import type { Division, EventType, Gender, ScheduleEvent, ScheduleSlot } from '../types'
import type { SmartEventInput, BracketMatch, Pair, Team } from '../types'

// ─── 대진 의존성 기반 병렬 스케줄러 ──────────────────────────────
// 브래킷의 의존성 그래프(이전 라운드 종료 → 다음 라운드 시작, 조별 완료 → 본선,
// 같은 선수 동시 불가, 휴식)를 지키면서 코트를 최대 병렬로 채워 총 소요시간을 최소화한다.
export interface SmartScheduleEventInput {
  id: string
  eventType: EventType
  matches: BracketMatch[]
  preferredCourtStart?: number   // 1-base, 이 종목 전용 코트 시작
  preferredCourtEnd?: number
}
// 다일차 운영 창(벽시계 분). 지정 시 경기가 하루 운영시간을 넘기지 못하도록
// day 경계에서 자동으로 다음 날로 넘긴다(경기는 하루를 가로지를 수 없음).
export interface SchedulerDayConfig {
  startMin: number    // 이 날 시작(자정 기준 분, 예: 09:00 → 540)
  endMin: number      // 이 날 종료(예: 20:00 → 1200)
  courts?: number     // 이 날 가용 코트 수 (기본 = input.courts)
}
export interface SmartScheduleInput {
  events: SmartScheduleEventInput[]
  courts: number
  startMinutes: number
  individualMin: number
  teamMin: number
  bufferMin: number   // 코트 회전 간격
  restMin: number     // 선수 연속 경기 최소 휴식
  pairs?: Pair[]
  teams?: Team[]
  days?: SchedulerDayConfig[]  // 지정 시 다일차 자동분할. 미지정 시 startMinutes부터 단일 타임라인(기존 동작).
}
export interface ScheduledMatch {
  matchId: string
  eventId: string
  courtNo: number
  startMin: number   // 벽시계 분(해당 day 기준)
  endMin: number
  round: number
  day: number        // 1-base 일차
}
export interface SmartScheduleResult {
  matches: ScheduledMatch[]
  makespanMin: number
  courtBusyMin: number
  utilization: number   // 0~1, 코트 가동률
  usedDays: number      // 실제 사용된 일수(1-base 최대 day)
}

