# 다음 세션 계획서

> 작성: 2026-06-29 (v4.5 세션) · 대상: 탁구대회 관리 시스템 (32-table)
> 함께 읽기: `MANUAL.md` §12-12(최근 변경)·§14(개발 후보), 메모리 `project_state.md`

## 0. 시작 방법
```bash
cd "C:/Users/USER/tetherget-mvp/31-대진표- 경기시간표"
git pull && npm run dev
```
Claude에게: **"NEXT_SESSION.md 읽고 남은 항목 루프 구현"**

## 1. 현재 상태 (v4.5)
- **HEAD**: `58065f4` — 전부 push·자동배포(https://32-table.pages.dev), 작업트리 클린.
- **이번 세션 완료 3기능**:
  1. 대시보드 코트 현황판 클릭 팝오버 (`e933079`)
  2. 홈 빠른 링크 3×2 통합 — 대시보드·체크인 추가 (`45aef02`)
  3. 통계 메달표 부문·성별 뱃지 + 대회별 그룹 헤더 (`58065f4`)

---

## 2. 다음 자동 구현 후보 (사용자 개입 불필요)

현재 §14에서 코드만으로 완료 가능한 항목:

### 2-1. 라이브보드 경기 호출 표시
- `/liveboard` 페이지에 현재 미확인 경기 호출 목록 표시 (전광판 화면)
- `Liveboard.tsx` 확인 후 호출 섹션 추가

### 2-2. 대회 진행 상태 뱃지 개선
- `/tournament` 페이지 대회 목록 카드에 진행률(%) 뱃지 표시
- `Tournament.tsx` 대회 카드 수정

### 2-3. 체크인 페이지 미체크인 선수 수 표시
- `/checkin` 상단에 "미체크인 N명" 카운터 + 체크인율 바 추가
- `Checkin.tsx` 확인 후 추가

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
