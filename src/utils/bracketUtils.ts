import type { BracketMatch, Group, TournamentEvent } from '../types'

export function genId() { return Math.random().toString(36).slice(2, 10) }

export function nextPow2(n: number): number {
  let p = 1; while (p < n) p *= 2; return p
}

interface Seeded { id: string; points: number }

// ─── 토너먼트 (단일 제거) ─────────────────────────────────
export function generateTournamentBracket(participants: Seeded[], options?: { thirdPlace?: boolean; preserveOrder?: boolean }): BracketMatch[] {
  const sorted = options?.preserveOrder ? [...participants] : [...participants].sort((a, b) => b.points - a.points)
  const n = sorted.length
  const size = nextPow2(n)
  const totalRounds = Math.log2(size)

  // Standard seeding positions for round 1
  const seedOrder = buildSeedOrder(size)

  // Build match ID grid
  const ids: string[][] = []
  for (let r = 0; r < totalRounds; r++) {
    const cnt = size / Math.pow(2, r + 1)
    ids.push(Array.from({ length: cnt }, (_, i) => `r${r + 1}m${i + 1}`))
  }

  const matches: BracketMatch[] = []

  // Round 1
  for (let i = 0; i < size / 2; i++) {
    const s1 = seedOrder[i * 2]
    const s2 = seedOrder[i * 2 + 1]
    const p1 = s1 <= n ? sorted[s1 - 1] : null
    const p2 = s2 <= n ? sorted[s2 - 1] : null
    const nextMatchId = totalRounds > 1 ? ids[1][Math.floor(i / 2)] : null
    const isBye = (p1 && !p2) || (!p1 && p2)
    const autoWinner = p1 && !p2 ? p1.id : !p1 && p2 ? p2.id : null

    matches.push({
      id: ids[0][i], round: 1, position: i,
      participant1Id: p1?.id ?? null,
      participant2Id: p2?.id ?? null,
      result: autoWinner
        ? { winnerId: autoWinner, loserId: '', winnerScore: 0, loserScore: 0, walkedOver: true }
        : null,
      nextMatchId, isBye: !!isBye,
    })
  }

  // Subsequent rounds
  for (let r = 1; r < totalRounds; r++) {
    const cnt = ids[r].length
    for (let i = 0; i < cnt; i++) {
      const f1 = matches.find(m => m.id === ids[r - 1][i * 2])
      const f2 = matches.find(m => m.id === ids[r - 1][i * 2 + 1])
      const nextMatchId = r < totalRounds - 1 ? ids[r + 1][Math.floor(i / 2)] : null
      matches.push({
        id: ids[r][i], round: r + 1, position: i,
        participant1Id: f1?.result?.winnerId ?? null,
        participant2Id: f2?.result?.winnerId ?? null,
        result: null, nextMatchId,
      })
    }
  }

  // 3·4위전: 준결승(totalRounds-1 라운드)이 존재하는 경우에만 추가
  if (options?.thirdPlace && totalRounds >= 2) {
    matches.push({
      id: 'third-place', round: totalRounds, position: 1,
      participant1Id: null, participant2Id: null,
      result: null, nextMatchId: null, isThirdPlace: true,
    })
  }

  return matches
}

// ─── 조별 + 토너먼트 ─────────────────────────────────────
export function generateGroups(
  participants: Seeded[],
  groupSize: number,
  advanceCount: number
): { groups: Group[]; matches: BracketMatch[] } {
  const sorted = [...participants].sort((a, b) => b.points - a.points)
  const n = sorted.length
  const groupCount = Math.ceil(n / groupSize)
  const groups: Group[] = []
  const groupMatches: BracketMatch[] = []

  // Snake seeding: top seed into group A, 2nd into B, ... then reverse
  const groupBuckets: string[][] = Array.from({ length: groupCount }, () => [])
  sorted.forEach((p, i) => {
    const row = Math.floor(i / groupCount)
    const col = row % 2 === 0 ? i % groupCount : groupCount - 1 - (i % groupCount)
    groupBuckets[col].push(p.id)
  })

  // Max group round offset (round-robin rounds = members - 1)
  const maxGroupMembers = Math.max(...groupBuckets.map(b => b.length), 2)
  const maxGroupRound = maxGroupMembers - 1

  groupBuckets.forEach((bucket, gi) => {
    const gId = `g${gi + 1}`
    const gName = `${String.fromCharCode(65 + gi)}조`
    groups.push({ id: gId, name: gName, participantIds: bucket, advanceCount })

    // Round-robin within group
    const list = [...bucket]
    if (list.length % 2 !== 0) list.push('bye')
    const rounds = list.length - 1
    const half = list.length / 2
    let pos = 0

    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < half; i++) {
        const p1 = list[i]
        const p2 = list[list.length - 1 - i]
        if (p1 !== 'bye' && p2 !== 'bye') {
          groupMatches.push({
            id: `${gId}-r${r + 1}-m${i + 1}`,
            round: r + 1, position: pos++,
            groupId: gId,
            participant1Id: p1, participant2Id: p2,
            result: null, nextMatchId: null,
          })
        }
      }
      list.splice(1, 0, list.pop()!)
    }
  })

  // Build knockout bracket with placeholder slots
  const knockoutMatches = generateKnockoutFromGroups(groups, maxGroupRound)

  return { groups, matches: [...groupMatches, ...knockoutMatches] }
}