export function scheduleTournamentMatches(input: SmartScheduleInput): SmartScheduleResult {
  const { events, courts, startMinutes, individualMin, teamMin, bufferMin, restMin, pairs = [], teams = [] } = input

  const expand = (id: string | null | undefined): string[] => {
    if (!id || id.startsWith('ko-slot-')) return []
    const pair = pairs.find(p => p.id === id)
    if (pair) return [pair.player1Id, pair.player2Id].filter(Boolean) as string[]
    const team = teams.find(t => t.id === id)
    if (team) return (team.playerIds ?? []).filter(Boolean)
    return [id]
  }

  interface Node { id: string; eventId: string; dur: number; deps: string[]; players: string[]; round: number; courtFrom: number; courtTo: number }
  const nodes: Record<string, Node> = {}

  for (const ev of events) {
    const dur = ev.eventType === '단체전' ? teamMin : individualMin
    const cFrom = ev.preferredCourtStart ? Math.max(1, ev.preferredCourtStart) : 1
    const cTo = ev.preferredCourtEnd ? Math.min(courts, ev.preferredCourtEnd) : courts
    const byId = new Map(ev.matches.map(m => [m.id, m]))
    const groupMatchIds: Record<string, string[]> = {}
    for (const m of ev.matches) if (m.groupId && !m.isBye) (groupMatchIds[m.groupId] ??= []).push(m.id)

    for (const m of ev.matches) {
      if (m.isBye) continue
      const deps: string[] = []
      for (const f of ev.matches) {
        if (f.id === m.id || f.isBye) continue
        if (f.nextMatchId === m.id || f.loserNextMatchId === m.id) deps.push(f.id)
      }
      // 조별 진출 슬롯(ko-slot-{group}-r{rank}) 참가자 → 해당 조 전 경기 의존
      for (const pid of [m.participant1Id, m.participant2Id, m.slotRef?.p1, m.slotRef?.p2]) {
        const mt = pid && /^ko-slot-(.+)-r\d+$/.exec(pid)
        if (mt) (groupMatchIds[mt[1]] ?? []).forEach(id => { if (id !== m.id) deps.push(id) })
      }
      nodes[m.id] = {
        id: m.id, eventId: ev.id, dur,
        deps: [...new Set(deps)].filter(d => byId.has(d)),
        players: [...expand(m.participant1Id), ...expand(m.participant2Id)],
        round: m.round, courtFrom: cFrom, courtTo: cTo,
      }
    }
  }

  const scheduled: Record<string, ScheduledMatch> = {}
  const done = new Set<string>()
  const endOf: Record<string, number> = {}     // 노드별 종료 시각(절대 분)
  const playerFree: Record<string, number> = {}
  const total = Object.keys(nodes).length

  // ── 단일 타임라인 (days 미지정, 기존 동작 그대로) ──
  if (!input.days || input.days.length === 0) {
    const courtFree = Array(courts).fill(startMinutes)
    let guard = 0
    while (done.size < total && guard++ < total + 5) {
      const ready = Object.values(nodes).filter(n => !done.has(n.id) && n.deps.every(d => done.has(d) || !nodes[d]))
      if (ready.length === 0) break
      let best: { n: Node; court: number; start: number } | null = null
      for (const n of ready) {
        const depEnd = n.deps.length ? Math.max(startMinutes, ...n.deps.map(d => (endOf[d] ?? startMinutes) + bufferMin)) : startMinutes
        const playerReady = n.players.length ? Math.max(startMinutes, ...n.players.map(p => playerFree[p] ?? startMinutes)) : startMinutes
        const readyT = Math.max(depEnd, playerReady)
        // 이 종목이 쓸 수 있는 코트 중 가장 빨리 비는 것
        let bc = -1
        for (let c = n.courtFrom - 1; c <= n.courtTo - 1; c++) if (bc < 0 || courtFree[c] < courtFree[bc]) bc = c
        if (bc < 0) bc = 0
        const startT = Math.max(courtFree[bc], readyT)
        if (!best || startT < best.start || (startT === best.start && n.round < best.n.round)) best = { n, court: bc, start: startT }
      }
      if (!best) break
      const { n, court, start } = best
      const end = start + n.dur
      courtFree[court] = end
      endOf[n.id] = end
      for (const p of n.players) playerFree[p] = end + restMin
      scheduled[n.id] = { matchId: n.id, eventId: n.eventId, courtNo: court + 1, startMin: start, endMin: end, round: n.round, day: 1 }
      done.add(n.id)
    }
    const result = Object.values(scheduled).sort((a, b) => a.startMin - b.startMin || a.courtNo - b.courtNo)
    const makespanMin = result.length ? Math.max(...result.map(r => r.endMin)) : startMinutes
    const courtBusyMin = result.reduce((s, r) => s + (r.endMin - r.startMin), 0)
    const span = makespanMin - startMinutes
    const utilization = span > 0 ? courtBusyMin / (courts * span) : 0
    return { matches: result, makespanMin, courtBusyMin, utilization, usedDays: 1 }
  }

  // ── 다일차 자동분할 (절대 타임라인 모델) ──
  // 각 날을 연속 절대분으로 이어붙임(밤 사이 간격 0). 경기는 하루를 가로지를 수 없고,
  // 안 들어가면 다음 날로 넘긴다. 마지막 날엔 넘쳐도 배치(드롭 금지).
  const dayList = input.days.map(d => ({
    start: d.startMin,
    len: Math.max(0, d.endMin - d.startMin),
    courts: Math.max(1, Math.min(courts, d.courts ?? courts)),
  }))
  const baseAbs: number[] = []
  { let acc = 0; for (let i = 0; i < dayList.length; i++) { baseAbs[i] = acc; acc += dayList[i].len } }
  const startAbs = baseAbs[0]
  const dayOfAbs = (a: number): number => {
    let d = 0
    for (let i = 0; i < dayList.length; i++) { if (a >= baseAbs[i]) d = i; else break }
    return d
  }
  const toWall = (a: number): { day: number; wall: number } => {
    const d = dayOfAbs(a)
    return { day: d + 1, wall: dayList[d].start + (a - baseAbs[d]) }
  }
  // court(1-base)가 fromAbs 이후 dur 동안 통째로 들어가는 가장 빠른 절대 시작.
  // 해당 코트가 남은 일정 어디에도 없으면 Infinity(선택되지 않음).
  const earliestFit = (fromAbs: number, dur: number, court1: number): number => {
    let a = Math.max(startAbs, fromAbs)
    for (let d = dayOfAbs(a); d < dayList.length; d++) {
      if (court1 > dayList[d].courts) { a = baseAbs[d + 1] ?? Infinity; continue }  // 이 날 코트 없음 → 다음 날
      const dStartAbs = baseAbs[d]
      const dEndAbs = baseAbs[d] + dayList[d].len
      const s = Math.max(a, dStartAbs)
      if (s + dur <= dEndAbs) return s                              // 이 날에 들어감
      if (d + 1 >= dayList.length) return s                          // 마지막 날 — 오버플로 허용(드롭 금지)
      a = baseAbs[d + 1]                                             // 다음 날로
    }
    return Infinity                                                  // 이 코트는 남은 일정에 없음
  }

  const courtFree = Array(courts).fill(startAbs)
  let guard = 0
  while (done.size < total && guard++ < total + 5) {
    const ready = Object.values(nodes).filter(n => !done.has(n.id) && n.deps.every(d => done.has(d) || !nodes[d]))
    if (ready.length === 0) break
    let best: { n: Node; court: number; start: number } | null = null
    for (const n of ready) {
      const depEnd = n.deps.length ? Math.max(startAbs, ...n.deps.map(d => (endOf[d] ?? startAbs) + bufferMin)) : startAbs
      const playerReady = n.players.length ? Math.max(startAbs, ...n.players.map(p => playerFree[p] ?? startAbs)) : startAbs
      const readyT = Math.max(depEnd, playerReady)
      // 이 종목이 쓸 수 있는 코트 중 가장 빨리 들어갈 수 있는 것
      let bc = -1, bs = Infinity
      for (let c = n.courtFrom; c <= n.courtTo; c++) {
        const s = earliestFit(Math.max(courtFree[c - 1] ?? startAbs, readyT), n.dur, c)
        if (s < bs) { bs = s; bc = c - 1 }
      }
      if (bc < 0) { bc = 0; bs = earliestFit(Math.max(courtFree[0], readyT), n.dur, 1) }  // 전용코트가 남은 일정에 없으면 코트1로

      if (!best || bs < best.start || (bs === best.start && n.round < best.n.round)) best = { n, court: bc, start: bs }
    }
    if (!best) break
    const { n, court, start } = best
    const end = start + n.dur
    courtFree[court] = end
    endOf[n.id] = end
    for (const p of n.players) playerFree[p] = end + restMin
    const { day, wall } = toWall(start)
    scheduled[n.id] = { matchId: n.id, eventId: n.eventId, courtNo: court + 1, startMin: wall, endMin: wall + n.dur, round: n.round, day }
    done.add(n.id)
  }

  const result = Object.values(scheduled).sort((a, b) => (a.day - b.day) || (a.startMin - b.startMin) || (a.courtNo - b.courtNo))
  const lastEndAbs = Object.values(endOf).length ? Math.max(...Object.values(endOf)) : startAbs
  const courtBusyMin = result.reduce((s, r) => s + (r.endMin - r.startMin), 0)
  const span = lastEndAbs - startAbs
  const utilization = span > 0 ? courtBusyMin / (courts * span) : 0
  const usedDays = result.length ? Math.max(...result.map(r => r.day)) : 1
  const makespanMin = result.length ? toWall(lastEndAbs).wall : startMinutes   // 마지막 경기의 종료 벽시계
  return { matches: result, makespanMin, courtBusyMin, utilization, usedDays }
}

