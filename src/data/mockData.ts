import type { Player, Pair, Tournament, TournamentEvent, BracketMatch, SchedulePlan, ScheduleEvent, Division } from '../types'
import { generateTournamentBracket, generateLeagueMatches, generateGroups } from '../utils/bracketUtils'

// ─── 결정론적 난수 생성기 (시드 고정 → 항상 동일한 데이터) ─
function createRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) >>> 0
    s = Math.imul(s ^ (s >>> 12), 0x297a2d39) >>> 0
    s ^= s >>> 15
    return (s >>> 0) / 0xffffffff
  }
}
const rng = createRng(42)
function ri(min: number, max: number) { return Math.floor(rng() * (max - min + 1)) + min }
function pick<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)] }

// ─── 이름 데이터 ──────────────────────────────────────────
const SURNAMES = ['김','이','박','최','정','강','조','윤','장','임','한','오','서','신','권','황','안','송','류','전','홍','고','문','양','손','배','백','허','유','남','심','노','하','곽','성','차','주','우','구','민','나','진','엄','채','원','천','방','공','현','동']
const MALE_NAMES = ['민준','서준','도윤','시우','주원','예준','건우','현우','지호','준서','준혁','도현','현준','민재','지훈','우진','승민','태양','재원','승현','민성','동현','준영','성민','재현','영준','우성','재훈','민호','성준','태준','지성','현수','정우','민국','태민','시현','지원','준우','세준']
const FEMALE_NAMES = ['서연','서윤','지우','서현','하은','민서','지유','수아','지아','하린','나은','채원','지현','예은','다은','소율','예린','지수','수빈','유나','아린','예나','다현','채영','나현','소현','민지','수현','지민','혜원','유진','세아','은지','하윤','소아','채은','민아','수연','지은','아영']

// ─── 학교/소속 ────────────────────────────────────────────
const SCHOOLS: Record<Division, string[]> = {
  초등: ['한빛초','하늘초','별빛초','청솔초','미래초','푸른초','햇살초','샘물초','무지개초','늘푸른초','동화초','은하초','꿈나무초','새싹초','행복초','신나는초','바른초','희망초','나래초','파란초'],
  중등: ['한빛중','청솔중','미래중','별빛중','서울중','한강중','영동중','강남중','마포중','은평중','노원중','강북중','도봉중','성북중','동대문중','중랑중','양천중','구로중','관악중','금천중'],
  고등: ['청솔고','한강고','서울고','영동고','강남고','마포고','은평고','노원고','강북고','성북고','동대문고','중랑고','양천고','구로고','관악고','금천고','강서고','동작고','용산고','성동고'],
  대학: ['서울대','연세대','고려대','성균관대','한양대','이화여대','중앙대','경희대','한국외대','서강대','숙명여대','동국대','건국대','국민대','홍익대','단국대','아주대','인하대','세종대','명지대'],
  일반: ['삼성전자','현대자동차','LG전자','SK텔레콤','롯데그룹','포스코','KT','신한은행','KB국민은행','우리은행','하나은행','NH농협','카카오','네이버','쿠팡','배달의민족','토스','당근마켓','라인','크래프톤'],
  생활체육: ['강남구청','서초구청','마포구청','노원구청','은평구청','강북구청','도봉구청','중랑구청','성북구청','동대문구청','용산구청','성동구청','광진구청','강동구청','송파구청','강서구청','양천구청','구로구청','금천구청','관악구청'],
}

// ─── 포인트 범위 ──────────────────────────────────────────
const POINT_RANGE: Record<Division, [number, number]> = {
  초등: [50, 500],
  중등: [100, 650],
  고등: [200, 800],
  대학: [300, 900],
  일반: [150, 750],
  생활체육: [50, 600],
}

