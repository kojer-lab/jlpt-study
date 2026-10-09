# JLPT 발음 오류 일괄 검수·수정 운영

## 평소에는 신고만 접수

- 안키/단어장에서 ⚑ → 오류 선택 → **신고 접수**.
- Supabase `public.jlpt_pronunciation_reports`에 `open`으로 저장.
- GitHub Issues에서 이전에 신고한 내역도 함께 확인.
- 신고가 없는 날에는 AI 점검 작업을 실행하지 않음.

## 나중에 ChatGPT에 이렇게 요청

> **JLPT 발음 오류 신고 쌓인 거 전부 확인하고, 중복을 묶어서 MP3 일괄 수정하고 배포까지 해줘.**

ChatGPT 작업 순서:
1. Supabase의 `open`·`reviewing` 신고와 GitHub의 발음 오류 Issues를 조회.
2. `word_id + target_kind + example_index`를 기준으로 동일 MP3 대상 중복을 묶음.
3. 신고의 실제 원문, 읽기, 원인, 해당 MP3/소스 코드를 검수. **자동으로 오류로 단정하지 않음.**
4. 재생성이 타당한 대상만 `audio/vocab/repair-batch.json`에 최대 20개씩 등록. `spoken_text`는 사람이 검수한 일본어 발음 입력으로 작성. 단어 데이터/후리가나 자체를 고쳐야 하는 경우는 별도로 수정.
5. JSON을 GitHub `main`에 커밋하면 `repair-reported-vocab-batch.yml`이 **한 번의 실행**으로 Kokoro 설치·모델 로딩 → MP3 순차 재생성 → 포맷·길이·SHA 검증 → 파일/리비전 함께 커밋.
6. GitHub Pages 배포 확인 후 처리된 신고만 `fixed`로 변경하고 GitHub Issue 완료. 음성이 부자연스러우면 재검수/재신고 가능.
7. 결과 요약으로 전체 신고 수, 중복을 제외한 MP3 수, 성공/실패, 배포 상태를 보고.

### 큐 형식

```json
{
  "version": 1,
  "batch_id": "reviewed-20261009-a",
  "items": [
    {
      "word_id": "todokooru",
      "kind": "example",
      "index": 0,
      "spoken_text": "手続きがとどこおっている",
      "report_ids": [2],
      "reason": "예문 끝에서 비정상적인 소리가 난다는 신고. 일본어 읽기를 확인 후 발음 입력을 명시."
    }
  ]
}
```

- 단어 음성은 `kind:"word",index:null`; 예문 인덱스는 0부터 시작.
- `batch_id`는 매 실행마다 새 값으로 변경. **빈 `items:[]`는 비용이 드는 합성을 건너뜀.**
- 동일 단어/예문 대상 중복을 **한 번**만 큐에 넣고 모든 관련 Supabase 신고 ID를 `report_ids`에 기록.
- **작업량 최대 20개**. 더 많으면 별도 배치로 나눔.
- 소스/manifest 경로를 교차 검증하고 승인된 MP3만 수정. 예문이 아닌 문제·청해 음성은 이 도구 범위에 포함되지 않음.
- `audio/vocab/repaired-revisions.json`에는 수정한 MP3의 해시가 자동 반영되어 브라우저가 구버전 음성을 캐시에서 재생하지 않도록 함.
- 배치 중 한 건이라도 합성/코덱/경로 검증이 실패하면 **전체 배치를 게시하지 않음**. 문제 항목을 해결하고 다시 제출.
- 코드/파일 검증 성공은 **일본어의 실제 청각적 자연스러움까지 보장하지 않음**. 실제 청취 확인이 필요.
- GitHub Actions 작업은 실행된 배치만 처리하며 매일 자동으로 Supabase를 감시하지 않음.


## 문장 끝에 이상한 소리: 기존 목소리를 유지하는 MP3 끝소리 보정

- 앱에서 오류 유형 **문장 끝에 이상한 소리**로 신고된 경우만 검수 후 이 경로를 사용한다. 다른 오류는 기존 Kokoro 재생성 경로를 사용한다.
- 신고 자체가 MP3를 변경하지 않는다. 먼저 정상 일본어 마지막 음절과 불필요한 끝소리의 경계를 확인해 `remove_tail_ms`를 **수동으로 승인**한다. 정상 음절과 붙어 있어 경계가 불명확하면 임의 절단하지 말고 별도 검수한다.
- `audio/vocab/trim-batch.json`에 최대 20개를 등록한다. `error_type`은 정확히 `문장 끝에 이상한 소리`, `reviewed`는 `true`, `report_ids`에는 실제 신고 ID가 있어야 한다. `remove_tail_ms`는 **50~800ms**, 기존 음성 길이의 25% 이내여야 한다.
- 승인된 배치가 main에 커밋되면 `.github/workflows/trim-reported-vocab-batch.yml`이 실행된다. 기존 MP3의 **끝부분만 제거**하고 짧은 페이드아웃 후 MP3를 재인코딩한다. Kokoro 모델이나 화자를 변경하지 않는다.
- 한 건이라도 포맷·길이·경로 검증이 실패하면 전체 배치를 게시하지 않는다. 결과는 `audio/vocab/repaired-revisions.json`에 해시를 기록해 iPhone Safari의 구버전 캐시를 우회한다. 최종 청취 검수 후에만 신고를 `fixed` 처리한다.
- 검수 대기 중인 신고만으로는 자동 절단이 일어나지 않는다. **불필요한 끝소리만 분명하게 구분될 때** 승인하고, 그렇지 않으면 MP3를 그대로 둔다.

예시 형식(실제 리뷰 후 대상과 길이 지정):

```json
{
  "version": 1,
  "batch_id": "reviewed-endtrim-20261009-a",
  "items": [{
    "word_id": "todokooru",
    "kind": "example",
    "index": 0,
    "error_type": "문장 끝에 이상한 소리",
    "reviewed": true,
    "remove_tail_ms": 220,
    "report_ids": [2],
    "reason": "원래 문장의 마지막 음절 이후에 붙은 소리만 제거"
  }]
}
```

*위의 220ms와 신고 ID는 형식 설명용 예시이며 실제 보정 승인값이 아니다.*

## 구현 파일

- `tools/repair-reported-vocab-audio.py` — 입력 검증, Kokoro 1회 로딩, 다중 MP3 생성
- `tools/test_repair_reported_vocab_audio.py` — 순수 Python 테스트(음성 라이브러리 불필요)
- `.github/workflows/repair-reported-vocab-batch.yml` — 큐 수정 시 GitHub Actions 실행
- `audio/vocab/repair-batch.json` — ChatGPT가 검수 후 승인한 배치
- `audio/vocab/repaired-revisions.json` — 수정 MP3 캐시 버전
- `index.html` — 수정된 MP3만 `?v=<hash>`로 재생

## 실제 운영 참고

이 워크플로는 Supabase에 접수된 모든 신고를 무조건 AI로 자동 수정하는 기능이 아니다.
신고 내용을 검수하고 큐를 채우는 것은 ChatGPT와 대화할 때 진행한다. 서버측 TTS 처리에는 GitHub Actions 런타임이 사용된다.
