// ─────────────────────────────────────────────────────────────
// 토너먼트 포인트·레이팅 정산 엔진
//
// 설계 원칙: "종목 완료 시 일괄 정산" + idempotent
//  - 종목(이벤트)의 모든 실경기가 끝나면 최종 순위(우승/준우승/3위/8강…)를
//    브래킷에서 계산해 포인트·승패·Elo를 한 번에 산정한다.
//  - 산정 결과(EventAwards)를 이벤트에 스냅샷으로 저장하고, 선수에게는
//    "이번 산정값 − 직전 스냅샷"의 차이만 반영한다.
//  - 따라서 결과 수정·취소 시 자동으로 롤백/재계산되어 포인트가 오염되지 않는다.
//    (미완료 상태면 빈 정산값 → 직전 스냅샷이 그대로 차감되어 0으로 복구)
// ─────────────────────────────────────────────────────────────
import type {
  BracketMatch, EventAwards, Pair, Player, Team, Tournament,
  TournamentEvent, TournamentGrade,
} from '../types'
import { calcStandings, computeDoubleElimPlacements } from './bracketUtils'
import {
  calcNewRatings, getPointsForResult, getEventMultiplier, eloPointsMultiplier,
} from './ratingUtils'

export const EMPTY_AWARDS = (): EventAwards => ({
  points: {}, wins: {}, losses: {}, ratingDelta: {}, gamesDelta: {},
})

// 참가자 ID(선수/페어/팀) → 구성 선수 ID 배열로 확장
function expandId(id: string, pairs: Pair[], teams: Team[]): string[] {
  const pair = pairs.find(p => p.id === id)
  if (pair) return [pair.player1Id, pair.player2Id].filter(Boolean) as string[]
  const team = teams.find(t => t.id === id)
  if (team) return (team.playerIds ?? []).filter(Boolean)
  return [id]
}

// 본선(녹아웃) 경기만 추출 — 조별/예선(groupId 보유)·시드예선 예선 제외
function knockoutMatches(ev: TournamentEvent): BracketMatch[] {
  return ev.matches.filter(m => !m.groupId)
}

// 결승전 찾기 (Elo 이변 배율·우승자 판정용)
export function getFinalMatch(ev: TournamentEvent): BracketMatch | null {
  if (ev.bracketFormat === '리그') return null
  const ko = knockoutMatches(ev).filter(m => !m.isThirdPlace)
  if (ko.length === 0) return null
  const maxR = Math.max(...ko.map(m => m.round))
  return ko.find(m => m.round === maxR && !m.nextMatchId)
    ?? ko.find(m => m.round === maxR)
    ?? null
}

// 종목 완료 여부: 실경기(양쪽 참가자 존재·부전승 아님)가 모두 결과 보유
export function isEventComplete(ev: TournamentEvent): boolean {
  const real = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
  return real.length > 0 && real.every(m => m.result)
}

