# Quick Start Guide - AWS SSO 자격 증명 설정

## 문제 해결: "AWSConnectService not initialized" 오류

이 오류는 AWS 자격 증명이 설정되지 않았을 때 발생합니다. 아래 단계를 따라 해결하세요.

---

## 🚀 빠른 시작 (권장)

### 1. 백엔드 서버 실행

터미널 1에서:

```bash
# 백엔드 의존성 설치 (최초 1회)
npm install --save-dev express @aws-sdk/credential-provider-node @aws-sdk/credential-provider-sso

# AWS SSO 로그인
aws sso login --profile your-profile-name

# 백엔드 서버 시작
node server.js
```

### 2. 프론트엔드 실행

터미널 2에서:

```bash
npm start
```

### 3. 브라우저에서 설정

1. 브라우저가 자동으로 열립니다 (http://localhost:3000)
2. 상단 메뉴에서 **Settings** 클릭
3. **AWS SSO Profile** 필드에 프로필 이름 입력 (예: `your-profile-name`)
4. **"SSO 자격 증명 가져오기"** 버튼 클릭
5. **"저장"** 버튼 클릭

### 4. Contact ID 조회

1. Dashboard로 돌아가기
2. Contact ID 입력
3. Search 버튼 클릭

✅ 이제 정상적으로 작동합니다!

---

## 💡 대체 방법: 환경 변수 사용

백엔드 서버 없이 사용하려면:

### 1. AWS 자격 증명 가져오기

```bash
# SSO 로그인
aws sso login --profile your-profile-name

# 임시 자격 증명 추출
aws configure export-credentials --profile your-profile-name --format env
```

출력 예시:
```
export AWS_ACCESS_KEY_ID=ASIAXXXXXXXXXXX
export AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxx
export AWS_SESSION_TOKEN=xxxxxxxxxxxxxxxxxxxx
```

### 2. .env 파일 생성

프로젝트 루트에 `.env` 파일 생성:

```env
REACT_APP_AWS_ACCESS_KEY_ID=ASIAXXXXXXXXXXX
REACT_APP_AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxx
REACT_APP_AWS_SESSION_TOKEN=xxxxxxxxxxxxxxxxxxxx
```

### 3. 앱 시작

```bash
npm start
```

### 4. Settings에서 가져오기

1. http://localhost:3000/settings 접속
2. **"환경 변수에서 가져오기"** 버튼 클릭
3. **"저장"** 버튼 클릭

---

## 🔄 자격 증명 갱신

AWS SSO 토큰은 약 1시간 후 만료됩니다. 만료 시:

### 방법 1: 백엔드 서버 사용 중

```bash
# 터미널에서
aws sso login --profile your-profile-name

# 브라우저에서 Settings 페이지
# "SSO 자격 증명 가져오기" 버튼 클릭
# "저장" 버튼 클릭
```

### 방법 2: 환경 변수 사용 중

```bash
# 새 자격 증명 가져오기
aws configure export-credentials --profile your-profile-name --format env

# .env 파일 업데이트
# Settings에서 "환경 변수에서 가져오기" 클릭
```

---

## 📋 체크리스트

설정이 잘 되었는지 확인:

- [ ] `npm install` 완료
- [ ] AWS CLI 설치됨 (`aws --version`)
- [ ] AWS SSO 설정됨 (`~/.aws/config` 확인)
- [ ] AWS SSO 로그인됨 (`aws sso login`)
- [ ] 백엔드 서버 실행 중 (http://localhost:8080/health 접속해보기)
- [ ] 프론트엔드 실행 중 (http://localhost:3000)
- [ ] Settings에서 자격 증명 가져오기 완료
- [ ] Settings에서 Instance ID 등 AWS 설정 완료
- [ ] "저장" 버튼 클릭 완료

---

## ❌ 문제 해결

### 백엔드 서버 연결 실패

**증상:** "Failed to fetch credentials" 오류

**해결:**
```bash
# 1. 백엔드 서버가 실행 중인지 확인
curl http://localhost:8080/health

# 2. 실행 중이 아니면
node server.js

# 3. 포트가 사용 중이면
lsof -ti:8080 | xargs kill -9
node server.js
```

### SSO 로그인 실패

**증상:** "SSO session has expired"

**해결:**
```bash
# 캐시 삭제
rm -rf ~/.aws/sso/cache/*

# 다시 로그인
aws sso login --profile your-profile-name
```

### Contact ID 조회 시 오류

**증상:** "AWSConnectService not initialized"

**원인:** 자격 증명이 설정되지 않았거나 만료됨

**해결:**
1. Settings 페이지 이동
2. "SSO 자격 증명 가져오기" 다시 클릭
3. "저장" 클릭

### 권한 오류

**증상:** "AccessDeniedException" 또는 "UnauthorizedOperation"

**해결:**
- AWS IAM에서 다음 권한 확인:
  - `connect:DescribeContact`
  - `connect:SearchContacts`
  - `logs:StartQuery`
  - `logs:GetQueryResults`
  - `s3:GetObject`
  - `xray:GetTraceSummaries`
  - `xray:GetTraceGraph`

---

## 🔐 보안 주의사항

⚠️ **중요:**

1. **`.env` 파일을 git에 커밋하지 마세요**
   - `.gitignore`에 추가되어 있는지 확인

2. **로컬 개발용으로만 사용**
   - 프로덕션에서는 Cognito, IAM Role 등 사용

3. **공용 컴퓨터에서 주의**
   - 자격 증명이 localStorage에 저장됨
   - 사용 후 브라우저 데이터 삭제 권장

4. **토큰 만료 주기적 확인**
   - 1시간마다 갱신 필요
   - 만료 시 즉시 갱신

---

## 📞 도움이 필요하신가요?

자세한 내용은 [AWS_SSO_SETUP.md](AWS_SSO_SETUP.md)를 참고하세요.
