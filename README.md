# AWS Connect Contact Tracer - React Version

## 📋 개요

AWS Connect Contact Flow Tracer의 React 기반 웹 애플리케이션 버전입니다. Contact Flow를 시각화하고, 로그를 분석하며, 고객 상담 흐름을 추적할 수 있는 종합적인 도구입니다.

## 🚀 주요 기능

### 1. Contact Flow 시각화
- Contact ID를 통한 실시간 플로우 추적
- 모듈별 실행 상태 시각화
- 에러 및 성공 상태 하이라이팅
- 인터랙티브 노드 클릭으로 상세 정보 확인

### 2. 로그 분석
- CloudWatch Logs 통합
- S3 백업 로그 조회
- Lambda 함수 실행 추적
- X-Ray 트레이싱 통합

### 3. Transcript 분석
- 고객-상담원 대화 내용 표시
- 감정 분석 결과 표시
- 타임라인 기반 대화 흐름

### 4. 대시보드
- 실시간 통계 표시
- 최근 검색 기록
- 빠른 검색 기능
- 고급 검색 옵션

## 🛠️ 기술 스택

- **Frontend Framework**: React 18 with TypeScript
- **UI Library**: Material-UI (MUI) v5
- **Flow Visualization**: React Flow
- **State Management**: React Query (TanStack Query)
- **AWS SDK**: AWS SDK v3
- **Routing**: React Router v6
- **Date Handling**: Day.js
- **Build Tool**: Create React App

## 📦 설치 및 실행

### 사전 요구사항
- Node.js 16.x 이상
- npm 또는 yarn
- AWS 계정 및 자격 증명

### 설치

```bash
# 저장소 클론
cd aws-connect-tracer-react

# 의존성 설치
npm install
# 또는
yarn install
```

### 환경 설정

`.env` 파일을 생성하고 다음 환경 변수를 설정합니다:

```env
REACT_APP_AWS_REGION=ap-northeast-2
REACT_APP_CONNECT_INSTANCE_ID=your-instance-id
REACT_APP_ENVIRONMENT=prd
REACT_APP_LOG_GROUP_NAME=/aws/connect/your-log-group
REACT_APP_S3_BUCKET_PREFIX=your-bucket-prefix
```

### 실행

```bash
# 개발 서버 실행
npm start
# 또는
yarn start
```

브라우저에서 `http://localhost:3000` 접속

### 빌드

```bash
# 프로덕션 빌드
npm run build
# 또는
yarn build
```

## 🔧 AWS 설정

### 필요한 AWS 권한

애플리케이션이 정상적으로 작동하려면 다음 AWS 서비스에 대한 권한이 필요합니다:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "connect:DescribeContact",
        "connect:SearchContacts",
        "connect:GetContactAttributes",
        "logs:StartQuery",
        "logs:GetQueryResults",
        "s3:GetObject",
        "s3:ListBucket",
        "xray:GetTraceGraph",
        "xray:GetTraceSummaries"
      ],
      "Resource": "*"
    }
  ]
}
```

## 📂 프로젝트 구조

```
src/
├── components/          # React 컴포넌트
│   ├── Layout/         # 레이아웃 컴포넌트
│   ├── FlowNodes/      # Flow 노드 컴포넌트
│   └── ...
├── contexts/           # React Context
│   ├── AuthContext.tsx
│   └── ConfigContext.tsx
├── pages/              # 페이지 컴포넌트
│   ├── Dashboard.tsx
│   ├── ContactFlowViewer.tsx
│   └── LogAnalysis.tsx
├── services/           # API 서비스
│   ├── awsConnectService.ts
│   └── flowBuilderService.ts
├── types/              # TypeScript 타입 정의
│   └── contact.types.ts
├── utils/              # 유틸리티 함수
├── hooks/              # Custom React Hooks
└── App.tsx             # 메인 앱 컴포넌트
```

## 🎯 사용 방법

### 1. Contact Flow 추적

1. Dashboard에서 Contact ID 입력
2. "Trace" 버튼 클릭
3. Flow 다이어그램 확인
4. 노드 클릭으로 상세 정보 확인

### 2. 로그 분석

1. "Log Analysis" 메뉴 선택
2. 시간 범위 및 필터 설정
3. 로그 목록 확인
4. 상세 분석 실행

### 3. 고급 검색

1. Dashboard의 "Advanced Search" 섹션 이용
2. 시간 범위, 채널, 큐 등 필터 설정
3. 검색 실행

## 🔍 주요 기능 상세

### Flow 시각화
- **노드 타입**: 각 모듈 타입별 아이콘 및 색상 구분
- **에러 표시**: 빨간색 테두리로 에러 노드 강조
- **연결선**: 실행 순서에 따른 화살표 연결
- **미니맵**: 전체 플로우 개요 제공

### 로그 필터링
- **시간 기반**: 특정 시간 범위 내 로그 조회
- **모듈 타입**: 특정 모듈 타입만 필터링
- **에러 필터**: 에러 발생 로그만 표시

### 성능 최적화
- **React Query**: 캐싱 및 백그라운드 리페치
- **가상 스크롤**: 대량 로그 처리
- **레이지 로딩**: 필요시에만 데이터 로드

## 🐛 트러블슈팅

### CloudWatch Logs 조회 실패
- IAM 권한 확인
- 로그 그룹 이름 확인
- 시간 범위 조정

### S3 접근 거부
- S3 버킷 정책 확인
- KMS 키 권한 확인
- Cross-region 접근 설정

## 📝 라이센스

MIT License

## 🤝 기여하기

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 문의

문제가 발생하거나 기능 제안이 있으시면 Issues 섹션을 이용해 주세요.
