# KOJER JLPT STUDY — PROJECT_STATUS

> **목적:** JLPT 학습 사이트를 다른 ChatGPT 대화에서도 정확하게 이어서 개발하기 위한 인계·상태 문서.
>
> **최종 수동 점검:** 2026-10-18 (뉴스 6개 후리가나 전수 검사·CI 출고 게이트 추가). 이 파일은 자동 갱신되지 않으며, 아래 실시간 파일·GitHub Actions·소스코드가 항상 우선합니다.
>
> **범위:** JLPT 사이트 전용. 게임 《TAKE 04》와 별도 프로젝트로 관리합니다.

## 1. 기본 정보

- **GitHub 저장소:** https://github.com/kojer-lab/jlpt-study
- **운영 사이트:** https://kojer-lab.github.io/jlpt-study/
- **배포:** GitHub Pages, `main` 브랜치
- **구현:** 정적 HTML/JS/CSS, 학습 데이터·MP3, 브라우저 내 학습 상태 및 선택적 Supabase 동기화
- **우선 환경:** iPhone Safari(모바일 중심), Mac/PC 브라우저, 라이트·다크 모드
- **목표:** N1 종합 학습 + N2 단어의 자연스러운 통합, 읽기·문제·청해·뉴스 읽기를 한 앱에서 제공

## 2. 완료·진행 중 현황

| 분야 | 상태 | 확인 사항 |
|---|---|---|
| **N2 단어장 확장** | **완료, 2,000 / 2,000 (텍스트 100%)** | 기존 322개와 새로 검수한 1,678개 통합. 뜻·일본어 예문·한국어 번역 포함 |
| **N2 단어/예문 정책** | **확정** | N2는 카드당 긴 예문 **1개**, 안키·단어장 위주. N2 전용 문제은행을 별도로 확대하지 않음 |
| **N1/N2 통합 안키** | **구현·배포** | 하나의 학습 덱, FSRS/학습 이력 보존, 겹치는 단어의 기존 N1 기록 재사용 |
| **안키 배치 간격** | **복습 4 : 새 단어 1** | 2026-10-13 적용. 스케줄러 검사 및 Pages 배포 성공 |
| **N1:N2 신규 단어 할당** | **기본 2 : 1** | 일일 새 단어 설정 범위 안에서 섞음. 사용자의 실제 현재 한도는 개인 저장 설정 확인 필요 |
| **N1 기존 음성** | **정적 MP3 서비스** | `audio/vocab/manifest.json`: 3,233개 항목. 발음 품질/신고 보정은 별개 |
| **N2 MP3 제작** | **자동 생성 완료 (100%)** | **3,904/3,904**. 단어 1,952개 + 예문 1,952개. 실제 발음·아이폰 연속 재생 검수는 별도 |
| **N2 MP3 배치 자동화** | **40/40차 완료** | `audio/n2/progress.json` status=complete, 자동 무결성 검사 3,904개 완료 |
| **아이폰 UI 리디자인** | **주요 화면 반영** | 라벤더·블루그레이, 흰색 둥근 카드, 명확한 버튼 아이콘, 하단 고정 메뉴 |
| **독해·청해·어휘·문법·모의고사** | **기존 기능 운영** | 기능은 유지하되 개별 문항/기기별 품질 검수 필요 |
| **뉴스 읽기** | **문단별 Kokoro 듣기 + C안 선행 생성** | 현재 문단의 남은 음성과 바로 다음 문단 전체를 브라우저에서 순차 준비(아이폰 1문단 선행 제한). 정적 MP3 사전 제작 없음. iPhone C안 실기기 테스트 필요 |
| **PC·모바일 학습 동기화** | **Supabase 연결 방식 구현** | 실제 계정 상태나 각 기기의 동기화 성공은 사용 환경에서 확인 |

### N2 어휘 목표의 정확한 의미

- 텍스트 원본 2,000개 완료. 후보 2,019개 중 N1 정확 중복 15개와 낮은 효용 후보 4개는 제외했고, 대기 중인 실제 검수 대상은 0개.
- **48개**는 N1에 동일한 표제어·읽기가 있어 **기존 N1 카드와 FSRS 학습 상태를 재사용**함. 즉, 2,000개 소스가 모두 신규 SRS 카드 2,000개를 뜻하지 않음.
- 동일 표기라도 읽기가 다른 단어는 뜻과 문맥을 검수해 분리.
- 공식 JLPT 시험 주관기관이 공인한 고정 단어 목록이라는 주장은 하지 않음.
- 정본: `data/n2-promotion-progress.json` 및 `N2_TARGET_2000_STATUS.md`.

