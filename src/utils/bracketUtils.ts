import type { BracketMatch, Group } from '../types'

export function genId() { return Math.random().toString(36).slice(2, 10) }

export function nextPow2(n: number): number {
  let p = 1; while (p < n) p *= 2; return p
}

interface Seeded { id: string; points: number }

// ─── 토너먼트 (단일 제거) ─────────────────────────────────
export function generateTournamentBracket(participants: Seeded[]): BracketMatch[] {
  const sorted = [...participants].sort((a, b) => b.points - a.points)
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
