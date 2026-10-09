# JLPT N1 발음 오류 신고 · Supabase 설정 및 운영

## 첫 연결 (프로젝트 관리자, 1회)

1. 기존 JLPT 동기화에 사용 중인 **같은 Supabase 프로젝트**를 연다.
2. SQL Editor에서 [supabase_pronunciation_reports.sql](./supabase_pronunciation_reports.sql) 전체를 실행한다.
3. `public.jlpt_pronunciation_reports` 테이블이 만들어졌는지 확인한다.
4. 사이트의 **PC·모바일 동기화** 메뉴에서 평소 사용하던 계정으로 로그인한다.
5. 안키 또는 전체 단어장에서 ⚑ 버튼 → 오류 유형 → **신고 접수**.

**중요:** GitHub에 SQL 파일을 커밋하는 것만으로 Supabase DB에 적용되지는 않는다. 이 단계가 끝나기 전까지는 사이트의 '다른 신고 방법'에서 GitHub 신고/복사가 가능하다. ChatGPT에 Supabase 프로젝트를 연결하면 SQL 적용과 DB 검증을 직접 요청할 수 있다.

## 사용자 경험

- 로그인됨: '신고 접수' 버튼이 서버 DB에 바로 INSERT를 요청한다. 성공 응답을 받아야만 '접수 완료'를 표시한다.
- 미로그인: Supabase 로그인 설정 안내가 표시되고, 직접 INSERT는 비활성화된다.
- 중복: 동일 사용자·단어·예문·오류 유형의 24시간 이내 중복 신고는 거부된다.
- 제한: 사용자당 최대 12건/시간, 50건/24시간.
- 서버 연결 실패/DB 미설치: '접수 완료'를 표시하지 않는다. GitHub 신고 작성·텍스트 복사 등의 대체 수단을 유지한다.
- 신고 접수 = 오류 수정 완료가 아니다. 실제 발음 검증, 음성 수정·배포는 별도로 진행한다.

## 무엇을 저장하는가

Auth 사용자 UUID, 대상 단어 ID, 단어/예문 구분, 예문 번호(0부터 시작), 단어·일본어 텍스트·읽기, 존재하는 MP3 상대경로, 오류 유형, 선택한 설명, 신고 시각 및 검토 상태. 사용자 이메일/비밀번호, 동기화 학습 데이터, 기기 고유 식별자, IP 주소는 신고 테이블의 컬럼에 저장하지 않는다.

## 보안 경계

- 브라우저에는 Supabase 공개용 publishable/anon 키만 사용하고 `service_role`/secret 키는 사용하지 않는다.
- 기존 `jlpt_study_state` 테이블·RLS는 변경하지 않는다.
- `jlpt_pronunciation_reports`는 RLS 사용. 로그인한 사용자는 본인 신고만 읽으며, 지정한 입력 컬럼에 한해 INSERT 가능하다.
- 일반 사용자는 본인의 신고도 UPDATE/DELETE할 수 없다. `status`, `user_id`, `created_at`을 직접 조작할 권한이 없다.
- 입력 길이와 형식 검사, 중복 검사 및 사용자별 전송 횟수 제한이 PostgreSQL에서 수행된다.
- 서버측 검증 트리거는 PostgREST의 노출 대상이 아닌 `private` 스키마에 있고 실행 권한을 제한한다.
- Supabase Auth의 익명 사용자는 신고할 수 없다. 계정 발급 자체에 대한 악의적인 공격까지 완전히 방지하는 것은 아니므로, 공개 회원가입을 허용한다면 Supabase Auth의 가입 속도 제한·CAPTCHA 등을 추가 고려한다.

## 신고 목록 확인 (Supabase SQL Editor)

```sql
select id, created_at, word_id, target_kind, example_index,
       japanese_text, error_type, note, audio_path, status
from public.jlpt_pronunciation_reports
order by created_at desc
limit 100;
```

### 처리 예시

1. 신고의 MP3 경로를 확인하고 실제 발음을 검증한다.
2. 관련 MP3를 재생성하거나 발음 텍스트를 수정한 다음 GitHub에 반영한다.
3. 새 음성을 테스트하고 배포 완료를 확인한다.
4. **관리자 전용 SQL Editor**에서 해당 신고의 상태를 변경한다.

```sql
update public.jlpt_pronunciation_reports
set status = 'fixed', updated_at = now()
where id = 123; -- 실제 ID로 변경
```

## 권한 점검 (Supabase SQL Editor)

```sql
select
 has_table_privilege('anon', 'public.jlpt_pronunciation_reports', 'INSERT') as anon_can_insert,
 has_column_privilege('authenticated', 'public.jlpt_pronunciation_reports', 'word_id', 'INSERT') as user_can_submit_word_id,
 has_column_privilege('authenticated', 'public.jlpt_pronunciation_reports', 'status', 'UPDATE') as user_can_edit_status,
 has_column_privilege('authenticated', 'public.jlpt_pronunciation_reports', 'user_id', 'INSERT') as user_can_forge_owner;
-- Expected: false, true, false, false
```

**주의:** 이 권한 쿼리는 설정 점검일 뿐, 실제 Auth/JWT로 로그인한 브라우저의 신고 성공 여부까지 확인하는 것은 아니다. 로그인한 상태에서 신고 테스트 후 관리자 SQL Editor에서 저장된 행을 직접 확인해야 완료된다.

## 다음 개선

관리자 신고 대시보드, 상태별 필터링, 일괄 처리, MP3 자동 재생성 파이프라인은 아직 개발되지 않았다. 저장에 성공해도 ChatGPT가 백그라운드에서 알아서 음성을 고치는 것은 아니다.
