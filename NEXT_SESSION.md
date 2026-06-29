# 다음 세션 계획서

> 작성: 2026-06-29 (v4.4 세션) · 대상: 탁구대회 관리 시스템 (32-table)
> 함께 읽기: `MANUAL.md` §12-11(최근 변경)·§14(개발 후보), 메모리 `project_state.md`

## 0. 시작 방법
```bash
cd "C:/Users/USER/tetherget-mvp/31-대진표- 경기시간표"
git pull && npm run dev
```
Claude에게: **"NEXT_SESSION.md 읽고 남은 항목 루프 구현"**

## 1. 현재 상태 (v4.4)
- **HEAD**: `391c48a` — 전부 push·자동배포(https://32-table.pages.dev), 작업트리 클린.
- **이번 세션 완료 3기능**:
  1. 대시보드 대기 경기 충돌 감지·적체 경고 (`1e5241b`)
  2. 일정 시간순 뷰 다일차 섹션 헤더·인쇄 개선 (`0d2266d`)
  3. 복식 페어 전적 모달·CSV 내보내기 (`391c48a`)

---

## 2. 다음 자동 구현 후보 (사용자 개입 불필요)

현재 §14에서 코드만으로 완료 가능한 항목:

### 2-1. 대시보드 코트 현황판 클릭 → 경기 상세
- 코트 현황판(상단 코트 카드)에서 "called" 상태 코트 클릭 시 해당 경기 호출 정보 팝오버
- `Dashboard.tsx` 수정 — 순수 UI

### 2-2. 홈 빠른 링크에 대시보드·체크인 추가
- 현재 Quick links: 랭킹·대회·일정·점수. 대시보드와 체크인 도 빠른 접근 가능하면 편리
- `Home.tsx` quickLinks 배열 수정 (6개로 확장 또는 기존 4개 교체)

### 2-3. 통계·리포트 페이지 종목별 메달표 개선
- `/stats` 페이지에 이미 메달표가 있는지 확인 후 없으면 종목별 금·은·동 수상자 표 추가
- `Stats.tsx` 또는 유사 파일 수정

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
