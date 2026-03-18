/**
 * AWS SSO Credentials Proxy Server
 *
 * 이 서버는 로컬 AWS SSO 자격 증명을 프론트엔드로 전달합니다.
 *
 * 사용 방법:
 * 1. npm install express @aws-sdk/credential-provider-node @aws-sdk/credential-provider-sso
 * 2. aws sso login --profile <your-profile>
 * 3. node server.js
 * 4. 프론트엔드에서 http://localhost:8081 으로 요청
 */

const express = require('express');
const { fromSSO } = require('@aws-sdk/credential-provider-sso');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');
const { ConnectClient, DescribeUserCommand, SearchUsersCommand } = require('@aws-sdk/client-connect');
const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { fromIni } = require('@aws-sdk/credential-provider-ini');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ini = require('ini');

const app = express();
const PORT = 8081;

app.use(express.json());

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-aws-credentials, x-aws-region, x-environment, x-instance-id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ========================================
// Helper Functions
// ========================================

/**
 * credentials 헤더 파싱 및 expiration Date 변환
 */
function parseCredentials(credentialsHeader) {
  if (!credentialsHeader) return null;

  const credentials = JSON.parse(credentialsHeader);

  if (credentials.expiration && typeof credentials.expiration === 'string') {
    credentials.expiration = new Date(credentials.expiration);
  } else if (credentials.Expiration && typeof credentials.Expiration === 'string') {
    credentials.expiration = new Date(credentials.Expiration);
    delete credentials.Expiration;
  }

  return credentials;
}

/**
 * request body에서 credentials 파싱 (expiration을 Date로 변환)
 */
function parseCredentialsFromBody(rawCredentials) {
  return {
    accessKeyId: rawCredentials.accessKeyId,
    secretAccessKey: rawCredentials.secretAccessKey,
    sessionToken: rawCredentials.sessionToken,
    expiration: rawCredentials.expiration
      ? (rawCredentials.expiration instanceof Date
        ? rawCredentials.expiration
        : new Date(rawCredentials.expiration))
      : undefined
  };
}

/**
 * 요청 헤더에서 credentials 가져오기 또는 기본 provider 사용
 */
async function getCredentialsFromRequest(req) {
  const credentialsHeader = req.headers['x-aws-credentials'];

  if (credentialsHeader) {
    return parseCredentials(credentialsHeader);
  }

  const creds = await defaultProvider()();
  if (creds.expiration && typeof creds.expiration === 'string') {
    creds.expiration = new Date(creds.expiration);
  } else if (creds.Expiration && typeof creds.Expiration === 'string') {
    creds.expiration = new Date(creds.Expiration);
    delete creds.Expiration;
  }
  return creds;
}

/**
 * 요청 헤더에서 region, environment, credentials 공통 추출
 */
async function getRequestContext(req) {
  const region = req.headers['x-aws-region'] || 'ap-northeast-2';
  const environment = req.headers['x-environment'] || 'dev';
  const credentials = await getCredentialsFromRequest(req);
  const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
  return { region, environment, credentials, prefix };
}

/**
 * Lambda ALB Proxy 호출 및 응답 처리 공통 함수
 */
async function invokeLambdaProxy(lambdaClient, functionName, albPayload) {
  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify(albPayload),
  });

  const response = await lambdaClient.send(command);
  const result = JSON.parse(Buffer.from(response.Payload).toString());

  if (result.errorMessage) {
    return { statusCode: 502, data: { error: 'Lambda Execution Failed', message: result.errorMessage } };
  }

  const statusCode = result.statusCode || 200;
  let responseData = result.body;

  if (responseData && typeof responseData === 'string') {
    try { responseData = JSON.parse(responseData); } catch { /* keep as-is */ }
  }

  if (statusCode >= 400) {
    const errorBody = typeof responseData === 'object'
      ? { error: responseData?.error || responseData?.message || 'Request failed', message: responseData?.error || responseData?.message || 'Unknown error', statusCode }
      : { error: 'Request failed', message: responseData || 'Unknown error', statusCode };
    return { statusCode, data: errorBody };
  }

  // 성공: responseData.data가 있으면 그것을, 아니면 responseData 전체 반환
  const successData = (responseData && typeof responseData === 'object' && responseData.data !== undefined)
    ? responseData.data
    : (responseData || result.data || result);

  return { statusCode, data: successData };
}