## 3. 자동 생성 완료 — N2 Kokoro MP3 (청취 QA 남음)

**목표 3,904개** = 새 N2 단어 음성 1,952개 + 예문 음성 1,952개. N1과 완전히 겹치는 48개는 기존 자산을 재사용.

- **음성:** Kokoro JP 0.2.0, `jf_alpha`, 브라우저 WASM q8.
- **형식:** 브라우저 합성 WAV → FFmpeg, 24 kHz / mono / 64 kbps MP3. 기존 N1 음성 파일 수정 없이 N2 별도 저장.
- **순서:** (1) 2,000개 소스 검증 → (2) 단어 MP3 → (3) 예문 MP3 → (4) 파일 검사 → (5) 앱 재생 연결 및 아이폰 청취 확인.
- **배치:** 총 40차 **완료**, 한 차례 최대 100개, 50개 단위 SHA-256·길이·코덱·디코딩 검사를 통과한 파일만 커밋. 자동 파일 검증 3,904개 성공.
- **생성기:** `tools/build-n2-audio-source.mjs`, `tools/run-n2-browser-audio.mjs`.
- **자동화:** `.github/workflows/n2-browser-audio.yml` — https://github.com/kojer-lab/jlpt-study/actions/workflows/n2-browser-audio.yml
- **진행률 페이지:** https://kojer-lab.github.io/jlpt-study/n2-audio-progress.html
- **실시간 상태의 정본:** `audio/n2/progress.json`, `audio/n2/batches/`, 실제 GitHub Actions 실행 기록.
- **음원 매니페스트:** `audio/n2/manifest.json`, `audio/n2/revisions.json`, `audio/n2/mp3/`. 앱 `index.html`은 매니페스트에 있는 N2 음원을 순차적으로 사용하도록 연결됨.
- **완료 확인:** `audio/n2/progress.json`에 **3,904/3,904 (100%)**, 단어 1,952, 예문 1,952, 배치 40/40, `status=complete`, `integrity_verified=3904` 기록됨. 실제 음질·억양은 청각 검수 필요.
- **남은 주의:** 파일 형식·디코딩 검사 통과가 발음·억양 완벽을 뜻하지 않음. 이상한 종결 음성(예: 불필요한 `い`), 한자 독음, 음절 끊김, 음성 다중 클릭·동시재생은 별도 실청 검수.

## 4. 학습 시스템의 확정 규칙

- **통합 안키:** N1/N2를 별도 앱이나 별도 학습 상태로 쪼개지 않음. 기존 ID, SRS/FSRS 기록·별표·오답·세션 복원·클라우드 기록을 보존.
- **새 카드 주기:** 복습 **4개 후 새 카드 1개**. 단, 정해진 시간에 다시 나와야 하는 학습 카드는 FSRS·재학습 규칙에 따라 처리. **4:1 변경이 일일 신규 배정 수 증가를 뜻하지 않음**.
- **하루 신규 수:** 사용자 설정값을 유지. `index.html`의 기본값은 10개이며 사용자가 다른 값을 저장했을 수 있음.
- **N1:N2 기본 신규 배분:** **2:1**. N1과 N2가 섞여 나온다는 이유로 중복 카드나 중복 학습 기록을 만들지 않음.
- **N2:** 한국어 뜻과 긴 일본어 예문 **1개**, 자연스러운 한국어 번역. N2 문제은행 확대는 현재 범위 밖.
- **N1:** 단어 해부, 한자·구성자·연관어, 후리가나, 별표·오답, 기존 다수의 MP3 등 학습 자산을 유지.
- **음성 재생:** MP3 준비된 경우 즉시 재생, 준비되지 않은 음성은 별도 처리. 재생 버튼 중복 탭으로 여러 소리가 겹치지 않도록 주의.
- **뉴스 읽기:** 900~1,200자 안팎의 독립적인 학습용 기사 작성 기준, 출처 확인, 클릭 후리가나, 제목·문장별 자연스러운 번역, 실전 표현 수첩과 본문 하이라이트. RSS 짧은 소개문만으로 장문 보도가 자동 검증된 것으로 간주하지 않음.