// ─── 1000명 선수 생성 ─────────────────────────────────────
const DIVISION_COUNTS: Array<[Division, number, number]> = [
  // [부문, 남, 여]
  ['초등',      80,  70],
  ['중등',     100,  80],
  ['고등',     130, 100],
  ['대학',      90,  80],
  ['일반',     110,  90],
  ['생활체육', 105,  65],
]
// 총합 = (80+70)+(100+80)+(130+100)+(90+80)+(110+90)+(105+65) = 1000

const usedNames = new Set<string>()

function makeName(gender: '남' | '여'): string {
  for (let i = 0; i < 100; i++) {
    const surname = pick(SURNAMES)
    const given = gender === '남' ? pick(MALE_NAMES) : pick(FEMALE_NAMES)
    const full = surname + given
    if (!usedNames.has(full)) { usedNames.add(full); return full }
  }
  // fallback with number suffix
  const base = pick(SURNAMES) + (gender === '남' ? pick(MALE_NAMES) : pick(FEMALE_NAMES))
  const name = base + ri(1, 99)
  usedNames.add(name)
  return name
}

let pidCounter = 1
export function generatePlayers(): Player[] {
  const players: Player[] = []
  for (const [division, maleCount, femaleCount] of DIVISION_COUNTS) {
    const [minPts, maxPts] = POINT_RANGE[division]
    const schools = SCHOOLS[division]
    for (let i = 0; i < maleCount + femaleCount; i++) {
      const gender: '남' | '여' = i < maleCount ? '남' : '여'
      const points = ri(minPts, maxPts)
      const wins = ri(Math.floor(points / 50), Math.floor(points / 30))
      const losses = ri(Math.floor(wins * 0.2), Math.floor(wins * 0.6))
      const year = ri(2020, 2024)
      const month = String(ri(1, 12)).padStart(2, '0')
      const day = String(ri(1, 28)).padStart(2, '0')
      // USATT-style initial Elo rating derived from points
      const rating = Math.round(800 + (points / 900) * 1300)
      players.push({
        id: `p${pidCounter++}`,
        name: makeName(gender),
        school: pick(schools),
        division,
        gender,
        points,
        wins,
        losses,
        createdAt: `${year}-${month}-${day}`,
        rating,
        gamesPlayed: wins + losses,
        registrationNo: `TT${String(pidCounter).padStart(5, '0')}`,
      })
    }
  }
  return players
}

// ─── 복식 페어 생성 ───────────────────────────────────────
export function generatePairs(players: Player[]): Pair[] {
  const pairs: Pair[] = []
  let pairId = 1

  // 남복 20페어 (같은 학교 우선)
  const maleHigh = players.filter(p => p.gender === '남' && (p.division === '고등' || p.division === '대학')).sort((a, b) => b.points - a.points)
  const usedInPair = new Set<string>()

  function tryPair(list: Player[], gender: '남' | '여' | '혼합', count: number, label: '남복' | '여복' | '혼복') {
    let made = 0
    for (let i = 0; i < list.length - 1 && made < count; i++) {
      const p1 = list[i]
      if (usedInPair.has(p1.id)) continue
      for (let j = i + 1; j < list.length && made < count; j++) {
        const p2 = list[j]
        if (usedInPair.has(p2.id)) continue
        usedInPair.add(p1.id)
        usedInPair.add(p2.id)
        const school = p1.school === p2.school ? p1.school : `${p1.school} / ${p2.school}`
        const div = p1.division === p2.division ? p1.division : p1.division
        pairs.push({
          id: `pair${pairId++}`,
          player1Id: p1.id, player2Id: p2.id,
          name: `${p1.name} / ${p2.name}`,
          school, division: div, gender,
          points: Math.floor((p1.points + p2.points) / 2),
          wins: Math.floor(Math.min(p1.wins, p2.wins) * 0.7),
          losses: Math.floor(Math.min(p1.losses, p2.losses) * 0.7),
        })
        made++
        break
      }
    }
  }

  const maleAll = players.filter(p => p.gender === '남').sort((a, b) => b.points - a.points)
  const femaleAll = players.filter(p => p.gender === '여').sort((a, b) => b.points - a.points)

  tryPair(maleAll, '남', 25, '남복')

  const unusedFemale = femaleAll.filter(p => !usedInPair.has(p.id))
  tryPair(unusedFemale, '여', 20, '여복')

  // 혼복: 각 페어에서 남1 + 여1
  const unusedM2 = maleAll.filter(p => !usedInPair.has(p.id))
  const unusedF2 = femaleAll.filter(p => !usedInPair.has(p.id))
  for (let i = 0; i < Math.min(unusedM2.length, unusedF2.length, 20); i++) {
    const p1 = unusedM2[i], p2 = unusedF2[i]
    usedInPair.add(p1.id); usedInPair.add(p2.id)
    const school = p1.school === p2.school ? p1.school : `${p1.school} / ${p2.school}`
    pairs.push({
      id: `pair${pairId++}`,
      player1Id: p1.id, player2Id: p2.id,
      name: `${p1.name} / ${p2.name}`,
      school, division: p1.division, gender: '혼합',
      points: Math.floor((p1.points + p2.points) / 2),
      wins: ri(0, 8), losses: ri(0, 5),
    })
  }

  return pairs
}