/**
 * CloudWatch Logs Insights 쿼리 실행 및 결과 대기
 */
async function runCloudWatchQuery(logsClient, { logGroupName, queryString, startTime, endTime }) {
  const startQueryCommand = new StartQueryCommand({
    logGroupName,
    queryString,
    startTime: Math.floor(startTime.getTime() / 1000),
    endTime: Math.floor(endTime.getTime() / 1000),
  });

  const { queryId } = await logsClient.send(startQueryCommand);

  let status = 'Running';
  let results;

  while (status === 'Running' || status === 'Scheduled') {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const response = await logsClient.send(new GetQueryResultsCommand({ queryId }));
    status = response.status;
    results = response.results;
  }

  return { status, results };
}

/**
 * CloudWatch 결과에서 contactId 추출 및 중복 제거
 */
function extractUniqueContacts(results, extractFn) {
  const seen = new Set();
  const contacts = [];

  for (const result of (results || [])) {
    const item = extractFn(result);
    if (item?.contactId && !seen.has(item.contactId)) {
      seen.add(item.contactId);
      contacts.push(item);
    }
  }

  return contacts;
}

/**
 * AWS config 파일 읽기
 */
function readAwsConfig() {
  const awsConfigPath = path.join(os.homedir(), '.aws', 'config');
  if (!fs.existsSync(awsConfigPath)) return null;
  return ini.parse(fs.readFileSync(awsConfigPath, 'utf-8'));
}

// ========================================
// AWS Credentials Endpoints
// ========================================

app.post('/api/aws/credentials', async (req, res) => {
  try {
    const { profile } = req.body;

    const credentialProvider = profile
      ? (console.log(`Fetching credentials for profile: ${profile}`), fromSSO({ profile }))
      : (console.log('Fetching credentials from default provider chain'), defaultProvider());

    const credentials = await credentialProvider();

    res.json({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration instanceof Date
        ? credentials.expiration.toISOString()
        : credentials.expiration,
    });
  } catch (error) {
    console.error('Error fetching credentials:', error);
    res.status(500).json({
      error: 'Failed to fetch credentials',
      message: error.message,
      hint: 'Make sure you have run "aws sso login --profile <profile-name>" first',
    });
  }
});

app.get('/api/aws/auto-credentials', async (req, res) => {
  try {
    const config = readAwsConfig();
    if (!config) {
      return res.status(400).json({ error: 'AWS config file not found' });
    }

    const hasSsoSession = Object.keys(config).some(key => key.startsWith('sso-session '));

    let selectedProfile = null;
    let selectedRegion = 'ap-northeast-2';

    for (const [key, value] of Object.entries(config)) {
      if (key.startsWith('profile ') && (value.sso_start_url || hasSsoSession)) {
        selectedProfile = key.replace('profile ', '');
        selectedRegion = value.region || selectedRegion;
        break;
      }
    }

    if (!selectedProfile) {
      return res.status(401).json({ error: 'No SSO profile found. Ensure your ~/.aws/config has [sso-session] or profiles with sso_start_url.' });
    }

    const credentials = await fromSSO({ profile: selectedProfile })();

    res.json({
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        expiration: credentials.expiration instanceof Date
          ? credentials.expiration.toISOString()
          : credentials.expiration,
      },
      profile: selectedProfile,
      region: selectedRegion,
    });
  } catch (error) {
    console.error('Error auto-fetching credentials:', error);
    res.status(500).json({ error: 'Failed to auto-fetch credentials', message: error.message });
  }
});