// ─── 시간 유틸 ─────────────────────────────────────────────
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  const nh = Math.floor(total / 60) % 24
  const nm = total % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function diffMinutes(t1: string, t2: string): number {
  return timeToMins(t2) - timeToMins(t1)
}

// ─── 하루 수용 가능 경기 수 계산 ───────────────────────────
export interface DayConfig {
  day: number          // 1-based day index
  date?: string        // e.g., "2024-09-14"
  label?: string       // "1일차 - 조별예선"
  startTime: string    // e.g., "09:00"
  endTime: string      // e.g., "20:00"
  courtCount: number   // active courts this day
}

export function calcDayCapacity(day: DayConfig, minutesPerMatch: number, bufferMinutes: number): number {
  const totalMins = timeToMins(day.endTime) - timeToMins(day.startTime)
  const slotsPerCourt = Math.floor(totalMins / (minutesPerMatch + bufferMinutes))
  return slotsPerCourt * day.courtCount
}

// ─── 종목별 경기 시간 (단체전은 별도 시간) ──────────────────
export function matchMinutes(eventType: EventType, individualMin: number, teamMin: number): number {
  return eventType === '단체전' ? teamMin : individualMin
}

// 하루 전체 코트-분 (코트 수 × 운영 시간) — 혼합 경기시간 정확 계산용
export function calcDayCourtMinutes(day: DayConfig): number {
  return calcDayOperatingMinutes(day) * day.courtCount
}

// 하루 운영 시간(벽시계, 분) — 코트 수와 무관
export function calcDayOperatingMinutes(day: DayConfig): number {
  return Math.max(0, timeToMins(day.endTime) - timeToMins(day.startTime))
}

// ─── 기본 단일 날 슬롯 생성 (기존 호환) ───────────────────
export function generateScheduleSlots(
  events: ScheduleEvent[],
  startTime: string,
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = []
  const courtAvail: Record<string, string> = {}
  const allCourts = Math.max(...events.map(e => e.courtCount), 1)
  for (let c = 1; c <= allCourts; c++) courtAvail[`court-${c}`] = startTime

  let slotIdx = 0

  for (const event of events) {
    const courts = Array.from({ length: event.courtCount }, (_, i) => `court-${i + 1}`)
    for (let matchNo = 1; matchNo <= event.matchCount; matchNo++) {
      let bestCourt = courts[0]
      let bestTime = courtAvail[courts[0]] ?? startTime
      for (const court of courts) {
        const t = courtAvail[court] ?? startTime
        if (timeToMins(t) < timeToMins(bestTime)) { bestTime = t; bestCourt = court }
      }
      const endTime = addMinutes(bestTime, event.minutesPerMatch)
      const courtNo = parseInt(bestCourt.replace('court-', ''))
      slots.push({
        id: `slot-${slotIdx++}`, eventId: event.id,
        label: `${event.label} - ${matchNo}경기`,
        division: event.division, eventType: event.eventType, gender: event.gender,
        courtNo, startTime: bestTime, endTime, matchNo,
      })
      courtAvail[bestCourt] = addMinutes(endTime, event.bufferMinutes)
    }
  }
  return slots.sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1
    return a.courtNo - b.courtNo
  })
}

