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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  AWS SSO Credentials Proxy Server                        ║
║  Running on http://localhost:${PORT}                        ║
╚══════════════════════════════════════════════════════════╝

사용 전 준비:
1. AWS SSO 로그인:
   aws sso login --profile <your-profile>

2. 프론트엔드 실행:
   npm start

3. Settings 페이지에서 "SSO 자격 증명 가져오기" 클릭

엔드포인트:
- POST /api/aws/credentials - SSO 자격 증명 가져오기
- GET  /health              - Health check
  `);
});
