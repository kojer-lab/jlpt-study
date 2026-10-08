# N1 언어 검수 속도 개선

- 구조 검사와 실제 단어 뜻·예문 언어 검수를 구분한다.
- 다음 검수 범위 500개를 하나의 JSON 패킷에 모아서 같은 GitHub 파일을 여러 번 다운로드하지 않는다.
- 오역 가능성, 단어/예문 불일치, 유사 예문을 자동 표시하고 높은 점수부터 검수한다.
- 점수가 낮은 단어도 반드시 패킷에 남겨서 순차적으로 검수한다.
- 수정은 가능한 500개 단위로 묶어서 한 번의 커밋과 CI 실행으로 검증한다.
- QA 브랜치에서 검수하고, 최종 검사 전에는 main 브랜치에 반영하지 않는다.

실행: python scripts/n1_language_review_queue.py
구간 지정: python scripts/n1_language_review_queue.py --start 1001 --batch-size 500

생성물: qa-results/n1-language-review-next.json
GitHub Actions 아티팩트: n1-next-review-packet

중요: 위험 점수는 검수 우선순위일 뿐 오류 판정이 아니다.
표제어가 예문에 직접 없어도 정상일 수 있고, 오역이 점수 0인 단어도 있을 수 있다.
500개 전체를 언어 검토한 뒤에만 progress reviewedRange를 다음 단계로 갱신한다.