// ─── 토너먼트 시뮬레이션 (라운드별 결과 자동 입력) ─────────
function simulateRounds(
  matches: BracketMatch[],
  playerMap: Record<string, { points: number }>,
  roundsToPlay: number,
): BracketMatch[] {
  let ms = matches.map(m => ({ ...m }))

  for (let round = 1; round <= roundsToPlay; round++) {
    const todo = ms.filter(m =>
      m.round === round && m.participant1Id && m.participant2Id
      && !m.result && !m.isBye
      && playerMap[m.participant1Id] && playerMap[m.participant2Id]
    )
    for (const match of todo) {
      const pts1 = playerMap[match.participant1Id!]?.points ?? 500
      const pts2 = playerMap[match.participant2Id!]?.points ?? 500
      const p1WinProb = pts1 / (pts1 + pts2) * 0.6 + 0.2
      const p1Wins = rng() < p1WinProb
      const winnerId = p1Wins ? match.participant1Id! : match.participant2Id!
      const loserId = p1Wins ? match.participant2Id! : match.participant1Id!
      const winSets = 3
      const loseSets = ri(0, 2)

      // Update match result
      const idx = ms.findIndex(m => m.id === match.id)
      ms[idx] = { ...ms[idx], result: { winnerId, loserId, winnerScore: winSets, loserScore: loseSets } }

      // Advance winner to next round
      if (match.nextMatchId) {
        const ni = ms.findIndex(m => m.id === match.nextMatchId)
        if (ni >= 0) {
          const isEven = match.position % 2 === 0
          if (isEven) ms[ni] = { ...ms[ni], participant1Id: winnerId }
          else ms[ni] = { ...ms[ni], participant2Id: winnerId }
        }
      }
    }
  }
  return ms
}

