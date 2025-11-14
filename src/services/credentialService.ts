/**
 * Credential Service
 * 백엔드 API를 통해 AWS SSO 자격 증명을 가져옵니다.
 */

export interface AWSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
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
