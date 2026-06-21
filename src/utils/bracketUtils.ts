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

  // 본선 라운드를 예선 최대 라운드만큼 오프셋 → 라운드 번호 충돌 방지
  // (예선 1·2·3R + 본선 8강·준결승·결승 이 별도 라운드로 구분 표시됨)
  const maxQualRound = qualMatches.length > 0 ? Math.max(...qualMatches.map(m => m.round)) : 0
  const mainOffset = mainMatches.map(m => ({ ...m, round: m.round + maxQualRound }))

  return { groups, matches: [...qualMatches, ...mainOffset] }
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

// ─── 더블 엘리미네이션 ────────────────────────────────────────
// 승자조(WB) + 패자조(LB) + 단일 결승(GF). 참가자 수는 2의 거듭제곱만 지원(부전승 없음).
// 패자는 loserNextMatchId로 LB의 지정 슬롯에 떨어지고, propagateDoubleElim이 승자·패자를 함께 전파한다.
const GF_ROUND = 1000  // GF가 항상 최고 라운드(getFinalMatch가 결승으로 인식)

export function isPow2(n: number): boolean { return n >= 2 && (n & (n - 1)) === 0 }

export function generateDoubleElimBracket(
  participants: Seeded[],
  options?: { preserveOrder?: boolean }
): BracketMatch[] {
  const sorted = options?.preserveOrder ? [...participants] : [...participants].sort((a, b) => b.points - a.points)
  const n = sorted.length
  const S = nextPow2(n)
  const k = Math.log2(S)              // WB 라운드 수
  if (k < 2) return []                // 최소 4명
  const seedOrder = buildSeedOrder(S)
  const wbCount = (r: number) => S / Math.pow(2, r)     // WB 라운드 r(1-base) 경기 수
  const lbRounds = 2 * k - 2
  const lbCount = (lr: number) => {                      // LB 라운드 lr 경기 수
    const j = Math.ceil(lr / 2)                          // minor(2j-1)·major(2j) 모두 S/2^(j+1)
    return S / Math.pow(2, j + 1)
  }
  const wbId = (r: number, i: number) => `wb-r${r}m${i}`
  const lbId = (lr: number, i: number) => `lb-r${lr}m${i}`
  const GF = 'gf'
  const matches: BracketMatch[] = []

  // ── WB Round 1 (실제 참가자 배치) ──
  for (let i = 1; i <= wbCount(1); i++) {
    const s1 = seedOrder[(i - 1) * 2], s2 = seedOrder[(i - 1) * 2 + 1]
    const p1 = s1 <= n ? sorted[s1 - 1] : null
    const p2 = s2 <= n ? sorted[s2 - 1] : null
    matches.push({
      id: wbId(1, i), round: 1, position: i - 1, phase: 'wb',
      participant1Id: p1?.id ?? null, participant2Id: p2?.id ?? null, result: null,
      nextMatchId: k > 1 ? wbId(2, Math.ceil(i / 2)) : GF,
      nextSlot: ((i - 1) % 2 === 0 ? 1 : 2),
      loserNextMatchId: lbId(1, Math.ceil(i / 2)),
      loserSlot: ((i - 1) % 2 === 0 ? 1 : 2),
    })
  }
  // ── WB Round 2..k ──
  for (let r = 2; r <= k; r++) {
    for (let i = 1; i <= wbCount(r); i++) {
      matches.push({
        id: wbId(r, i), round: r, position: i - 1, phase: 'wb',
        participant1Id: null, participant2Id: null, result: null,
        nextMatchId: r < k ? wbId(r + 1, Math.ceil(i / 2)) : GF,
        nextSlot: r < k ? ((i - 1) % 2 === 0 ? 1 : 2) : 1,   // WB 결승 승자 → GF 슬롯1
        loserNextMatchId: lbId(2 * r - 2, i),                 // 패자 → LB major 라운드(2r-2)
        loserSlot: 2,
      })
    }
  }
  // ── LB Rounds 1..(2k-2) ──
  for (let lr = 1; lr <= lbRounds; lr++) {
    const isMinor = lr % 2 === 1
    for (let i = 1; i <= lbCount(lr); i++) {
      let nextMatchId: string, nextSlot: 1 | 2
      if (lr === lbRounds) { nextMatchId = GF; nextSlot = 2 }     // LB 결승 승자 → GF 슬롯2
      else if (isMinor) { nextMatchId = lbId(lr + 1, i); nextSlot = 1 }  // minor 승자 → 다음 major 슬롯1
      else { nextMatchId = lbId(lr + 1, Math.ceil(i / 2)); nextSlot = ((i - 1) % 2 === 0 ? 1 : 2) } // major 승자 → 다음 minor
      matches.push({
        id: lbId(lr, i), round: k + lr, position: i - 1, phase: 'lb',
        participant1Id: null, participant2Id: null, result: null,
        nextMatchId, nextSlot,
      })
    }
  }
  // ── Grand Final + 리셋(브래킷 리셋) ──
  // 승자조 우승자는 무패, 패자조 우승자는 1패 상태 → 패자조 우승자가 GF에서 이기면
  // 양쪽 1패 동률이 되어 최종 1경기(gf2)를 더 치른다. 승자조 우승자가 이기면 gf2는 미실시.
  matches.push({
    id: GF, round: GF_ROUND, position: 0, phase: 'gf',
    participant1Id: null, participant2Id: null, result: null, nextMatchId: null,
  })
  matches.push({
    id: 'gf2', round: GF_ROUND + 1, position: 0, phase: 'gf',
    participant1Id: null, participant2Id: null, result: null, nextMatchId: null,
  })

  return matches
}