// ─── 시드예선 브래킷 ──────────────────────────────────────────
// seeds: 상위 seedCount명 → 본선 직행
// 나머지: 예선 조별 미니 토너먼트 → 우승자 본선 합류
export function generateSeededBracket(
  participants: Seeded[],
  seedCount: number,
  options?: { thirdPlace?: boolean }
): { groups: Group[]; matches: BracketMatch[] } {
  const sorted = [...participants].sort((a, b) => b.points - a.points)
  const actualSeeds = Math.min(seedCount, sorted.length)
  const seeds = sorted.slice(0, actualSeeds)
  const qualifiers = sorted.slice(actualSeeds)

  // 본선에서 필요한 예선 통과 슬롯 수
  const qualAdvance = qualifiers.length > 0 ? Math.min(qualifiers.length, actualSeeds) : 0

  // 예선 통과 슬롯 플레이스홀더 (포인트 0 → 본선에서 낮은 시드 위치 배정)
  const qualSlots: Seeded[] = Array.from({ length: qualAdvance }, (_, i) => ({
    id: `ko-slot-qg${i}-r1`,
    points: 0,
  }))

  // 본선 브래킷 생성 (시드 + 예선 슬롯)
  const mainParticipants = [...seeds, ...qualSlots]
  const mainMatches: BracketMatch[] = generateTournamentBracket(mainParticipants, options)
    .map(m => ({ ...m, phase: 'main' as const }))

  // 예선 조 생성
  const groups: Group[] = []
  const qualMatches: BracketMatch[] = []

  for (let gi = 0; gi < qualAdvance; gi++) {
    const groupPlayers = qualifiers.filter((_, idx) => idx % qualAdvance === gi)
    if (groupPlayers.length === 0) continue

    const gId = `qg${gi}`
    groups.push({
      id: gId,
      name: `예선 ${gi + 1}조`,
      participantIds: groupPlayers.map(p => p.id),
      advanceCount: 1,
    })

    if (groupPlayers.length === 1) {
      // 1명 → 부전승으로 바로 통과
      qualMatches.push({
        id: `${gId}-r1m1`,
        round: 1, position: 0,
        groupId: gId,
        participant1Id: groupPlayers[0].id,
        participant2Id: null,
        result: { winnerId: groupPlayers[0].id, loserId: '', winnerScore: 0, loserScore: 0, walkedOver: true },
        nextMatchId: null,
        isBye: true,
        phase: 'qual',
      })
    } else {
      // 미니 토너먼트 생성 후 ID 앞에 그룹 접두사 붙이기
      const inner = generateTournamentBracket(groupPlayers)
      const prefixed: BracketMatch[] = inner.map(m => ({
        ...m,
        id: `${gId}-${m.id}`,
        groupId: gId,
        phase: 'qual' as const,
        nextMatchId: m.nextMatchId ? `${gId}-${m.nextMatchId}` : null,
      }))
      qualMatches.push(...prefixed)
    }
  }

  return { groups, matches: [...qualMatches, ...mainMatches] }
}

// 시드예선에서 예선 그룹 완료 시 본선 슬롯 채우기 (useStore recordMatchResult에서 호출)
export function wireSeededQualWinners(
  ev: Pick<TournamentEvent, 'groups'>,
  matches: BracketMatch[]
): BracketMatch[] {
  for (const group of ev.groups) {
    const qgMatches = matches.filter(m => m.groupId === group.id)
    if (qgMatches.length === 0) continue

    const maxRound = Math.max(...qgMatches.map(m => m.round))
    const qgFinal = qgMatches.find(m => m.round === maxRound && !m.isBye)
    const autoWin = qgMatches.find(m => m.isBye && m.result?.winnerId)
    const winner = qgFinal?.result?.winnerId ?? autoWin?.result?.winnerId
    if (!winner) continue

    const slotId = `ko-slot-${group.id}-r1`
    matches = matches.map((m): BracketMatch => {
      if (m.groupId) return m
      const p1 = m.participant1Id === slotId ? winner : m.participant1Id
      const p2 = m.participant2Id === slotId ? winner : m.participant2Id
      return p1 !== m.participant1Id || p2 !== m.participant2Id
        ? { ...m, participant1Id: p1, participant2Id: p2 }
        : m
    })
  }
  return matches
}

