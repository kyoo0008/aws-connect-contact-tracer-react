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
 * credentials 파싱 및 expiration Date 변환
 */
function parseCredentials(credentialsHeader) {
  if (!credentialsHeader) {
    return null;
  }

  const credentials = JSON.parse(credentialsHeader);

  // Handle both lowercase 'expiration' and uppercase 'Expiration'
  if (credentials.expiration && typeof credentials.expiration === 'string') {
    credentials.expiration = new Date(credentials.expiration);
  } else if (credentials.Expiration && typeof credentials.Expiration === 'string') {
    credentials.expiration = new Date(credentials.Expiration);
    delete credentials.Expiration; // Remove uppercase version
  }

  return credentials;
}

// ========================================
// API Endpoints
// ========================================

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
        expiration: credentials.expiration instanceof Date
          ? credentials.expiration.toISOString()
          : credentials.expiration,
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
    const { searchValue, searchType, credentials: rawCredentials, region, environment } = req.body;

    // Parse credentials to ensure expiration is a Date object
    const credentials = {
      accessKeyId: rawCredentials.accessKeyId,
      secretAccessKey: rawCredentials.secretAccessKey,
      sessionToken: rawCredentials.sessionToken,
      expiration: rawCredentials.expiration
        ? (rawCredentials.expiration instanceof Date
          ? rawCredentials.expiration
          : new Date(rawCredentials.expiration))
        : undefined
    };

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
    const { searchValue, searchType, credentials: rawCredentials, region, instanceId, environment } = req.body;

    // Parse credentials to ensure expiration is a Date object
    const credentials = {
      accessKeyId: rawCredentials.accessKeyId,
      secretAccessKey: rawCredentials.secretAccessKey,
      sessionToken: rawCredentials.sessionToken,
      expiration: rawCredentials.expiration
        ? (rawCredentials.expiration instanceof Date
          ? rawCredentials.expiration
          : new Date(rawCredentials.expiration))
        : undefined
    };

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

    // DynamoDB에서 agent의 contact 조회 (credentials already parsed above)
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
 * Connect 사용자 검색 (Username으로 User ID 조회)
 *
 * GET /api/agent/v1/connect/search-user?username=xxx
 * Headers: x-aws-credentials, x-aws-region, x-environment
 *
 * Response: { userId: "uuid-v4" }
 */
