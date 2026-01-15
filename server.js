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
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-aws-credentials, x-aws-region, x-environment');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

/**
 * AWS SSO 자격 증명을 가져오는 엔드포인트
 *
 * POST /api/aws/credentials
 * Body: { profile?: string }
 *
 * Response: { accessKeyId, secretAccessKey, sessionToken }
 */
app.post('/api/aws/credentials', async (req, res) => {
  try {
    const { profile } = req.body;

    let credentialProvider;

    if (profile) {
      // 특정 프로필 사용
      console.log(`Fetching credentials for profile: ${profile}`);
      credentialProvider = fromSSO({ profile });
    } else {
      // 기본 credential chain 사용
      console.log('Fetching credentials from default provider chain');
      credentialProvider = defaultProvider();
    }

    // 자격 증명 가져오기
    const credentials = await credentialProvider();

    res.json({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration,
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

/**
 * 자동으로 AWS SSO 자격 증명을 가져오는 엔드포인트
 *
 * GET /api/aws/auto-credentials
 *
 * Response: { credentials, profile, region }
 */
app.get('/api/aws/auto-credentials', async (req, res) => {
  try {
    // AWS config 파일에서 기본 프로필 찾기
    const awsConfigPath = path.join(os.homedir(), '.aws', 'config');

    if (!fs.existsSync(awsConfigPath)) {
      return res.status(404).json({ error: 'AWS config file not found' });
    }

    const configContent = fs.readFileSync(awsConfigPath, 'utf-8');
    const config = ini.parse(configContent);

    // 기본 프로필 또는 첫 번째 SSO 프로필 찾기
    let selectedProfile = null;
    let selectedRegion = 'ap-northeast-2';

    for (const [key, value] of Object.entries(config)) {
      if (key.startsWith('profile ') && value.sso_start_url) {
        selectedProfile = key.replace('profile ', '');
        selectedRegion = value.region || selectedRegion;
        break;
      }
    }

    if (!selectedProfile) {
      return res.status(404).json({ error: 'No SSO profile found' });
    }

    // SSO 자격 증명 가져오기
    const credentialProvider = fromSSO({ profile: selectedProfile });
    const credentials = await credentialProvider();

    res.json({
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        expiration: credentials.expiration,
      },
      profile: selectedProfile,
      region: selectedRegion,
    });
  } catch (error) {
    console.error('Error auto-fetching credentials:', error);
    res.status(500).json({
      error: 'Failed to auto-fetch credentials',
      message: error.message,
    });
  }
});

/**
 * 로컬 AWS 설정에서 SSO 프로필 목록을 가져오는 엔드포인트
 *
 * GET /api/aws/profiles
 *
 * Response: { profiles: [{ name, region, sso_start_url, sso_account_id, isLoggedIn }] }
 */
app.get('/api/aws/profiles', async (req, res) => {
  try {
    const awsConfigPath = path.join(os.homedir(), '.aws', 'config');

    if (!fs.existsSync(awsConfigPath)) {
      return res.json({ profiles: [] });
    }

    const configContent = fs.readFileSync(awsConfigPath, 'utf-8');
    const config = ini.parse(configContent);

    const profiles = [];

    for (const [key, value] of Object.entries(config)) {
      // SSO 프로필만 필터링 (sso_start_url이 있는 프로필)
      if (key.startsWith('profile ') && value.sso_start_url) {
        const profileName = key.replace('profile ', '');

        // SSO 캐시에서 로그인 상태 확인
        let isLoggedIn = false;
        try {
          const credentialProvider = fromSSO({ profile: profileName });
          await credentialProvider();
          isLoggedIn = true;
        } catch {
          isLoggedIn = false;
        }

        profiles.push({
          name: profileName,
          region: value.region || 'ap-northeast-2',
          sso_start_url: value.sso_start_url,
          sso_account_id: value.sso_account_id,
          isLoggedIn,
        });
      }
    }

    res.json({ profiles });
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles', message: error.message });
  }
});

/**
 * AWS 프로필에서 리전 정보를 가져오는 엔드포인트
 *
 * POST /api/aws/region
 * Body: { profile?: string }
 *
 * Response: { region }
 */
app.post('/api/aws/region', async (req, res) => {
  try {
    const { profile } = req.body;
    const awsConfigPath = path.join(os.homedir(), '.aws', 'config');

    if (!fs.existsSync(awsConfigPath)) {
      return res.status(404).json({ error: 'AWS config file not found' });
    }

    const configContent = fs.readFileSync(awsConfigPath, 'utf-8');
    const config = ini.parse(configContent);

    let region = 'ap-northeast-2'; // default

    if (profile) {
      const profileKey = `profile ${profile}`;
      if (config[profileKey] && config[profileKey].region) {
        region = config[profileKey].region;
      }
    }

    res.json({ region });
  } catch (error) {
    console.error('Error fetching region:', error);
    res.status(500).json({ error: 'Failed to fetch region' });
  }
});

/**
 * Customer 검색 (DynamoDB)
 *
 * POST /api/search/customer
 * Body: {
 *   searchValue: string,
 *   searchType: 'phone' | 'profileId' | 'skypass',
 *   credentials: { accessKeyId, secretAccessKey, sessionToken },
 *   region: string,
 *   environment: string
 * }
 */
app.post('/api/search/customer', async (req, res) => {
  try {
    const { searchValue, searchType, credentials, region, environment } = req.body;

    const dynamoClient = new DynamoDBClient({
      region,
      credentials,
    });

    let gsi, keyName, keyValue;

    switch (searchType) {
      case 'phone':
        gsi = 'gsi3';
        keyName = 'gsi3Pk';
        keyValue = `contact#phoneNumber#${searchValue}`;
        break;
      case 'profileId':
        gsi = 'gsi1';
        keyName = 'gsi1Pk';
        keyValue = `contact#profileId#${searchValue}`;
        break;
      case 'skypass':
        gsi = 'gsi9';
        keyName = 'gsi9Pk';
        keyValue = `contact#skypassNumber#${searchValue}`;
        break;
      default:
        return res.status(400).json({ error: 'Invalid search type' });
    }

    const command = new QueryCommand({
      TableName: `aicc-${environment}-ddb-agent-contact`,
      IndexName: `aicc-${environment}-ddb-agent-contact-${gsi}`,
      KeyConditionExpression: `${keyName} = :value`,
      ExpressionAttributeValues: {
        ':value': { S: keyValue },
      },
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

/**
 * Agent 검색 (AWS Connect)
 *
 * POST /api/search/agent
 * Body: {
 *   searchValue: string,
 *   searchType: 'uuid' | 'email' | 'name',
 *   credentials: { accessKeyId, secretAccessKey, sessionToken },
 *   region: string,
 *   instanceId: string,
 *   environment: string
 * }
 */
app.post('/api/search/agent', async (req, res) => {
  try {
    const { searchValue, searchType, credentials, region, instanceId, environment } = req.body;

    const connectClient = new ConnectClient({
      region,
      credentials,
    });

    let agentUsername;

    if (searchType === 'uuid') {
      // UUID로 직접 조회
      const command = new DescribeUserCommand({
        InstanceId: instanceId,
        UserId: searchValue,
      });
      const response = await connectClient.send(command);
      agentUsername = response.User?.Username;
    } else if (searchType === 'email') {
      agentUsername = searchValue;
    } else if (searchType === 'name') {
      // 이름으로 검색
      const command = new SearchUsersCommand({
        InstanceId: instanceId,
      });
      const response = await connectClient.send(command);

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

    // DynamoDB에서 agent의 contact 조회
    const dynamoClient = new DynamoDBClient({
      region,
      credentials,
    });

    const command = new QueryCommand({
      TableName: `aicc-${environment}-ddb-agent-contact`,
      IndexName: `aicc-${environment}-ddb-agent-contact-gsi2`,
      KeyConditionExpression: 'gsi2Pk = :value',
      ExpressionAttributeValues: {
        ':value': { S: `contact#agentUserName#${agentUsername}` },
      },
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

/**
 * ContactFlow 이름으로 검색 (CloudWatch Logs)
 *
 * POST /api/search/contact-flow
 * Body: {
 *   flowName: string,
 *   credentials: { accessKeyId, secretAccessKey, sessionToken },
 *   region: string,
 *   instanceAlias: string
 * }
 */
app.post('/api/search/contact-flow', async (req, res) => {
  try {
    const { flowName, credentials, region, instanceAlias } = req.body;

    const logsClient = new CloudWatchLogsClient({
      region,
      credentials,
    });

    const query = `fields @timestamp, @message, @logStream, @log
| filter ContactFlowName like '${flowName}'
| sort @timestamp desc
| limit 10000`;

    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 144); // 6일 전
    const endTime = new Date();

    const startQueryCommand = new StartQueryCommand({
      logGroupName: `/aws/connect/${instanceAlias}`,
      queryString: query,
      startTime: Math.floor(startTime.getTime() / 1000),
      endTime: Math.floor(endTime.getTime() / 1000),
    });

    const { queryId } = await logsClient.send(startQueryCommand);

    // 쿼리 결과 대기
    let status = 'Running';
    let results;

    while (status === 'Running' || status === 'Scheduled') {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const getResultsCommand = new GetQueryResultsCommand({ queryId });
      const response = await logsClient.send(getResultsCommand);

      status = response.status;
      results = response.results;
    }

    if (status !== 'Complete') {
      return res.status(500).json({ error: 'Query failed', status });
    }

    const contacts = results
      ?.map(result => {
        const timestamp = result.find(f => f.field === '@timestamp')?.value;
        const messageStr = result.find(f => f.field === '@message')?.value;

        if (!messageStr) return null;

        try {
          const message = JSON.parse(messageStr);
          return {
            contactId: message.ContactId,
            timestamp,
          };
        } catch {
          return null;
        }
      })
      .filter(c => c && c.contactId)
      .reduce((acc, curr) => {
        if (!acc.find(c => c.contactId === curr.contactId)) {
          acc.push(curr);
        }
        return acc;
      }, []) || [];

    res.json({ contacts });
  } catch (error) {
    console.error('Error searching contact flow:', error);
    res.status(500).json({ error: 'Failed to search contact flow', message: error.message });
  }
});

/**
 * DNIS로 검색 (CloudWatch Logs)
 *
 * POST /api/search/dnis
 * Body: {
 *   dnis: string,
 *   credentials: { accessKeyId, secretAccessKey, sessionToken },
 *   region: string,
 *   instanceAlias: string
 * }
 */
app.post('/api/search/dnis', async (req, res) => {
  try {
    const { dnis, credentials, region, instanceAlias } = req.body;

    const logsClient = new CloudWatchLogsClient({
      region,
      credentials,
    });

    const query = `fields @timestamp, @message, @logStream, @log
| filter @message like '${dnis}' and @message like 'SetAttributes'
| sort @timestamp desc
| limit 10000`;

    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 144); // 6일 전
    const endTime = new Date();

    const startQueryCommand = new StartQueryCommand({
      logGroupName: `/aws/connect/${instanceAlias}`,
      queryString: query,
      startTime: Math.floor(startTime.getTime() / 1000),
      endTime: Math.floor(endTime.getTime() / 1000),
    });

    const { queryId } = await logsClient.send(startQueryCommand);

    // 쿼리 결과 대기
    let status = 'Running';
    let results;

    while (status === 'Running' || status === 'Scheduled') {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const getResultsCommand = new GetQueryResultsCommand({ queryId });
      const response = await logsClient.send(getResultsCommand);

      status = response.status;
      results = response.results;
    }

    if (status !== 'Complete') {
      return res.status(500).json({ error: 'Query failed', status });
    }

    const contacts = results
      ?.map(result => {
        const timestamp = result.find(f => f.field === '@timestamp')?.value;
        const messageStr = result.find(f => f.field === '@message')?.value;

        if (!messageStr) return null;

        try {
          const message = JSON.parse(messageStr);
          return {
            contactId: message.ContactId,
            timestamp,
          };
        } catch {
          return null;
        }
      })
      .filter(c => c && c.contactId)
      .reduce((acc, curr) => {
        if (!acc.find(c => c.contactId === curr.contactId)) {
          acc.push(curr);
        }
        return acc;
      }, []) || [];

    res.json({ contacts });
  } catch (error) {
    console.error('Error searching DNIS:', error);
    res.status(500).json({ error: 'Failed to search DNIS', message: error.message });
  }
});

/**
 * Lambda Error 검색 (CloudWatch Logs)
 *
 * POST /api/search/lambda-error
 * Body: {
 *   credentials: { accessKeyId, secretAccessKey, sessionToken },
 *   region: string
 * }
 */
app.post('/api/search/lambda-error', async (req, res) => {
  try {
    const { credentials, region } = req.body;

    const logsClient = new CloudWatchLogsClient({
      region,
      credentials,
    });

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

    const query = `fields @timestamp, @message, @logStream, @log
| filter @message like '"level":"ERROR"'
| sort @timestamp desc
| limit 10000`;

    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 48); // 48시간 전
    const endTime = new Date();

    const allContacts = [];

    // 각 로그 그룹에서 검색
    for (const logGroup of logGroups) {
      try {
        const startQueryCommand = new StartQueryCommand({
          logGroupName: logGroup,
          queryString: query,
          startTime: Math.floor(startTime.getTime() / 1000),
          endTime: Math.floor(endTime.getTime() / 1000),
        });

        const { queryId } = await logsClient.send(startQueryCommand);

        // 쿼리 결과 대기
        let status = 'Running';
        let results;

        while (status === 'Running' || status === 'Scheduled') {
          await new Promise(resolve => setTimeout(resolve, 2000));

          const getResultsCommand = new GetQueryResultsCommand({ queryId });
          const response = await logsClient.send(getResultsCommand);

          status = response.status;
          results = response.results;
        }

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
              } catch {
                return null;
              }
            })
            .filter(c => c && c.contactId);

          allContacts.push(...contacts);
        }
      } catch (err) {
        console.error(`Error querying log group ${logGroup}:`, err);
      }
    }

    // 중복 제거
    const uniqueContacts = allContacts.reduce((acc, curr) => {
      if (!acc.find(c => c.contactId === curr.contactId)) {
        acc.push(curr);
      }
      return acc;
    }, []);

    res.json({ contacts: uniqueContacts });
  } catch (error) {
    console.error('Error searching lambda errors:', error);
    res.status(500).json({ error: 'Failed to search lambda errors', message: error.message });
  }
});

// ========================================
// QM Automation APIs
// ========================================

/**
 * credentials 파싱 및 expiration Date 변환
 */
function parseCredentials(credentialsHeader) {
  const credentials = JSON.parse(credentialsHeader);
  if (credentials.expiration && typeof credentials.expiration === 'string') {
    credentials.expiration = new Date(credentials.expiration);
  }
  return credentials;
}

/**
 * 요청 헤더에서 credentials 가져오기 또는 기본 provider 사용
 */
async function getCredentialsFromRequest(req) {
  const credentialsHeader = req.headers['x-aws-credentials'];

  if (credentialsHeader) {
    return parseCredentials(credentialsHeader);
  } else {
    const credentialProvider = defaultProvider();
    return await credentialProvider();
  }
}


/**
 * DynamoDB 아이템을 unmarshall (간단한 버전)
 */
function unmarshallItem(item) {
  const result = {};
  for (const [key, value] of Object.entries(item)) {
    if (value.S !== undefined) result[key] = value.S;
    else if (value.N !== undefined) result[key] = parseFloat(value.N);
    else if (value.BOOL !== undefined) result[key] = value.BOOL;
    else if (value.NULL !== undefined) result[key] = null;
    else if (value.L !== undefined) result[key] = value.L.map(v => unmarshallItem({ _: v })._);
    else if (value.M !== undefined) result[key] = unmarshallItem(value.M);
    else result[key] = value;
  }
  return result;
}

/**
 * QM Automation 요청 (Lambda 호출)
 *
 * POST /api/agent/v1/qm-automation
 * Headers: x-aws-credentials, x-aws-region, x-environment
 */
app.post('/api/agent/v1/qm-automation', async (req, res) => {
  try {
    const requestBody = req.body;

    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const lambdaClient = new LambdaClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;

    // Construct ALB-like event payload
    const payload = {
      httpMethod: 'POST',
      path: '/api/agent/v1/qm-automation',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    };

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse', // Synchronous invocation
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);

    // Lambda (ALB Proxy 타입) 응답 파싱
    const result = JSON.parse(Buffer.from(response.Payload).toString());

    const statusCode = result.statusCode || 200;

    if (result.body) {
      // AlbResponse.success/fail은 body를 JSON string으로 반환함
      const responseData = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;

      // 에러 응답 처리 (statusCode >= 400)
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: responseData.error || responseData.message || 'Request failed',
          message: responseData.error || responseData.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      // 성공 응답
      res.status(statusCode).json(responseData.data || responseData);
    } else {
      // 에러 응답 처리 (statusCode >= 400)
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: result.error || result.message || 'Request failed',
          message: result.error || result.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      // 성공 응답
      res.status(statusCode).json(result.data || result);
    }

  } catch (error) {
    console.error('Error invoking QM Automation Lambda:', error);
    res.status(500).json({ error: 'Failed to invoke QM Automation', message: error.message });
  }
});

/**
 * QM Automation 목록 조회 (contactId GSI 사용)
 *
 * GET /api/agent/v1/qm-automation/list?contactId=xxx
 * Headers: x-aws-credentials, x-aws-region, x-environment
 */
app.get('/api/agent/v1/qm-automation/list', async (req, res) => {
  try {
    const { contactId } = req.query;

    if (!contactId) {
      return res.status(400).json({ error: 'contactId is required' });
    }

    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const dynamoClient = new DynamoDBClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const tableName = `aicc-${prefix}-ddb-gemini-response`;
    const indexName = `aicc-${prefix}-ddb-gemini-response-gsi-contactId`;

    const command = new QueryCommand({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: 'contactId = :contactId',
      ExpressionAttributeValues: {
        ':contactId': { S: contactId },
      },
      ScanIndexForward: false, // 최신순 정렬
    });

    const response = await dynamoClient.send(command);

    if (!response.Items || response.Items.length === 0) {
      return res.json({ items: [] });
    }

    // DynamoDB 아이템을 변환
    const items = response.Items.map(item => {
      const unmarshalled = unmarshallItem(item);
      return {
        requestId: unmarshalled.requestId,
        contactId: unmarshalled.contactId,
        agentId: unmarshalled.agentId,
        status: unmarshalled.status,
        createdAt: unmarshalled.sk, // sk가 생성 timestamp
        completedAt: unmarshalled.completedAt,
        geminiModel: unmarshalled.result?.geminiModel || unmarshalled.input?.model,
        processingTime: unmarshalled.result?.processingTime,
        connectedToAgentTimestamp: unmarshalled.connectedToAgentTimestamp,
        input: unmarshalled.input,
        result: unmarshalled.result,
      };
    });

    res.json({ items });
  } catch (error) {
    console.error('Error fetching QM Automation list:', error);
    res.status(500).json({ error: 'Failed to fetch QM Automation list', message: error.message });
  }
});

/**
 * QM Automation 상세 조회 (requestId로 조회)
 *
 * GET /api/agent/v1/qm-automation/status?requestId=xxx
 * Headers: x-aws-credentials, x-aws-region, x-environment
 */
app.get('/api/agent/v1/qm-automation/status', async (req, res) => {
  try {
    const { requestId } = req.query;

    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }

    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const dynamoClient = new DynamoDBClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const tableName = `aicc-${prefix}-ddb-gemini-response`;

    // pk가 "requestId#<uuid>" 형식
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: `requestId#${requestId}` },
      },
      Limit: 1,
    });

    const response = await dynamoClient.send(command);

    if (!response.Items || response.Items.length === 0) {
      return res.status(404).json({ error: 'QM Automation not found' });
    }

    const item = unmarshallItem(response.Items[0]);

    res.json({
      requestId: item.requestId,
      contactId: item.contactId,
      agentId: item.agentId,
      status: item.status,
      createdAt: item.sk,
      completedAt: item.completedAt,
      connectedToAgentTimestamp: item.connectedToAgentTimestamp,
      result: item.result,
      input: item.input,
      error: item.error,
    });
  } catch (error) {
    console.error('Error fetching QM Automation status:', error);
    res.status(500).json({ error: 'Failed to fetch QM Automation status', message: error.message });
  }
});

/**
 * QM Automation 월별 목록 조회 (gsi_yearmm GSI 사용)
 *
 * GET /api/agent/v1/qm-automation/statistics?month=YYYYMM&limit=100
 * Headers: x-aws-credentials, x-aws-region, x-environment
 */
app.get('/api/agent/v1/qm-automation/statistics', async (req, res) => {
  try {
    const { month, limit = 100 } = req.query;

    if (!month) {
      return res.status(400).json({ error: 'month (YYYYMM format) is required' });
    }

    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const dynamoClient = new DynamoDBClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const tableName = `aicc-${prefix}-ddb-gemini-response`;
    const indexName = `aicc-${prefix}-ddb-gemini-response-gsi-yearmm`;

    // connectedToAgentYYYYMM은 "QM#YYYYMM" 형식
    const command = new QueryCommand({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: 'connectedToAgentYYYYMM = :yearMonth',
      ExpressionAttributeValues: {
        ':yearMonth': { S: `QM#${month}` },
      },
      ScanIndexForward: false,
      Limit: parseInt(limit, 10),
    });

    const response = await dynamoClient.send(command);

    if (!response.Items || response.Items.length === 0) {
      return res.json({ items: [] });
    }

    const items = response.Items.map(item => {
      const unmarshalled = unmarshallItem(item);
      return {
        requestId: unmarshalled.requestId,
        contactId: unmarshalled.contactId,
        agentId: unmarshalled.agentId,
        status: unmarshalled.status,
        createdAt: unmarshalled.sk,
        completedAt: unmarshalled.completedAt,
        connectedToAgentTimestamp: unmarshalled.connectedToAgentTimestamp,
        geminiModel: unmarshalled.result?.geminiModel || unmarshalled.input?.model,
        processingTime: unmarshalled.result?.processingTime,
      };
    });

    res.json({ items });
  } catch (error) {
    console.error('Error fetching QM Automation statistics:', error);
    res.status(500).json({ error: 'Failed to fetch QM Automation statistics', message: error.message });
  }
});

/**
 * QM Automation Agent별 목록 조회 (gsi_agentId GSI 사용)
 *
 * GET /api/agent/v1/qm-automation/agent/:agentId/history?limit=100
 * Headers: x-aws-credentials, x-aws-region, x-environment
 */
app.get('/api/agent/v1/qm-automation/agent/:agentId/history', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { limit = 100 } = req.query;

    if (!agentId) {
      return res.status(400).json({ error: 'agentId is required' });
    }

    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const dynamoClient = new DynamoDBClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const tableName = `aicc-${prefix}-ddb-gemini-response`;
    const indexName = `aicc-${prefix}-ddb-gemini-response-gsi-agentId`;

    const command = new QueryCommand({
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: 'agentId = :agentId',
      ExpressionAttributeValues: {
        ':agentId': { S: agentId },
      },
      ScanIndexForward: false,
      Limit: parseInt(limit, 10),
    });

    const response = await dynamoClient.send(command);

    if (!response.Items || response.Items.length === 0) {
      return res.json({ items: [] });
    }

    const items = response.Items.map(item => {
      const unmarshalled = unmarshallItem(item);
      return {
        requestId: unmarshalled.requestId,
        contactId: unmarshalled.contactId,
        agentId: unmarshalled.agentId,
        status: unmarshalled.status,
        createdAt: unmarshalled.sk,
        completedAt: unmarshalled.completedAt,
        geminiModel: unmarshalled.result?.geminiModel || unmarshalled.input?.model,
        processingTime: unmarshalled.result?.processingTime,
      };
    });

    res.json({ items });
  } catch (error) {
    console.error('Error fetching agent QM history:', error);
    res.status(500).json({ error: 'Failed to fetch agent QM history', message: error.message });
  }
});