// ─── 최종 순위(성적) 계산: entityId → 성적('우승'|'준우승'|'3위'|'4위'|'8강'…|'참가')
// 미완료 경기는 무시하고 현재까지 확정된 성적만 반영 (배너·요약 표시에도 사용)
export function computeEventPlacements(ev: TournamentEvent): Record<string, string> {
  const place: Record<string, string> = {}
  for (const id of ev.participantIds) place[id] = '참가'

  // 더블 엘리미네이션: 전용 순위 계산 (WB/LB/GF)
  if (ev.bracketFormat === '더블엘리미네이션') {
    const de = computeDoubleElimPlacements(ev.matches, ev.participantIds)
    return { ...place, ...de }
  }

  // 리그: 순위표 기준 상위 4명
  if (ev.bracketFormat === '리그') {
    const standings = calcStandings(ev.matches, ev.participantIds)
    const ranked = [...ev.participantIds].sort((a, b) => {
      const sa = standings[a], sb = standings[b]
      if (!sa || !sb) return 0
      if (sb.pts !== sa.pts) return sb.pts - sa.pts
      const da = sa.setsW - sa.setsL, db = sb.setsW - sb.setsL
      if (db !== da) return db - da
      return (sb.pointsW - sb.pointsL) - (sa.pointsW - sa.pointsL)
    })
    const labels = ['우승', '준우승', '3위', '4위']
    ranked.forEach((id, i) => {
      if (i < labels.length && (standings[id]?.played ?? 0) > 0) place[id] = labels[i]
    })
    return place
  }

  // 녹아웃(토너먼트·시드예선 본선·조별 본선)
  const ko = knockoutMatches(ev).filter(m => !m.isThirdPlace)
  if (ko.length === 0) return place
  const maxR = Math.max(...ko.map(m => m.round))
  const tp = ev.matches.find(m => m.isThirdPlace)
  const hasTP = !!tp

  for (const m of ko) {
    if (!m.result || !m.participant1Id || !m.participant2Id || m.isBye) continue
    const fromEnd = maxR - m.round
    let ach: string
    if (fromEnd <= 0) ach = '준우승'
    else if (fromEnd === 1) ach = hasTP ? '4위' : '3위' // 3·4위전 없으면 공동 3위
    else if (fromEnd === 2) ach = '8강'
    else if (fromEnd === 3) ach = '16강'
    else if (fromEnd === 4) ach = '32강'
    else if (fromEnd === 5) ach = '64강'
    else ach = '참가'
    const l = m.result.loserId
    if (l && l in place) place[l] = ach
    if (fromEnd <= 0) {
      const w = m.result.winnerId
      if (w in place) place[w] = '우승'
    }
  }

  // 3·4위전 결과로 준결승 패자 성적 확정
  if (tp?.result) {
    const w = tp.result.winnerId, l = tp.result.loserId
    if (w in place) place[w] = '3위'
    if (l && l in place) place[l] = '4위'
  }

  return place
}

// 배너·요약용 메달리스트 (entityId)
export function getMedalists(ev: TournamentEvent): { gold: string | null; silver: string | null; bronze: string[] } {
  const place = computeEventPlacements(ev)
  const byAch = (a: string) => Object.keys(place).filter(id => place[id] === a)
  return {
    gold: byAch('우승')[0] ?? null,
    silver: byAch('준우승')[0] ?? null,
    bronze: byAch('3위'),
  }
}