// ─── 대회 생성 ───────────────────────────────────────────
export function generateTournaments(players: Player[], pairs: Pair[]): Tournament[] {
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]))
  const pairMap = Object.fromEntries(pairs.map(p => [p.id, p]))
  const allMap = { ...playerMap, ...pairMap }

  // ── 대회 1: 전국 학생 탁구 선수권대회 ────────────────────
  const t1Events: TournamentEvent[] = []

  // 고등 남 단식 128명 토너먼트 (3라운드 완료)
  const highMale = players.filter(p => p.division === '고등' && p.gender === '남').sort((a, b) => b.points - a.points).slice(0, 128)
  if (highMale.length >= 8) {
    const raw = generateTournamentBracket(highMale)
    const ms = simulateRounds(raw, allMap, 3)
    t1Events.push({ id: 't1e1', label: '고등 남자 단식', eventType: '단식', gender: '남', division: '고등', bracketFormat: '토너먼트', participantIds: highMale.map(p => p.id), groups: [], matches: ms, pointsForWin: 100, status: 'ongoing' })
  }

  // 고등 여 단식 64명 토너먼트 (4라운드 완료 = 8강까지)
  const highFemale = players.filter(p => p.division === '고등' && p.gender === '여').sort((a, b) => b.points - a.points).slice(0, 64)
  if (highFemale.length >= 8) {
    const raw = generateTournamentBracket(highFemale)
    const ms = simulateRounds(raw, allMap, 4)
    t1Events.push({ id: 't1e2', label: '고등 여자 단식', eventType: '단식', gender: '여', division: '고등', bracketFormat: '토너먼트', participantIds: highFemale.map(p => p.id), groups: [], matches: ms, pointsForWin: 100, status: 'ongoing' })
  }

  // 대학 남 단식 64명 토너먼트 (2라운드 완료)
  const uniMale = players.filter(p => p.division === '대학' && p.gender === '남').sort((a, b) => b.points - a.points).slice(0, 64)
  if (uniMale.length >= 8) {
    const raw = generateTournamentBracket(uniMale)
    const ms = simulateRounds(raw, allMap, 2)
    t1Events.push({ id: 't1e3', label: '대학 남자 단식', eventType: '단식', gender: '남', division: '대학', bracketFormat: '토너먼트', participantIds: uniMale.map(p => p.id), groups: [], matches: ms, pointsForWin: 80, status: 'ongoing' })
  }

  // 대학 여 단식 32명 토너먼트 (준결승까지 완료)
  const uniFemale = players.filter(p => p.division === '대학' && p.gender === '여').sort((a, b) => b.points - a.points).slice(0, 32)
  if (uniFemale.length >= 4) {
    const raw = generateTournamentBracket(uniFemale)
    const ms = simulateRounds(raw, allMap, 4)
    t1Events.push({ id: 't1e4', label: '대학 여자 단식', eventType: '단식', gender: '여', division: '대학', bracketFormat: '토너먼트', participantIds: uniFemale.map(p => p.id), groups: [], matches: ms, pointsForWin: 80, status: 'ongoing' })
  }

  // 혼합복식 토너먼트 16페어
  const mixedPairs = pairs.filter(p => p.gender === '혼합').slice(0, 16)
  if (mixedPairs.length >= 4) {
    const raw = generateTournamentBracket(mixedPairs)
    const ms = simulateRounds(raw, allMap, 2)
    t1Events.push({ id: 't1e5', label: '혼합복식', eventType: '혼합복식', gender: '혼합', division: '대학', bracketFormat: '토너먼트', participantIds: mixedPairs.map(p => p.id), groups: [], matches: ms, pointsForWin: 60, status: 'ongoing' })
  }

  // ── 대회 2: 서울시 생활체육 탁구대회 ─────────────────────
  const t2Events: TournamentEvent[] = []

  // 생활체육 남 단식 32명 조별+토너먼트 (조별 완료)
  const lifeMale = players.filter(p => p.division === '생활체육' && p.gender === '남').sort((a, b) => b.points - a.points).slice(0, 32)
  if (lifeMale.length >= 8) {
    const { groups, matches: gms } = generateGroups(lifeMale, 4, 2)
    const groupRounds = 3
    const ms = simulateRounds(gms, allMap, groupRounds)
    t2Events.push({ id: 't2e1', label: '생활체육 남자 단식', eventType: '단식', gender: '남', division: '생활체육', bracketFormat: '조별+토너먼트', participantIds: lifeMale.map(p => p.id), groups, matches: ms, pointsForWin: 50, status: 'ongoing' })
  }

  // 생활체육 여 단식 16명 리그전 (8경기 완료)
  const lifeFemale = players.filter(p => p.division === '생활체육' && p.gender === '여').sort((a, b) => b.points - a.points).slice(0, 16)
  if (lifeFemale.length >= 4) {
    const raw = generateLeagueMatches(lifeFemale)
    const ms = simulateRounds(raw, allMap, 4)
    t2Events.push({ id: 't2e2', label: '생활체육 여자 단식', eventType: '단식', gender: '여', division: '생활체육', bracketFormat: '리그', participantIds: lifeFemale.map(p => p.id), groups: [], matches: ms, pointsForWin: 40, status: 'ongoing' })
  }

  // 남복식 페어 16쌍 토너먼트 (1라운드 완료)
  const malePairs = pairs.filter(p => p.gender === '남').slice(0, 16)
  if (malePairs.length >= 4) {
    const raw = generateTournamentBracket(malePairs)
    const ms = simulateRounds(raw, allMap, 1)
    t2Events.push({ id: 't2e3', label: '남자 복식', eventType: '복식', gender: '남', division: '생활체육', bracketFormat: '토너먼트', participantIds: malePairs.map(p => p.id), groups: [], matches: ms, pointsForWin: 60, status: 'ongoing' })
  }

  // ── 대회 3: 한빛배 초중등 탁구대회 ─────────────────────
  const t3Events: TournamentEvent[] = []

  // 초등 남 단식 32명 토너먼트 (완료)
  const elemMale = players.filter(p => p.division === '초등' && p.gender === '남').sort((a, b) => b.points - a.points).slice(0, 32)
  if (elemMale.length >= 4) {
    const raw = generateTournamentBracket(elemMale)
    const ms = simulateRounds(raw, allMap, 5)
    t3Events.push({ id: 't3e1', label: '초등 남자 단식', eventType: '단식', gender: '남', division: '초등', bracketFormat: '토너먼트', participantIds: elemMale.map(p => p.id), groups: [], matches: ms, pointsForWin: 30, status: 'completed' })
  }

  // 초등 여 단식 16명 토너먼트 (완료)
  const elemFemale = players.filter(p => p.division === '초등' && p.gender === '여').sort((a, b) => b.points - a.points).slice(0, 16)
  if (elemFemale.length >= 4) {
    const raw = generateTournamentBracket(elemFemale)
    const ms = simulateRounds(raw, allMap, 4)
    t3Events.push({ id: 't3e2', label: '초등 여자 단식', eventType: '단식', gender: '여', division: '초등', bracketFormat: '토너먼트', participantIds: elemFemale.map(p => p.id), groups: [], matches: ms, pointsForWin: 30, status: 'completed' })
  }

  // 중등 남 단식 48명 조별+토너먼트 (1,2라운드 완료)
  const midMale = players.filter(p => p.division === '중등' && p.gender === '남').sort((a, b) => b.points - a.points).slice(0, 48)
  if (midMale.length >= 8) {
    const { groups, matches: gms } = generateGroups(midMale, 4, 2)
    const ms = simulateRounds(gms, allMap, 2)
    t3Events.push({ id: 't3e3', label: '중등 남자 단식', eventType: '단식', gender: '남', division: '중등', bracketFormat: '조별+토너먼트', participantIds: midMale.map(p => p.id), groups, matches: ms, pointsForWin: 40, status: 'ongoing' })
  }

  // 중등 여 단식 32명 리그전 (시작 전)
  const midFemale = players.filter(p => p.division === '중등' && p.gender === '여').sort((a, b) => b.points - a.points).slice(0, 32)
  if (midFemale.length >= 4) {
    const { groups, matches: gms } = generateGroups(midFemale, 4, 2)
    t3Events.push({ id: 't3e4', label: '중등 여자 단식', eventType: '단식', gender: '여', division: '중등', bracketFormat: '조별+토너먼트', participantIds: midFemale.map(p => p.id), groups, matches: gms, pointsForWin: 40, status: 'ongoing' })
  }

  // ── 대회 4: 직장인 일반부 탁구대회 ──────────────────────
  const t4Events: TournamentEvent[] = []
  const corpMale = players.filter(p => p.division === '일반' && p.gender === '남').sort((a, b) => b.points - a.points).slice(0, 64)
  if (corpMale.length >= 8) {
    const raw = generateTournamentBracket(corpMale)
    const ms = simulateRounds(raw, allMap, 1)
    t4Events.push({ id: 't4e1', label: '일반부 남자 단식', eventType: '단식', gender: '남', division: '일반', bracketFormat: '토너먼트', participantIds: corpMale.map(p => p.id), groups: [], matches: ms, pointsForWin: 70, status: 'ongoing' })
  }
  const corpFemale = players.filter(p => p.division === '일반' && p.gender === '여').sort((a, b) => b.points - a.points).slice(0, 32)
  if (corpFemale.length >= 4) {
    const raw = generateTournamentBracket(corpFemale)
    const ms = simulateRounds(raw, allMap, 2)
    t4Events.push({ id: 't4e2', label: '일반부 여자 단식', eventType: '단식', gender: '여', division: '일반', bracketFormat: '토너먼트', participantIds: corpFemale.map(p => p.id), groups: [], matches: ms, pointsForWin: 70, status: 'ongoing' })
  }
  const femalePairs = pairs.filter(p => p.gender === '여').slice(0, 12)
  if (femalePairs.length >= 4) {
    const raw = generateTournamentBracket(femalePairs)
    t4Events.push({ id: 't4e3', label: '여자 복식', eventType: '복식', gender: '여', division: '일반', bracketFormat: '토너먼트', participantIds: femalePairs.map(p => p.id), groups: [], matches: raw, pointsForWin: 60, status: 'ongoing' })
  }

  return [
    {
      id: 'tour1',
      name: '제1회 전국 학생 탁구 선수권대회',
      date: '2024-09-14',
      venue: '올림픽 체조경기장',
      events: t1Events,
      status: 'ongoing',
      createdAt: '2024-09-01T09:00:00Z',
    },
    {
      id: 'tour2',
      name: '서울시 생활체육 탁구대회',
      date: '2024-10-05',
      venue: '서울시 실내체육관',
      events: t2Events,
      status: 'ongoing',
      createdAt: '2024-09-20T10:00:00Z',
    },
    {
      id: 'tour3',
      name: '한빛배 초중등 탁구대회',
      date: '2024-08-17',
      venue: '한빛체육관',
      events: t3Events,
      status: 'ongoing',
      createdAt: '2024-08-01T08:00:00Z',
    },
    {
      id: 'tour4',
      name: '직장인 일반부 탁구대회',
      date: '2024-11-02',
      venue: '강남구 실내체육관',
      events: t4Events,
      status: 'ongoing',
      createdAt: '2024-10-15T09:00:00Z',
    },
  ]
}

