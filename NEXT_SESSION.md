# 다음 세션 계획서

> 작성: 2026-06-29 (v4.2 세션) · 대상: 탁구대회 관리 시스템 (32-table)
> 함께 읽기: `MANUAL.md` §12-9(최근 변경)·§14(개발 후보), 메모리 `project_state.md`

## 0. 시작 방법
```bash
cd "C:/Users/USER/tetherget-mvp/31-대진표- 경기시간표"
git pull && npm run dev
```
Claude에게: **"NEXT_SESSION.md 읽고 남은 항목 루프 구현"**

## 1. 현재 상태 (v4.2)
- **HEAD**: `9ee12dd` — 전부 push·자동배포(https://32-table.pages.dev), 작업트리 클린.
- **이번 세션 완료 4기능**:
  1. 일정 생성 운영설정 프리셋 저장/불러오기 (`9899011`)
  2. 홈 진행중 대회 카드 종목별 완료율 바 (`81fbaf8`)
  3. 일정 목록 카드 다일차 뱃지 (`e71484b`)
  4. 코트순 뷰 슬롯 드래그&드롭 코트 간 이동 (`9ee12dd`)

---

## 2. 다음 자동 구현 후보 (사용자 개입 불필요)

현재 §14에서 코드만으로 완료 가능한 항목:

### 2-1. 대시보드 진행중 경기 타이머
- `MatchCall`이나 `LiveMatch`에 시작시각 기록 → 대시보드 LIVE 현황에 경과 시간 표시
- `Dashboard.tsx` + store 수정 — 라이브 검증 가능

### 2-2. 선수 전적 CSV 내보내기
- 랭킹 페이지 선수 전적 모달에 CSV 다운로드 버튼 추가
- `Rankings.tsx` 수정 (scoreRecords + tournamentId 조인) — 순수 UI

### 2-3. 홈 명예의 전당 완료 대회 우승자 카드 개선
- 현재 `/` 홈에 완료 대회 우승자 섹션이 있는지 확인 후
  없으면 Col 3 하단에 완료 대회 최근 3개 메달리스트 추가

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
- **드래그 이벤트 시뮬레이션**: `new DataTransfer()` + `dt.setData('slotId', id)` 후 `onDragStart`→`onDrop` 순서 중요 (50ms setTimeout 사이에 drop 발생)
- 빌드 검증: `npx tsc --noEmit`(OK), `npx vite build`. `tsc -b`는 supabase 관련 에러 가능.
- preview_screenshot은 타임아웃 잦음 → eval/snapshot으로 검증.
- 커밋 본문 끝 `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