// ─── 멀티데이 슬롯 생성 ─────────────────────────────────────
export interface MultiDayScheduleInput {
  events: ScheduleEvent[]
  days: DayConfig[]
  minutesPerMatch: number
  bufferMinutes: number
}

export function generateMultiDaySlots(input: MultiDayScheduleInput): ScheduleSlot[] {
  const { events, days, minutesPerMatch, bufferMinutes } = input
  const slots: ScheduleSlot[] = []
  let slotIdx = 0

  // Sort events by day assignment
  const sortedEvents = [...events].sort((a, b) => (a.day ?? 1) - (b.day ?? 1))

  for (const dayConfig of days) {
    const dayEvents = sortedEvents.filter(e => (e.type === 'match' || !e.type) && (e.day ?? 1) === dayConfig.day)
    const specialEvents = sortedEvents.filter(e => e.type && e.type !== 'match' && (e.day ?? 1) === dayConfig.day)

    // Court availability per court
    const courtAvail: Record<number, string> = {}
    for (let c = 1; c <= dayConfig.courtCount; c++) courtAvail[c] = dayConfig.startTime

    // Process special events first (opening ceremony etc.)
    for (const spec of specialEvents.sort((a, b) => (a.day ?? 1) - (b.day ?? 1))) {
      slots.push({
        id: `slot-${slotIdx++}`, eventId: spec.id,
        label: spec.label,
        division: spec.division, eventType: spec.eventType, gender: spec.gender,
        courtNo: 0,
        startTime: dayConfig.startTime,
        endTime: addMinutes(dayConfig.startTime, spec.minutesPerMatch),
        matchNo: 0, day: dayConfig.day, type: spec.type,
      })
      // Push all courts forward past special event
      if (spec.type === 'opening') {
        const afterEvent = addMinutes(dayConfig.startTime, spec.minutesPerMatch + 5)
        for (const c in courtAvail) courtAvail[Number(c)] = afterEvent
      }
    }

    for (const event of dayEvents) {
      for (let matchNo = 1; matchNo <= event.matchCount; matchNo++) {
        // Find earliest available court within day's operating hours
        let bestCourt = 1
        let bestTime = courtAvail[1] ?? dayConfig.startTime
        for (let c = 1; c <= dayConfig.courtCount; c++) {
          const t = courtAvail[c] ?? dayConfig.startTime
          if (timeToMins(t) < timeToMins(bestTime)) { bestTime = t; bestCourt = c }
        }

        // Check if match fits before endTime
        const endTime = addMinutes(bestTime, minutesPerMatch)
        if (timeToMins(endTime) > timeToMins(dayConfig.endTime)) {
          // Day is full — skip remaining (shouldn't happen if capacity is calculated correctly)
          break
        }

        slots.push({
          id: `slot-${slotIdx++}`, eventId: event.id,
          label: `${event.label} - ${matchNo}경기`,
          division: event.division, eventType: event.eventType, gender: event.gender,
          courtNo: bestCourt, startTime: bestTime, endTime,
          matchNo, day: dayConfig.day,
        })

        courtAvail[bestCourt] = addMinutes(endTime, bufferMinutes)
      }
    }

    // Add 점심시간 / 시상식 as needed (from special events)
    for (const spec of specialEvents) {
      if (spec.type === 'break' || spec.type === 'ceremony') {
        // Find latest busy court time
        const latestTime = Object.values(courtAvail).sort().pop() ?? dayConfig.startTime
        slots.push({
          id: `slot-${slotIdx++}`, eventId: spec.id,
          label: spec.label,
          division: spec.division, eventType: spec.eventType, gender: spec.gender,
          courtNo: 0, startTime: latestTime,
          endTime: addMinutes(latestTime, spec.minutesPerMatch),
          matchNo: 0, day: dayConfig.day, type: spec.type,
        })
      }
    }
  }

  return slots.sort((a, b) => {
    const dayDiff = (a.day ?? 1) - (b.day ?? 1)
    if (dayDiff !== 0) return dayDiff
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1
    return a.courtNo - b.courtNo
  })
}

// ─── 라운드명별 권장 일자 ─────────────────────────────────
// 토너먼트 규모에 따른 자동 일자 배정 제안
export interface RoundDayPlan {
  roundName: string
  recommendedDay: number
  matchCount: number
  reason: string
}

