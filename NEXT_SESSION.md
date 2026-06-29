# 다음 세션 계획서

> 작성: 2026-06-29 (v4.8 세션) · 대상: 탁구대회 관리 시스템 (32-table)
> 함께 읽기: `MANUAL.md` §12-15(최근 변경)·§14(개발 후보), 메모리 `project_state.md`

## 0. 시작 방법
```bash
cd "C:/Users/USER/tetherget-mvp/31-대진표- 경기시간표"
git pull && npm run dev
```
Claude에게: **"NEXT_SESSION.md 읽고 남은 항목 루프 구현"**

## 1. 현재 상태 (v4.8)
- **HEAD**: (v4.8 커밋) — 전부 push·자동배포(https://32-table.pages.dev), 작업트리 클린.
- **이번 세션 완료 3기능**:
  1. 랭킹 대회별 참가자 필터 (드롭다운 → 1100→288명 필터)
  2. 대시보드 대회별 진행률 요약 행 (4개 대회 93%·47%·56%·75%)
  3. 점수 기록 세트스코어 칩 표시 (11-9, 9-11 등)

---

## 2. 다음 자동 구현 후보 (사용자 개입 불필요)

v4.6에서 모두 완료. §14에서 추가 후보:

### 2-1. ✅ 라이브보드 경기 호출 경과분 (완료 v4.6)
### 2-2. ✅ 대회 진행률 뱃지 (완료 v4.6)
### 2-3. ✅ 체크인 진행률 바 + 미체크인 카운터 (완료 v4.6)
### 2-4. ✅ 점수 기록 삭제 버튼 (완료 v4.7)
### 2-5. ✅ 대회 목록 상태 필터 탭 (완료 v4.7)
### 2-6. ✅ 홈 경기 요약 바 (완료 v4.7)
### 2-7. ✅ 랭킹 대회별 참가자 필터 (완료 v4.8)
### 2-8. ✅ 대시보드 대회별 진행률 요약 행 (완료 v4.8)
### 2-9. ✅ 점수 기록 세트스코어 칩 표시 (완료 v4.8)

### 다음 후보
- **점수 입력 직접입력 탭에 세트스코어 펼치기/접기**: r.sets 이미 표시됨, 검색 필터에 대회 추가
- **체크인 페이지 선수 QR 대량출력 개선**: 현재 개별 출력, 선택 인쇄 가능하게
- **일정표 다운로드 PDF**: 현재 인쇄만 있음, html2canvas/window.print 활용

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