app.get('/api/agent/v1/connect/search-user', async (req, res) => {
  try {
    const { username } = req.query;
    const credentials = parseCredentials(req.headers['x-aws-credentials']);
    const region = req.headers['x-aws-region'];
    const environment = req.headers['x-environment'];
    let instanceId = req.headers['x-instance-id'];

    console.log('[search-user] Request info:', {
      username,
      region,
      environment,
      instanceId,
      credentialsPresent: !!credentials,
      credentialsKeys: credentials ? Object.keys(credentials) : [],
    });

    if (!username) {
      return res.status(400).json({ error: 'username is required' });
    }

    if (!credentials) {
      return res.status(400).json({ error: 'credentials are required' });
    }

    // instanceId가 헤더에 없으면 AWS 환경 설정에서 가져오기 (fallback)
    if (!instanceId) {
      try {
        const awsConfigPath = path.join(os.homedir(), '.aws', 'config');
        const configContent = fs.readFileSync(awsConfigPath, 'utf-8');
        const config = ini.parse(configContent);

        // 프로필에서 instanceId 찾기
        for (const [key, value] of Object.entries(config)) {
          if (key.includes(environment) && value.connect_instance_id) {
            instanceId = value.connect_instance_id;
            break;
          }
        }
      } catch (error) {
        console.error('Failed to read AWS config file:', error);
      }
    }

    if (!instanceId) {
      return res.status(400).json({ error: 'instanceId not found. Please provide x-instance-id header or configure it in AWS config file.' });
    }

    // Debug: Log credentials structure (without sensitive values)
    console.log('[search-user] Credentials structure:', {
      hasAccessKeyId: !!credentials.accessKeyId,
      hasSecretAccessKey: !!credentials.secretAccessKey,
      hasSessionToken: !!credentials.sessionToken,
      hasExpiration: !!credentials.expiration,
      expirationIsDate: credentials.expiration instanceof Date,
    });

    const connectClient = new ConnectClient({
      region,
      credentials,
    });

    // SearchUsers 명령 실행
    const command = new SearchUsersCommand({
      InstanceId: instanceId,
      SearchFilter: {
        TagFilter: {
          OrConditions: [],
          AndConditions: [],
          TagCondition: undefined,
        },
      },
      SearchCriteria: {
        StringCondition: {
          FieldName: 'Username',
          Value: username,
          ComparisonType: 'EXACT',
        },
      },
      MaxResults: 1,
    });

    const response = await connectClient.send(command);

    // 사용자를 찾았으면 첫 번째 사용자의 ID 반환
    if (response.Users && response.Users.length > 0 && response.Users[0].Id) {
      return res.json({ userId: response.Users[0].Id });
    }

    // 사용자를 찾지 못함
    return res.status(404).json({ error: 'User not found', username });
  } catch (error) {
    console.error('Error searching Connect user:', error);
    res.status(500).json({ error: 'Failed to search Connect user', message: error.message });
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
    const { flowName, credentials: rawCredentials, region, instanceAlias } = req.body;

    // Parse credentials to ensure expiration is a Date object
    const credentials = {
      accessKeyId: rawCredentials.accessKeyId,
      secretAccessKey: rawCredentials.secretAccessKey,
      sessionToken: rawCredentials.sessionToken,
      expiration: rawCredentials.expiration
        ? (rawCredentials.expiration instanceof Date
          ? rawCredentials.expiration
          : new Date(rawCredentials.expiration))
        : undefined
    };

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
    const { dnis, credentials: rawCredentials, region, instanceAlias } = req.body;

    // Parse credentials to ensure expiration is a Date object
    const credentials = {
      accessKeyId: rawCredentials.accessKeyId,
      secretAccessKey: rawCredentials.secretAccessKey,
      sessionToken: rawCredentials.sessionToken,
      expiration: rawCredentials.expiration
        ? (rawCredentials.expiration instanceof Date
          ? rawCredentials.expiration
          : new Date(rawCredentials.expiration))
        : undefined
    };

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
    const { credentials: rawCredentials, region } = req.body;

    // Parse credentials to ensure expiration is a Date object
    const credentials = {
      accessKeyId: rawCredentials.accessKeyId,
      secretAccessKey: rawCredentials.secretAccessKey,
      sessionToken: rawCredentials.sessionToken,
      expiration: rawCredentials.expiration
        ? (rawCredentials.expiration instanceof Date
          ? rawCredentials.expiration
          : new Date(rawCredentials.expiration))
        : undefined
    };

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
 * 요청 헤더에서 credentials 가져오기 또는 기본 provider 사용
 */
async function getCredentialsFromRequest(req) {
  const credentialsHeader = req.headers['x-aws-credentials'];

  if (credentialsHeader) {
    return parseCredentials(credentialsHeader);
  } else {
    const credentialProvider = defaultProvider();
    const creds = await credentialProvider();
    // Ensure expiration is a Date object
    if (creds.expiration && typeof creds.expiration === 'string') {
      creds.expiration = new Date(creds.expiration);
    } else if (creds.Expiration && typeof creds.Expiration === 'string') {
      creds.expiration = new Date(creds.Expiration);
      delete creds.Expiration;
    }
    return creds;
  }
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
 * QM Automation 상세 조회 (Lambda 호출)
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

    const lambdaClient = new LambdaClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;

    // Construct ALB-like event payload
    const payload = {
      httpMethod: 'GET',
      path: '/api/agent/v1/qm-automation/status',
      headers: {
        'Content-Type': 'application/json'
      },
      queryStringParameters: {
        requestId: requestId
      }
    };

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);

    // Lambda (ALB Proxy 타입) 응답 파싱
    const result = JSON.parse(Buffer.from(response.Payload).toString());

    const statusCode = result.statusCode || 200;

    if (result.body) {
      const responseData = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;

      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: responseData.error || responseData.message || 'Request failed',
          message: responseData.error || responseData.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(responseData.data || responseData);
    } else {
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: result.error || result.message || 'Request failed',
          message: result.error || result.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(result.data || result);
    }
  } catch (error) {
    console.error('Error invoking QM Automation Status Lambda:', error);
    res.status(500).json({ error: 'Failed to fetch QM Automation status', message: error.message });
  }
});