app.get('/api/aws/profiles', async (req, res) => {
  try {
    const config = readAwsConfig();
    if (!config) {
      return res.json({ profiles: [] });
    }

    const hasSsoSession = Object.keys(config).some(key => key.startsWith('sso-session '));

    const checkSsoLoginStatus = (profileConfig) => {
      try {
        const ssoCachePath = path.join(os.homedir(), '.aws', 'sso', 'cache');
        if (!fs.existsSync(ssoCachePath)) return false;

        let startUrl = profileConfig.sso_start_url;
        if (!startUrl && profileConfig.sso_session) {
          const sessionKey = `sso-session ${profileConfig.sso_session}`;
          if (config[sessionKey]) startUrl = config[sessionKey].sso_start_url;
        }
        if (!startUrl) return false;

        const cacheFiles = fs.readdirSync(ssoCachePath).filter(f => f.endsWith('.json'));
        for (const file of cacheFiles) {
          try {
            const cacheContent = JSON.parse(fs.readFileSync(path.join(ssoCachePath, file), 'utf-8'));
            if (cacheContent.startUrl === startUrl && cacheContent.accessToken && new Date(cacheContent.expiresAt) > new Date()) {
              return true;
            }
          } catch { /* skip */ }
        }
        return false;
      } catch { return false; }
    };

    const profiles = [];
    for (const [key, value] of Object.entries(config)) {
      if (key.startsWith('profile ') && (value.sso_start_url || hasSsoSession)) {
        profiles.push({
          name: key.replace('profile ', ''),
          region: value.region || 'ap-northeast-2',
          sso_start_url: value.sso_start_url,
          sso_account_id: value.sso_account_id,
          isLoggedIn: checkSsoLoginStatus(value),
        });
      }
    }

    res.json({ profiles });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles', message: error.message });
  }
});

app.post('/api/aws/region', async (req, res) => {
  try {
    const { profile } = req.body;
    const config = readAwsConfig();

    if (!config) {
      return res.status(404).json({ error: 'AWS config file not found' });
    }

    let region = 'ap-northeast-2';
    if (profile) {
      const profileKey = `profile ${profile}`;
      if (config[profileKey]?.region) {
        region = config[profileKey].region;
      }
    }

    res.json({ region });
  } catch (error) {
    console.error('Error fetching region:', error);
    res.status(500).json({ error: 'Failed to fetch region' });
  }
});

// ========================================
// Search APIs
// ========================================

app.post('/api/search/customer', async (req, res) => {
  try {
    const { searchValue, searchType, credentials: rawCredentials, region, environment } = req.body;
    const credentials = parseCredentialsFromBody(rawCredentials);

    const dynamoClient = new DynamoDBClient({ region, credentials });

    const gsiMap = {
      phone:     { gsi: 'gsi3', keyName: 'gsi3Pk', prefix: 'contact#phoneNumber#' },
      profileId: { gsi: 'gsi1', keyName: 'gsi1Pk', prefix: 'contact#profileId#' },
      skypass:   { gsi: 'gsi9', keyName: 'gsi9Pk', prefix: 'contact#skypassNumber#' },
    };

    const gsiConfig = gsiMap[searchType];
    if (!gsiConfig) {
      return res.status(400).json({ error: 'Invalid search type' });
    }

    const command = new QueryCommand({
      TableName: `aicc-${environment}-ddb-agent-contact`,
      IndexName: `aicc-${environment}-ddb-agent-contact-${gsiConfig.gsi}`,
      KeyConditionExpression: `${gsiConfig.keyName} = :value`,
      ExpressionAttributeValues: { ':value': { S: `${gsiConfig.prefix}${searchValue}` } },
      ScanIndexForward: false,
      Limit: 20,
    });

    const response = await dynamoClient.send(command);

    const contacts = response.Items?.map(item => ({
      contactId: item.contactId?.S,
      channel: item.channel?.S,
      initiationMethod: item.initiationMethod?.S,
      initiationTimestamp: item.initiationTimestamp?.S,
      disconnectTimestamp: item.disconnectTimestamp?.S,
    })) || [];

    res.json({ contacts });
  } catch (error) {
    console.error('Error searching customer:', error);
    res.status(500).json({ error: 'Failed to search customer', message: error.message });
  }
});

