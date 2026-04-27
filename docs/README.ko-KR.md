[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Русский](README.ru-RU.md)

<p align="center">
  <img src="../assets/tracemind-logo.svg" alt="TraceMind logo" width="520">
</p>

<h1 align="center">TraceMind</h1>

<p align="center">
  <strong>빠른 답변이 아니라 연구 방향의 맥락을 이해하고 싶은 사람을 위한 AI 개인 연구 워크벤치.</strong>
</p>

<p align="center">
  <a href="../LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-111827"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-ready-0f766e">
  <img alt="Evidence-first" src="https://img.shields.io/badge/research-evidence_first-f5b84b">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-8_languages-2563eb">
</p>

TraceMind 는 한 번의 연구 업데이트만으로는 어떤 분야의 전체 흐름을 보기 어렵다는 문제에서 출발합니다.

지금의 AI 연구는 빠르고, 시끄럽고, 유행을 따라가기 쉽습니다. 하지만 논문을 계속 추적하고 증거를 축적하지 않으면 무엇이 진짜 문제를 푸는지 알기 어렵습니다. TraceMind 는 AI 가 문헌을 따라가고, 근거를 모으고, 그 근거 위에서 답하도록 만들어 연구자를 돕는 충실하고 엄격한 조수이길 바랍니다.

## 프로젝트 소개

TraceMind 는 AI 개인 연구 워크벤치입니다. 학생, 독립 연구자, 엔지니어, 기술 리드, 분석가처럼 점점 늘어나는 논문을 하나의 시야로 정리해야 하는 사람에게 맞춰져 있습니다.

| 자주 겪는 문제 | TraceMind 가 돕는 방식 |
| --- | --- |
| 논문은 많은데 중심 줄기가 보이지 않음 | 토픽 맵, 노드 그래프, 핵심 논문, 실제 연구 진행 상태 |
| AI 답변은 매끄럽지만 출처가 약함 | 논문, PDF, 그림, 수식, 인용과 연결된 답변 |
| 중요한 질문이 채팅과 메모에 흩어짐 | 장기 기억을 가진 토픽 워크벤치 |
| 유행은 쫓지만 축적이 남지 않음 | 실제 자료에서 자라는 장기 연구 주제 |

## 왜 만들었는가

연구가 어려운 이유는 정보가 없어서가 아니라, 이해가 충분히 축적되지 않아서인 경우가 많습니다.

일반적인 채팅 도구는 답을 빠르게 주지만 다음을 오래 붙잡아 두지는 못합니다.
- 왜 그런 판단이 나왔는가
- 어떤 증거가 그것을 지지하는가
- 무엇이 아직 불확실한가
- 시간이 지나며 방향이 어떻게 바뀌는가

TraceMind 는 네 가지 원칙을 붙듭니다.
- `증거 우선`
- `기억 우선`
- `구조 우선`
- `최종 판단은 사람에게`

## 핵심 포인트

- `토픽 페이지는 실제 연구 결과를 보여줍니다`: 가짜 계획 단계를 먼저 만들지 않고, 실제 논문과 노드가 쌓이면서 단계와 진행도가 생깁니다.
- `노드 페이지는 빠른 이해를 위한 연구 뷰입니다`: 핵심 질문, 주요 논문, 증거 사슬, 방법, 발견, 한계, 논쟁, 연구 판단을 구조적으로 보여줍니다.
- `증거가 항상 가깝습니다`: 최종 판단 옆에 PDF, 그림, 수식, 인용, 추출 조각을 남깁니다.
- `후속 질문이 맥락을 잃지 않습니다`: 빈 채팅창이 아니라 토픽과 노드의 축적 위에서 질문합니다.
- `셀프 호스팅을 전제로 합니다`: 모델 설정과 자격 증명, 연구 데이터를 직접 관리할 수 있습니다.

## 빠른 시작

필수 조건:
- Node.js `18+`
- npm `9+`
- Python `3.10+`
- 사용할 모델 제공자의 API 키

백엔드:

```bash
cd skills-backend
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

프론트엔드:

```bash
cd frontend
npm install
npm run dev
```

기본 주소:
- frontend: `http://localhost:5173`
- backend health: `http://localhost:3303/health`