export function suggestDayPlan(
  totalParticipants: number,
  dayCount: number,
  courtCount: number,
  minutesPerMatch: number,
  operatingHours: number
): RoundDayPlan[] {
  // Approximate matches per round for single elimination
  const rounds: RoundDayPlan[] = []
  let remaining = totalParticipants
  let roundNum = 1

  while (remaining > 1) {
    const matchCount = Math.floor(remaining / 2)
    let roundName = ''
    if (remaining <= 2) roundName = '결승'
    else if (remaining <= 4) roundName = '준결승'
    else if (remaining <= 8) roundName = '8강'
    else if (remaining <= 16) roundName = '16강'
    else if (remaining <= 32) roundName = '32강'
    else if (remaining <= 64) roundName = '64강'
    else roundName = `예선 ${roundNum}라운드`

    const dayForRound = Math.min(
      dayCount,
      remaining > 32 ? 1 :
      remaining > 8  ? Math.ceil(dayCount * 0.5) :
      remaining > 2  ? Math.ceil(dayCount * 0.75) :
      dayCount
    )

    rounds.push({ roundName, recommendedDay: dayForRound, matchCount, reason: `${matchCount}경기 · ${dayForRound}일차 권장` })
    remaining = Math.ceil(remaining / 2)
    roundNum++
  }

  void operatingHours

  return rounds.reverse()
}

export function groupSlotsByTime(slots: ScheduleSlot[]): Map<string, ScheduleSlot[]> {
  const map = new Map<string, ScheduleSlot[]>()
  for (const slot of slots) {
    const key = slot.startTime
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(slot)
  }
  return map
}

// ─── 일정 충돌 감지 ──────────────────────────────────────────
// 운영 사고 예방: 같은 선수/페어/팀이 (1) 동시간대 두 코트에 배정되거나
// (2) 연속 경기 사이 휴식이 부족한 경우를 탐지한다. 슬롯의 참가자명(엔티티 단위) 기준.
export const REST_MINUTES_THRESHOLD = 10  // 연속 경기 최소 권장 휴식(분)

export type ScheduleConflictType = 'overlap' | 'rest'
export interface ScheduleConflict {
  type: ScheduleConflictType
  participant: string
  day: number
  slotA: ScheduleSlot
  slotB: ScheduleSlot
  gapMinutes?: number   // rest 타입: 두 경기 사이 간격(분)
}

export interface ConflictReport {
  conflicts: ScheduleConflict[]
  conflictSlotIds: Set<string>   // 하이라이트용 (overlap 슬롯만)
}

export function detectScheduleConflicts(
  slots: ScheduleSlot[],
  restThreshold: number = REST_MINUTES_THRESHOLD,
): ConflictReport {
  // 참가자(엔티티명) → 출전 슬롯 목록
  const byParticipant = new Map<string, Array<{ slot: ScheduleSlot; start: number; end: number; day: number }>>()
  for (const slot of slots) {
    if (slot.type && slot.type !== 'match') continue
    const day = slot.day ?? 1
    const start = timeToMins(slot.startTime)
    const end = timeToMins(slot.endTime)
    for (const name of [slot.participant1, slot.participant2]) {
      const p = (name ?? '').trim()
      if (!p || p === '미정' || p === 'BYE') continue
      if (!byParticipant.has(p)) byParticipant.set(p, [])
      byParticipant.get(p)!.push({ slot, start, end, day })
    }
  }

  const conflicts: ScheduleConflict[] = []
  const conflictSlotIds = new Set<string>()

  for (const [participant, entries] of byParticipant) {
    if (entries.length < 2) continue
    // 같은 날끼리 시간순 비교
    const sorted = [...entries].sort((a, b) => a.day - b.day || a.start - b.start)
    for (let i = 0; i < sorted.length - 1; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i], b = sorted[j]
        if (a.day !== b.day) continue
        if (a.slot.id === b.slot.id) continue
        const overlap = a.start < b.end && b.start < a.end
        if (overlap) {
          conflicts.push({ type: 'overlap', participant, day: a.day, slotA: a.slot, slotB: b.slot })
          conflictSlotIds.add(a.slot.id)
          conflictSlotIds.add(b.slot.id)
        } else {
          // 휴식 부족: 먼저 끝나는 경기 종료 → 다음 경기 시작 간격
          const earlier = a.end <= b.start ? a : b
          const later = earlier === a ? b : a
          const gap = later.start - earlier.end
          if (gap >= 0 && gap < restThreshold) {
            conflicts.push({ type: 'rest', participant, day: a.day, slotA: earlier.slot, slotB: later.slot, gapMinutes: gap })
          }
        }
      }
    }
  }

  // overlap 먼저, 그다음 휴식부족
  conflicts.sort((a, b) => (a.type === b.type ? 0 : a.type === 'overlap' ? -1 : 1))
  return { conflicts, conflictSlotIds }
}

// ─── 스마트 자동 스케줄러 ────────────────────────────────────

