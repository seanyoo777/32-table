# 다음 세션 계획서

> 작성: 2026-06-21 (v4.0 세션 종료 시) · 대상: 탁구대회 관리 시스템 (32-table)
> 함께 읽기: `MANUAL.md` §4(일정)·§12-7(최근 변경)·§14(개발 후보), 메모리 `project_state.md`

## 0. 시작 방법
```bash
cd "C:/Users/USER/tetherget-mvp/31-대진표- 경기시간표"
git pull && npm run dev
```
Claude에게: **"NEXT_SESSION.md 읽고 1번(일정 운영설정 프리셋 저장) 구현"**

## 1. 현재 상태 (v4.0)
- **HEAD**: `5d0ba20` 기준 + 본 계획서/매뉴얼 커밋. 전부 push·자동배포(https://32-table.pages.dev), 작업트리 클린.
- **직전 세션(자동 루프) 완료 5기능** — 모두 라이브검증·배포:
  1. 병렬 스케줄러 다일차 자동분할 (엔진 `cbf9260` + UI `5fde629`)
  2. 단체전 전용코트 분리 — 병렬생성 연결 (`159c139`)
  3. 경기 지연 후속 자동밀림 (`31e317d`)
  4. 일정 슬롯 인라인 시간/코트 편집 (`34709ae`)
- **일정 운영 관련 MEDIUM 항목 전부 완료.**

---

## 2. 1순위 — 일정 생성 운영설정 프리셋 저장/불러오기 (자동검증 가능, 착수 직전이었음)

**목표**: 일정 생성폼의 운영 설정을 이름 붙여 저장하고 다음 대회에 재사용.

**저장 대상(운영 설정만)**: `totalDays`, `dayConfigs[]`(시작·종료·코트수), `globalMinutesPerMatch`,
`globalTeamMinutes`, `globalBuffer`, `teamCourtCount`.
**제외**: 부문별 인원 grid(`activeDivs`/`grid`) — 대회마다 다름. ⚠️ **과확장 금지**.

**구현 단계**
1. `src/store/useStore.ts`: 상태 `schedulePresets: { id: string; name: string; config: {...} }[]` 추가 +
   `addSchedulePreset`, `deleteSchedulePreset` 액션. persist 자동(키 `pingpong-v3`).
   - 타입은 `types/index.ts`에 `SchedulePreset` 정의(순환 import 피해 config 인라인).
2. `src/pages/Schedule.tsx` 생성폼(상단 state: `totalDays`/`dayConfigs`/`global*`/`teamCourtCount` 근처):
   - **'설정 프리셋 저장'** 버튼 → 이름 prompt/인풋 → 현재 설정 스냅샷 저장.
   - **'불러오기' select** → 선택 시 각 setter로 폼 채움(`setTotalDays`/`setDayConfigs`/...).
   - (선택) 프리셋 삭제 버튼.
3. **라이브 검증 필수**(UI/스토어는 tsc·node로 안 잡힘):
   `preview_start` → 생성폼 진입 → 설정 변경 → 프리셋 저장 → 값 바꾼 뒤 불러오기 →
   폼 입력값·`localStorage` 반영 확인. 끝나면 `localStorage.removeItem('pingpong-v3')` 정리.
4. `tsc --noEmit` + `vite build` 통과 → 커밋·푸시 → MANUAL §14·메모리 갱신.

---

## 3. 그 다음 (사용자 개입/외부 연동 필요 — 함께 있을 때 권장)
- **🔴 Supabase 활성화 (HIGH)**: 코드는 이미 있음. 사용자가 ① Supabase에 `pingpong_tournaments`
  테이블 생성(SQL은 MANUAL §14) ② Cloudflare Pages env `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` 설정.
  - 코드 확장 후보: `lib/sync.ts`가 tournaments만 업로드 → players/pairs/teams도 동기화.
    (미설정 시 graceful no-op 보장. 사용자 원격 프로젝트엔 임의로 손대지 말 것.)
- **SMS/카카오 경기 호출**: Twilio/알리고 등 외부 서비스 + 연락처. matchCall→발송.

## 4. 보류/대형 (착수 전 사용자 합의)
- 복식·단체 개별 Elo — 검증단 권고로 보류(현재 포인트·승패만, 배율 보정).
- 다국어(i18n) — 대형. / 대회 사진 갤러리 / 노쇼·운영로그.

---

## 5. 개발 팁 (실측)
- **순수함수**(scheduleUtils 등)는 `npx esbuild <file> --bundle --platform=node --format=esm --outfile=_x.mjs && node _x.mjs`로 단위테스트. 끝나면 임시파일 삭제.
- **UI/스토어 통합은 반드시 라이브 검증** — preview_eval로 localStorage 주입→클릭→DOM/localStorage 확인.
  React 제어 input/select는 네이티브 setter + `dispatchEvent(new Event('change',{bubbles:true}))`로 값 주입.
- 빌드 검증: `npx tsc --noEmit`(OK), `npx vite build`. `tsc -b`는 supabase 관련 에러 가능.
- preview_screenshot은 타임아웃 잦음 → eval/snapshot으로 검증.
- 커밋 본문 끝 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