// 승자(nextMatchId/nextSlot) + 패자(loserNextMatchId/loserSlot) 동시 전파 + 연쇄 무효화
export function propagateDoubleElim(input: BracketMatch[]): BracketMatch[] {
  let matches = input
  for (let pass = 0; pass < 200; pass++) {
    let changed = false
    const next = matches.map((m): BracketMatch => {
      const feeders = matches.filter(f => f.nextMatchId === m.id || f.loserNextMatchId === m.id)
      if (feeders.length === 0) return m  // 외부 입력(WB 1라운드)
      let s1: string | null = null, s2: string | null = null
      for (const f of feeders) {
        if (f.nextMatchId === m.id && f.result) {
          if (f.nextSlot === 1) s1 = f.result.winnerId; else if (f.nextSlot === 2) s2 = f.result.winnerId
        }
        if (f.loserNextMatchId === m.id && f.result && f.result.loserId) {
          if (f.loserSlot === 1) s1 = f.result.loserId; else if (f.loserSlot === 2) s2 = f.result.loserId
        }
      }
      let p1 = m.participant1Id, p2 = m.participant2Id, result = m.result
      if (p1 !== s1 || p2 !== s2) { p1 = s1; p2 = s2; changed = true }
      if (result) {
        const ids = [p1, p2]
        if (!p1 || !p2 || !ids.includes(result.winnerId) || (result.loserId && !ids.includes(result.loserId))) {
          result = null; changed = true
        }
      }
      return (p1 !== m.participant1Id || p2 !== m.participant2Id || result !== m.result)
        ? { ...m, participant1Id: p1, participant2Id: p2, result }
        : m
    })
    matches = next
    if (!changed) break
  }

  // ── 그랜드 파이널 리셋(gf2) 활성/비활성 ──
  // 패자조 우승자(GF 슬롯2)가 GF에서 이긴 경우에만 gf2를 같은 두 선수로 재대결시킨다.
  const gf2idx = matches.findIndex(m => m.id === 'gf2')
  const gf = matches.find(m => m.id === 'gf')
  if (gf2idx >= 0 && gf) {
    const lbChampWon = !!(gf.result && gf.participant1Id && gf.participant2Id && gf.result.winnerId === gf.participant2Id)
    let g2 = matches[gf2idx]
    if (lbChampWon) {
      let np1 = gf.participant1Id, np2 = gf.participant2Id, res = g2.result
      if (res && !(np1 === g2.participant1Id && np2 === g2.participant2Id && [np1, np2].includes(res.winnerId))) res = null
      if (g2.participant1Id !== np1 || g2.participant2Id !== np2 || res !== g2.result) {
        g2 = { ...g2, participant1Id: np1, participant2Id: np2, result: res }
      }
    } else if (g2.participant1Id || g2.participant2Id || g2.result) {
      g2 = { ...g2, participant1Id: null, participant2Id: null, result: null }
    }
    if (g2 !== matches[gf2idx]) matches = matches.map((m, i) => i === gf2idx ? g2 : m)
  }

  return matches
}