app.post('/api/search/agent', async (req, res) => {
  try {
    const { searchValue, searchType, credentials: rawCredentials, region, instanceId, environment } = req.body;
    const credentials = parseCredentialsFromBody(rawCredentials);

    const connectClient = new ConnectClient({ region, credentials });

    let agentUsername;

    if (searchType === 'uuid') {
      const response = await connectClient.send(new DescribeUserCommand({ InstanceId: instanceId, UserId: searchValue }));
      agentUsername = response.User?.Username;
    } else if (searchType === 'email') {
      agentUsername = searchValue;
    } else if (searchType === 'name') {
      const response = await connectClient.send(new SearchUsersCommand({ InstanceId: instanceId }));
      const user = response.Users?.find(u => {
        const fullName = `${u.IdentityInfo?.LastName}${u.IdentityInfo?.FirstName}`;
        const fullNameEng = `${u.IdentityInfo?.FirstName} ${u.IdentityInfo?.LastName}`;
        return fullName === searchValue || fullNameEng === searchValue;
      });
      agentUsername = user?.Username;
    }

    if (!agentUsername) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const dynamoClient = new DynamoDBClient({ region, credentials });

    const command = new QueryCommand({
      TableName: `aicc-${environment}-ddb-agent-contact`,
      IndexName: `aicc-${environment}-ddb-agent-contact-gsi2`,
      KeyConditionExpression: 'gsi2Pk = :value',
      ExpressionAttributeValues: { ':value': { S: `contact#agentUserName#${agentUsername}` } },
      ScanIndexForward: false,
      Limit: 20,
    });

    const response = await dynamoClient.send(command);

    const contacts = response.Items?.map(item => ({
      contactId: item.contactId?.S,
      channel: item.channel?.S,
      initiationMethod: item.initiationMethod?.S,
      initiationTimestamp: item.initiationTimestamp?.S,
      disconnectTimestamp: item.disconnectTimestamp?.S,
    })) || [];

    res.json({ contacts, agentUsername });
  } catch (error) {
    console.error('Error searching agent:', error);
    res.status(500).json({ error: 'Failed to search agent', message: error.message });
  }
});

app.get('/api/agent/v1/connect/search-user', async (req, res) => {
  try {
    const { username } = req.query;
    const credentials = parseCredentials(req.headers['x-aws-credentials']);
    const region = req.headers['x-aws-region'];
    const environment = req.headers['x-environment'];
    let instanceId = req.headers['x-instance-id'];

    if (!username) return res.status(400).json({ error: 'username is required' });
    if (!credentials) return res.status(400).json({ error: 'credentials are required' });

    // instanceId가 헤더에 없으면 AWS config에서 fallback
    if (!instanceId) {
      try {
        const config = readAwsConfig();
        if (config) {
          for (const [key, value] of Object.entries(config)) {
            if (key.includes(environment) && value.connect_instance_id) {
              instanceId = value.connect_instance_id;
              break;
            }
          }
        }
      } catch (error) {
        console.error('Failed to read AWS config file:', error);
      }
    }

    if (!instanceId) {
      return res.status(400).json({ error: 'instanceId not found. Please provide x-instance-id header or configure it in AWS config file.' });
    }

    const connectClient = new ConnectClient({ region, credentials });

    const command = new SearchUsersCommand({
      InstanceId: instanceId,
      SearchFilter: { TagFilter: { OrConditions: [], AndConditions: [], TagCondition: undefined } },
      SearchCriteria: { StringCondition: { FieldName: 'Username', Value: username, ComparisonType: 'EXACT' } },
      MaxResults: 1,
    });

    const response = await connectClient.send(command);

    if (response.Users?.length > 0 && response.Users[0].Id) {
      return res.json({ userId: response.Users[0].Id });
    }

    return res.status(404).json({ error: 'User not found', username });
  } catch (error) {
    console.error('Error searching Connect user:', error);
    res.status(500).json({ error: 'Failed to search Connect user', message: error.message });
  }
});

app.post('/api/search/contact-flow', async (req, res) => {
  try {
    const { flowName, credentials: rawCredentials, region, instanceAlias } = req.body;
    const credentials = parseCredentialsFromBody(rawCredentials);
    const logsClient = new CloudWatchLogsClient({ region, credentials });

    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 144);

    const { status, results } = await runCloudWatchQuery(logsClient, {
      logGroupName: `/aws/connect/${instanceAlias}`,
      queryString: `fields @timestamp, @message, @logStream, @log\n| filter ContactFlowName like '${flowName}'\n| sort @timestamp desc\n| limit 10000`,
      startTime,
      endTime: new Date(),
    });

    if (status !== 'Complete') {
      return res.status(500).json({ error: 'Query failed', status });
    }

    const contacts = extractUniqueContacts(results, result => {
      const timestamp = result.find(f => f.field === '@timestamp')?.value;
      const messageStr = result.find(f => f.field === '@message')?.value;
      if (!messageStr) return null;
      try {
        return { contactId: JSON.parse(messageStr).ContactId, timestamp };
      } catch { return null; }
    });

    res.json({ contacts });
  } catch (error) {
    console.error('Error searching contact flow:', error);
    res.status(500).json({ error: 'Failed to search contact flow', message: error.message });
  }
});