export interface RoundPlan {
  eventId: string
  eventLabel: string
  division: Division
  eventType: EventType
  gender: Gender
  roundName: string
  matchCount: number
  stageRatio: number   // 0=earliest round, 1=final
  isLate: boolean      // true for 준결승/결승 → goes on last days
}

export function calcRoundsFromParticipants(ev: SmartEventInput): RoundPlan[] {
  const n = ev.participantCount
  if (n < 2) return []
  const rounds: RoundPlan[] = []

  if (ev.bracketFormat === 'single') {
    let p = n
    const raw: { name: string; matches: number }[] = []
    while (p > 1) {
      const m = Math.floor(p / 2)
      const name =
        p <= 2 ? '결승' : p <= 4 ? '준결승' : p <= 8 ? '8강' :
        p <= 16 ? '16강' : p <= 32 ? '32강' : p <= 64 ? '64강' :
        p <= 128 ? '128강' : '예선'
      raw.push({ name, matches: m })
      p = Math.ceil(p / 2)
    }
    raw.reverse()
    raw.forEach((r, i) => rounds.push({
      eventId: ev.id, eventLabel: ev.label,
      division: ev.division, eventType: ev.eventType, gender: ev.gender,
      roundName: r.name, matchCount: r.matches,
      stageRatio: i / (raw.length - 1 || 1),
      isLate: r.name === '결승' || r.name === '준결승',
    }))
  } else if (ev.bracketFormat === 'group') {
    const groupSize = 4
    const numGroups = Math.ceil(n / groupSize)
    const groupMatches = numGroups * (groupSize * (groupSize - 1) / 2)
    rounds.push({
      eventId: ev.id, eventLabel: ev.label,
      division: ev.division, eventType: ev.eventType, gender: ev.gender,
      roundName: '조별예선', matchCount: groupMatches, stageRatio: 0, isLate: false,
    })
    let p = numGroups * 2
    const ko: { name: string; matches: number }[] = []
    while (p > 1) {
      const m = Math.floor(p / 2)
      const name =
        p <= 2 ? '결승' : p <= 4 ? '준결승' : p <= 8 ? '8강' : p <= 16 ? '16강' : '32강'
      ko.push({ name, matches: m })
      p = Math.ceil(p / 2)
    }
    ko.reverse()
    const total = 1 + ko.length
    ko.forEach((r, i) => rounds.push({
      eventId: ev.id, eventLabel: ev.label,
      division: ev.division, eventType: ev.eventType, gender: ev.gender,
      roundName: r.name, matchCount: r.matches,
      stageRatio: (1 + i) / (total - 1 || 1),
      isLate: r.name === '결승' || r.name === '준결승',
    }))
  } else if (ev.bracketFormat === 'seeded') {
    // 시드예선: 예선(토너먼트 절반) + 본선(토너먼트)
    const seedCount = ev.seedCount ?? Math.min(Math.ceil(n / 2), 16)
    const qualifiers = n - seedCount
    // 예선 라운드 (non-seeds)
    let qp = qualifiers
    const qual: { name: string; matches: number }[] = []
    while (qp > 1) {
      qual.push({ name: `예선 ${qual.length + 1}라운드`, matches: Math.floor(qp / 2) })
      qp = Math.ceil(qp / 2)
    }
    qual.forEach((r, i) => rounds.push({
      eventId: ev.id, eventLabel: ev.label,
      division: ev.division, eventType: ev.eventType, gender: ev.gender,
      roundName: r.name, matchCount: r.matches,
      stageRatio: i / (qual.length + 3 || 1), isLate: false,
    }))
    // 본선 라운드 (seeds + qual winners)
    let p = seedCount + Math.ceil(qualifiers / 2)
    const main: { name: string; matches: number }[] = []
    while (p > 1) {
      const m = Math.floor(p / 2)
      const name = p <= 2 ? '결승' : p <= 4 ? '준결승' : p <= 8 ? '8강' : p <= 16 ? '16강' : '32강'
      main.push({ name, matches: m })
      p = Math.ceil(p / 2)
    }
    main.reverse()
    const total = qual.length + main.length
    main.forEach((r, i) => rounds.push({
      eventId: ev.id, eventLabel: ev.label,
      division: ev.division, eventType: ev.eventType, gender: ev.gender,
      roundName: r.name, matchCount: r.matches,
      stageRatio: (qual.length + i) / (total - 1 || 1),
      isLate: r.name === '결승' || r.name === '준결승',
    }))
  } else {
    // league: round-robin
    const totalMatches = Math.floor(n * (n - 1) / 2)
    const matchesPerRound = Math.max(1, Math.floor(n / 2))
    let remaining = totalMatches
    let rIdx = 1
    while (remaining > 0) {
      const m = Math.min(matchesPerRound, remaining)
      rounds.push({
        eventId: ev.id, eventLabel: ev.label,
        division: ev.division, eventType: ev.eventType, gender: ev.gender,
        roundName: `${rIdx}라운드`, matchCount: m,
        stageRatio: rIdx / Math.ceil(totalMatches / matchesPerRound),
        isLate: false,
      })
      remaining -= m
      rIdx++
    }
  }
  return rounds
}

