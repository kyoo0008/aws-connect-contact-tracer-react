/**
 * AWS SSO Credentials Proxy Server
 *
 * 이 서버는 로컬 AWS SSO 자격 증명을 프론트엔드로 전달합니다.
 *
 * 사용 방법:
 * 1. npm install express @aws-sdk/credential-provider-node @aws-sdk/credential-provider-sso
 * 2. aws sso login --profile <your-profile>
 * 3. node server.js
 * 4. 프론트엔드에서 http://localhost:8080 으로 요청
 */

const express = require('express');
const { fromSSO } = require('@aws-sdk/credential-provider-sso');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');
const { ConnectClient, DescribeUserCommand, SearchUsersCommand } = require('@aws-sdk/client-connect');
const { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } = require('@aws-sdk/client-cloudwatch-logs');
const { DynamoDBClient, QueryCommand } = require('@aws-sdk/client-dynamodb');
const { fromIni } = require('@aws-sdk/credential-provider-ini');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ini = require('ini');

const app = express();
const PORT = 8080;

app.use(express.json());

// CORS 설정
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
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
- POST /api/aws/credentials      - SSO 자격 증명 가져오기
- GET  /api/aws/auto-credentials - SSO 자격 증명 자동 가져오기
- POST /api/aws/region           - 프로필에서 리전 가져오기

[Search APIs]
- POST /api/search/customer      - Customer 검색 (Phone/ProfileID/Skypass)
- POST /api/search/agent         - Agent 검색 (UUID/Email/Name)
- POST /api/search/contact-flow  - Contact Flow 이름으로 검색
- POST /api/search/dnis          - DNIS로 검색
- POST /api/search/lambda-error  - Lambda 에러 로그 검색

[Health]
- GET  /health                   - Health check
  `);
});
