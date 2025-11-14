# AWS SSO 자격 증명 설정 가이드

이 가이드는 로컬 개발 환경에서 AWS SSO 프로필을 사용하여 애플리케이션에 자격 증명을 주입하는 방법을 설명합니다.

## 방법 1: 백엔드 Proxy Server 사용 (권장)

### 1. 백엔드 서버 의존성 설치

```bash
npm install --save-dev express @aws-sdk/credential-provider-node @aws-sdk/credential-provider-sso
```

### 2. AWS SSO 로그인

```bash
# 특정 프로필로 로그인
aws sso login --profile your-profile-name

# 또는 기본 프로필로 로그인
aws sso login
```

### 3. 백엔드 서버 실행

별도 터미널에서:

```bash
node server.js
```

서버가 `http://localhost:8080`에서 실행됩니다.

### 4. 프론트엔드 실행

```bash
npm start
```

### 5. Settings 페이지에서 설정

1. 브라우저에서 `http://localhost:3000/settings` 접속
2. "AWS SSO Profile" 필드에 프로필 이름 입력 (예: `your-profile-name`)
3. "SSO 자격 증명 가져오기" 버튼 클릭
4. "저장" 버튼 클릭

## 방법 2: 환경 변수 사용

### 1. STS 토큰 생성

먼저 AWS STS를 사용하여 임시 자격 증명을 생성합니다:

```bash
# SSO 로그인
aws sso login --profile your-profile-name

# 자격 증명 확인
aws sts get-caller-identity --profile your-profile-name

# 자격 증명 가져오기 (아래 명령은 credentials를 출력합니다)
aws configure export-credentials --profile your-profile-name --format env
```

### 2. .env 파일 생성

프로젝트 루트에 `.env` 파일을 생성하고 다음 내용을 추가:

```env
REACT_APP_AWS_ACCESS_KEY_ID=ASIAXXXXXXXXXXX
REACT_APP_AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxx
REACT_APP_AWS_SESSION_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 3. 애플리케이션 실행

```bash
npm start
```

### 4. Settings 페이지에서 설정

1. 브라우저에서 `http://localhost:3000/settings` 접속
2. "환경 변수에서 가져오기" 버튼 클릭
3. "저장" 버튼 클릭

## 방법 3: 수동 입력

AWS 콘솔에서 임시 자격 증명을 복사하여 Settings 페이지에 직접 입력할 수 있습니다.

1. AWS CloudShell 또는 로컬 터미널에서:
```bash
aws sts get-session-token --profile your-profile-name
```

2. 출력된 자격 증명을 Settings 페이지의 해당 필드에 입력

## 자격 증명 갱신

AWS SSO 토큰은 일정 시간(보통 1시간)이 지나면 만료됩니다. 만료 시:

1. 다시 `aws sso login` 실행
2. Settings 페이지에서 "SSO 자격 증명 가져오기" 다시 클릭
3. 또는 환경 변수 갱신 후 "환경 변수에서 가져오기" 클릭

## 문제 해결

### 백엔드 서버 연결 실패

- `package.json`의 `proxy` 설정이 `http://localhost:8080`인지 확인
- 백엔드 서버가 실행 중인지 확인
- CORS 오류가 발생하면 백엔드 서버의 CORS 설정 확인

### SSO 로그인 실패

```bash
# AWS SSO 설정 확인
cat ~/.aws/config

# SSO 세션 확인
aws sso login --profile your-profile-name

# 캐시 삭제 후 재시도
rm -rf ~/.aws/sso/cache/*
aws sso login --profile your-profile-name
```

### 자격 증명 만료

증상: API 호출 시 "ExpiredToken" 오류

해결:
1. `aws sso login` 재실행
2. Settings에서 자격 증명 다시 가져오기

## 보안 주의사항

⚠️ **중요:**

- `.env` 파일은 절대 git에 커밋하지 마세요
- 프로덕션 환경에서는 IAM 역할이나 Cognito를 사용하세요
- 로컬 개발용으로만 이 방법을 사용하세요
- 자격 증명을 localStorage에 저장하므로, 공용 컴퓨터에서는 사용을 피하세요

## 프로덕션 배포

프로덕션 환경에서는:

1. **Cognito User Pools** 사용
2. **IAM Roles for Web Identity Federation**
3. **API Gateway + Lambda Authorizer**
4. **백엔드 API를 통한 프록시 방식**

등의 보안 방법을 고려하세요.