/**
 * QM Automation 검색 (다중 필터)
 *
 * GET /api/agent/v1/qm-automation/search
 * Query: startMonth, endMonth, agentId, agentUserName, agentConfirmYN, qaFeedbackYN, qmEvaluationStatus, contactId, limit
 * Headers: x-aws-credentials, x-aws-region, x-environment
 */
app.get('/api/agent/v1/qm-automation/search', async (req, res) => {
  try {
    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const lambdaClient = new LambdaClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;

    // Construct ALB-like event payload with all query parameters
    const queryStringParameters = {};
    const allowedParams = [
      'startMonth', 'endMonth', 'agentId', 'agentUserName', 'agentCenter',
      'agentConfirmYN', 'qaFeedbackYN', 'qmEvaluationStatus', 'contactId', 'qaAgentUserName'
    ];

    for (const param of allowedParams) {
      if (req.query[param]) {
        queryStringParameters[param] = req.query[param];
      }
    }

    const payload = {
      httpMethod: 'GET',
      path: '/api/agent/v1/qm-automation/search',
      headers: {
        'Content-Type': 'application/json'
      },
      queryStringParameters
    };

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);

    // Lambda (ALB Proxy 타입) 응답 파싱
    const result = JSON.parse(Buffer.from(response.Payload).toString());

    const statusCode = result.statusCode || 200;

    if (result.body) {
      const responseData = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;

      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: responseData.error || responseData.message || 'Request failed',
          message: responseData.error || responseData.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(responseData.data || responseData);
    } else {
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: result.error || result.message || 'Request failed',
          message: result.error || result.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(result.data || result);
    }
  } catch (error) {
    console.error('Error invoking QM Automation Search Lambda:', error);
    res.status(500).json({ error: 'Failed to search QM Automation list', message: error.message });
  }
});

// ========================================
// QM Evaluation State APIs (이의제기/확인)
// ========================================

/**
 * 상담사 확인 (Agent Confirm)
 * 상태: GEMINI_EVAL_COMPLETED → AGENT_CONFIRM_COMPLETED
 *
 * POST /api/agent/v1/qm-automation/confirm
 * Body: { requestId, category, userId, userName? }
 * Headers: x-aws-credentials, x-aws-region, x-environment
 */
app.post('/api/agent/v1/qm-automation/confirm', async (req, res) => {
  try {
    const requestBody = req.body;
    const { requestId, category, userId } = requestBody;

    // 필수 파라미터 검증
    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    if (!userId || userId.trim() === '') {
      return res.status(400).json({ error: 'userId is required' });
    }

    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const lambdaClient = new LambdaClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;

    const payload = {
      httpMethod: 'POST',
      path: '/api/agent/v1/qm-automation/confirm',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    };

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(Buffer.from(response.Payload).toString());
    const statusCode = result.statusCode || 200;

    if (result.body) {
      const responseData = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;

      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: responseData.error || responseData.message || 'Request failed',
          message: responseData.error || responseData.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(responseData.data || responseData);
    } else {
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: result.error || result.message || 'Request failed',
          message: result.error || result.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(result.data || result);
    }
  } catch (error) {
    console.error('Error invoking Agent Confirm Lambda:', error);
    res.status(500).json({ error: 'Failed to confirm evaluation', message: error.message });
  }
});

/**
 * 상담사 이의제기 (Agent Objection)
 * 상태: GEMINI_EVAL_COMPLETED → AGENT_OBJECTION_REQUESTED (FAIL인 경우만)
 *
 * POST /api/agent/v1/qm-automation/objection
 * Body: { requestId, category, reason, userId, userName? }
 * Headers: x-aws-credentials, x-aws-region, x-environment
 */