/**
 * QM Automation 검색 (기간 조회)
 *
 * POST /api/agent/v1/qm-automation/search
 * Body: { startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD" }
 */
app.post('/api/agent/v1/qm-automation/search', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const dynamoClient = new DynamoDBClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const tableName = `aicc-${prefix}-ddb-gemini-response`;
    const indexName = `aicc-${prefix}-ddb-gemini-response-gsi-yearmm`;

    // 1. 기간 내의 모든 YYYYMM 목록 생성
    const start = new Date(startDate);
    const end = new Date(endDate);
    // end date를 해당일의 23:59:59.999로 설정하여 포함되도록 함
    end.setHours(23, 59, 59, 999);

    const months = [];
    const current = new Date(start);
    current.setDate(1); // 1일로 설정하여 달 루프

    while (current <= end) {
      const yyyy = current.getFullYear();
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      months.push(`${yyyy}${mm}`);
      current.setMonth(current.getMonth() + 1);
    }

    // 마지막 달이 루프 조건에 의해 빠질 수 있으므로 확인 (end 날짜의 달)
    const endYyyy = end.getFullYear();
    const endMm = String(end.getMonth() + 1).padStart(2, '0');
    const endMonthStr = `${endYyyy}${endMm}`;
    if (!months.includes(endMonthStr) && start <= end) {
      months.push(endMonthStr);
    }

    // 2. 각 달에 대해 병렬 쿼리 실행
    const promises = months.map(async month => {
      const params = {
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: 'connectedToAgentYYYYMM = :yearMonth',
        ExpressionAttributeValues: {
          ':yearMonth': { S: `QM#${month}` },
        },
        ScanIndexForward: false, // DESC
      };

      try {
        const response = await dynamoClient.send(new QueryCommand(params));
        return response.Items || [];
      } catch (e) {
        console.error(`Error querying month ${month}:`, e);
        return [];
      }
    });

    const results = await Promise.all(promises);
    const allItems = results.flat();

    // 3. 필터링 및 정렬
    const items = allItems.map(item => {
      const unmarshalled = unmarshallItem(item);
      return {
        requestId: unmarshalled.requestId,
        contactId: unmarshalled.contactId,
        agentId: unmarshalled.agentId,
        status: unmarshalled.status,
        createdAt: unmarshalled.sk, // stored as ISO string in SK? User said connectedToAgentTimestamp is SK, but mapping logic usually puts sk as sort key. 
        // Let's trust unmarshalled.sk is the timestamp if mapping logic is correct.
        // If unmarshalled.sk is just the sort key value, and user says sort key is connectedToAgentTimestamp, then unmarshalled.sk IS the timestamp.
        completedAt: unmarshalled.completedAt,
        geminiModel: unmarshalled.result?.geminiModel || unmarshalled.input?.model,
        processingTime: unmarshalled.result?.processingTime,
        result: unmarshalled.result,
        input: unmarshalled.input,
        connectedToAgentTimestamp: unmarshalled.connectedToAgentTimestamp, // GSI SK
      };
    }).filter(item => {
      // 날짜 필터링 (DB에서 못하고 가져온 후 수행)
      // 비교할 대상은 createdAT (sk) 또는 connectedToAgentTimestamp
      // User said: connectedToAgentTimestamp is SK. 
      // Safe to use item.createdAt or item.connectedToAgentTimestamp. 
      const itemDate = new Date(item.connectedToAgentTimestamp || item.createdAt);
      return itemDate >= start && itemDate <= end;
    });

    // 최신순 정렬
    items.sort((a, b) => {
      const dateA = new Date(a.connectedToAgentTimestamp || a.createdAt).getTime();
      const dateB = new Date(b.connectedToAgentTimestamp || b.createdAt).getTime();
      return dateB - dateA;
    });

    res.json({ items });
  } catch (error) {
    console.error('Error searching QM Automation list:', error);
    res.status(500).json({ error: 'Failed to search QM Automation list', message: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  AWS Connect Contact Tracer - Backend API Server        ║
║  Running on http://localhost:${PORT}                        ║
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
- POST /api/search/customer      - Customer 검색 (Phone/ProfileID/Skypass)
- POST /api/search/agent         - Agent 검색 (UUID/Email/Name)
- POST /api/search/contact-flow  - Contact Flow 이름으로 검색
- POST /api/search/dnis          - DNIS로 검색
- POST /api/search/lambda-error  - Lambda 에러 로그 검색

[QM Automation APIs]
- GET  /api/agent/v1/qm-automation/list?contactId=xxx     - Contact별 QM 목록
- GET  /api/agent/v1/qm-automation/status?requestId=xxx   - QM 상세 조회
- GET  /api/agent/v1/qm-automation/statistics?month=YYYYMM - 월별 QM 통계
- GET  /api/agent/v1/qm-automation/agent/:agentId/history  - Agent별 QM 이력

[Health]
- GET  /health                   - Health check
  `);
});
