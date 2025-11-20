/**
 * Credential Service
 * 백엔드 API를 통해 AWS SSO 자격 증명을 가져옵니다.
 */

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: string;
}

/**
 * 백엔드 API를 통해 SSO 자격 증명을 가져옵니다.
 *
 * 사용 방법:
 * 1. 백엔드 서버에서 `aws sso login --profile <profile-name>`을 먼저 실행
 * 2. 백엔드 API에서 credential을 읽어서 반환
 * 3. 프론트엔드에서 이 함수를 호출하여 credential을 받음
 *
 * @param profile - AWS SSO 프로필 이름
 * @returns AWS 자격 증명
 */
export async function fetchSSOCredentials(profile?: string): Promise<AWSCredentials> {
  try {
    const response = await fetch('/api/aws/credentials', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ profile }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch credentials: ${response.statusText}`);
    }

    const credentials = await response.json();
    return credentials;
  } catch (error) {
    console.error('Error fetching SSO credentials:', error);
    throw new Error(
      'SSO 자격 증명을 가져올 수 없습니다. 백엔드 서버가 실행 중인지 확인하세요.'
    );
  }
}

/**
 * 환경 변수에서 자격 증명을 가져옵니다 (개발용)
 * .env 파일에 다음 값을 설정하세요:
 * REACT_APP_AWS_ACCESS_KEY_ID=your_access_key
 * REACT_APP_AWS_SECRET_ACCESS_KEY=your_secret_key
 * REACT_APP_AWS_SESSION_TOKEN=your_session_token (선택사항)
 */
export function getCredentialsFromEnv(): AWSCredentials | null {
  const accessKeyId = process.env.REACT_APP_AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.REACT_APP_AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.REACT_APP_AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return {
    accessKeyId,
    secretAccessKey,
    sessionToken,
  };
}

/**
 * 백엔드 API를 통해 현재 AWS SSO 프로필에서 자격 증명을 자동으로 가져옵니다.
 * 이 함수는 사용자가 이미 aws sso login을 실행한 상태를 가정합니다.
 */
export async function autoFetchSSOCredentials(): Promise<{
  credentials: AWSCredentials;
  profile: string;
  region: string;
} | null> {
  try {
    const response = await fetch('/api/aws/auto-credentials', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error auto-fetching SSO credentials:', error);
    return null;
  }
}

/**
 * 백엔드 API를 통해 AWS 프로필에서 리전 정보를 가져옵니다.
 */
export async function getRegionFromProfile(profile?: string): Promise<string | null> {
  try {
    const response = await fetch('/api/aws/region', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ profile }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.region;
  } catch (error) {
    console.error('Error fetching region from profile:', error);
    return null;
  }
}

/**
 * AWS SDK v3 호환 Credential Provider를 생성합니다.
 * 이 Provider는 자격 증명이 만료되기 전에 자동으로 갱신합니다.
 */
export function createAutoRenewingCredentialProvider(profile?: string) {
  let cachedCredentials: AWSCredentials | null = null;
  let refreshPromise: Promise<AWSCredentials> | null = null;

  return async () => {
    // 1. Check if we have valid cached credentials
    if (cachedCredentials) {
      const now = new Date();
      // If expiration is missing, assume valid (or let SDK handle it)
      // If expiration exists, check if it's expired or expiring soon (within 5 mins)
      if (cachedCredentials.expiration) {
        const expiration = new Date(cachedCredentials.expiration);
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

        if (expiration > fiveMinutesFromNow) {
          return {
            accessKeyId: cachedCredentials.accessKeyId,
            secretAccessKey: cachedCredentials.secretAccessKey,
            sessionToken: cachedCredentials.sessionToken,
            expiration: expiration,
          };
        }
      } else {
        // If no expiration provided, just return what we have
        // The SDK might fail if it's actually expired, but we can't know
        return {
          accessKeyId: cachedCredentials.accessKeyId,
          secretAccessKey: cachedCredentials.secretAccessKey,
          sessionToken: cachedCredentials.sessionToken,
        };
      }
    }

    // 2. Refresh credentials
    if (!refreshPromise) {
      refreshPromise = (async () => {
        try {
          console.log('Refreshing AWS credentials...');
          let newCreds: AWSCredentials;

          if (profile) {
            newCreds = await fetchSSOCredentials(profile);
          } else {
            // Try auto-fetch if no profile specified
            const result = await autoFetchSSOCredentials();
            if (result) {
              newCreds = result.credentials;
            } else {
              throw new Error('Failed to auto-fetch credentials');
            }
          }

          cachedCredentials = newCreds;
          return newCreds;
        } finally {
          refreshPromise = null;
        }
      })();
    }

    const creds = await refreshPromise;

    return {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
      expiration: creds.expiration ? new Date(creds.expiration) : undefined,
    };
  };
}