app.post('/api/agent/v1/qm-automation/objection', async (req, res) => {
  try {
    const requestBody = req.body;
    const { requestId, category, reason, userId } = requestBody;

    // 필수 파라미터 검증
    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'reason is required' });
    }
    if (!userId || userId.trim() === '') {
      return res.status(400).json({ error: 'userId is required' });
    }

    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const lambdaClient = new LambdaClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;

    const payload = {
      httpMethod: 'POST',
      path: '/api/agent/v1/qm-automation/objection',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    };

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(Buffer.from(response.Payload).toString());
    const statusCode = result.statusCode || 200;

    if (result.body) {
      const responseData = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;

      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: responseData.error || responseData.message || 'Request failed',
          message: responseData.error || responseData.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(responseData.data || responseData);
    } else {
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: result.error || result.message || 'Request failed',
          message: result.error || result.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(result.data || result);
    }
  } catch (error) {
    console.error('Error invoking Agent Objection Lambda:', error);
    res.status(500).json({ error: 'Failed to submit objection', message: error.message });
  }
});

/**
 * QA 피드백 (이의 승인/거절)
 * 상태: AGENT_OBJECTION_REQUESTED → QA_AGENT_OBJECTION_ACCEPTED 또는 QA_AGENT_OBJECTION_REJECTED
 *
 * POST /api/agent/v1/qm-automation/qa-feedback
 * Body: { requestId, category, action: 'accept'|'reject', reason, userId, userName? }
 * Headers: x-aws-credentials, x-aws-region, x-environment
 */
app.post('/api/agent/v1/qm-automation/qa-feedback', async (req, res) => {
  try {
    const requestBody = req.body;
    const { requestId, category, action, reason, userId } = requestBody;

    // 필수 파라미터 검증
    if (!requestId) {
      return res.status(400).json({ error: 'requestId is required' });
    }
    if (!category) {
      return res.status(400).json({ error: 'category is required' });
    }
    if (!action || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: "action is required and must be 'accept' or 'reject'" });
    }
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'reason is required' });
    }
    if (!userId || userId.trim() === '') {
      return res.status(400).json({ error: 'userId is required' });
    }

    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const credentials = await getCredentialsFromRequest(req);

    const lambdaClient = new LambdaClient({
      region,
      credentials,
    });

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');
    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;

    const payload = {
      httpMethod: 'POST',
      path: '/api/agent/v1/qm-automation/qa-feedback',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    };

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload),
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(Buffer.from(response.Payload).toString());
    const statusCode = result.statusCode || 200;

    if (result.body) {
      const responseData = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;

      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: responseData.error || responseData.message || 'Request failed',
          message: responseData.error || responseData.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(responseData.data || responseData);
    } else {
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: result.error || result.message || 'Request failed',
          message: result.error || result.message || 'Unknown error',
          statusCode: statusCode
        });
      }

      res.status(statusCode).json(result.data || result);
    }
  } catch (error) {
    console.error('Error invoking QA Feedback Lambda:', error);
    res.status(500).json({ error: 'Failed to submit QA feedback', message: error.message });
  }
});

/**
 * 벌크 상담사 액션 API (확인/이의제기 일괄 처리)
 * POST /api/agent/v1/qm-automation/bulk-action
 * Body: { requestId, actions: [{ category, action, reason? }], userId, userName? }
 */