// 더블 엘리미네이션 최종 순위: entityId → 성적
export function computeDoubleElimPlacements(matches: BracketMatch[], participantIds: string[]): Record<string, string> {
  const place: Record<string, string> = {}
  for (const id of participantIds) place[id] = '참가'

  const wbRounds = matches.filter(m => m.phase === 'wb').map(m => m.round)
  if (wbRounds.length === 0) return place
  const k = Math.max(...wbRounds)
  const lbRounds = 2 * k - 2
  // 결승 판정: 리셋(gf2)이 활성(양 선수 배정)이면 gf2가 우승을 가른다
  const gfMain = matches.find(m => m.id === 'gf')
  const gf2 = matches.find(m => m.id === 'gf2')
  const gf = (gf2 && gf2.participant1Id && gf2.participant2Id) ? gf2 : gfMain

  const placeLabel = (p: number): string => {
    if (p === 1) return '우승'
    if (p === 2) return '준우승'
    if (p === 3) return '3위'
    if (p === 4) return '4위'
    if (p <= 8) return '8강'
    if (p <= 16) return '16강'
    if (p <= 32) return '32강'
    if (p <= 64) return '64강'
    return '참가'
  }

  // GF 우승/준우승
  if (gf?.result) {
    if (gf.result.winnerId in place) place[gf.result.winnerId] = '우승'
    if (gf.result.loserId && gf.result.loserId in place) place[gf.result.loserId] = '준우승'
  }

  // LB 탈락 라운드별 순위 (높은 라운드 = 상위)
  let curPlace = 3
  for (let lr = lbRounds; lr >= 1; lr--) {
    const roundMatches = matches.filter(m => m.phase === 'lb' && m.round === k + lr)
    const label = placeLabel(curPlace)
    for (const lm of roundMatches) {
      const loser = lm.result?.loserId
      if (loser && loser in place && place[loser] === '참가') place[loser] = label
    }
    curPlace += roundMatches.length  // 이 라운드 패자 수만큼 순위 진행
  }

  return place
}

// ─── 녹아웃 승자 전파 + 연쇄 무효화 ──────────────────────────
// feeder(이 경기로 진출하는 직전 경기)의 승자를 참가자로 채우고,
// 상위 경기의 결과가 클리어되면 그 승자가 빠진 하위 경기 참가자·결과를 연쇄 정리한다.
// 라운드1·조별/예선 슬롯으로 채워지는 경기(feeder 없음)는 건드리지 않는다.
export function propagateAndCascade(input: BracketMatch[]): BracketMatch[] {
  let matches = input
  for (let pass = 0; pass < 100; pass++) {
    let changed = false
    const next = matches.map((m): BracketMatch => {
      const feeders = matches.filter(f => f.nextMatchId === m.id)
      if (feeders.length === 0) return m // 외부 입력(라운드1·조별·예선 슬롯)
      const sorted = [...feeders].sort((a, b) => a.position - b.position)
      const np1 = sorted[0]?.result?.winnerId ?? null
      const np2 = sorted[1]?.result?.winnerId ?? null
      let p1 = m.participant1Id, p2 = m.participant2Id, result = m.result
      if (p1 !== np1 || p2 !== np2) { p1 = np1; p2 = np2; changed = true }
      if (result) {
        const ids = [p1, p2]
        if (!p1 || !p2 || !ids.includes(result.winnerId) || (result.loserId && !ids.includes(result.loserId))) {
          result = null; changed = true
        }
      }
      return (p1 !== m.participant1Id || p2 !== m.participant2Id || result !== m.result)
        ? { ...m, participant1Id: p1, participant2Id: p2, result }
        : m
    })
    matches = next
    if (!changed) break
  }
  return matches
}