app.post('/api/search/dnis', async (req, res) => {
  try {
    const { dnis, credentials: rawCredentials, region, instanceAlias } = req.body;
    const credentials = parseCredentialsFromBody(rawCredentials);
    const logsClient = new CloudWatchLogsClient({ region, credentials });

    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 144);

    const { status, results } = await runCloudWatchQuery(logsClient, {
      logGroupName: `/aws/connect/${instanceAlias}`,
      queryString: `fields @timestamp, @message, @logStream, @log\n| filter @message like '${dnis}' and @message like 'SetAttributes'\n| sort @timestamp desc\n| limit 10000`,
      startTime,
      endTime: new Date(),
    });

    if (status !== 'Complete') {
      return res.status(500).json({ error: 'Query failed', status });
    }

    const contacts = extractUniqueContacts(results, result => {
      const timestamp = result.find(f => f.field === '@timestamp')?.value;
      const messageStr = result.find(f => f.field === '@message')?.value;
      if (!messageStr) return null;
      try {
        return { contactId: JSON.parse(messageStr).ContactId, timestamp };
      } catch { return null; }
    });

    res.json({ contacts });
  } catch (error) {
    console.error('Error searching DNIS:', error);
    res.status(500).json({ error: 'Failed to search DNIS', message: error.message });
  }
});

app.post('/api/search/lambda-error', async (req, res) => {
  try {
    const { credentials: rawCredentials, region } = req.body;
    const credentials = parseCredentialsFromBody(rawCredentials);
    const logsClient = new CloudWatchLogsClient({ region, credentials });

    const logGroups = [
      '/aws/lmd/aicc-connect-flow-base/flow-agent-workspace-handler',
      '/aws/lmd/aicc-connect-flow-base/flow-alms-if',
      '/aws/lmd/aicc-connect-flow-base/flow-chat-app',
      '/aws/lmd/aicc-connect-flow-base/flow-idnv-async-if',
      '/aws/lmd/aicc-connect-flow-base/flow-idnv-common-if',
      '/aws/lmd/aicc-connect-flow-base/flow-internal-handler',
      '/aws/lmd/aicc-connect-flow-base/flow-kalis-if',
      '/aws/lmd/aicc-connect-flow-base/flow-mdm-if',
      '/aws/lmd/aicc-connect-flow-base/flow-ods-if',
      '/aws/lmd/aicc-connect-flow-base/flow-oneid-if',
      '/aws/lmd/aicc-connect-flow-base/flow-sample-integration',
      '/aws/lmd/aicc-connect-flow-base/flow-tms-if',
      '/aws/lmd/aicc-connect-flow-base/flow-vars-controller',
      '/aws/lmd/aicc-chat-app/alb-chat-if',
      '/aws/lmd/aicc-chat-app/sns-chat-if',
    ];

    const query = `fields @timestamp, @message, @logStream, @log\n| filter @message like '"level":"ERROR"'\n| sort @timestamp desc\n| limit 10000`;

    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 48);
    const endTime = new Date();

    const allContacts = [];

    for (const logGroup of logGroups) {
      try {
        const { status, results } = await runCloudWatchQuery(logsClient, {
          logGroupName: logGroup,
          queryString: query,
          startTime,
          endTime,
        });

        if (status === 'Complete' && results) {
          const contacts = results
            .map(result => {
              const timestamp = result.find(f => f.field === '@timestamp')?.value;
              const messageStr = result.find(f => f.field === '@message')?.value;
              if (!messageStr) return null;
              try {
                const message = JSON.parse(messageStr);
                return {
                  contactId: message.contactId || message.response?.contactId || message.initialContactId,
                  service: message.service,
                  timestamp,
                };
              } catch { return null; }
            })
            .filter(c => c?.contactId);

          allContacts.push(...contacts);
        }
      } catch (err) {
        console.error(`Error querying log group ${logGroup}:`, err);
      }
    }

    // 중복 제거
    const seen = new Set();
    const uniqueContacts = allContacts.filter(c => {
      if (seen.has(c.contactId)) return false;
      seen.add(c.contactId);
      return true;
    });

    res.json({ contacts: uniqueContacts });
  } catch (error) {
    console.error('Error searching lambda errors:', error);
    res.status(500).json({ error: 'Failed to search lambda errors', message: error.message });
  }
});