## 5. UI/UX 원칙

- **색감:** 은은한 연보라/블루그레이 바탕, 큰 흰색 라운드 카드, 짙은 네이비 제목, 보라-파랑 진행률 그라데이션.
- **품질:** 과도한 색·그림자·여백을 줄이고, 숫자·아이콘·텍스트 간격을 균형 있게 정렬. 아이폰 시안의 디자인이 기준.
- **안키:** 다시/어려움/알겠음/쉬움 아이콘과 버튼을 구분. 학습 중에도 **고정 하단 메뉴 유지**. 평가 버튼은 하단 메뉴에 가리지 않게 스크롤.
- **읽기:** 클릭 후리가나는 한자에만 제공. 번역 토글, 원문 위치 하이라이트, 라이트/다크 읽음 표시 대비 유지.
- **기기:** iPhone Safari 우선. 모바일 터치 확대·오디오·스크롤을 Mac/PC 브라우저와 구분해 검사.


### 2026-10-18 뉴스 읽기 후리가나 전수 검수

- 신규 뉴스 6개, 제목 6개·본문 48문단, **한자 2,377자 모두 클릭 후리가나 커버리지 검사 통과**, 미표기 0곳.
- 원인: 날짜별 사전 누락·활용형과 숫자+한자 예외 부족·화면 실제 렌더링 전수 검사 부재.
- 수정 파일: `data/news-furi-2026-10-18-reviewed.js`, `data/news-reader-embedded.js`.
- 앞으로 신규 기사 배포 전 `node tools/test-news-furigana-coverage.cjs` + GitHub Actions 검사를 반드시 통과해야 함.
- 원인/방법/한계: [NEWS_FURIGANA_QA.md](./NEWS_FURIGANA_QA.md).

## 6. 다음 해야 할 일 (우선순위)

1. **N2 MP3 실제 재생·발음 검수:** 3,904개 자동 생성 완료. iPhone Safari에서 MP3 로딩·한자 독음·마침표 종결 음성·연속 재생을 확인하고 문제 파일만 개별 수정. N1 파일은 유지.
2. **N2 음성 완성 검증:** 3,904개 매니페스트 경로, 파일 실존·무결성, 단어/예문 버튼, N1과 공유되는 48개 재사용, 음성 길이·발음 대조.
3. **실기기 최종 QA:** iPhone Safari 음성 딜레이·동시재생·캐시 문제, 안키 N2 카드 전환, 4:1 신규 배치·다시 학습, PC/모바일 동기화.
4. **발음 신고 검수:** 신고가 쌓인 단어/예문의 발음과 문장 끝 이상 음성을 확인·교정. 신고 접수와 수정 완료는 별개.
5. **뉴스 Kokoro C안 실기기 검증:** 현재 문단 재생 중 남은 문장 → 다음 문단 1개 선행 생성, 두 번째 문단 진입 대기 단축, 아이폰 CPU·메모리·오디오 끊김, 문단 전환 시 이전 선행 작업이 추가 예약되지 않는지 확인. 기존 후리가나·번역·본문 하이라이트도 회귀 검사.
6. **상태 문서 갱신:** 주요 기능 배포/전량 작업 완료 시 `PROJECT_STATUS.md`의 상태와 점검 날짜를 업데이트.

- **2026-10-18 GitHub Actions 반복 실패 원인 및 테스트 재발 방지:** [CI_FAILURE_PREVENTION.md](./CI_FAILURE_PREVENTION.md) 참조. 안키 세션 검사의 오래된 모의 의존성·문구 비교를 수정했고, 뉴스 Kokoro 검사의 캐시 버전 의존성을 제거해 두 검사 모두 최종 PASS. 뉴스 후리가나 검사는 6개 기사·2,377자에서 누락 0개 확인.

## 7. 수정/배포 작업 안전 규칙