// ─── 3·4위전 참가자(준결승 패자) 재배정 + 무효 결과 정리 ──────
export function wireThirdPlace(matches: BracketMatch[]): BracketMatch[] {
  const idx = matches.findIndex(m => m.isThirdPlace)
  if (idx < 0) return matches
  const knockout = matches.filter(m => !m.isThirdPlace && !m.groupId)
  if (knockout.length === 0) return matches
  const maxR = Math.max(...knockout.map(m => m.round), 1)
  const finalM = knockout.find(m => m.round === maxR && !m.nextMatchId)
  const tp = matches[idx]
  let p1 = tp.participant1Id, p2 = tp.participant2Id
  if (finalM) {
    const semis = knockout.filter(m => m.nextMatchId === finalM.id).sort((a, b) => a.position - b.position)
    p1 = semis[0]?.result?.loserId ?? null
    p2 = semis[1]?.result?.loserId ?? null
  }
  let result = tp.result
  if (result) {
    const ids = [p1, p2]
    if (!ids.includes(result.winnerId) || (result.loserId && !ids.includes(result.loserId))) result = null
  }
  if (p1 === tp.participant1Id && p2 === tp.participant2Id && result === tp.result) return matches
  return matches.map((m, i) => i === idx ? { ...m, participant1Id: p1, participant2Id: p2, result } : m)
}

// Knockout bracket after group stage (placeholder matches)
export function generateKnockoutFromGroups(
  groups: Group[],
  roundOffset?: number,
): BracketMatch[] {
  // 진출 인원은 조원 수를 넘을 수 없음 — 초과 시 채워지지 않는 고아 슬롯이 생겨
  // 본선 경기가 영구 미완료가 되므로 실제 조원 수로 클램프한다.
  const advCount = (g: Group) => Math.min(g.advanceCount, g.participantIds.length)
  const totalAdvancers = groups.reduce((s, g) => s + advCount(g), 0)
  const maxGroupRound = roundOffset ?? Math.max(...groups.map(g => g.participantIds.length - 1), 1)
  // Placeholder ids: slot-g1-1 = 1st place of group 1, slot-g1-2 = 2nd place, etc.
  const advancerSlots: Seeded[] = []
  for (const g of groups) {
    for (let rank = 1; rank <= advCount(g); rank++) {
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

// 직접대결(head-to-head): a가 b를 이긴 횟수 − b가 a를 이긴 횟수 (둘 사이 경기만, 부전승 제외)
export function headToHead(matches: BracketMatch[], a: string, b: string): number {
  let aw = 0, bw = 0
  for (const m of matches) {
    if (!m.result || m.result.walkedOver) continue
    if (![m.participant1Id, m.participant2Id].includes(a) || ![m.participant1Id, m.participant2Id].includes(b)) continue
    if (m.result.winnerId === a) aw++
    else if (m.result.winnerId === b) bw++
  }
  return aw - bw
}

// 순위 비교자: 1)승점 2)세트득실 3)점수득실 4)직접대결 5)초기순서(결정적)
// order = 동률 시 안정적 최종 정렬을 위한 기준 ID 배열(시드/등록 순)
export function standingsComparator(
  matches: BracketMatch[],
  standings: ReturnType<typeof calcStandings>,
  order: string[],
) {
  const zero = { played: 0, wins: 0, losses: 0, pts: 0, setsW: 0, setsL: 0, pointsW: 0, pointsL: 0 }
  return (a: string, b: string): number => {
    const sa = standings[a] ?? zero, sb = standings[b] ?? zero
    if (sb.pts !== sa.pts) return sb.pts - sa.pts
    const sd = (sb.setsW - sb.setsL) - (sa.setsW - sa.setsL)
    if (sd !== 0) return sd
    const pd = (sb.pointsW - sb.pointsL) - (sa.pointsW - sa.pointsL)
    if (pd !== 0) return pd
    const h2h = headToHead(matches, a, b)   // a가 b에 우세하면 양수 → a가 앞
    if (h2h !== 0) return -h2h
    return order.indexOf(a) - order.indexOf(b)
  }
}

// ─── 조별 리그 완료 시 순위별 ID 반환 ────────────────────
export function getGroupRankedIds(
  groupMatches: BracketMatch[],
  group: Group
): string[] {
  const standings = calcStandings(groupMatches, group.participantIds)
  return [...group.participantIds].sort(standingsComparator(groupMatches, standings, group.participantIds))
}

// ─── 시드 배치 (표준 토너먼트 대진, 폴딩) ─────────────────────
// 각 단계마다 "현재 길이"의 보수 시드를 끼워 1↔최약체가 가장 멀리 떨어지게 배치한다.
// (이전 구현은 보수를 최종 size 기준으로 계산해 8명+ 에서 시드가 중복·누락되는 버그가 있었음)
function buildSeedOrder(size: number): number[] {
  let order = [1]
  while (order.length < size) {
    const cur = order.length * 2
    order = order.flatMap(s => [s, cur + 1 - s])
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