// 라운드 1개가 차지하는 코트-분 (경기 수 × (경기시간 + 버퍼))
function roundCourtMinutes(r: RoundPlan, individualMin: number, teamMin: number, bufferMinutes: number): number {
  return r.matchCount * (matchMinutes(r.eventType, individualMin, teamMin) + bufferMinutes)
}

export function previewSmartPlan(
  events: SmartEventInput[],
  days: DayConfig[],
  individualMinutes: number,
  teamMinutes: number,
  bufferMinutes: number,
): { day: number; rounds: RoundPlan[]; assignedMinutes: number; capacityMinutes: number }[] {
  const capacities = days.map(d => calcDayCourtMinutes(d))
  const remaining = [...capacities]
  const cost = (r: RoundPlan) => roundCourtMinutes(r, individualMinutes, teamMinutes, bufferMinutes)
  const roundDayAssign: { round: RoundPlan; day: number }[] = []

  // 1) 일차 범위 지정된 종목 먼저 배정 (예선→앞날, 준결승/결승→마지막날)
  const pinnedEvents = events.filter(e => e.preferredDayStart)
  const autoEvents = events.filter(e => !e.preferredDayStart)

  for (const ev of pinnedEvents) {
    const startDay = ev.preferredDayStart!
    const endDay = ev.preferredDayEnd ?? startDay
    const rangeDays = days.filter(d => d.day >= startDay && d.day <= endDay)
    if (rangeDays.length === 0) continue

    const rounds = calcRoundsFromParticipants(ev)
    const earlyRounds = rounds.filter(r => !r.isLate)
    const lateRounds = rounds.filter(r => r.isLate)

    // 예선 라운드: 범위 앞쪽 날짜에 순서대로 채움
    let ei = days.findIndex(d => d.day === startDay)
    const maxEarlyIdx = rangeDays.length > 1
      ? days.findIndex(d => d.day === endDay) - (lateRounds.length > 0 ? 1 : 0)
      : ei
    for (const r of earlyRounds) {
      while (ei < maxEarlyIdx && remaining[ei] < cost(r)) ei++
      if (ei >= days.length) ei = days.length - 1
      roundDayAssign.push({ round: r, day: days[ei].day })
      remaining[ei] -= cost(r)
    }

    // 준결승/결승: 범위 마지막 날짜에 배정
    const lastIdx = days.findIndex(d => d.day === endDay)
    for (const r of lateRounds) {
      roundDayAssign.push({ round: r, day: endDay })
      remaining[lastIdx] -= cost(r)
    }
  }

  // 2) 나머지 자동 배정
  const allAutoRounds = autoEvents.flatMap(e => calcRoundsFromParticipants(e))
  const earlyRounds = allAutoRounds.filter(r => !r.isLate)
  const lateRounds = allAutoRounds.filter(r => r.isLate)

  let di = 0
  for (const r of earlyRounds) {
    const maxEarlyDay = Math.max(0, days.length - (lateRounds.length > 0 ? 2 : 1))
    while (di < maxEarlyDay && remaining[di] < cost(r)) di++
    if (di >= days.length) di = days.length - 1
    roundDayAssign.push({ round: r, day: days[di].day })
    remaining[di] -= cost(r)
  }

  let li = Math.max(0, days.length - 2)
  for (const r of lateRounds) {
    while (li < days.length - 1 && remaining[li] < cost(r)) li++
    roundDayAssign.push({ round: r, day: days[li].day })
    remaining[li] -= cost(r)
  }

  return days.map((d, i) => ({
    day: d.day,
    rounds: roundDayAssign.filter(x => x.day === d.day).map(x => x.round),
    assignedMinutes: capacities[i] - remaining[i],
    capacityMinutes: capacities[i],
  }))
}