// ─── 경기 일정표 생성 ─────────────────────────────────────
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function generateSchedules(): SchedulePlan[] {
  // ── 일정표 1: 전국 학생 탁구 선수권대회 (코트 10개, 9:00~18:00) ──
  const s1Events: ScheduleEvent[] = [
    { id: 's1e1', label: '초등 남자 단식 예선', division: '초등', eventType: '단식', gender: '남', matchCount: 40, minutesPerMatch: 10, courtCount: 4, bufferMinutes: 2 },
    { id: 's1e2', label: '초등 여자 단식 예선', division: '초등', eventType: '단식', gender: '여', matchCount: 30, minutesPerMatch: 10, courtCount: 3, bufferMinutes: 2 },
    { id: 's1e3', label: '중등 남자 단식 조별', division: '중등', eventType: '단식', gender: '남', matchCount: 48, minutesPerMatch: 12, courtCount: 4, bufferMinutes: 3 },
    { id: 's1e4', label: '중등 여자 단식 조별', division: '중등', eventType: '단식', gender: '여', matchCount: 36, minutesPerMatch: 12, courtCount: 3, bufferMinutes: 3 },
    { id: 's1e5', label: '고등 남자 단식 1라운드', division: '고등', eventType: '단식', gender: '남', matchCount: 64, minutesPerMatch: 15, courtCount: 6, bufferMinutes: 3 },
    { id: 's1e6', label: '고등 여자 단식 1라운드', division: '고등', eventType: '단식', gender: '여', matchCount: 32, minutesPerMatch: 15, courtCount: 4, bufferMinutes: 3 },
    { id: 's1e7', label: '대학 남자 단식 1라운드', division: '대학', eventType: '단식', gender: '남', matchCount: 32, minutesPerMatch: 15, courtCount: 4, bufferMinutes: 3 },
    { id: 's1e8', label: '대학 여자 단식 1라운드', division: '대학', eventType: '단식', gender: '여', matchCount: 16, minutesPerMatch: 15, courtCount: 2, bufferMinutes: 3 },
    { id: 's1e9', label: '고등 남자 단식 2라운드', division: '고등', eventType: '단식', gender: '남', matchCount: 32, minutesPerMatch: 20, courtCount: 6, bufferMinutes: 5 },
    { id: 's1e10', label: '혼합복식 1라운드', division: '대학', eventType: '혼합복식', gender: '혼합', matchCount: 8, minutesPerMatch: 20, courtCount: 2, bufferMinutes: 5 },
  ]

  const s1Slots = generateSlots(s1Events, '09:00', 10)

  // ── 일정표 2: 생활체육 대회 (코트 4개, 9:00~16:00) ──
  const s2Events: ScheduleEvent[] = [
    { id: 's2e1', label: '생활체육 남자 단식 A,B조', division: '생활체육', eventType: '단식', gender: '남', matchCount: 12, minutesPerMatch: 15, courtCount: 2, bufferMinutes: 3 },
    { id: 's2e2', label: '생활체육 남자 단식 C,D조', division: '생활체육', eventType: '단식', gender: '남', matchCount: 12, minutesPerMatch: 15, courtCount: 2, bufferMinutes: 3 },
    { id: 's2e3', label: '생활체육 여자 단식 리그', division: '생활체육', eventType: '단식', gender: '여', matchCount: 28, minutesPerMatch: 12, courtCount: 2, bufferMinutes: 3 },
    { id: 's2e4', label: '남자 복식 1라운드', division: '생활체육', eventType: '복식', gender: '남', matchCount: 8, minutesPerMatch: 20, courtCount: 2, bufferMinutes: 5 },
    { id: 's2e5', label: '생활체육 남자 단식 본선', division: '생활체육', eventType: '단식', gender: '남', matchCount: 8, minutesPerMatch: 20, courtCount: 2, bufferMinutes: 5 },
    { id: 's2e6', label: '남자 복식 준결승·결승', division: '생활체육', eventType: '복식', gender: '남', matchCount: 3, minutesPerMatch: 25, courtCount: 1, bufferMinutes: 10 },
    { id: 's2e7', label: '생활체육 남자 단식 결승', division: '생활체육', eventType: '단식', gender: '남', matchCount: 1, minutesPerMatch: 30, courtCount: 1, bufferMinutes: 0 },
  ]

  const s2Slots = generateSlots(s2Events, '09:00', 4)

  // ── 일정표 3: 초중등 한빛배 (코트 6개) ──
  const s3Events: ScheduleEvent[] = [
    { id: 's3e1', label: '초등 남자 단식 32강', division: '초등', eventType: '단식', gender: '남', matchCount: 16, minutesPerMatch: 10, courtCount: 4, bufferMinutes: 2 },
    { id: 's3e2', label: '초등 여자 단식 16강', division: '초등', eventType: '단식', gender: '여', matchCount: 8, minutesPerMatch: 10, courtCount: 3, bufferMinutes: 2 },
    { id: 's3e3', label: '중등 남자 단식 조별 1R', division: '중등', eventType: '단식', gender: '남', matchCount: 24, minutesPerMatch: 12, courtCount: 4, bufferMinutes: 3 },
    { id: 's3e4', label: '중등 여자 단식 조별 1R', division: '중등', eventType: '단식', gender: '여', matchCount: 16, minutesPerMatch: 12, courtCount: 3, bufferMinutes: 3 },
    { id: 's3e5', label: '초등 남자 단식 16강', division: '초등', eventType: '단식', gender: '남', matchCount: 8, minutesPerMatch: 12, courtCount: 4, bufferMinutes: 3 },
    { id: 's3e6', label: '초등 여자 단식 8강~결승', division: '초등', eventType: '단식', gender: '여', matchCount: 4, minutesPerMatch: 15, courtCount: 2, bufferMinutes: 5 },
    { id: 's3e7', label: '중등 남자 단식 조별 2R', division: '중등', eventType: '단식', gender: '남', matchCount: 24, minutesPerMatch: 12, courtCount: 4, bufferMinutes: 3 },
    { id: 's3e8', label: '초등 남자 단식 8강~결승', division: '초등', eventType: '단식', gender: '남', matchCount: 4, minutesPerMatch: 15, courtCount: 2, bufferMinutes: 5 },
  ]

  const s3Slots = generateSlots(s3Events, '09:00', 6)

  return [
    {
      id: 'sched1',
      name: '제1회 전국 학생 탁구 선수권대회 경기일정표',
      date: '2024-09-14',
      startTime: '09:00',
      events: s1Events,
      slots: s1Slots,
      createdAt: '2024-09-10T10:00:00Z',
    },
    {
      id: 'sched2',
      name: '서울시 생활체육 탁구대회 경기일정표',
      date: '2024-10-05',
      startTime: '09:00',
      events: s2Events,
      slots: s2Slots,
      createdAt: '2024-10-01T09:00:00Z',
    },
    {
      id: 'sched3',
      name: '한빛배 초중등 탁구대회 경기일정표',
      date: '2024-08-17',
      startTime: '09:00',
      events: s3Events,
      slots: s3Slots,
      createdAt: '2024-08-10T08:00:00Z',
    },
  ]
}