// ========================================
// QM Automation APIs
// ========================================

// audio-stream: Lambda 호출 후 S3에서 오디오 스트리밍 (특수 처리 필요)
app.get('/api/agent/v1/qm-automation/audio-stream', async (req, res) => {
  try {
    const { requestId } = req.query;
    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    const { region, credentials, prefix } = await getRequestContext(req);
    const lambdaClient = new LambdaClient({ region, credentials });
    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;

    const { statusCode, data } = await invokeLambdaProxy(lambdaClient, functionName, {
      httpMethod: 'GET',
      path: '/api/agent/v1/qm-automation/audio-presigned-url',
      headers: { 'Content-Type': 'application/json' },
      queryStringParameters: { requestId },
    });

    if (statusCode >= 400) {
      return res.status(statusCode).json({ error: 'Failed to get audio presigned URL' });
    }

    const audioUrl = data?.audioPresignedUrl;
    if (!audioUrl) {
      return res.status(404).json({ error: 'Audio presigned URL not found' });
    }

    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      return res.status(audioResponse.status).json({ error: 'Failed to fetch audio from S3' });
    }

    res.setHeader('Content-Type', audioResponse.headers.get('content-type') || 'audio/mpeg');
    const contentLength = audioResponse.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    const { Readable } = require('node:stream');
    Readable.fromWeb(audioResponse.body).pipe(res);
  } catch (error) {
    console.error('Error streaming audio:', error);
    res.status(500).json({ error: 'Failed to stream audio', message: error.message });
  }
});

// simple-prompt: 다른 Lambda(gemini-handler)를 사용하므로 별도 처리
app.post('/api/agent/v1/qm-automation/simple-prompt', async (req, res) => {
  try {
    const { prompt, model, files, requestId, createdAt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    if (!model) return res.status(400).json({ error: 'model is required' });

    const { region, credentials, prefix } = await getRequestContext(req);
    const lambdaClient = new LambdaClient({ region, credentials });
    const functionName = `aicc-${prefix}-lmd-gemini-handler`;

    const lambdaPayload = {
      invocationType: 'RequestResponse',
      input: { action: 'simple_prompt', prompt, model, pk: requestId, sk: createdAt },
    };

    if (files?.length > 0) {
      lambdaPayload.input.files = files;
    }

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(lambdaPayload),
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(Buffer.from(response.Payload).toString());

    if (result.errorMessage) {
      return res.status(502).json({ error: 'Lambda Execution Failed', message: result.errorMessage });
    }

    const statusCode = result.statusCode || 200;
    let responseBody = result.body;

    if (responseBody && typeof responseBody === 'string') {
      try { responseBody = JSON.parse(responseBody); } catch { /* keep as-is */ }
    }

    if (statusCode >= 400) {
      return res.status(statusCode).json({
        error: responseBody?.error || 'Request failed',
        message: responseBody?.message || responseBody || 'Unknown error',
        statusCode,
      });
    }

    res.status(statusCode).json(responseBody || result);
  } catch (error) {
    console.error('Error invoking Gemini Lambda:', error);
    res.status(500).json({ error: 'Failed to invoke Gemini API', message: error.message });
  }
});

// 나머지 QM Automation 엔드포인트는 모두 동일한 Lambda로 ALB Proxy
app.all('/api/agent/v1/qm-automation*', handleAlbProxyRequest);

// ========================================
// QM Evaluation Form & SOP APIs (ALB Proxy)
// ========================================

/**
 * ALB Proxy 공통 핸들러 - qm-evaluation-form, sop 모두 동일한 Lambda로 프록시
 */
async function handleAlbProxyRequest(req, res) {
  try {
    const { region, credentials, prefix } = await getRequestContext(req);
    const lambdaClient = new LambdaClient({ region, credentials });
    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;

    const payload = {
      httpMethod: req.method,
      path: req.path,
      headers: { 'content-type': 'application/json', 'accept': '*/*' },
      queryStringParameters: Object.keys(req.query).length > 0 ? req.query : null,
      body: (req.method === 'GET' || req.method === 'DELETE') ? null : (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)),
      isBase64Encoded: false,
      requestContext: {
        elb: { targetGroupArn: 'arn:aws:elasticloadbalancing:ap-northeast-2:123456789012:targetgroup/local/1234567890123456' }
      }
    };

    const { statusCode, data } = await invokeLambdaProxy(lambdaClient, functionName, payload);
    res.status(statusCode).json(data);
  } catch (error) {
    console.error(`Error invoking Lambda for ${req.path}:`, error);
    res.status(500).json({ error: 'Failed to invoke Lambda API', message: error.message });
  }
}

