# 다음 세션 계획서

> 작성: 2026-06-29 (v4.6 세션) · 대상: 탁구대회 관리 시스템 (32-table)
> 함께 읽기: `MANUAL.md` §12-13(최근 변경)·§14(개발 후보), 메모리 `project_state.md`

## 0. 시작 방법
```bash
cd "C:/Users/USER/tetherget-mvp/31-대진표- 경기시간표"
git pull && npm run dev
```
Claude에게: **"NEXT_SESSION.md 읽고 남은 항목 루프 구현"**

## 1. 현재 상태 (v4.6)
- **HEAD**: (v4.6 커밋) — 전부 push·자동배포(https://32-table.pages.dev), 작업트리 클린.
- **이번 세션 완료 3기능**:
  1. 라이브보드 경기 호출 경과분 표시 (10분↑ 빨간색)
  2. 대회 목록 카드 진행률 뱃지 (N% / 완료)
  3. 체크인 상단 진행률 바 + 미체크인 카운터

---

## 2. 다음 자동 구현 후보 (사용자 개입 불필요)

v4.6에서 모두 완료. §14에서 추가 후보:

### 2-1. ✅ 라이브보드 경기 호출 경과분 (완료)
### 2-2. ✅ 대회 진행률 뱃지 (완료)
### 2-3. ✅ 체크인 진행률 바 + 미체크인 카운터 (완료)

### 다음 후보
- **라이브보드 선수 사진 표시**: `photoMap`이 이미 있음, LIVE 카드에 썸네일 추가
- **대회 종료 처리**: `status === 'done'` 전환 버튼 + 결과 잠금
- **점수 입력 히스토리**: 최근 5경기 입력 목록 표시 (undo 지원)

---

## 3. 사용자 개입/외부 연동 필요 (함께 있을 때)
- **🔴 Supabase 활성화 (HIGH)**: 코드 완성, DB 테이블만 생성 필요
  ```sql
  create table if not exists pingpong_tournaments (
    id text primary key, data jsonb not null,
    session_name text, updated_at timestamptz default now() not null
  );
  ```
  + Cloudflare Pages env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- **SMS/카카오 경기 호출**: Twilio/알리고 외부 서비스

## 4. 보류/대형
- 복식·단체 개별 Elo / 다국어(i18n) / 대회 사진 갤러리 / 노쇼·운영로그

---

## 5. 개발 팁 (실측)
- **순수함수**: `npx esbuild <file> --bundle --platform=node --format=esm --outfile=_x.mjs && node _x.mjs`
- **UI/스토어**: 반드시 라이브 검증 — React 제어 input은 네이티브 setter + `dispatchEvent(new Event('change',{bubbles:true}))`
- 빌드 검증: `npx tsc --noEmit`(OK), `npx vite build`. `tsc -b`는 supabase 관련 에러 가능.
- preview_screenshot은 타임아웃 잦음 → eval/snapshot으로 검증.
- 커밋 본문 끝 `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