// ─── 핵심: 종목의 포인트·승패·Elo 정산값 산정 (선수 ID 기준)
// 미완료면 빈 정산값을 반환 → 호출부에서 직전 스냅샷을 차감해 자동 롤백
export function computeEventAwards(
  ev: TournamentEvent,
  ctx: { players: Player[]; pairs: Pair[]; teams: Team[]; grade: TournamentGrade },
): EventAwards {
  const awards = EMPTY_AWARDS()
  if (!isEventComplete(ev)) return awards

  const { players, pairs, teams, grade } = ctx
  const place = computeEventPlacements(ev)
  const mult = getEventMultiplier(ev.eventType)

  // 우승 포인트 Elo 이변 배율 (단식 결승만)
  let champEloMult = 1
  if (ev.eventType === '단식') {
    const finalM = getFinalMatch(ev)
    if (finalM?.result) {
      const wr = players.find(p => p.id === finalM.result!.winnerId)?.rating ?? 1000
      const lr = players.find(p => p.id === finalM.result!.loserId)?.rating ?? 1000
      champEloMult = eloPointsMultiplier(wr, lr)
    }
  }

  // 1) 성적별 포인트 (선수 단위로 확장 분배)
  for (const [entityId, ach] of Object.entries(place)) {
    let pts = getPointsForResult(grade, ach) * mult
    if (ach === '우승') pts *= champEloMult
    pts = Math.round(pts)
    if (pts === 0) continue
    for (const pid of expandId(entityId, pairs, teams)) {
      awards.points[pid] = (awards.points[pid] ?? 0) + pts
    }
  }

  // 2) 승패 (완료된 실경기 — 부전승 포함)
  for (const m of ev.matches) {
    if (!m.result || !m.participant1Id || !m.participant2Id || m.isBye) continue
    for (const pid of expandId(m.result.winnerId, pairs, teams)) {
      awards.wins[pid] = (awards.wins[pid] ?? 0) + 1
    }
    if (m.result.loserId) {
      for (const pid of expandId(m.result.loserId, pairs, teams)) {
        awards.losses[pid] = (awards.losses[pid] ?? 0) + 1
      }
    }
  }

  // 3) Elo 레이팅 (단식만) — 이벤트 내 경기를 라운드·포지션 순으로 재생
  //    기준 레이팅 = 현재 레이팅 − 직전 스냅샷 델타 (이벤트 단위 가역성 보장)
  if (ev.eventType === '단식') {
    const base = new Map<string, { rating: number; games: number }>()
    const getBase = (pid: string) => {
      let b = base.get(pid)
      if (!b) {
        const p = players.find(x => x.id === pid)
        b = {
          rating: (p?.rating ?? 1000) - (ev.awards?.ratingDelta?.[pid] ?? 0),
          games: (p?.gamesPlayed ?? 0) - (ev.awards?.gamesDelta?.[pid] ?? 0),
        }
        base.set(pid, b)
      }
      return b
    }
    const work = new Map<string, { rating: number; games: number }>()
    const cur = (pid: string) => work.get(pid) ?? { ...getBase(pid) }

    const singles = ev.matches
      .filter(m => m.result && !m.isBye && !m.result.walkedOver
        && m.participant1Id && m.participant2Id && m.result.loserId)
      .sort((a, b) => a.round !== b.round ? a.round - b.round : a.position - b.position)

    for (const m of singles) {
      const w = m.result!.winnerId, l = m.result!.loserId
      const rw = cur(w), rl = cur(l)
      const { newA, newB } = calcNewRatings(rw.rating, rw.games, rl.rating, rl.games, true)
      work.set(w, { rating: newA, games: rw.games + 1 })
      work.set(l, { rating: newB, games: rl.games + 1 })
    }

    for (const [pid, wv] of work) {
      const b = getBase(pid)
      const dr = wv.rating - b.rating
      const dg = wv.games - b.games
      if (dr !== 0) awards.ratingDelta[pid] = dr
      if (dg !== 0) awards.gamesDelta[pid] = dg
    }
  }

  return awards
}

// ─── 정산 적용: 브래킷이 변경된 후 한 종목을 재정산해 선수/이벤트에 반영
// (record/clear 양쪽에서 공통 사용)
export function applyEventSettlement(
  tournaments: Tournament[],
  players: Player[],
  pairs: Pair[],
  teams: Team[],
  tournamentId: string,
  eventId: string,
): { tournaments: Tournament[]; players: Player[] } {
  const tour = tournaments.find(t => t.id === tournamentId)
  const ev = tour?.events.find(e => e.id === eventId)
  if (!tour || !ev) return { tournaments, players }

  const grade: TournamentGrade = tour.grade ?? 'C급'
  const target = computeEventAwards(ev, { players, pairs, teams, grade })
  const prev = ev.awards ?? EMPTY_AWARDS()

  const newPlayers = players.map(p => {
    const dp = (target.points[p.id] ?? 0) - (prev.points[p.id] ?? 0)
    const dw = (target.wins[p.id] ?? 0) - (prev.wins[p.id] ?? 0)
    const dl = (target.losses[p.id] ?? 0) - (prev.losses[p.id] ?? 0)
    const dr = (target.ratingDelta[p.id] ?? 0) - (prev.ratingDelta[p.id] ?? 0)
    const dg = (target.gamesDelta[p.id] ?? 0) - (prev.gamesDelta[p.id] ?? 0)
    if (!dp && !dw && !dl && !dr && !dg) return p
    return {
      ...p,
      points: Math.max(0, p.points + dp),
      wins: Math.max(0, p.wins + dw),
      losses: Math.max(0, p.losses + dl),
      rating: Math.max(100, p.rating + dr),
      gamesPlayed: Math.max(0, p.gamesPlayed + dg),
    }
  })

  const newTournaments = tournaments.map(t => t.id !== tournamentId ? t : {
    ...t,
    events: t.events.map(e => e.id !== eventId ? e : { ...e, awards: target }),
  })

  return { tournaments: newTournaments, players: newPlayers }
}