function generateSlots(events: ScheduleEvent[], startTime: string, maxCourts: number) {
  type Slot = { id: string; eventId: string; label: string; division: Division; eventType: any; gender: any; courtNo: number; startTime: string; endTime: string; matchNo: number }
  const slots: Slot[] = []
  const courtAvail: Record<number, string> = {}
  for (let c = 1; c <= maxCourts; c++) courtAvail[c] = startTime

  let idx = 0
  for (const ev of events) {
    const courts = Array.from({ length: Math.min(ev.courtCount, maxCourts) }, (_, i) => i + 1)
    for (let matchNo = 1; matchNo <= ev.matchCount; matchNo++) {
      // Find earliest available court
      let bestCourt = courts[0]
      let bestTime = courtAvail[courts[0]] ?? startTime
      for (const c of courts) {
        const t = courtAvail[c] ?? startTime
        if (t < bestTime) { bestTime = t; bestCourt = c }
      }
      const endTime = addMinutes(bestTime, ev.minutesPerMatch)
      slots.push({
        id: `slot${idx++}`,
        eventId: ev.id,
        label: ev.label,
        division: ev.division as Division,
        eventType: ev.eventType,
        gender: ev.gender,
        courtNo: bestCourt,
        startTime: bestTime,
        endTime,
        matchNo,
      })
      courtAvail[bestCourt] = addMinutes(endTime, ev.bufferMinutes)
    }
  }
  return slots.sort((a, b) => a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : a.courtNo - b.courtNo)
}