// Knockout bracket after group stage (placeholder matches)
export function generateKnockoutFromGroups(
  groups: Group[],
  roundOffset?: number,
): BracketMatch[] {
  const totalAdvancers = groups.reduce((s, g) => s + g.advanceCount, 0)
  const maxGroupRound = roundOffset ?? Math.max(...groups.map(g => g.participantIds.length - 1), 1)
  // Placeholder ids: slot-g1-1 = 1st place of group 1, slot-g1-2 = 2nd place, etc.
  const advancerSlots: Seeded[] = []
  for (const g of groups) {
    for (let rank = 1; rank <= g.advanceCount; rank++) {
      advancerSlots.push({ id: `ko-slot-${g.id}-r${rank}`, points: totalAdvancers - advancerSlots.length })
    }
  }
  const knockout = generateTournamentBracket(advancerSlots)
  return knockout.map(m => ({
    ...m,
    round: m.round + maxGroupRound,
    // keep participant slots as placeholder ids (will be filled when group stage ends)
  }))
}

// ─── 리그 (라운드 로빈) ───────────────────────────────────
export function generateLeagueMatches(participants: Seeded[]): BracketMatch[] {
  const list = [...participants].map(p => p.id)
  if (list.length % 2 !== 0) list.push('bye')
  const rounds = list.length - 1
  const half = list.length / 2
  const matches: BracketMatch[] = []
  let pos = 0

  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const p1 = list[i]
      const p2 = list[list.length - 1 - i]
      if (p1 !== 'bye' && p2 !== 'bye') {
        matches.push({
          id: `rr-r${r + 1}-m${i + 1}`,
          round: r + 1, position: pos++,
          participant1Id: p1, participant2Id: p2,
          result: null, nextMatchId: null,
        })
      }
    }
    list.splice(1, 0, list.pop()!)
  }
  return matches
}

// ─── 리그 순위 계산 ───────────────────────────────────────
export function calcStandings(matches: BracketMatch[], participantIds: string[]) {
  const s: Record<string, { played: number; wins: number; losses: number; pts: number; setsW: number; setsL: number; pointsW: number; pointsL: number }> = {}
  for (const id of participantIds) s[id] = { played: 0, wins: 0, losses: 0, pts: 0, setsW: 0, setsL: 0, pointsW: 0, pointsL: 0 }
  for (const m of matches) {
    if (!m.result || !m.participant1Id || !m.participant2Id || m.result.walkedOver) continue
    const w = m.result.winnerId; const l = m.result.loserId
    // Tally set wins/losses from sets array if available, otherwise use winnerScore/loserScore as set counts
    const winnerSets = m.result.winnerScore
    const loserSets = m.result.loserScore
    // Point-level tallies from individual set scores
    let wPoints = 0, lPoints = 0
    if (m.result.sets && m.result.sets.length > 0) {
      for (const [a, b] of m.result.sets) {
        // Determine which player is p1
        if (w === m.participant1Id) { wPoints += a; lPoints += b }
        else { wPoints += b; lPoints += a }
      }
    }
    if (s[w]) {
      s[w].played++; s[w].wins++; s[w].pts += 2
      s[w].setsW += winnerSets; s[w].setsL += loserSets
      s[w].pointsW += wPoints; s[w].pointsL += lPoints
    }
    if (s[l]) {
      s[l].played++; s[l].losses++
      s[l].setsW += loserSets; s[l].setsL += winnerSets
      s[l].pointsW += lPoints; s[l].pointsL += wPoints
    }
  }
  return s
}

// ─── 조별 리그 완료 시 순위별 ID 반환 ────────────────────
export function getGroupRankedIds(
  groupMatches: BracketMatch[],
  group: Group
): string[] {
  const standings = calcStandings(groupMatches, group.participantIds)
  return [...group.participantIds].sort((a, b) => {
    const sa = standings[a] ?? { pts: 0, wins: 0, setsW: 0, setsL: 0, pointsW: 0, pointsL: 0 }
    const sb = standings[b] ?? { pts: 0, wins: 0, setsW: 0, setsL: 0, pointsW: 0, pointsL: 0 }
    // 1) 승점, 2) 세트 득실, 3) 점수 득실
    if (sb.pts !== sa.pts) return sb.pts - sa.pts
    const saDiff = sa.setsW - sa.setsL
    const sbDiff = sb.setsW - sb.setsL
    if (sbDiff !== saDiff) return sbDiff - saDiff
    const saPoints = sa.pointsW - sa.pointsL
    const sbPoints = sb.pointsW - sb.pointsL
    return sbPoints - saPoints
  })
}

// ─── 시드 배치 (표준 토너먼트 대진) ─────────────────────
function buildSeedOrder(size: number): number[] {
  let order = [1, 2]
  while (order.length < size) {
    order = order.flatMap(s => [s, size + 1 - s])
  }
  return order
}

// ─── 라운드 이름 ─────────────────────────────────────────
export function getRoundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return '결승'
  if (fromEnd === 1) return '준결승'
  if (fromEnd === 2) return '8강'
  if (fromEnd === 3) return '16강'
  if (fromEnd === 4) return '32강'
  return `${Math.pow(2, fromEnd + 1)}강`
}