app.post('/api/agent/v1/qm-automation/agent-bulk-action', async (req, res) => {
  try {
    const { requestId, actions, userId, userName } = req.body;

    if (!requestId || !actions || !Array.isArray(actions) || actions.length === 0 || !userId) {
      return res.status(400).json({
        error: 'requestId, actions (array), userId are required'
      });
    }

    const credentials = getCredentialsFromRequest(req);
    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';

    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');

    const lambdaClient = new LambdaClient({
      region,
      credentials
    });

    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;
    const payload = {
      httpMethod: 'POST',
      path: '/api/agent/v1/qm-automation/agent-bulk-action',
      body: JSON.stringify({ requestId, actions, userId, userName })
    };

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));

    const statusCode = result.statusCode || 200;

    if (result.body) {
      const responseData = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: responseData.error || responseData.message || 'Bulk action failed',
          message: responseData.error || responseData.message || 'Unknown error',
          statusCode: statusCode
        });
      }
      res.status(statusCode).json(responseData.data || responseData);
    } else {
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: result.error || result.message || 'Bulk action failed',
          message: result.error || result.message || 'Unknown error',
          statusCode: statusCode
        });
      }
      res.status(statusCode).json(result.data || result);
    }
  } catch (error) {
    console.error('Error invoking Bulk Agent Action Lambda:', error);
    res.status(500).json({ error: 'Failed to process bulk agent action', message: error.message });
  }
});

/**
 * 벌크 QA 피드백 API (이의제기 승인/거절 일괄 처리)
 * POST /api/agent/v1/qm-automation/qa-bulk-feedback
 * Body: { requestId, actions: [{ category, action, reason }], userId, userName? }
 * Lambda expects: { requestId, feedbacks: [{ category, action, reason }], userId, userName? }
 */
app.post('/api/agent/v1/qm-automation/qa-bulk-feedback', async (req, res) => {
  try {
    const { requestId, actions, userId, userName } = req.body;

    if (!requestId || !actions || !Array.isArray(actions) || actions.length === 0 || !userId) {
      return res.status(400).json({
        error: 'requestId, actions (array), userId are required'
      });
    }

    const credentials = getCredentialsFromRequest(req);
    const region = req.headers['x-aws-region'] || 'ap-northeast-2';
    const environment = req.headers['x-environment'] || 'dev';
    const prefix = environment === 'prd' ? 'prd' : (environment === 'stg' ? 'stg' : 'dev');

    const lambdaClient = new LambdaClient({
      region,
      credentials
    });

    const functionName = `aicc-${prefix}-lmd-alb-agent-qm-automation`;
    // Lambda expects 'feedbacks' field instead of 'actions'
    const payload = {
      httpMethod: 'POST',
      path: '/api/agent/v1/qm-automation/qa-bulk-feedback',
      body: JSON.stringify({ requestId, feedbacks: actions, userId, userName })
    };

    const command = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    });

    const response = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));

    const statusCode = result.statusCode || 200;

    if (result.body) {
      const responseData = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: responseData.error || responseData.message || 'Bulk QA feedback failed',
          message: responseData.error || responseData.message || 'Unknown error',
          statusCode: statusCode
        });
      }
      res.status(statusCode).json(responseData.data || responseData);
    } else {
      if (statusCode >= 400) {
        return res.status(statusCode).json({
          error: result.error || result.message || 'Bulk QA feedback failed',
          message: result.error || result.message || 'Unknown error',
          statusCode: statusCode
        });
      }
      res.status(statusCode).json(result.data || result);
    }
  } catch (error) {
    console.error('Error invoking Bulk QA Feedback Lambda:', error);
    res.status(500).json({ error: 'Failed to process bulk QA feedback', message: error.message });
  }
});

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
- GET  /api/agent/v1/qm-automation/search                       - QM 검색 (다중 필터)

[QM Evaluation State APIs] (이의제기/확인)
- POST /api/agent/v1/qm-automation/confirm                      - 상담사 확인 (GEMINI_EVAL_COMPLETED → AGENT_CONFIRM_COMPLETED)
- POST /api/agent/v1/qm-automation/objection                    - 상담사 이의제기 (GEMINI_EVAL_COMPLETED → AGENT_OBJECTION_REQUESTED)
- POST /api/agent/v1/qm-automation/qa-feedback                  - QA 피드백 (accept: ACCEPTED, reject: REJECTED)
- POST /api/agent/v1/qm-automation/bulk-action                  - 벌크 상담사/QA 액션 (확인/이의제기 or 승인/거절 일괄 처리)

[Health]
- GET  /health                   - Health check
  `);
});
