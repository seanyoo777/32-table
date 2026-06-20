import type { Division, EventType, Gender, ScheduleEvent, ScheduleSlot } from '../types'
import type { SmartEventInput } from '../types'

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