- 사용자 요청 시 가능한 한 **GitHub에서 직접 수정·배포**. 파일을 다운로드/복사해 업로드하라고 돌리지 않음.
- 파일을 수정하기 전에 **최신 `main` HEAD와 관련 코드**를 읽고, 학습 기록 초기화·ID 삭제·잘못된 중복 카드 생성이 없는지 확인.
- **FSRS 및 기존 학습 기록을 보호**. 페이지 리디자인 작업에서 안키 알고리즘·Supabase 스키마·음원 매니페스트를 불필요하게 바꾸지 않음.
- N2 자동 음성 제작은 40/40차 **완료**. 향후 파일 보정 작업에서는 기존 체크포인트/매니페스트와 `main` 변경 이력을 확인하며 다른 학습 기록을 덮어쓰지 않음.
- GitHub에 비밀키, 계정 비밀번호, Supabase `service_role` 키 등을 커밋하지 않음.
- **코드 작성/커밋 ≠ Actions 테스트 성공 ≠ Pages 배포 성공 ≠ 실기기 확인**. 각각 구분하여 보고.
- 뉴스 기사에 확인하지 않은 사실·수치·인용을 만들어 넣지 말 것. 원문 직접 확인 실패 시 별도 검증 또는 보류.
- 오류 신고 `jlpt_pronunciation_reports`는 사용자 로그인·DB 설치 상태가 필요. DB 저장 여부 확인 없이 신고 성공으로 표기 금지.

## 8. 파일 / 테스트 / 참조 링크

| 확인할 것 | 파일 |
|---|---|
| 메인 웹앱 | `index.html` |
| N2 단어 목표 완료 정본 | `data/n2-promotion-progress.json` |
| N2 최종 검수 기록 | `N2_TARGET_2000_STATUS.md` |
| N2 중복 검사 | `data/n2-duplicate-audit-20261013.json` |
| **N2 MP3 진행률 정본** | `audio/n2/progress.json` |
| N2 MP3 자동 제작 | `.github/workflows/n2-browser-audio.yml` |
| N2 MP3 매니페스트 | `audio/n2/manifest.json` |
| 기존 N1 MP3 매니페스트 | `audio/vocab/manifest.json` |
| MP3 진행률 UI | `n2-audio-progress.html` |
| 뉴스 콘텐츠 기준 | `NEWS_READING_EDITORIAL_GUIDE.md` |
| 뉴스 문단별 Kokoro 코드 | `data/news-reader-embedded.js` (on-demand 합성, 사전 MP3 불필요) |
| 뉴스 Kokoro 회귀 테스트 | `tools/test-news-paragraph-audio.cjs`, `.github/workflows/test-news-paragraph-audio.yml` |
| 발음 오류 신고 및 보안 | `PRONUNCIATION_REPORT_SETUP.md` |
| 단어 데이터 출처 | `OPENJLPT_ATTRIBUTION.md` |
| Supabase 데이터 연동 | `supabase_schema.sql`, `SETUP_SYNC.txt` |
| 안키 회귀 테스트 | `tools/test-anki-new-interleave.mjs`, `tools/test-anki-queue.cjs`, `tools/test-anki-session-recovery.cjs` |
| N2 검수 테스트 | `tools/test-unified-n2-anki.cjs`, `tools/test-n2-target-draft.cjs` |

대표 확인 명령:

```bash
node tools/test-anki-new-interleave.mjs
node tools/test-anki-queue.cjs
node tools/test-anki-session-recovery.cjs
node tools/test-unified-n2-anki.cjs
node tools/test-n2-target-draft.cjs
node tools/test-news-paragraph-audio.cjs
```

> 위 회귀 검사는 실제 iPhone Safari 음성 청취를 대신하지 않습니다.

## 9. 새로운 ChatGPT 대화에서 이어서 작업할 때

> GitHub의 `kojer-lab/jlpt-study` 저장소에서 `PROJECT_STATUS.md`를 먼저 읽고, `index.html`·`audio/n2/progress.json`·최근 GitHub Actions 결과를 확인해 JLPT 프로젝트를 이어서 작업해 줘. 기존 N1 자료, FSRS/학습 상태, N2 자동 MP3 작업을 보호하면서 진행해.

이 문서는 **자동으로 최신 상황으로 바뀌지 않습니다**. 새로운 개발 작업을 끝냈거나 사용자가 갱신을 요청했을 때 **현재 상태를 확인하고 문서를 갱신**해야 합니다.
