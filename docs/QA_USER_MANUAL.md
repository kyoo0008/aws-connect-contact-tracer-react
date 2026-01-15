# QA 사용자 매뉴얼: QM Automation 시스템

이 매뉴얼은 QA(Quality Assurance) 사용자가 **QM Automation** 시스템을 효과적으로 사용하여 상담 품질을 평가하고 분석하는 방법을 설명합니다.

---

## 1. 개요
본 시스템은 Google Gemini(LLM)를 활용하여 Amazon Connect의 상담 품질을 자동으로 평가(QM)하는 도구입니다. 상담 내역(Transcript), 오디오(Audio), 시스템 실행 데이터(Tool Call)를 종합적으로 분석하여 인사이트를 제공합니다.

---

## 2. 시스템 설치 및 실행 (Docker)
애플리케이션을 로컬 환경에서 실행하기 위해 Docker가 설치되어 있어야 합니다.

### 2.1 Docker 설치
*   **Windows / macOS**: [Docker Desktop 다운로드](https://www.docker.com/products/docker-desktop/) 후 설치를 진행합니다.
*   **설치 확인**: 터미널(또는 CMD)에서 아래 명령어를 입력하여 버전을 확인합니다.
    ```bash
    docker --version
    docker-compose --version
    ```

### 2.2 시스템 실행 방법
애플리케이션 이미지는 미리 빌드되어 Docker Hub에 업로드되어 있습니다. 아래 명령어를 통해 최신 버전을 내려받고 실행할 수 있습니다.

1.  **최신 이미지 다운로드**:
    ```bash
    docker-compose -f docker-compose.deploy.yml pull
    ```
2.  **컨테이너 실행**:
    ```bash
    docker-compose -f docker-compose.deploy.yml up -d
    ```
3.  **접속 정보**: 브라우저를 열고 `http://localhost:3000`에 접속합니다.

### 2.3 주요 Docker 명령어
*   **시스템 중지**: `docker-compose -f docker-compose.deploy.yml down`
*   **로그 확인**: `docker-compose -f docker-compose.deploy.yml logs -f`
*   **상태 확인**: `docker ps`

---

## 3. 초기 설정 (Settings)
애플리케이션을 처음 실행하거나 세션이 만료된 경우, AWS 리소스 접근을 위한 자격 증명 설정이 필요합니다.

1.  좌측 메뉴 또는 상단 네비게이션에서 **Settings** 페이지로 이동합니다.
2.  다음 항목들을 각각 입력합니다:
    *   **Access Key ID / Secret Access Key**: AWS IAM 계정의 자격 증명 정보
    *   **Region**: Amazon Connect 인스턴스가 위치한 리전 (예: `ap-northeast-2`)
    *   **Instance ID**: Amazon Connect 인스턴스 ID (상세 분석 및 로그 조회에 필수)
    *   **Environment**: 현재 실행 환경 구분 (`dev`, `stg`, `prd` 등)
3.  **Save Config** 또는 **Test Connection**을 클릭하여 설정을 저장합니다.

> **주의**: 입력된 자격 증명은 브라우저의 로컬 스토리지(LocalStorage)에만 보안 저장되며, 외부 서버로 전송되지 않습니다.

---

## 4. QM Automation 활용 가이드
LLM을 사용하여 상담 내용을 자동으로 평가하고 구조화된 데이터를 추출하는 핵심 기능입니다.

### 4.1 분석 이력 조회 및 검색
*   **QM Evaluation 메뉴**: 좌측 메뉴를 통해 이동합니다.
*   **Date Picker**: 상단의 날짜 범위를 조절하여 과거 분석 이력을 조회합니다. (기본 최근 30일)
*   **Search**: 특정 **Contact ID**를 입력하여 해당 상담의 모든 분석 차수(Request)를 찾을 수 있습니다.
*   **Sorting**: '상담 연결 일시', '총 처리 시간', '업데이트 일시' 헤더를 클릭하여 데이터를 정렬합니다.

### 4.2 새 QM 분석 요청 (New Request)
기본 설정 외에도 다양한 파라미터를 조절하여 정밀한 분석을 시도할 수 있습니다.

1.  우측 상단의 **[새 QM 분석]** 버튼을 클릭합니다.
2.  **분석 옵션 설정**:
    *   **Model**: `Gemini 2.5 Pro` (심층 분석 권장), `Flash` (빠른 응답) 중 선택합니다.
    *   **Temperature**: 창의성 조절. (QM 평가의 경우 0 ~ 0.2 사이의 낮은 값을 권장)
    *   **Thinking Process**: AI의 추론 과정을 볼지 선택합니다. 복잡한 평가 기준이 있는 경우 활성화를 권장합니다.
    *   **Tool/Function Calling**: 구조화된 정보 추출을 위해 사용합니다.
        *   **기본 Tool**: 생년월일(DOB) 확인 여부, 여정(PNR) 정보 등 추출.
        *   **Custom Tool**: 직접 JSON 정의를 입력하여 특정 정보를 추출하도록 지시할 수 있습니다.
    *   **Audio Analysis**: 텍스트뿐만 아니라 실제 음성 파일을 분석하여 음성 톤, 침묵 구간 등을 파악합니다.

> **알림**: Tool 호출 시, Lambda 백엔드에 해당 Tool 로직이 구현되어 있어야 실제 호출이 성공합니다.

3.  **분석 시작**: 모든 옵션 확인 후 버튼을 누르면 분석이 시작됩니다.

### 4.3 분석 결과 검토 (Detail View)
분석이 완료되면 상세 페이지에서 정보를 검토합니다.

*   **Status Bar**: 현재 상태(완료/실패/진행중)와 단계별(QM, Tool, Audio) 소요 시간 및 토큰 통계를 확인합니다.
*   **QM 평가 결과 탭**: LLM이 생성한 종합 리포트를 확인합니다.
    *   **Thinking Process**: AI가 어떤 논리적 단계를 거쳐 해당 결과(점수 등)를 도출했는지 확인하여 평가의 타당성을 검증합니다.
*   **Function Calls 탭**: 툴이 호출된 경우, 추출된 인자(Arguments)와 실제 결과값이 일치하는지 대조합니다.
*   **오디오 분석 탭**: 고객의 불만(Dissatisfaction) 감지 여부, 상담원 가로채기(Interruption) 빈도 등을 시각화된 데이터로 확인합니다.

---

## 5. QA 체크리스트 및 팁
*   **평가 일관성 확인**: 동일한 상담 건에 대해 모델이나 프롬프트를 변경하며 결과의 차이를 비교해 보세요.
*   **토큰 최적화**: 분석 효율성을 위해 필수적인 Tool만 활성화하여 사용하세요.
*   **오류 분석**: 상세 페이지 하단의 메타데이터(Project ID, Service Account)는 시스템 오류 발생 시 개발팀 전송용으로 사용됩니다.

---

## 6. 주요 장애 및 문제 해결

| 증상 | 원인 | 해결 방법 |
| :--- | :--- | :--- |
| 리스트가 나오지 않음 | 자격 증명 설정 누락 또는 만료 | Settings 페이지에서 AWS Key 정보가 정확한지 확인 |
| 분석 상태 'ERROR' | Transcript 미존재 또는 Lambda 타임아웃 | Connect에 해당 상담의 녹취/기록이 생성되었는지 확인 |
| Tool 호출 실패 | 정의된 스키마와 Lambda 로직 불일치 | Custom Tool 사용 시 스키마 형식이 올바른지 확인 |

---
*문서 버전: v1.1 | 최종 수정일: 2026-01-15*
