# 다음 세션 계획서

> 작성: 2026-06-29 (v4.3 세션) · 대상: 탁구대회 관리 시스템 (32-table)
> 함께 읽기: `MANUAL.md` §12-10(최근 변경)·§14(개발 후보), 메모리 `project_state.md`

## 0. 시작 방법
```bash
cd "C:/Users/USER/tetherget-mvp/31-대진표- 경기시간표"
git pull && npm run dev
```
Claude에게: **"NEXT_SESSION.md 읽고 남은 항목 루프 구현"**

## 1. 현재 상태 (v4.3)
- **HEAD**: `dab7dd6` — 전부 push·자동배포(https://32-table.pages.dev), 작업트리 클린.
- **이번 세션 완료 3기능**:
  1. 대시보드 경기 호출·LIVE 경과시간 타이머 (`b718df5`)
  2. 선수 전적 모달 CSV 내보내기 (`4fb81bd`)
  3. 홈 명예의 전당 완료 대회 우승자 카드 (`dab7dd6`)

---

## 2. 다음 자동 구현 후보 (사용자 개입 불필요)

현재 §14에서 코드만으로 완료 가능한 항목:

### 2-1. 대시보드 경기 대기 시간 경고 (Col 2)
- 대기중인 경기(Col 2) 중 같은 선수가 이미 호출된 다른 경기가 있으면 "충돌" 표시
- 또는: 대기중 경기 수가 임계값(예: 20경기 이상) 초과 시 경고 배지 강조
- `Dashboard.tsx` 수정 — 순수 UI

### 2-2. 일정표 인쇄 시 날짜 헤더 개선
- 인쇄 시 각 날차별 날짜/코트 구분 헤더를 더 명확하게
- `Schedule.tsx` + `index.css` @media print 수정

### 2-3. 랭킹 페이지 페어 전적 CSV
- 현재 선수(단식) 전적 CSV는 완료(v4.3). 페어·단체팀도 동일 기능 추가
- `Rankings.tsx` `PairStatsModal` 또는 비슷한 컴포넌트 찾아서 추가

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