export function generateSmartSlots(
  events: SmartEventInput[],
  days: DayConfig[],
  individualMinutes: number,
  teamMinutes: number,
  bufferMinutes: number,
): ScheduleSlot[] {
  const plan = previewSmartPlan(events, days, individualMinutes, teamMinutes, bufferMinutes)
  const slots: ScheduleSlot[] = []
  let slotIdx = 0

  // 종목별 코트 범위 사전 배정 맵 (단체전 ↔ 개인전 코트 분리용)
  const courtRange: Record<string, { start: number; end: number }> = {}
  for (const ev of events) {
    if (ev.preferredCourtStart) {
      courtRange[ev.id] = { start: ev.preferredCourtStart, end: ev.preferredCourtEnd ?? ev.preferredCourtStart }
    }
  }

  for (const dayPlan of plan) {
    const dayConfig = days.find(d => d.day === dayPlan.day)!
    const courtAvail: Record<number, string> = {}
    for (let c = 1; c <= dayConfig.courtCount; c++) courtAvail[c] = dayConfig.startTime

    const rounds = [...dayPlan.rounds]

    for (const round of rounds) {
      const dur = matchMinutes(round.eventType, individualMinutes, teamMinutes)
      // 이 종목이 사용할 코트 범위 (지정 없으면 전체 코트)
      const range = courtRange[round.eventId]
      const courtFrom = range ? Math.max(1, range.start) : 1
      const courtTo = range ? Math.min(dayConfig.courtCount, range.end) : dayConfig.courtCount

      for (let matchNo = 1; matchNo <= round.matchCount; matchNo++) {
        let bestCourt = courtFrom
        let bestTime = courtAvail[courtFrom] ?? dayConfig.startTime
        for (let c = courtFrom; c <= courtTo; c++) {
          const t = courtAvail[c] ?? dayConfig.startTime
          if (timeToMins(t) < timeToMins(bestTime)) { bestTime = t; bestCourt = c }
        }
        const endT = addMinutes(bestTime, dur)
        if (timeToMins(endT) > timeToMins(dayConfig.endTime)) break

        slots.push({
          id: `slot-${slotIdx++}`,
          eventId: round.eventId,
          label: `${round.eventLabel} ${round.roundName} ${matchNo}번`,
          division: round.division,
          eventType: round.eventType,
          gender: round.gender,
          courtNo: bestCourt,
          startTime: bestTime,
          endTime: endT,
          matchNo,
          day: dayConfig.day,
        })
        courtAvail[bestCourt] = addMinutes(endT, bufferMinutes)
      }
    }
  }

  return slots.sort((a, b) => {
    const dd = (a.day ?? 1) - (b.day ?? 1)
    if (dd) return dd
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1
    return a.courtNo - b.courtNo
  })
}

// ─── 경기 지연 → 후속 자동 밀림 / 슬롯 인라인 이동 ───────────────
function minutesToHHMM(total: number): string {
  const nh = Math.floor(total / 60) % 24
  const nm = ((total % 60) + 60) % 60
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

// 같은 코트·같은 날의 경기 슬롯을 시작순으로 재정렬해, 각 경기가 직전 경기 종료 + 버퍼
// 이후에 시작하도록 앞으로만 민다(겹침 발생 시에만). 다른 코트/날/특수일정은 건드리지 않음.
function repackCourtDay(result: ScheduleSlot[], court: number, day: number, bufferMin: number): void {
  const lane = result
    .filter(s => s.courtNo === court && (s.day ?? 1) === day && (!s.type || s.type === 'match'))
    .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime))
  let prevEnd = -Infinity
  for (const s of lane) {
    const dur = timeToMins(s.endTime) - timeToMins(s.startTime)
    const newStart = Math.max(timeToMins(s.startTime), prevEnd + bufferMin)
    if (newStart !== timeToMins(s.startTime)) {
      s.startTime = minutesToHHMM(newStart)
      s.endTime = minutesToHHMM(newStart + dur)
    }
    prevEnd = timeToMins(s.endTime)
  }
}

// 특정 경기가 delayMin 만큼 지연(연장)되면, 같은 코트·같은 날의 이후 경기들을 버퍼를 지키며
// 자동으로 뒤로 민다(겹침 시에만). day 경계 초과분은 벽시계 그대로(운영자는 detectScheduleConflicts로 경고 확인).
// 반환은 새 배열(원본 불변).
export function shiftSlotsAfterDelay(
  slots: ScheduleSlot[],
  slotId: string,
  delayMin: number,
  bufferMin = 0,
): ScheduleSlot[] {
  const result = slots.map(s => ({ ...s }))
  const target = result.find(s => s.id === slotId)
  if (!target || delayMin <= 0) return result
  target.endTime = addMinutes(target.endTime, delayMin)   // 대상 경기 연장
  repackCourtDay(result, target.courtNo, target.day ?? 1, bufferMin)
  return result
}

// 슬롯의 시작시간/코트를 직접 수정하고, 영향받는 코트(들)를 재정렬해 겹침을 자동 해소.
// 코트가 바뀌면 이전 코트와 새 코트 둘 다 재정렬. 반환은 새 배열(원본 불변).
export function moveScheduleSlot(
  slots: ScheduleSlot[],
  slotId: string,
  patch: { startTime?: string; courtNo?: number },
  bufferMin = 0,
): ScheduleSlot[] {
  const result = slots.map(s => ({ ...s }))
  const target = result.find(s => s.id === slotId)
  if (!target) return result
  const day = target.day ?? 1
  const oldCourt = target.courtNo
  if (patch.startTime != null) {
    const dur = timeToMins(target.endTime) - timeToMins(target.startTime)
    target.startTime = patch.startTime
    target.endTime = minutesToHHMM(timeToMins(patch.startTime) + dur)
  }
  if (patch.courtNo != null) target.courtNo = patch.courtNo
  repackCourtDay(result, target.courtNo, day, bufferMin)
  if (patch.courtNo != null && patch.courtNo !== oldCourt) repackCourtDay(result, oldCourt, day, bufferMin)
  return result
}
