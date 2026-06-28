# 다음 세션 계획서

> 작성: 2026-06-29 (v4.1 세션) · 대상: 탁구대회 관리 시스템 (32-table)
> 함께 읽기: `MANUAL.md` §4(일정)·§12-8(최근 변경)·§14(개발 후보), 메모리 `project_state.md`

## 0. 시작 방법
```bash
cd "C:/Users/USER/tetherget-mvp/31-대진표- 경기시간표"
git pull && npm run dev
```
Claude에게: **"NEXT_SESSION.md 읽고 남은 항목 루프 구현"**

## 1. 현재 상태 (v4.1)
- **HEAD**: `9899011` (일정 생성 운영설정 프리셋). 전부 push·자동배포(https://32-table.pages.dev), 작업트리 클린.
- **이번 세션 완료**:
  1. 일정 생성 운영설정 프리셋 저장/불러오기 (`9899011`) — tsc·vite build·라이브 검증 완료

---

## 2. 다음 자동 구현 후보 (사용자 개입 불필요 — 루프 가능)

현재 §14 MEDIUM/LOW에서 코드만으로 완료 가능한 항목:

### 2-1. 대회 진행률 홈 대시보드 위젯
- 홈(`/`)에 현재 진행중 대회의 종목별 경기 완료율 바(%) 표시
- `Home.tsx` 수정 + store에서 tournaments 읽기 (이미 있음)
- 순수 UI 변경 — 라이브 검증 가능

### 2-2. 일정표 목록에 다일차 뱃지 표시
- SchedulePage 목록 카드에 "3일차" 뱃지 (plan.days?.length > 1 시)
- `Schedule.tsx` 5줄 수정 — 즉시 가능

### 2-3. 경기일정 슬롯 드래그 편집 (보류 → 구현 검토)
- MANUAL §12-7 "드래그 UI는 미구현(필요시 추후)" — 코드 확장
- `moveScheduleSlot` 이미 존재, UI만 추가

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