Docker:

```bash
docker compose up --build
```

## 첫 15분 가이드

1. 백엔드와 프론트엔드를 실행합니다.
2. 설정에서 최소 하나의 모델 제공자를 등록합니다.
3. 실제로 오래 추적하고 싶은 주제로 토픽을 만듭니다.
4. 논문 탐색을 실행하고 후보를 그대로 믿지 말고 검토합니다.
5. 주제의 중심에 들어올 논문만 남깁니다.
6. 노드 연구 뷰를 열어 구조화된 요약부터 읽습니다.
7. `이 분기에서 가장 약한 증거는 무엇인가` 같은 검증 질문을 던집니다.
8. 결과를 내보내거나, 새로운 논문과 판단을 토픽에 계속 쌓습니다.

## 흐름 설명

TraceMind 는 연구를 다음과 같은 루프로 다룹니다.
- 논문 발견
- 후보 선별 및 채택
- PDF 에서 증거 추출
- 연구 노드 구성
- 단계별 판단 형성
- 맥락 있는 후속 질문
- 노트와 보고서로 내보내기
- 토픽 기억으로 되돌리기

## 비교

| 도구 | 강점 | TraceMind 의 위치 |
| --- | --- | --- |
| Zotero | 수집, 주석, 인용 관리 | 문헌을 노드와 증거 사슬, 판단으로 바꿉니다 |
| NotebookLM | 주어진 자료에 대한 질문 | 그 질문을 장기 토픽 안에 붙잡아 둡니다 |
| Elicit | 검색과 리뷰 워크플로 | 일회성 리뷰보다 개인 연구의 축적에 초점을 둡니다 |
| Perplexity | 빠른 출처 기반 답변 | 일회성 답을 토픽 기억으로 바꿉니다 |
| Obsidian / Notion | 개인 메모와 정리 | 논문 추적과 근거 기반 AI 를 더합니다 |
| ChatGPT / Claude | 추론, 작성, 대화 | 빈 채팅 대신 연구실 같은 맥락을 줍니다 |

## 오픈소스 기반과 참고

TraceMind 는 다음과 같은 기반 위에 세워져 있습니다.
- `React`, `Vite`
- `Express`, `Prisma`
- `SQLite`, `PostgreSQL`, `Redis`
- `PyMuPDF`
- `OpenAI`, `Anthropic`, `Google`
- `arXiv`, `OpenAlex`, `Crossref`, `Semantic Scholar`

문서 구성과 공개 표현 방식에서는 `Supabase`, `Dify`, `LangChain`, `Immich`, `Next.js`, `Visual Studio Code`, `Excalidraw`, `Open WebUI` 같은 프로젝트의 명료함을 참고했습니다.

## 누구에게 맞는가

TraceMind 는 다음과 같은 경우 잘 맞습니다.
- 몇 주, 몇 달 단위로 연구 방향을 따라가는 경우
- 논문을 모으는 것보다 비교하고 구조화해야 하는 경우
- 리뷰, 기술 메모, 연구 브리프를 작성해야 하는 경우
- 연구 데이터와 모델 설정을 직접 관리하고 싶은 경우

다음만 필요하다면 다른 도구가 더 적합할 수 있습니다.
- 단발성 사실 확인
- 근거 경로가 필요 없는 즉답
- 범용 사내 지식 베이스

## 기여, 보안, 라이선스

- 기여 가이드: [CONTRIBUTING.md](../CONTRIBUTING.md)
- 보안 정책: [SECURITY.md](../SECURITY.md)
- 라이선스: [MIT](../LICENSE)

## 마무리

한 번의 연구 진전만으로 한 분야를 선명하게 이해하기는 어렵습니다. 더구나 지금의 AI 연구는 속도, 유행, 겉보기의 새로움에 쉽게 끌립니다.

TraceMind 는 AI 가 문헌을 추적하고, 근거를 축적하고, 그 근거에 기반해 후속 질문을 지원함으로써 연구의 윤곽을 더 또렷하게 보이게 하려는 시도입니다. 연구보다 더 크게 말하는 도구가 아니라, 연구를 더 정확하게 보게 하는 조수가 되는 것. 그것이 이 프로젝트의 방향입니다.