app.all('/api/agent/v1/qm-evaluation-form*', handleAlbProxyRequest);
app.all('/api/agent/v1/sop*', handleAlbProxyRequest);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  AWS Connect Contact Tracer - Backend API Server         ║
║  Running on http://localhost:${PORT}                     ║
╚══════════════════════════════════════════════════════════╝

사용 전 준비:
1. AWS SSO 로그인:
   aws sso login --profile <your-profile>

2. npm install 필수 패키지:
   npm install express ini @aws-sdk/credential-provider-sso @aws-sdk/credential-provider-node @aws-sdk/credential-provider-ini @aws-sdk/client-connect @aws-sdk/client-cloudwatch-logs @aws-sdk/client-dynamodb

3. 프론트엔드 실행:
   npm start

엔드포인트:
[AWS Credentials]
- GET  /api/aws/profiles         - SSO 프로필 목록 가져오기
- POST /api/aws/credentials      - SSO 자격 증명 가져오기
- GET  /api/aws/auto-credentials - SSO 자격 증명 자동 가져오기
- POST /api/aws/region           - 프로필에서 리전 가져오기

[Search APIs]
- POST /api/search/customer                          - Customer 검색 (Phone/ProfileID/Skypass)
- POST /api/search/agent                             - Agent 검색 (UUID/Email/Name)
- GET  /api/agent/v1/connect/search-user             - Connect 사용자 검색 (Username → User ID)
- POST /api/search/contact-flow                      - Contact Flow 이름으로 검색
- POST /api/search/dnis                              - DNIS로 검색
- POST /api/search/lambda-error                      - Lambda 에러 로그 검색

[QM Automation APIs] (Lambda Invoke)
- POST /api/agent/v1/qm-automation                              - QM 상담 내용 분석
- GET  /api/agent/v1/qm-automation/status?requestId=xxx         - QM 상세 조회
- GET  /api/agent/v1/qm-automation/audio-presigned-url?requestId=xxx - 오디오 Presigned URL 조회
- GET  /api/agent/v1/qm-automation/audio-stream?requestId=xxx   - 오디오 스트리밍 (CORS 우회)
- GET  /api/agent/v1/qm-automation/search                       - QM 검색 (다중 필터)

[QM Evaluation State APIs] (이의제기/확인)
- POST /api/agent/v1/qm-automation/confirm                      - 상담사 확인
- POST /api/agent/v1/qm-automation/objection                    - 상담사 이의제기
- POST /api/agent/v1/qm-automation/qa-feedback                  - QA 피드백
- POST /api/agent/v1/qm-automation/agent-bulk-action             - 벌크 상담사 액션
- POST /api/agent/v1/qm-automation/qa-bulk-feedback              - 벌크 QA 피드백
- POST /api/agent/v1/qm-automation/reset-evaluation-state       - 평가 상태 초기화
- POST /api/agent/v1/qm-automation/agent-evaluation-summary     - 상담사 평가 요약 생성
- GET  /api/agent/v1/qm-automation/agent-evaluation-summary     - 상담사 평가 요약 목록 조회
- GET  /api/agent/v1/qm-automation/agent-evaluation-summary/detail - 상담사 평가 요약 상세 조회

[QM Evaluation Form APIs] (ALB Proxy)
- ALL  /api/agent/v1/qm-evaluation-form*                        - 평가 양식 CRUD

[SOP Manager APIs] (ALB Proxy)
- ALL  /api/agent/v1/sop*                                       - SOP 관리 CRUD

[Gemini API]
- POST /api/agent/v1/qm-automation/simple-prompt                - Gemini 프롬프트 실행

[Health]
- GET  /health                   - Health check
  `);
});
