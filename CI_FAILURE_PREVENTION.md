# JLPT GitHub Actions 반복 실패 원인과 재발 방지

점검일: **2026-10-18**  
대상: `kojer-lab/jlpt-study`의 GitHub Actions, 최근 실행·실패 로그 및 실제 테스트 코드  
관련 후리가나 검수 문서: [NEWS_FURIGANA_QA.md](./NEWS_FURIGANA_QA.md)

## 확인 결과

**실제 원인은 하나가 아니라 세 종류다.** 최근 100회 실행 기록(실행 시점 기준)에서 `Validate Anki scheduler` 11회 실패, `Test news Kokoro paragraph listening` 7회 실패, `Validate daily news furigana coverage` 1회 실패, Pages 배포 23회 취소가 보였다. 이 숫자는 고정 시점의 분석 자료이며 최신 내역은 Actions에서 확인한다.

### 1. 안키 자동검사가 이전 코드 구조에 고정돼 반복 실패

- 실패한 테스트: `tools/test-anki-session-recovery.cjs`.
- 로그의 첫 오류: **`ReferenceError: now is not defined`**. `reconcileDailyWordSession()`에서 사용하는 `now()`와 `wordsForLevel()`, `getSrs()`, 하루 신규 카드 자료 등의 의존성을 테스트 환경에 구성하지 않았다.
- 첫 수정 뒤 발견된 다음 오류: **예전 `renderWord()` 실행 순서를 문자열 하나로 비교하는 오래된 단언(assertion)**. 운영 코드는 세션 분모를 고정하고 화면에 추가 복습 수만 표시하는 방향으로 바뀌었으나 테스트가 예전 배치를 기대했다.
- **조치:** 실제 동작을 반영한 의존성 목(mock) 및 검사 조건으로 테스트만 갱신. **FSRS 알고리즘, 카드 순서, 사용자 학습 데이터는 수정하지 않음.**
- **검증:** [Validate Anki scheduler — 성공](https://github.com/kojer-lab/jlpt-study/actions/runs/39110487166). 안키 스케줄러, 문법 후리가나, 세션 복원, UI, 10/15분 학습 및 집중 학습 테스트 전부 성공.

### 2. 뉴스 Kokoro 회귀검사가 캐시 버전 문자열 변경을 오류로 판단

- 실패한 테스트: `tools/test-news-paragraph-audio.cjs`.
- 실제 로그: **`AssertionError: Missing cache-busted news script`**.
- 원인: 뉴스 렌더러의 `<script>` 참조를 확인하는 검사가 캐시 버전 또는 HTML의 정확한 형태에 너무 의존. 뉴스 후리가나 파일 갱신과 Safari 캐시 무효화로 버전이 바뀔 때, **재생 기능은 그대로인데도 테스트가 실패**하는 문제가 있었다.
- **조치 완료(이전 커밋):** 고정된 릴리스 버전이 아닌 적절한 버전이 붙은 실제 스크립트 경로로 검사. 
- **검증:** [Test news Kokoro paragraph listening — 성공](https://github.com/kojer-lab/jlpt-study/actions/runs/39109576462).
- 후속 지침: UI 배치, 캐시 버전, 문구 같은 변경 가능 요소는 정확한 문자열 전체 일치보다 의미 있는 동작과 안정적인 요소를 검사한다.

### 3. 뉴스 후리가나 출고 검사는 실제 콘텐츠 누락을 잡아낸 정상 실패

- [당시 누락 검출 로그](https://github.com/kojer-lab/jlpt-study/actions/runs/39109043994): **6개 기사에서 후리가나 빠진 8곳**을 발견. 이는 테스트 오작동이 아니라 검사가 올바르게 출고를 차단한 사례다.
- 누락된 곳을 수정하고 `NEWS_FURIGANA_QA.md`에 사전/실제 렌더링 불일치, 날짜·숫자·활용형 예외를 기록.
- **최종 검증:** [Validate daily news furigana coverage — 성공](https://github.com/kojer-lab/jlpt-study/actions/runs/39109496675). **2026-10-18 기사 6개, 제목 6개, 본문 48문단의 한자 2,377자 검사, 미표기 0곳.**
- 이 검사는 후리가나의 존재를 확인한다. 문맥상 독음의 정확성과 아이폰 클릭 반응은 별도로 검수한다.

### 4. Pages의 `cancelled`는 실패와 구별

- GitHub Pages는 `main`에 새 커밋이 오를 때마다 배포가 발생한다. 뉴스 6개를 개별 커밋으로 여러 번 갱신하고 테스트/문서를 연속 수정하면 배포가 겹친다.
- 새 배포가 옛 배포를 대체하면서 `cancelled`로 기록되는 경우가 생긴다. 이번 최신 100회에서 Pages `failure`는 0회, `cancelled`는 23회였다. **취소를 사이트 장애나 CI 코드 오류와 동일시하지 않는다.**
- 기존 자동 읽기 후리가나 빌더는 일부 입력 변경에 `main`으로 산출물을 다시 커밋하므로 또 한 차례 Pages 배포가 발생할 수 있다. 이는 정상일 수 있지만 불필요한 반복 실행을 늘린다.

## 앞으로 반드시 지킬 변경·배포 규칙

1. **변경 기능과 관련 회귀 테스트를 같은 작업에서 함께 검토**한다. 함수 의존성/호출 위치, 필드 이름, 스크립트 경로가 바뀌면 테스트 목과 가정도 동기화한다.
2. **실제 기능 오류와 테스트 코드 불일치 구분:** 실패하면 먼저 Actions의 실패 단계와 원문 로그를 읽는다. 단순 메일 제목이나 빨간 표시만으로 사용자 데이터가 망가졌다고 판단하지 않는다.
3. **후리가나 출고 게이트 유지:** 새 날짜의 모든 제목·문단을 실제 `titleHTML()`, `paragraphHTML()` 결과로 검사하고 **미표기 한자 0개** 확인 후 게시한다.
4. **작은 수정은 가능하면 하나의 검증된 커밋으로 묶는다.** 여러 임시 커밋이 연속으로 Pages를 다시 배포하고 검사를 반복하는 상황을 줄인다. 이미 실패한 실행 기록·메일은 코드 수정으로 소급 삭제되지 않는다.
5. **새 테스트에는 재현성이 있는 입력과 최신 모의 의존성 사용.** 앱의 DOM·캐시 버전 문자열에 대한 지나치게 세밀한 단언보다 중요한 사용자 동작과 실제 출력 검증을 우선한다.
6. `index.html`은 통합 웹앱과 실제 스크립트 참조가 들어 있어 안키·뉴스·후리가나 워크플로가 함께 실행될 수 있다. **여러 검사가 실행되는 것 자체는 오류가 아니라 안전망**이지만, 모든 워크플로의 기존 실패를 계속 방치하면 매번 실패 메일이 쌓인다.
7. 배포 완료 보고 시 **개별 기능 테스트 PASS / Pages 배포 성공 / iPhone 실기기 테스트**를 구별한다. 최신 성공 기록을 첨부한다.
8. GitHub 알림 메일 설정으로 실패 알림을 숨기기보다 **반복 실패 원인을 먼저 고친다.** 그 후에도 이메일이 과도할 때만 사용자가 GitHub 알림 설정을 조정한다.

## 유지보수용 명령 및 워크플로

```bash
node tools/test-anki-queue.cjs
node tools/test-grammar-furigana.cjs
node tools/test-anki-session-recovery.cjs
node tools/test-anki-dashboard-ui.cjs
node tools/test-anki-learning-steps.cjs
node tools/test-anki-focus-days.cjs
node tools/test-news-paragraph-audio.cjs
node tools/test-news-furigana-coverage.cjs
```

- `.github/workflows/anki-ui-check.yml`
- `.github/workflows/test-news-paragraph-audio.yml`
- `.github/workflows/test-news-furigana-coverage.yml`
- `.github/workflows/build-reading-furigana.yml`

**기록의 정확성:** 메일함에 실제 수신된 개별 통지는 확인하지 않았으며, 위 결론은 공개된 Actions 실패 기록·실패 로그에 근거한다. 수정 전 발생한 알림은 사라지지 않는다.
