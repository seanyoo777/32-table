import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { generateSmartSlots, previewSmartPlan, calcDayCourtMinutes, calcDayOperatingMinutes, matchMinutes, calcRoundsFromParticipants, detectScheduleConflicts, scheduleTournamentMatches, shiftSlotsAfterDelay, moveScheduleSlot } from '../utils/scheduleUtils'
import type { DayConfig } from '../utils/scheduleUtils'
import { Plus, Calendar, Printer, Clock, Building2, Link, Sun, Users, Download, ChevronLeft, AlertTriangle, Coffee, ChevronDown, Pencil, Bookmark, Trash2, X } from 'lucide-react'
import type { Division, EventType, Gender, ScheduleEvent, SchedulePlan, ScheduleSlot, SmartEventInput, SmartBracketFormat, SchedulePreset } from '../types'

const DIVISIONS: Division[] = ['초등', '중등', '고등', '대학', '일반', '생활체육']

const BRACKET_LABELS: Record<SmartBracketFormat, string> = {
  single: '토너먼트',
  group: '조별+토너먼트',
  league: '리그전',
  seeded: '시드예선',
}

type GridColDef = { key: string; label: string; eventType: EventType; gender: Gender }
const GRID_COLS: GridColDef[] = [
  { key: 'M-단식',  label: '남자단식',  eventType: '단식',    gender: '남' },
  { key: 'F-단식',  label: '여자단식',  eventType: '단식',    gender: '여' },
  { key: 'M-복식',  label: '남자복식',  eventType: '복식',    gender: '남' },
  { key: 'F-복식',  label: '여자복식',  eventType: '복식',    gender: '여' },
  { key: 'X-혼합',  label: '혼합복식',  eventType: '혼합복식', gender: '혼합' },
  { key: 'M-단체',  label: '남자단체',  eventType: '단체전',  gender: '남' },
  { key: 'F-단체',  label: '여자단체',  eventType: '단체전',  gender: '여' },
]

type GridRow = { bracketFormat: SmartBracketFormat; counts: Record<string, number>; dayStart: number; dayEnd: number; seedCount?: number }
type GridState = Record<Division, GridRow>
const initGrid = (): GridState =>
  Object.fromEntries(DIVISIONS.map(d => [d, { bracketFormat: 'single' as SmartBracketFormat, counts: {}, dayStart: 1, dayEnd: 1 }])) as GridState

const divColors: Record<Division, string> = {
  초등: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  중등: 'bg-green-100 text-green-700 border-green-200',
  고등: 'bg-blue-100 text-blue-700 border-blue-200',
  대학: 'bg-purple-100 text-purple-700 border-purple-200',
  일반: 'bg-gray-100 text-gray-700 border-gray-200',
  생활체육: 'bg-orange-100 text-orange-700 border-orange-200',
}

const eventColors: Record<string, string> = {
  단식: 'bg-blue-500',
  복식: 'bg-green-500',
  혼합복식: 'bg-purple-500',
  단체전: 'bg-orange-500',
  break: 'bg-gray-400',
  ceremony: 'bg-yellow-500',
  opening: 'bg-indigo-500',
}

function genId() { return Math.random().toString(36).slice(2, 10) }

function fmtCourtHours(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}분`
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`
}

function formatTime12h(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? '오후' : '오전'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${period} ${hour}:${m.toString().padStart(2, '0')}`
}

export default function SchedulePage() {
  const { schedules, addSchedule, deleteSchedule, schedulePresets, addSchedulePreset, deleteSchedulePreset, tournaments, players, pairs } = useStore()
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [planName, setPlanName] = useState('')
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0])
  const [planEndDate, setPlanEndDate] = useState('')  // 종료 날짜 (입력 시 totalDays 자동 계산)
  const [linkedTourId, setLinkedTourId] = useState('')

  const [grid, setGrid] = useState<GridState>(initGrid)
  const [activeDivs, setActiveDivs] = useState<Record<Division, boolean>>(
    () => Object.fromEntries(DIVISIONS.map(d => [d, true])) as Record<Division, boolean>
  )
  function toggleDiv(div: Division) {
    setActiveDivs(prev => ({ ...prev, [div]: !prev[div] }))
  }

  function setGridCount(div: Division, colKey: string, val: number) {
    setGrid(prev => ({
      ...prev,
      [div]: { ...prev[div], counts: { ...prev[div].counts, [colKey]: val } },
    }))
  }
  function setGridBracket(div: Division, fmt: SmartBracketFormat) {
    setGrid(prev => ({ ...prev, [div]: { ...prev[div], bracketFormat: fmt } }))
  }
  function setGridDayStart(div: Division, dayStart: number) {
    setGrid(prev => ({
      ...prev,
      [div]: { ...prev[div], dayStart, dayEnd: Math.max(prev[div].dayEnd, dayStart) },
    }))
  }
  function setGridDayEnd(div: Division, dayEnd: number) {
    setGrid(prev => ({
      ...prev,
      [div]: { ...prev[div], dayEnd, dayStart: Math.min(prev[div].dayStart, dayEnd) },
    }))
  }

  const [fillRow, setFillRow] = useState<Record<string, string>>({})
  function applyFill(colKey: string) {
    const val = Number(fillRow[colKey])
    if (!val || val < 0) return
    setGrid(prev => {
      const next = { ...prev }
      for (const div of DIVISIONS) {
        if (!activeDivs[div]) continue  // 비참가 부문은 일괄입력 제외
        next[div] = { ...next[div], counts: { ...next[div].counts, [colKey]: val } }
      }
      return next
    })
  }

  const smartEvents = useMemo<SmartEventInput[]>(() => {
    const result: SmartEventInput[] = []
    for (const div of DIVISIONS) {
      if (!activeDivs[div]) continue
      const row = grid[div]
      for (const col of GRID_COLS) {
        const count = row.counts[col.key] ?? 0
        if (count >= 2) {
          const gLabel = col.gender === '혼합' ? '' : col.gender + '자 '
          result.push({
            id: `${div}-${col.key}`,
            division: div,
            eventType: col.eventType,
            gender: col.gender,
            participantCount: count,
            bracketFormat: row.bracketFormat,
            label: `${div} ${gLabel}${col.eventType}`,
            preferredDayStart: row.dayStart,
            preferredDayEnd: row.dayEnd,
            seedCount: row.bracketFormat === 'seeded' ? (row.seedCount ?? 4) : undefined,
          })
        }
      }
    }
    return result
  }, [grid, activeDivs])

  const [selectedPresetId, setSelectedPresetId] = useState('')

  const [totalDays, setTotalDays] = useState(1)
  const [globalMinutesPerMatch, setGlobalMinutesPerMatch] = useState(30)
  const [globalTeamMinutes, setGlobalTeamMinutes] = useState(120)
  const [globalBuffer, setGlobalBuffer] = useState(5)
  const [teamCourtCount, setTeamCourtCount] = useState(0) // 단체전 전용 코트 수 (0=분리 안 함)
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>([
    { day: 1, date: planDate, startTime: '09:00', endTime: '20:00', courtCount: 4 }
  ])

  function handleSavePreset() {
    const name = prompt('프리셋 이름을 입력하세요 (예: 춘계대회 기본설정)')
    if (!name?.trim()) return
    const preset: SchedulePreset = {
      id: genId(),
      name: name.trim(),
      config: { totalDays, dayConfigs, globalMinutesPerMatch, globalTeamMinutes, globalBuffer, teamCourtCount },
    }
    addSchedulePreset(preset)
    setSelectedPresetId(preset.id)
  }

  function handleLoadPreset() {
    const preset = schedulePresets.find(p => p.id === selectedPresetId)
    if (!preset) return
    const { config } = preset
    setTotalDays(config.totalDays)
    setDayConfigs(config.dayConfigs)
    setGlobalMinutesPerMatch(config.globalMinutesPerMatch)
    setGlobalTeamMinutes(config.globalTeamMinutes)
    setGlobalBuffer(config.globalBuffer)
    setTeamCourtCount(config.teamCourtCount)
  }

  function handleDeletePreset() {
    if (!selectedPresetId) return
    const preset = schedulePresets.find(p => p.id === selectedPresetId)
    if (!preset) return
    if (!confirm(`"${preset.name}" 프리셋을 삭제하시겠습니까?`)) return
    deleteSchedulePreset(selectedPresetId)
    setSelectedPresetId('')
  }

  function updateDayCount(n: number, baseDate?: string) {
    const clamped = Math.min(7, Math.max(1, n))
    setTotalDays(clamped)
    const start = baseDate ?? planDate
    setDayConfigs(prev => {
      const next: DayConfig[] = []
      for (let i = 1; i <= clamped; i++) {
        const existing = prev.find(d => d.day === i)
        if (existing) { next.push({ ...existing, date: (() => { const d = new Date(start); d.setDate(d.getDate() + i - 1); return d.toISOString().split('T')[0] })() }) }
        else {
          const d = new Date(start)
          d.setDate(d.getDate() + i - 1)
          next.push({ day: i, date: d.toISOString().split('T')[0], startTime: '09:00', endTime: '20:00', courtCount: 4 })
        }
      }
      return next
    })
    // 일수가 줄면 범위 유효성 보정
    setGrid(prev => {
      const next = { ...prev }
      for (const div of DIVISIONS) {
        const row = next[div]
        const clampedEnd = Math.min(row.dayEnd, clamped)
        const clampedStart = Math.min(row.dayStart, clampedEnd)
        if (clampedStart !== row.dayStart || clampedEnd !== row.dayEnd) {
          next[div] = { ...row, dayStart: clampedStart, dayEnd: clampedEnd }
        }
      }
      return next
    })
  }

  function updateDayConfig(day: number, field: keyof DayConfig, value: string | number) {
    setDayConfigs(prev => prev.map(d => d.day === day ? { ...d, [field]: value } : d))
  }

  // 하루 코트-분 수용량 (코트 수 × 운영시간)
  const dayCapacities = useMemo(() =>
    dayConfigs.map(d => ({
      day: d.day,
      capacityMin: calcDayCourtMinutes(d),
      label: d.label ?? `${d.day}일차`,
      date: d.date,
    })),
    [dayConfigs]
  )

  const totalCapacityMin = dayCapacities.reduce((s, d) => s + d.capacityMin, 0)        // 총 코트-분 (수용 가능 작업량)
  const totalOperatingMin = dayConfigs.reduce((s, d) => s + calcDayOperatingMinutes(d), 0) // 총 운영 시간(벽시계)
  // 필요 코트-분 = Σ(경기 수 × (종목별 경기시간 + 버퍼))
  const totalRequiredMin = useMemo(() =>
    smartEvents.reduce((s, ev) => {
      const rounds = calcRoundsFromParticipants(ev)
      const per = matchMinutes(ev.eventType, globalMinutesPerMatch, globalTeamMinutes) + globalBuffer
      return s + rounds.reduce((rs, r) => rs + r.matchCount, 0) * per
    }, 0),
    [smartEvents, globalMinutesPerMatch, globalTeamMinutes, globalBuffer]
  )
  const totalRequiredMatches = useMemo(() =>
    smartEvents.reduce((s, ev) => {
      const rounds = calcRoundsFromParticipants(ev)
      return s + rounds.reduce((rs, r) => rs + r.matchCount, 0)
    }, 0),
    [smartEvents]
  )
  // 평균 코트 수 (가중 평균: Σ코트×운영분 / 총운영분)
  const avgCourts = totalOperatingMin > 0 ? totalCapacityMin / totalOperatingMin : 1

  // ── 핵심 공식 ──────────────────────────────────────────
  // 총 소요시간 = 총경기×경기시간 ÷ 평균코트수  (테이블↑→시간↓)
  const totalDurationMin = avgCourts > 0 ? Math.round(totalRequiredMin / avgCourts) : 0
  // 일평균 필요시간 = 총소요시간 ÷ 일수           (일수↑→시간↓)
  const perDayDurationMin = totalDays > 0 ? Math.round(totalDurationMin / totalDays) : totalDurationMin
  // 하루 운영시간 (첫째날 기준)
  const firstDayOpMin = dayConfigs[0] ? calcDayOperatingMinutes(dayConfigs[0]) : 660
  // 필요 일수 = ceil(총소요시간 ÷ 하루최대운영시간)
  const daysNeeded = firstDayOpMin > 0 ? Math.ceil(totalDurationMin / firstDayOpMin) : 1
  // 초과 여부
  const overCapacity = totalRequiredMin > totalCapacityMin
  const shortfallMin = totalRequiredMin - totalCapacityMin
  const avgCapacityPerDay = totalDays > 0 ? totalCapacityMin / totalDays : 0
  const extraDaysNeeded = avgCapacityPerDay > 0 ? Math.ceil(shortfallMin / avgCapacityPerDay) : 0

  const maxCourts = useMemo(() => Math.max(1, ...dayConfigs.map(d => d.courtCount)), [dayConfigs])
  const hasTeamEvent = smartEvents.some(e => e.eventType === '단체전')
  // 단체전 전용 코트 분리: 단체전→뒤쪽 코트, 개인/복식→앞쪽 코트 (겹침 방지)
  const planEvents = useMemo<SmartEventInput[]>(() => {
    if (teamCourtCount <= 0) return smartEvents
    const split = Math.max(1, maxCourts - teamCourtCount) // 개인전 마지막 코트 번호
    return smartEvents.map(ev => {
      if (ev.eventType === '단체전') {
        return { ...ev, preferredCourtStart: split + 1, preferredCourtEnd: maxCourts }
      }
      return { ...ev, preferredCourtStart: 1, preferredCourtEnd: split }
    })
  }, [smartEvents, teamCourtCount, maxCourts])

  const smartPreview = useMemo(() => {
    if (planEvents.length === 0 || dayConfigs.length === 0) return null
    return previewSmartPlan(planEvents, dayConfigs, globalMinutesPerMatch, globalTeamMinutes, globalBuffer)
  }, [planEvents, dayConfigs, globalMinutesPerMatch, globalTeamMinutes, globalBuffer])

  function resolveParticipantName(id: string | null, eventType: string): string {
    if (!id || id.startsWith('ko-slot-')) return '미정'
    if (eventType === '복식' || eventType === '혼합복식') {
      const pair = pairs.find(p => p.id === id)
      if (pair) {
        const p1 = players.find(p => p.id === pair.player1Id)
        const p2 = players.find(p => p.id === pair.player2Id)
        return `${p1?.name ?? '?'}/${p2?.name ?? '?'}`
      }
    }
    if (eventType === '단체전') return id  // 팀은 ID가 팀 이름인 경우 있음
    return players.find(p => p.id === id)?.name ?? id
  }

  function handleGenerate() {
    if (!planName || smartEvents.length === 0) return
    let slots: ScheduleSlot[] = generateSmartSlots(planEvents, dayConfigs, globalMinutesPerMatch, globalTeamMinutes, globalBuffer)

    // 연결 대회가 있으면 실제 선수 배치
    if (linkedTourId) {
      const tour = tournaments.find(t => t.id === linkedTourId)
      if (tour) {
        // eventId별 슬롯 그룹 (시간순)
        const slotsByEvent = new Map<string, ScheduleSlot[]>()
        for (const s of slots) {
          if (!slotsByEvent.has(s.eventId)) slotsByEvent.set(s.eventId, [])
          slotsByEvent.get(s.eventId)!.push(s)
        }
        // eventId → 슬롯들은 이미 시간순 정렬됨
        slots = slots.map(slot => {
          // 종목 매칭: division + eventType + gender
          const tourEvent = tour.events.find(te =>
            te.division === slot.division && te.eventType === slot.eventType && te.gender === slot.gender
          )
          if (!tourEvent) return slot
          // 슬롯 인덱스 (이 eventId에서 몇 번째 슬롯인가)
          const evSlots = slotsByEvent.get(slot.eventId) ?? []
          const slotIdx = evSlots.indexOf(slot)
          // 참가자 있는 경기를 라운드/포지션 순으로 정렬
          const assignable = tourEvent.matches
            .filter(m => m.participant1Id && m.participant2Id && !m.isBye)
            .sort((a, b) => a.round !== b.round ? a.round - b.round : a.position - b.position)
          const match = assignable[slotIdx]
          if (!match) return slot
          return {
            ...slot,
            participant1: resolveParticipantName(match.participant1Id, slot.eventType),
            participant2: resolveParticipantName(match.participant2Id, slot.eventType),
            round: `${match.round}라운드`,
          }
        })
      }
    }

    const derivedEvents: ScheduleEvent[] = planEvents.map(se => {
      const rounds = calcRoundsFromParticipants(se)
      const totalMatches = rounds.reduce((s, r) => s + r.matchCount, 0)
      return {
        id: se.id, label: se.label, division: se.division, eventType: se.eventType,
        gender: se.gender, matchCount: totalMatches,
        minutesPerMatch: matchMinutes(se.eventType, globalMinutesPerMatch, globalTeamMinutes),
        courtCount: dayConfigs[0]?.courtCount ?? 4, bufferMinutes: globalBuffer, type: 'match' as const,
      }
    })

    // 운영시간 초과로 배치되지 못한 경기 감지 → 운영자에게 고지(생성된 경기는 저장됨)
    const expectedMatches = derivedEvents.reduce((s, e) => s + e.matchCount, 0)
    const placedMatches = slots.filter(s => !s.type || s.type === 'match').length
    if (expectedMatches > placedMatches) {
      alert(`⚠ 운영 시간이 부족해 ${expectedMatches - placedMatches}경기가 일정에 배치되지 못했습니다.\n` +
        `코트 수를 늘리거나 일차를 추가한 뒤 다시 생성하세요.\n(배치된 ${placedMatches}경기는 그대로 저장됩니다)`)
    }

    const plan: SchedulePlan = {
      id: genId(), name: planName, date: planDate,
      startTime: dayConfigs[0]?.startTime ?? '09:00',
      events: derivedEvents, slots, createdAt: new Date().toISOString(),
      linkedTournamentId: linkedTourId || undefined,
      days: dayConfigs.map(d => ({ ...d })),   // 다일차 운영창 보존(시간 재배치용)
    }
    addSchedule(plan)
    setSelectedId(plan.id)
    setView('detail')
  }

  const selectedPlan = schedules.find(s => s.id === selectedId)

  if (view === 'detail' && selectedPlan) {
    return <ScheduleDetail plan={selectedPlan} onBack={() => setView('list')} />
  }

  if (view === 'create') {
    return (
      <div className="h-full flex flex-col overflow-hidden bg-gray-50">
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
          <button onClick={() => setView('list')} className="btn-secondary py-1.5 text-sm flex items-center gap-1">
            <ChevronLeft size={14} /> 목록
          </button>
          <h1 className="text-lg font-bold">경기일정 생성</h1>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {/* ⓪ 운영 설정 프리셋 */}
          <div className="card space-y-2">
            <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
              <Bookmark size={14} className="text-indigo-500" /> ⓪ 운영 설정 프리셋
              <span className="text-xs text-gray-400 font-normal">— 코트 수·경기 시간·일차 설정 저장·재사용</span>
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {schedulePresets.length > 0 ? (
                <>
                  <select
                    className="select text-sm flex-1 min-w-[180px]"
                    value={selectedPresetId}
                    onChange={e => setSelectedPresetId(e.target.value)}
                  >
                    <option value="">-- 저장된 프리셋 선택 --</option>
                    {schedulePresets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button
                    onClick={handleLoadPreset}
                    disabled={!selectedPresetId}
                    className="btn-secondary text-sm py-1.5 px-3 disabled:opacity-40"
                  >불러오기</button>
                  {selectedPresetId && (
                    <button onClick={handleDeletePreset} className="btn-danger text-sm py-1.5 px-3 flex items-center gap-1">
                      <Trash2 size={13} /> 삭제
                    </button>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-400">저장된 프리셋이 없습니다.</p>
              )}
              <button onClick={handleSavePreset} className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1">
                <Bookmark size={13} /> 현재 설정 저장
              </button>
            </div>
          </div>

          {/* ① 기본 정보 */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">① 기본 정보</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-1">일정표 이름 *</label>
                <input className="input text-sm" placeholder="예: 2024 춘계 탁구대회" value={planName} onChange={e => setPlanName(e.target.value)} />
              </div>
              {tournaments.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-gray-600 block mb-1">
                    연결 대회 <span className="text-gray-400 font-normal">(선택 — 선수 자동 배치)</span>
                  </label>
                  <select className="select text-sm w-full" value={linkedTourId} onChange={e => setLinkedTourId(e.target.value)}>
                    <option value="">선택 안 함 (익명 슬롯)</option>
                    {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">대회 시작 날짜</label>
                <input className="input text-sm" type="date" value={planDate} onChange={e => {
                  setPlanDate(e.target.value)
                  if (planEndDate && planEndDate >= e.target.value) {
                    const days = Math.round((new Date(planEndDate).getTime() - new Date(e.target.value).getTime()) / 86400000) + 1
                    updateDayCount(Math.min(7, Math.max(1, days)), e.target.value)
                  } else {
                    updateDayCount(totalDays, e.target.value)
                  }
                }} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">대회 종료 날짜</label>
                <input className="input text-sm" type="date" value={planEndDate || (() => { const d = new Date(planDate); d.setDate(d.getDate() + totalDays - 1); return d.toISOString().split('T')[0] })()} min={planDate}
                  onChange={e => {
                    setPlanEndDate(e.target.value)
                    if (e.target.value >= planDate) {
                      const days = Math.round((new Date(e.target.value).getTime() - new Date(planDate).getTime()) / 86400000) + 1
                      updateDayCount(Math.min(7, Math.max(1, days)), planDate)
                    }
                  }}
                />
                <div className="text-[10px] text-gray-400 mt-0.5">= {totalDays}일 (최대 7일)</div>
              </div>
            </div>
          </div>

          {/* ② 일자별 운영 시간 */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                <Sun size={14} className="text-orange-500" /> ② 일자별 운영 시간
              </h2>
              <div className="flex items-center gap-2.5 text-sm flex-wrap">
                <div className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-2 py-1">
                  <label className="text-xs text-blue-700 font-medium">개인전</label>
                  <input className="input w-14 text-center py-1 text-sm" type="number" min="10" max="120" value={globalMinutesPerMatch} onChange={e => setGlobalMinutesPerMatch(Number(e.target.value))} />
                  <span className="text-xs text-gray-500">분</span>
                </div>
                <div className="flex items-center gap-1.5 bg-orange-50 rounded-lg px-2 py-1">
                  <label className="text-xs text-orange-700 font-medium">단체전</label>
                  <input className="input w-16 text-center py-1 text-sm" type="number" min="30" max="300" step="10" value={globalTeamMinutes} onChange={e => setGlobalTeamMinutes(Number(e.target.value))} />
                  <span className="text-xs text-gray-500">분</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-600">여유</label>
                  <input className="input w-12 text-center py-1 text-sm" type="number" min="0" max="30" value={globalBuffer} onChange={e => setGlobalBuffer(Number(e.target.value))} />
                  <span className="text-xs text-gray-500">분</span>
                </div>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 pr-3 font-medium text-gray-600 text-xs whitespace-nowrap">일차</th>
                  <th className="text-left py-1.5 pr-3 font-medium text-gray-600 text-xs">날짜</th>
                  <th className="text-left py-1.5 pr-3 font-medium text-gray-600 text-xs">시작</th>
                  <th className="text-left py-1.5 pr-3 font-medium text-gray-600 text-xs">종료</th>
                  <th className="text-left py-1.5 pr-3 font-medium text-gray-600 text-xs">코트 수</th>
                  <th className="text-left py-1.5 font-medium text-gray-600 text-xs">운영 시간<br/><span className="text-[10px] text-gray-400 font-normal">(종료 − 시작)</span></th>
                </tr>
              </thead>
              <tbody>
                {dayConfigs.map(d => {
                  const opMin = calcDayOperatingMinutes(d)
                  return (
                    <tr key={d.day} className="border-b last:border-0">
                      <td className="py-1.5 pr-3">
                        <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-xs">{d.day}일차</span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <input className="input py-1 text-sm w-32" type="date" value={d.date ?? ''} onChange={e => updateDayConfig(d.day, 'date', e.target.value)} />
                      </td>
                      <td className="py-1.5 pr-3">
                        <div className="flex flex-col gap-1">
                          <input className="input py-1 text-sm w-28" type="time" value={d.startTime} onChange={e => updateDayConfig(d.day, 'startTime', e.target.value)} />
                          <span className={`text-xs font-semibold text-center whitespace-nowrap px-1.5 py-0.5 rounded ${Number(d.startTime.split(':')[0]) >= 12 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                            {formatTime12h(d.startTime)}
                          </span>
                        </div>
                      </td>
                      <td className="py-1.5 pr-3">
                        <div className="flex flex-col gap-1">
                          <input className="input py-1 text-sm w-28" type="time" value={d.endTime} onChange={e => updateDayConfig(d.day, 'endTime', e.target.value)} />
                          <span className={`text-xs font-semibold text-center whitespace-nowrap px-1.5 py-0.5 rounded ${Number(d.endTime.split(':')[0]) >= 12 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                            {formatTime12h(d.endTime)}
                          </span>
                        </div>
                      </td>
                      <td className="py-1.5 pr-3">
                        <input className="input py-1 text-sm w-14 text-center" type="number" min="1" max="20" value={d.courtCount} onChange={e => updateDayConfig(d.day, 'courtCount', Number(e.target.value))} />
                      </td>
                      <td className="py-1.5">
                        <span className="font-bold text-sm text-green-600">{fmtCourtHours(opMin)}</span>
                        <span className="text-[10px] text-gray-400 ml-1">× {d.courtCount}코트</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50">
                  <td colSpan={5} className="py-2 pr-3 text-xs text-gray-500 font-medium">예상 소요</td>
                  <td className="py-2">
                    {totalRequiredMin > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {/* 총 소요시간 = 총경기×경기시간 ÷ 평균코트 (코트↑→시간↓) */}
                        <span className={`font-bold text-base ${overCapacity ? 'text-red-600' : 'text-green-600'}`}>
                          {overCapacity ? '⚠' : '✓'} 총 {fmtCourtHours(totalDurationMin)}
                          <span className="text-xs font-normal ml-1 text-gray-500">
                            (테이블 {Math.round(avgCourts)}개 기준)
                          </span>
                        </span>
                        {/* 일평균 필요시간 (테이블↑ 또는 일수↑ → 감소) */}
                        <span className="text-[11px] text-blue-700 font-medium">
                          일평균 {fmtCourtHours(perDayDurationMin)} / {totalDays}일
                        </span>
                        <span className="text-[11px] text-gray-500">
                          {totalRequiredMatches}경기 · {overCapacity
                            ? `약 ${extraDaysNeeded}일 더 필요`
                            : `필요 ${daysNeeded}일 · 여유 ${fmtCourtHours(-shortfallMin)}`
                          }
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">인원 입력 시 계산</span>
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
            {hasTeamEvent && (
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-orange-700 whitespace-nowrap">🏓 단체전 전용 코트</span>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min="0" max={Math.max(0, maxCourts - 1)}
                    className="input w-14 text-center py-1 text-sm"
                    value={teamCourtCount}
                    onChange={e => setTeamCourtCount(Math.max(0, Math.min(maxCourts - 1, Number(e.target.value))))}
                  />
                  <span className="text-xs text-gray-500">개</span>
                </div>
                <span className="text-[11px] text-gray-500">
                  {teamCourtCount > 0
                    ? `개인·복식 → 코트 1~${maxCourts - teamCourtCount}번 / 단체전 → 코트 ${maxCourts - teamCourtCount + 1}~${maxCourts}번 (겹침 없음)`
                    : '0 = 분리 안 함 (모든 코트 공용). 단체전·개인전이 겹치지 않게 하려면 전용 코트 수를 지정하세요.'}
                </span>
              </div>
            )}
          </div>

          {/* ③ 종목 및 인원 */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                <Users size={14} className="text-blue-500" /> ③ 종목 및 인원
              </h2>
              <p className="text-xs text-gray-400">인원 수 입력 시 라운드·경기 수 자동 계산</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left py-1.5 px-2 font-medium text-gray-600 border border-gray-200 text-xs w-16">부문</th>
                    {totalDays > 1 && (
                      <th className="text-center py-1.5 px-1 font-medium text-gray-600 border border-gray-200 text-xs" style={{minWidth: '110px'}}>진행 일차</th>
                    )}
                    <th className="text-center py-1.5 px-2 font-medium text-gray-600 border border-gray-200 text-xs w-24">대진방식</th>
                    {GRID_COLS.map(col => (
                      <th key={col.key} className="text-center py-1.5 px-1 font-medium text-gray-600 border border-gray-200 text-xs min-w-[60px]">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                  {/* 일괄입력 행 */}
                  <tr className="bg-amber-50">
                    <td className={`py-1 px-2 border border-amber-200 text-xs font-semibold text-amber-700 whitespace-nowrap${totalDays > 1 ? '' : ''}`}
                      colSpan={totalDays > 1 ? 3 : 2}>
                      ⚡ 일괄입력
                    </td>
                    {GRID_COLS.map(col => (
                      <td key={col.key} className="py-1 px-1 border border-amber-200 text-center">
                        <input
                          type="number" min="0" max="512"
                          placeholder="전체"
                          className="w-14 text-center text-xs border rounded px-1 py-1 border-amber-300 bg-white text-amber-700 placeholder-amber-300"
                          value={fillRow[col.key] ?? ''}
                          onChange={e => setFillRow(prev => ({ ...prev, [col.key]: e.target.value }))}
                          onBlur={() => applyFill(col.key)}
                          onKeyDown={e => { if (e.key === 'Enter') { applyFill(col.key); setFillRow(prev => ({ ...prev, [col.key]: '' })) } }}
                        />
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DIVISIONS.map(div => {
                    const row = grid[div]
                    const active = activeDivs[div]
                    const rowHasAny = GRID_COLS.some(c => (row.counts[c.key] ?? 0) >= 2)
                    return (
                      <tr key={div} className={!active ? 'bg-gray-50 opacity-50' : rowHasAny ? 'bg-blue-50/40' : ''}>
                        <td className="py-1 px-2 border border-gray-200">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={active}
                              onChange={() => toggleDiv(div)}
                              className="rounded accent-blue-600 cursor-pointer"
                              title={active ? '참가 (클릭 시 제외)' : '비참가 (클릭 시 포함)'}
                            />
                            <span className={`badge border text-xs ${divColors[div]}`}>{div}</span>
                          </label>
                        </td>
                        {totalDays > 1 && (
                          <td className="py-1 px-1 border border-gray-200">
                            <div className="flex items-center gap-0.5 justify-center">
                              <select
                                disabled={!active}
                                className="text-xs border border-gray-200 rounded px-1 py-1 bg-white w-12 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                value={row.dayStart}
                                onChange={e => setGridDayStart(div, Number(e.target.value))}
                              >
                                {dayConfigs.map(d => (
                                  <option key={d.day} value={d.day}>{d.day}일</option>
                                ))}
                              </select>
                              <span className="text-xs text-gray-400">~</span>
                              <select
                                disabled={!active}
                                className="text-xs border border-gray-200 rounded px-1 py-1 bg-white w-12 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                value={row.dayEnd}
                                onChange={e => setGridDayEnd(div, Number(e.target.value))}
                              >
                                {dayConfigs.map(d => (
                                  <option key={d.day} value={d.day}>{d.day}일</option>
                                ))}
                              </select>
                            </div>
                            {row.dayEnd > row.dayStart && (
                              <div className="text-[10px] text-center text-purple-600 mt-0.5">
                                예선→{row.dayStart}일 / 결승→{row.dayEnd}일
                              </div>
                            )}
                          </td>
                        )}
                        <td className="py-1 px-1.5 border border-gray-200">
                          <div className="flex flex-col gap-1">
                            <select disabled={!active} className="w-full text-xs border border-gray-200 rounded px-1 py-1 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
                              value={row.bracketFormat} onChange={e => setGridBracket(div, e.target.value as SmartBracketFormat)}>
                              {(Object.keys(BRACKET_LABELS) as SmartBracketFormat[]).map(k => (
                                <option key={k} value={k}>{BRACKET_LABELS[k]}</option>
                              ))}
                            </select>
                            {row.bracketFormat === 'seeded' && (
                              <select disabled={!active} className="w-full text-xs border border-purple-300 rounded px-1 py-1 bg-purple-50 text-purple-700 font-medium disabled:opacity-50"
                                value={row.seedCount ?? 4}
                                onChange={e => setGrid(prev => ({ ...prev, [div]: { ...prev[div], seedCount: Number(e.target.value) } }))}>
                                {[2, 4, 8, 16, 32].map(n => <option key={n} value={n}>시드 {n}명</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                        {GRID_COLS.map(col => {
                          const val = row.counts[col.key] ?? 0
                          return (
                            <td key={col.key} className="py-1 px-1 border border-gray-200 text-center">
                              <input type="number" min="0" max="512" disabled={!active}
                                className={`w-14 text-center text-sm border rounded px-1 py-1 disabled:bg-gray-100 disabled:cursor-not-allowed ${val >= 2 ? 'border-blue-300 bg-blue-50 font-medium text-blue-700' : 'border-gray-200 bg-white text-gray-300'}`}
                                value={val || ''} placeholder="—"
                                onChange={e => setGridCount(div, col.key, Number(e.target.value))}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td colSpan={totalDays > 1 ? 3 : 2} className="py-1.5 px-2 text-xs text-gray-500 border border-gray-200 font-medium">참가 부문</td>
                    {GRID_COLS.map(col => {
                      const cnt = DIVISIONS.reduce((s, div) => s + (activeDivs[div] && (grid[div].counts[col.key] ?? 0) >= 2 ? 1 : 0), 0)
                      return (
                        <td key={col.key} className="py-1.5 px-1 border border-gray-200 text-center">
                          {cnt > 0 && <span className="text-xs font-bold text-blue-600">{cnt}부문</span>}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              </table>
            </div>
            {smartEvents.length > 0 && (
              <div className="text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2 flex items-center gap-2">
                <span>총</span>
                <span className="font-bold text-blue-700">{smartEvents.length}개 종목</span>
                <span>·</span>
                <span className="font-bold text-blue-700">{smartEvents.reduce((s, e) => s + e.participantCount, 0)}명</span>
                <span>참가</span>
              </div>
            )}
          </div>

          {/* ④ 미리보기 */}
          {smartPreview && smartEvents.length > 0 && (
            <div className="card space-y-3">
              <h2 className="font-semibold text-gray-700 text-sm">📊 ④ 스마트 자동 배정 미리보기</h2>
              <div className="space-y-3">
                {smartPreview.map(dayPlan => {
                  const dayConfig = dayConfigs.find(d => d.day === dayPlan.day)
                  const courts = dayConfig?.courtCount ?? 1
                  const dayEstMin = Math.round(dayPlan.assignedMinutes / courts)   // 그날 예상 소요시간(벽시계)
                  const dayOpMin = dayConfig ? calcDayOperatingMinutes(dayConfig) : 0
                  const pct = dayPlan.capacityMinutes > 0 ? Math.min(100, Math.round(dayPlan.assignedMinutes / dayPlan.capacityMinutes * 100)) : 0
                  const over = dayPlan.assignedMinutes > dayPlan.capacityMinutes
                  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-400' : 'bg-green-500'
                  const textColor = over ? 'text-red-600' : pct >= 70 ? 'text-orange-600' : 'text-green-600'
                  const byEvent = new Map<string, typeof dayPlan.rounds>()
                  for (const r of dayPlan.rounds) {
                    byEvent.set(r.eventLabel, [...(byEvent.get(r.eventLabel) ?? []), r])
                  }
                  return (
                    <div key={dayPlan.day} className="border rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-purple-700 text-sm">{dayPlan.day}일차</span>
                          {dayConfig?.date && <span className="text-xs text-gray-400 ml-2">({dayConfig.date})</span>}
                          <span className="text-[10px] text-gray-400 ml-1.5">{courts}코트</span>
                        </div>
                        <span className={`text-sm font-bold ${textColor}`}>
                          소요 {fmtCourtHours(dayEstMin)} / 운영 {fmtCourtHours(dayOpMin)}{over && ' ⚠ 초과'}
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                      </div>
                      {dayPlan.rounds.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">배정된 라운드 없음</p>
                      ) : (
                        <div className="space-y-0.5">
                          {Array.from(byEvent.entries()).map(([evLabel, rounds]) => (
                            <div key={evLabel} className="text-xs text-gray-600">
                              <span className="font-medium text-gray-700">{evLabel}</span>
                              {' — '}
                              {rounds.map(r => `${r.roundName} (${r.matchCount}경기)`).join(', ')}
                            </div>
                          ))}
                        </div>
                      )}
                      {over && (
                        <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1.5 border border-red-200">
                          ⚠ 운영 시간({fmtCourtHours(dayOpMin)})을 초과합니다. 코트 수를 늘리면 소요 시간이 줄어듭니다.
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-2 pb-2">
            <button className="btn-primary flex-1 text-base" onClick={handleGenerate} disabled={!planName || smartEvents.length === 0}>
              📅 일정표 자동생성
            </button>
            <button className="btn-secondary" onClick={() => setView('list')}>취소</button>
          </div>
        </div>
      </div>
    )
  }

  // List view
  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Calendar size={20} className="text-purple-500" />경기 일정표
        </h1>
        <button onClick={() => setView('create')} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> 일정 생성
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {schedules.length === 0 ? (
          <div className="card text-center py-16">
            <Calendar size={48} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 mb-4">생성된 일정표가 없습니다</p>
            <button onClick={() => setView('create')} className="btn-primary">첫 일정표 만들기</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {schedules.map(s => (
              <div key={s.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSelectedId(s.id); setView('detail') }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{s.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">{s.date} · {formatTime12h(s.startTime)} 시작</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {s.days && s.days.length > 1 && (
                      <span className="badge bg-indigo-100 text-indigo-700">{s.days.length}일</span>
                    )}
                    <span className="badge bg-purple-100 text-purple-700">{s.slots.length}경기</span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {s.events.map(e => (
                    <span key={e.id} className={`badge border text-xs ${e.type && e.type !== 'match' ? 'bg-gray-100 text-gray-600 border-gray-200' : divColors[e.division]}`}>
                      {e.type && e.type !== 'match' ? e.label : `${e.division} ${e.eventType}`}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {s.slots.length > 0 ? `코트 ${Math.max(...s.slots.map(sl => sl.courtNo))}개` : '특별일정만'}
                  </span>
                  <button onClick={ev => { ev.stopPropagation(); deleteSchedule(s.id) }} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded">삭제</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ScheduleDetail({ plan: planProp, onBack }: { plan: SchedulePlan; onBack: () => void }) {
  const navigate = useNavigate()
  const { tournaments, updateTournament, updateSchedule, players, pairs, teams, schedules } = useStore()
  const plan = schedules.find(s => s.id === planProp.id) ?? planProp
  const [viewMode, setViewMode] = useState<'time' | 'court'>('time')
  const [activeDay, setActiveDay] = useState<number | null>(null)
  const [assignTourId, setAssignTourId] = useState<string>('')
  const [assignResult, setAssignResult] = useState<string | null>(null)
  const [assignTeamCourts, setAssignTeamCourts] = useState(0)  // 단체전 전용 코트 수(0=분리 안 함)
  const [showConflicts, setShowConflicts] = useState(false)
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)  // 인라인 편집 중인 슬롯
  const [draggingSlotId, setDraggingSlotId] = useState<string | null>(null)  // 드래그 중인 슬롯
  const [dragOverCourt, setDragOverCourt] = useState<number | null>(null)   // 드롭 대상 코트
  const [undoSlots, setUndoSlots] = useState<typeof plan.slots | null>(null)
  const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null)
  const [courtFilter, setCourtFilter] = useState<number | null>(null)       // 코트 필터
  const [slotSearch, setSlotSearch] = useState('')
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false)
  const [bulkShiftMin, setBulkShiftMin] = useState(10)
  const [popoverSlot, setPopoverSlot] = useState<typeof plan.slots[0] | null>(null)
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (!popoverSlot) return
    const close = () => setPopoverSlot(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPopoverSlot(null) }
    document.addEventListener('click', close)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey) }
  }, [popoverSlot])

  // 이 일정의 최대 코트 수(인라인 코트 이동 select 범위)
  const planMaxCourts = Math.max(1,
    ...(plan.days?.map(d => d.courtCount) ?? []),
    ...plan.events.filter(e => !e.type || e.type === 'match').map(e => e.courtCount),
    ...plan.slots.map(s => s.courtNo),
  )

  const days = [...new Set([
    ...plan.slots.map(s => s.day ?? 1),
    ...plan.events.map(e => e.day ?? 1),
  ])].sort()
  const hasMultipleDays = days.length > 1

  const dayFilteredSlots = activeDay !== null
    ? plan.slots.filter(s => (s.day ?? 1) === activeDay)
    : plan.slots
  const allCourtsInView = [...new Set(dayFilteredSlots.map(s => s.courtNo))].sort()

  const filteredSlots = dayFilteredSlots.filter(s => {
    if (courtFilter !== null && s.courtNo !== courtFilter) return false
    if (showUnassignedOnly && s.participant1 && s.participant2) return false
    if (slotSearch.trim()) {
      const q = slotSearch.trim().toLowerCase()
      return (s.participant1?.toLowerCase().includes(q) || s.participant2?.toLowerCase().includes(q) || s.eventType?.toLowerCase().includes(q) || s.division?.toLowerCase().includes(q))
    }
    return true
  })

  // 참가자별 오늘(현재 뷰) 경기 수 집계
  const participantMatchCount = new Map<string, number>()
  filteredSlots.forEach(s => {
    if (s.participant1) participantMatchCount.set(s.participant1, (participantMatchCount.get(s.participant1) ?? 0) + 1)
    if (s.participant2) participantMatchCount.set(s.participant2, (participantMatchCount.get(s.participant2) ?? 0) + 1)
  })

  const filteredCourts = [...new Set(filteredSlots.map(s => s.courtNo))].sort()
  const filteredTimes = [...new Set(filteredSlots.map(s => s.startTime))].sort()
  const byTime = filteredTimes.map(t => ({ time: t, slots: filteredSlots.filter(s => s.startTime === t) }))

  // 연결 대회의 완료 경기 키 세트 (eventId-matchNo)
  const completedMatchSet = useMemo(() => {
    const set = new Set<string>()
    const tour = tournaments.find(t => t.id === plan.linkedTournamentId)
    if (!tour) return set
    for (const ev of tour.events) {
      const assignable = ev.matches
        .filter(m => m.participant1Id && m.participant2Id && !m.isBye)
        .sort((a, b) => a.round !== b.round ? a.round - b.round : a.position - b.position)
      assignable.forEach((m, idx) => { if (m.result) set.add(`${ev.id}-${idx + 1}`) })
    }
    return set
  }, [plan.linkedTournamentId, tournaments])

  // 다일차 전체 보기: 일차별 섹션(인쇄 헤더용)
  const byDayTime = hasMultipleDays && activeDay === null
    ? days.map(day => {
        const dc = plan.days?.find(d => d.day === day)
        const daySlots = plan.slots.filter(s => (s.day ?? 1) === day)
        const times = [...new Set(daySlots.map(s => s.startTime))].sort()
        return {
          day,
          label: dc?.label ?? `${day}일차`,
          date: dc?.date ?? '',
          courts: [...new Set(daySlots.map(s => s.courtNo))].sort(),
          rows: times.map(t => ({ time: t, slots: daySlots.filter(s => s.startTime === t) })),
        }
      })
    : null

  // 일정 충돌 감지 (선수 동시간대 중복배정 / 연속경기 휴식부족)
  const { conflicts, conflictSlotIds } = useMemo(() => detectScheduleConflicts(filteredSlots), [filteredSlots])
  const overlapCount = conflicts.filter(c => c.type === 'overlap').length
  const restCount = conflicts.filter(c => c.type === 'rest').length

  const specialEvents = plan.events.filter(e =>
    e.type && e.type !== 'match' && (activeDay === null || (e.day ?? 1) === activeDay)
  )

  const endTime = plan.slots.reduce((latest, s) => s.endTime > latest ? s.endTime : latest, '')

  function exportScheduleCSV() {
    const rows = ['날짜,시작,종료,코트,부문,종목,선수1,선수2,라운드']
    for (const slot of filteredSlots) {
      rows.push([plan.date, slot.startTime, slot.endTime, `${slot.courtNo}번`, slot.division ?? '', slot.label, slot.participant1 ?? '', slot.participant2 ?? '', slot.round ?? ''].join(','))
    }
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `경기일정_${plan.name}_${plan.date}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const courtBadgeColor = (c: number) => {
    const map: Record<number, string> = { 1: 'bg-blue-500', 2: 'bg-green-500', 3: 'bg-orange-500', 4: 'bg-purple-500' }
    return map[c] ?? 'bg-gray-500'
  }
  const courtCardAccent = (c: number) => {
    const map: Record<number, string> = { 1: 'border-l-blue-400', 2: 'border-l-green-400', 3: 'border-l-amber-400', 4: 'border-l-rose-400' }
    return `border-l-[3px] ${map[c] ?? 'border-l-purple-400'}`
  }

  const slotEventColors = (slot: ScheduleSlot) => {
    if (slot.type && slot.type !== 'match') return eventColors[slot.type] ?? 'bg-gray-400'
    return eventColors[slot.eventType] ?? 'bg-gray-400'
  }

  function resolveParticipantName(id: string | null, eventType: string): string {
    if (!id || id.startsWith('ko-slot-')) return '미정'
    if (eventType === '복식' || eventType === '혼합복식') {
      const pair = pairs.find(p => p.id === id)
      if (pair) {
        const p1 = players.find(p => p.id === pair.player1Id)
        const p2 = players.find(p => p.id === pair.player2Id)
        return `${p1?.name ?? '?'}/${p2?.name ?? '?'}`
      }
    }
    return players.find(p => p.id === id)?.name ?? id
  }

  function handleAssignTimes() {
    if (!assignTourId) return
    const tour = tournaments.find(t => t.id === assignTourId)
    if (!tour) return

    // 일정 설정에서 코트·시작시간·경기시간 도출
    const matchCfgs = plan.events.filter(e => !e.type || e.type === 'match')
    const hhmmToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    // 다일차 운영창(plan.days) → 스케줄러 days. 구버전 plan(days 없음)은 단일 타임라인 유지.
    const schedDays = plan.days && plan.days.length > 1
      ? plan.days.map(d => ({ startMin: hhmmToMin(d.startTime), endMin: hhmmToMin(d.endTime), courts: d.courtCount }))
      : undefined
    const courts = schedDays
      ? Math.max(1, ...plan.days!.map(d => d.courtCount))
      : Math.max(1, ...matchCfgs.map(e => e.courtCount), 1)
    const startMin = plan.days?.[0] ? hhmmToMin(plan.days[0].startTime) : hhmmToMin(plan.startTime)
    const indivMin = matchCfgs.find(e => e.eventType !== '단체전')?.minutesPerMatch ?? 25
    const teamMin = matchCfgs.find(e => e.eventType === '단체전')?.minutesPerMatch ?? 120
    const buffer = matchCfgs[0]?.bufferMinutes ?? 0

    // 단체전 전용 코트 분리: 단체전→뒤쪽 코트, 개인/복식→앞쪽 코트 (긴 단체전이 개인전 코트 막지 않게)
    const teamSplit = assignTeamCourts > 0 ? Math.max(1, courts - assignTeamCourts) : 0
    const evInputs = tour.events.map(ev => {
      const base = { id: ev.id, eventType: ev.eventType, matches: ev.matches }
      if (teamSplit > 0) {
        return ev.eventType === '단체전'
          ? { ...base, preferredCourtStart: teamSplit + 1, preferredCourtEnd: courts }
          : { ...base, preferredCourtStart: 1, preferredCourtEnd: teamSplit }
      }
      return base
    })

    // 대진 의존성 기반 병렬 스케줄링 (이전 라운드 종료→다음 시작, 조별→본선, 선수충돌·휴식)
    // days 지정 시 하루 운영시간 초과분은 다음 날로 자동 분할.
    const sched = scheduleTournamentMatches({
      events: evInputs,
      courts, startMinutes: startMin, individualMin: indivMin, teamMin, bufferMin: buffer, restMin: buffer,
      pairs, teams, days: schedDays,
    })
    console.log('[ASSIGN] sched', { matches: sched.matches.length, courts, startMin, days: schedDays?.length ?? 1, usedDays: sched.usedDays })
    if (sched.matches.length === 0) { setAssignResult('배치할 경기가 없습니다.'); return }

    const minToTime = (mm: number) => `${String(Math.floor(mm / 60) % 24).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`
    const evOf = new Map(tour.events.flatMap(ev => ev.matches.map(m => [m.id, ev])))

    // 스케줄 결과 → 일정 슬롯 (실시간·코트·선수)
    const newSlots: ScheduleSlot[] = sched.matches.map((s, i) => {
      const ev = evOf.get(s.matchId)!
      const m = ev.matches.find(x => x.id === s.matchId)!
      return {
        id: genId(), eventId: ev.id, label: ev.label, division: ev.division, eventType: ev.eventType, gender: ev.gender,
        courtNo: s.courtNo, startTime: minToTime(s.startMin), endTime: minToTime(s.endMin), matchNo: i + 1,
        participant1: resolveParticipantName(m.participant1Id, ev.eventType),
        participant2: resolveParticipantName(m.participant2Id, ev.eventType),
        round: `${m.round}라운드`, day: s.day, type: 'match' as const,
      }
    })

    // 토너먼트 브래킷에도 시간·테이블 기록
    const schedMap = new Map(sched.matches.map(s => [s.matchId, s]))
    const newEvents = tour.events.map(ev => ({
      ...ev,
      matches: ev.matches.map(m => {
        const s = schedMap.get(m.id)
        return s ? { ...m, scheduledTime: minToTime(s.startMin), tableNo: s.courtNo } : m
      })
    }))
    updateTournament(assignTourId, { events: newEvents })
    updateSchedule(plan.id, { slots: newSlots, linkedTournamentId: assignTourId })

    const pct = Math.round(sched.utilization * 100)
    if (sched.usedDays > 1) {
      setAssignResult(`${sched.matches.length}경기 병렬배치 · ${sched.usedDays}일 일정 (마지막날 ${minToTime(sched.makespanMin)} 종료) · 코트 ${courts}개 가동률 ${pct}%`)
    } else {
      const mk = sched.makespanMin - startMin
      const hh = Math.floor(mk / 60), mmn = mk % 60
      setAssignResult(`${sched.matches.length}경기 병렬배치 · 총 ${hh}시간${mmn ? ` ${mmn}분` : ''} · 코트 ${courts}개 가동률 ${pct}%`)
    }
  }

  // 경기 지연 → 같은 코트 후속 자동 밀림(버퍼 유지). 현장 운영 중 지연 대응.
  function handleDelaySlot(slotId: string, delayMin: number) {
    const buffer = plan.events.find(e => !e.type || e.type === 'match')?.bufferMinutes ?? 0
    updateSchedule(plan.id, { slots: shiftSlotsAfterDelay(plan.slots, slotId, delayMin, buffer) })
  }

  // 슬롯 시작시간/코트 인라인 수정 → 영향 코트 재정렬(겹침 자동 해소).
  function handleMoveSlot(slotId: string, patch: { startTime?: string; courtNo?: number }) {
    const buffer = plan.events.find(e => !e.type || e.type === 'match')?.bufferMinutes ?? 0
    setUndoSlots(plan.slots)
    if (undoTimer) clearTimeout(undoTimer)
    setUndoTimer(setTimeout(() => setUndoSlots(null), 5000))
    const moved = moveScheduleSlot(plan.slots, slotId, patch, buffer)
    updateSchedule(plan.id, { slots: moved.map(s => s.id === slotId ? { ...s, updatedAt: new Date().toISOString() } : s) })
  }
  function handleUndo() {
    if (!undoSlots) return
    updateSchedule(plan.id, { slots: undoSlots })
    setUndoSlots(null)
    if (undoTimer) clearTimeout(undoTimer)
    setUndoTimer(null)
  }
  function handleUpdateSlotNote(slotId: string, note: string) {
    updateSchedule(plan.id, { slots: plan.slots.map(s => s.id === slotId ? { ...s, note: note || undefined } : s) })
  }
  function handleBulkShift(deltaMin: number) {
    const t2m = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const m2t = (mm: number) => `${String(Math.floor(Math.abs(mm) / 60) % 24).padStart(2, '0')}:${String(Math.abs(mm) % 60).padStart(2, '0')}`
    setUndoSlots(plan.slots)
    const shifted = plan.slots.map(s => ({
      ...s,
      startTime: m2t(Math.max(0, t2m(s.startTime) + deltaMin)),
      endTime: m2t(Math.max(0, t2m(s.endTime) + deltaMin)),
    }))
    updateSchedule(plan.id, { slots: shifted })
    if (undoTimer) clearTimeout(undoTimer)
    setUndoTimer(setTimeout(() => { setUndoSlots(null); setUndoTimer(null) }, 8000))
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between gap-3 no-print">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 flex-shrink-0">
            <ChevronLeft size={13} /> 목록
          </button>
          <div className="min-w-0">
            <h1 className="font-bold text-base truncate leading-tight">{plan.name}</h1>
            <p className="text-xs text-gray-400">{plan.date} · {formatTime12h(plan.startTime)} ~ {formatTime12h(endTime)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasMultipleDays && (
            <div className="flex gap-1 mr-1">
              <button onClick={() => { setActiveDay(null); setCourtFilter(null) }} className={`px-2 py-1 rounded text-xs font-medium ${activeDay === null ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>전체</button>
              {days.map(d => (
                <button key={d} onClick={() => { setActiveDay(d); setCourtFilter(null) }} className={`px-2 py-1 rounded text-xs font-medium ${activeDay === d ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{d}일차</button>
              ))}
            </div>
          )}
          {allCourtsInView.length > 1 && (
            <select
              value={courtFilter ?? ''}
              onChange={e => setCourtFilter(e.target.value === '' ? null : Number(e.target.value))}
              className="select text-xs py-1 px-2 mr-1"
            >
              <option value="">전체 코트</option>
              {allCourtsInView.map(c => <option key={c} value={c}>코트 {c}</option>)}
            </select>
          )}
          <div className="relative flex-shrink-0">
            <input type="text" value={slotSearch} onChange={e => setSlotSearch(e.target.value)}
              placeholder="선수·종목 검색" className="text-xs border border-gray-200 rounded-lg px-2 py-1 pr-5 bg-white w-32" />
            {slotSearch && <button onClick={() => setSlotSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[10px]">✕</button>}
          </div>
          <label className="flex items-center gap-1 text-[11px] text-gray-600 cursor-pointer select-none flex-shrink-0">
            <input type="checkbox" checked={showUnassignedOnly} onChange={e => setShowUnassignedOnly(e.target.checked)} className="rounded" />
            미배정만
          </label>
          {undoSlots && (
            <button onClick={handleUndo}
              className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1 text-orange-600 border-orange-300 bg-orange-50 hover:bg-orange-100 animate-pulse">
              ↩ 실행취소
            </button>
          )}
          <button
            onClick={() => {
              const sorted = [...plan.slots].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.courtNo - b.courtNo)
              updateSchedule(plan.id, { slots: sorted })
            }}
            className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"
            title="모든 슬롯을 시작 시간 오름차순으로 정렬">
            ↕ 정렬
          </button>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => handleBulkShift(-bulkShiftMin)}
              className="text-xs px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 font-mono">-{bulkShiftMin}분</button>
            <input type="number" min={1} max={120} value={bulkShiftMin}
              onChange={e => setBulkShiftMin(Math.max(1, Number(e.target.value)))}
              className="w-10 text-center text-xs border border-gray-200 rounded px-1 py-0.5 bg-white"
              title="일괄 이동 분" />
            <button onClick={() => handleBulkShift(bulkShiftMin)}
              className="text-xs px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 font-mono">+{bulkShiftMin}분</button>
          </div>
          <button onClick={() => setViewMode('time')} className={`px-2.5 py-1 rounded text-xs font-medium ${viewMode === 'time' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>시간순</button>
          <button onClick={() => setViewMode('court')} className={`px-2.5 py-1 rounded text-xs font-medium ${viewMode === 'court' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>코트순</button>
          <button onClick={exportScheduleCSV} className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"><Download size={12} /> CSV</button>
          <button onClick={() => window.print()} className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"><Printer size={12} /> 인쇄</button>
          <button onClick={() => { setViewMode('court'); setTimeout(() => window.print(), 100) }}
            className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1" title="코트마다 한 페이지씩 인쇄(현장 배부용)"><Printer size={12} /> 코트별</button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-6 no-print">
        <StatMini label="총 경기" value={`${filteredSlots.length}경기`} />
        <StatMini label="코트 수" value={`${filteredCourts.length}개`} />
        <StatMini label="종목 수" value={`${plan.events.length}개`} />
        <StatMini label="예상 종료" value={formatTime12h(endTime) || '-'} />
        {(() => {
          const unassigned = filteredSlots.filter(s => !s.participant1 || !s.participant2).length
          if (unassigned === 0) return null
          return (
            <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full flex-shrink-0">
              미배정 {unassigned}
            </span>
          )
        })()}
        {(() => {
          if (filteredSlots.length < 2) return null
          const toMins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
          const earliest = filteredSlots.reduce((min, s) => s.startTime < min ? s.startTime : min, filteredSlots[0].startTime)
          const latest = filteredSlots.reduce((max, s) => (s.endTime ?? '') > max ? (s.endTime ?? '') : max, '')
          if (!earliest || !latest) return null
          const totalMin = toMins(latest) - toMins(earliest)
          if (totalMin <= 0) return null
          const h = Math.floor(totalMin / 60), m = totalMin % 60
          return (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
              총 {h > 0 ? `${h}시간 ` : ''}{m > 0 ? `${m}분` : ''}
            </span>
          )
        })()}
        {filteredSlots.length > 0 && (() => {
          const doneCount = filteredSlots.filter(s => completedMatchSet.has(`${s.eventId}-${s.matchNo}`)).length
          if (doneCount === 0 && completedMatchSet.size === 0) return null
          const total = filteredSlots.length
          const pct = Math.round(doneCount / total * 100)
          return (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${pct === 100 ? 'bg-green-100 text-green-700' : doneCount > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
              완료 {doneCount}/{total} ({pct}%)
            </span>
          )
        })()}
        {filteredSlots.length >= 2 && (() => {
          const slotsWithTime = filteredSlots.filter(s => s.startTime).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
          if (slotsWithTime.length < 2) return null
          const last = slotsWithTime[slotsWithTime.length - 1]
          const [h, m] = (last.startTime ?? '').split(':').map(Number)
          if (isNaN(h) || isNaN(m)) return null
          const endMin = h * 60 + m + 30
          const endH = Math.floor(endMin / 60) % 24
          const endM = endMin % 60
          const timeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`
          return (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 flex-shrink-0">
              완료 예상 {timeStr}
            </span>
          )
        })()}
        {conflicts.length === 0 ? (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> 충돌 없음
          </span>
        ) : (
          <button onClick={() => setShowConflicts(v => !v)}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700">
            <AlertTriangle size={13} />
            {overlapCount > 0 && <span>중복배정 {overlapCount}</span>}
            {restCount > 0 && <span className="text-amber-600">휴식부족 {restCount}</span>}
            <ChevronDown size={12} className={`transition-transform ${showConflicts ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* 부문 색상 범례 */}
      {(() => {
        const usedDivs = [...new Set(filteredSlots.map(s => s.division).filter(Boolean))] as Division[]
        if (usedDivs.length < 2) return null
        return (
          <div className="flex-shrink-0 bg-gray-50 border-b border-gray-100 px-4 py-1.5 flex items-center gap-2 flex-wrap no-print">
            <span className="text-[10px] text-gray-400 font-medium">부문</span>
            {usedDivs.map(div => (
              <span key={div} className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${divColors[div]}`}>{div}</span>
            ))}
          </div>
        )
      })()}

      {/* 종목 타입 색상 범례 + 슬롯 수 통계 */}
      {(() => {
        const usedTypes = [...new Set(filteredSlots.map(s => s.type && s.type !== 'match' ? s.type : s.eventType).filter(Boolean))]
        if (usedTypes.length < 2) return null
        return (
          <div className="flex-shrink-0 bg-gray-50 border-b border-gray-100 px-4 py-1.5 flex items-center gap-2 flex-wrap no-print">
            <span className="text-[10px] text-gray-400 font-medium">종목</span>
            {usedTypes.map(t => {
              const cnt = filteredSlots.filter(s => (s.type && s.type !== 'match' ? s.type : s.eventType) === t).length
              return (
                <span key={t} className="flex items-center gap-1 text-[10px] text-gray-600">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${eventColors[t] ?? 'bg-gray-400'}`} />
                  {t}<span className="text-gray-400 ml-0.5">({cnt})</span>
                </span>
              )
            })}
          </div>
        )
      })()}

      {/* 충돌 경고 패널 */}
      {conflicts.length > 0 && showConflicts && (
        <div className="flex-shrink-0 bg-red-50 border-b border-red-100 px-4 py-2.5 max-h-44 overflow-y-auto no-print">
          <div className="space-y-1">
            {conflicts.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {c.type === 'overlap'
                  ? <AlertTriangle size={12} className="text-red-500 flex-shrink-0" />
                  : <Coffee size={12} className="text-amber-500 flex-shrink-0" />}
                <span className="font-bold text-gray-800 w-24 truncate">{c.participant}</span>
                {hasMultipleDays && <span className="text-gray-400">{c.day}일차</span>}
                {c.type === 'overlap' ? (
                  <span className="text-red-600">
                    동시간 중복 — 코트{c.slotA.courtNo}({formatTime12h(c.slotA.startTime)}) ⟷ 코트{c.slotB.courtNo}({formatTime12h(c.slotB.startTime)})
                  </span>
                ) : (
                  <span className="text-amber-700">
                    휴식 {c.gapMinutes}분 — 코트{c.slotA.courtNo}({formatTime12h(c.slotA.endTime)} 종료) → 코트{c.slotB.courtNo}({formatTime12h(c.slotB.startTime)} 시작)
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Left sidebar */}
        <div className="w-52 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto no-print">
          {/* Legend */}
          <div className="p-3 border-b border-gray-100">
            <h4 className="text-xs font-semibold text-gray-500 mb-2">종목 범례</h4>
            <div className="space-y-1.5">
              {plan.events.filter(e => !e.type || e.type === 'match').map(e => (
                <div key={e.id} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${eventColors[e.eventType] ?? 'bg-gray-400'}`} />
                  <span className={`badge border text-[10px] ${divColors[e.division]}`}>{e.division} {e.eventType}({e.gender})</span>
                  <span className="text-[10px] text-gray-400 ml-auto">{e.minutesPerMatch}분</span>
                </div>
              ))}
            </div>
          </div>

          {/* Special events */}
          {specialEvents.length > 0 && (
            <div className="p-3 border-b border-gray-100">
              <h4 className="text-xs font-semibold text-gray-500 mb-2">특별 일정</h4>
              <div className="space-y-1">
                {specialEvents.map(e => (
                  <div key={e.id} className="flex items-center gap-1.5 bg-gray-50 rounded px-2 py-1">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${eventColors[e.type ?? 'break']}`} />
                    <span className="text-xs">{e.label}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">{e.minutesPerMatch}분</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assign to tournament */}
          {tournaments.length > 0 && (
            <div className="p-3">
              <h4 className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
                <Link size={11} /> 대회 병렬 시간표 자동생성
              </h4>
              <select className="select text-xs w-full mb-2" value={assignTourId}
                onChange={e => { setAssignTourId(e.target.value); setAssignResult(null) }}>
                <option value="">대회 선택...</option>
                {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {tournaments.find(t => t.id === assignTourId)?.events.some(e => e.eventType === '단체전') && (
                <label className="flex items-center gap-1.5 mb-2 text-[11px] text-gray-600">
                  <Building2 size={11} className="text-gray-400" /> 단체전 전용 코트
                  <input type="number" min="0" max="20" value={assignTeamCourts}
                    onChange={e => { setAssignTeamCourts(Math.max(0, Number(e.target.value) || 0)); setAssignResult(null) }}
                    className="input py-0.5 px-1 text-xs w-12 text-center" />
                  <span className="text-gray-400">개 (뒤쪽 코트 분리, 0=안 함)</span>
                </label>
              )}
              <button className="btn-primary w-full text-xs py-1.5 flex items-center justify-center gap-1"
                onClick={handleAssignTimes} disabled={!assignTourId}>
                <Clock size={11} /> 병렬 시간표 생성
              </button>
              <p className="text-[10px] text-gray-400 mt-1">라운드 의존·선수충돌·휴식을 지키며 코트를 최대 병렬로 배치</p>
              {assignResult && <p className="text-xs text-green-600 mt-1.5">{assignResult}</p>}
            </div>
          )}
        </div>

        {/* Print-only header */}
        <div className="hidden print:block px-4 py-3 border-b border-gray-200 mb-2">
          <div className="text-lg font-bold text-gray-900">{plan.name}</div>
          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-3">
            <span>코트 {[...new Set(plan.slots.map(s => s.courtNo))].sort().join(', ')}번</span>
            <span>|</span>
            <span>슬롯 {plan.slots.length}개</span>
            <span>|</span>
            <span>출력일: {new Date().toLocaleDateString('ko-KR')}</span>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-auto p-3">
          {viewMode === 'time' && (
            byDayTime ? (
              /* 다일차 전체 보기: 일차별 분리 테이블 */
              <div className="space-y-4">
                {byDayTime.map(({ day, label, date, courts, rows }) => (
                  <div key={day} className="schedule-day-section">
                    <div className="schedule-day-header sticky top-0 z-20 flex items-center gap-3 bg-purple-700 text-white px-4 py-2 rounded-t-lg">
                      <span className="font-bold text-sm">{label}</span>
                      {date && <span className="text-purple-200 text-xs">{date}</span>}
                      <span className="text-purple-200 text-xs ml-auto">{rows.reduce((s, r) => s + r.slots.length, 0)}경기</span>
                    </div>
                    <table className="text-sm border-collapse w-full">
                      <thead>
                        <tr>
                          <th className="py-2 px-3 text-left font-semibold text-gray-600 w-24 border border-gray-200 bg-gray-100 whitespace-nowrap">시간</th>
                          {courts.map(c => (
                            <th key={c} className="py-2 px-2 text-center font-semibold text-gray-600 min-w-[120px] border border-gray-200 bg-gray-100 whitespace-nowrap">
                              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold mr-1 ${courtBadgeColor(c)}`}>{c}</span>코트
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ time, slots }) => (
                          <tr key={time}>
                            <td className="py-2 px-3 font-mono text-xs text-blue-700 font-semibold align-top border border-gray-200 whitespace-nowrap bg-blue-50">{formatTime12h(time)}</td>
                            {courts.map(c => {
                              const slot = slots.find(s => s.courtNo === c)
                              if (!slot) return <td key={c} className="py-2 px-2 border border-gray-100 bg-white" />
                              return (
                                <td key={c} className="py-1.5 px-2 border border-gray-100">
                                  {(() => { const isDone = completedMatchSet.has(`${slot.eventId}-${slot.matchNo}`); return (
                                  <div className={`rounded p-1.5 border cursor-pointer hover:brightness-95 transition-all ${divColors[slot.division]} ${courtCardAccent(slot.courtNo)} ${conflictSlotIds.has(slot.id) ? 'ring-2 ring-red-400' : ''} ${isDone ? 'opacity-60' : ''} ${(!slot.participant1 || !slot.participant2) ? 'border-dashed opacity-70' : ''}`}
                                    onClick={e => { e.stopPropagation(); const px = Math.min(e.clientX + 8, window.innerWidth - 210); const py = Math.min(e.clientY + 8, window.innerHeight - 160); setPopoverPos({ x: px, y: py }); setPopoverSlot(slot) }}>
                                    <div className="flex items-center gap-1 mb-0.5">
                                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slotEventColors(slot)}`} />
                                      <span className={`font-semibold text-[11px] ${isDone ? 'line-through text-gray-400' : ''}`}>{slot.division} {slot.eventType}</span>
                                      {isDone ? <span className="text-[9px] text-green-600 font-bold ml-auto">✓완료</span> : <span className="text-[10px] text-gray-400 ml-auto">#{slot.matchNo}</span>}
                                    </div>
                                    {slot.participant1 && slot.participant2 ? (
                                      <div className="mt-0.5 space-y-0.5">
                                        <div className="text-[12px] font-bold text-gray-800 truncate flex items-baseline gap-0.5">{slot.participant1}{(participantMatchCount.get(slot.participant1) ?? 0) > 1 && <span className="text-[9px] text-orange-500 font-normal flex-shrink-0">{participantMatchCount.get(slot.participant1)}경기</span>}</div>
                                        <div className="text-[10px] text-gray-400 text-center leading-none">vs</div>
                                        <div className="text-[12px] font-bold text-gray-800 truncate flex items-baseline gap-0.5">{slot.participant2}{(participantMatchCount.get(slot.participant2) ?? 0) > 1 && <span className="text-[9px] text-orange-500 font-normal flex-shrink-0">{participantMatchCount.get(slot.participant2)}경기</span>}</div>
                                      </div>
                                    ) : (
                                      <div className="text-[10px] text-gray-400 mt-0.5">{slot.gender} · 미배정</div>
                                    )}
                                    <div className="text-[10px] text-gray-400 mt-0.5">{formatTime12h(slot.startTime)}~{formatTime12h(slot.endTime)}</div>
                                  </div>
                                  )})()}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ) : (
            <table className="text-sm border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 text-left font-semibold text-gray-600 w-24 border border-gray-200 bg-gray-100 whitespace-nowrap">시간</th>
                  {filteredCourts.map(c => (
                    <th key={c} className="py-2 px-2 text-center font-semibold text-gray-600 min-w-[120px] border border-gray-200 bg-gray-100 whitespace-nowrap">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold mr-1 ${courtBadgeColor(c)}`}>{c}</span>코트
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byTime.map(({ time, slots }) => (
                  <tr key={time}>
                    <td className="py-2 px-3 font-mono text-xs text-blue-700 font-semibold align-top border border-gray-200 whitespace-nowrap bg-blue-50">{formatTime12h(time)}</td>
                    {filteredCourts.map(c => {
                      const slot = slots.find(s => s.courtNo === c)
                      if (!slot) return <td key={c} className="py-2 px-2 border border-gray-100 bg-white" />
                      return (
                        <td key={c} className="py-1.5 px-2 border border-gray-100">
                          {(() => { const isDone = completedMatchSet.has(`${slot.eventId}-${slot.matchNo}`); return (
                          <div className={`rounded p-1.5 border cursor-pointer hover:brightness-95 transition-all ${divColors[slot.division]} ${courtCardAccent(slot.courtNo)} ${conflictSlotIds.has(slot.id) ? 'ring-2 ring-red-400' : ''} ${isDone ? 'opacity-60' : ''} ${(!slot.participant1 || !slot.participant2) ? 'border-dashed opacity-70' : ''}`}
                            onClick={e => { e.stopPropagation(); const px = Math.min(e.clientX + 8, window.innerWidth - 210); const py = Math.min(e.clientY + 8, window.innerHeight - 160); setPopoverPos({ x: px, y: py }); setPopoverSlot(slot) }}>
                            <div className="flex items-center gap-1 mb-0.5">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slotEventColors(slot)}`} />
                              <span className={`font-semibold text-[11px] ${isDone ? 'line-through text-gray-400' : ''}`}>{slot.division} {slot.eventType}</span>
                              {isDone ? <span className="text-[9px] text-green-600 font-bold ml-auto">✓완료</span> : <span className="text-[10px] text-gray-400 ml-auto">#{slot.matchNo}</span>}
                            </div>
                            {slot.participant1 && slot.participant2 ? (
                              <div className="mt-0.5 space-y-0.5">
                                <div className="text-[12px] font-bold text-gray-800 truncate flex items-baseline gap-0.5">{slot.participant1}{(participantMatchCount.get(slot.participant1) ?? 0) > 1 && <span className="text-[9px] text-orange-500 font-normal flex-shrink-0">{participantMatchCount.get(slot.participant1)}경기</span>}</div>
                                <div className="text-[10px] text-gray-400 text-center leading-none">vs</div>
                                <div className="text-[12px] font-bold text-gray-800 truncate flex items-baseline gap-0.5">{slot.participant2}{(participantMatchCount.get(slot.participant2) ?? 0) > 1 && <span className="text-[9px] text-orange-500 font-normal flex-shrink-0">{participantMatchCount.get(slot.participant2)}경기</span>}</div>
                              </div>
                            ) : (
                              <div className="text-[10px] text-gray-400 mt-0.5">{slot.gender} · 미배정</div>
                            )}
                            <div className="text-[10px] text-gray-400 mt-0.5">{formatTime12h(slot.startTime)}~{formatTime12h(slot.endTime)}</div>
                          </div>
                          )})()}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            )
          )}

          {viewMode === 'court' && (
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 court-print">
              {filteredCourts.map(c => {
                const courtSlots = filteredSlots.filter(s => s.courtNo === c).sort((a, b) => a.startTime.localeCompare(b.startTime))
                return (
                  <div key={c}
                    className={`card transition-colors ${dragOverCourt === c && draggingSlotId ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`}
                    onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverCourt(c) }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCourt(null) }}
                    onDrop={e => { e.preventDefault(); const sid = draggingSlotId || e.dataTransfer.getData('slotId'); if (sid) { handleMoveSlot(sid, { courtNo: c }); setDraggingSlotId(null); setDragOverCourt(null) } }}
                  >
                    <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2 text-sm flex-wrap">
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-[10px] font-bold flex-shrink-0 ${courtBadgeColor(c)}`}>{c}</span>
                      코트
                      {(() => {
                        const done = courtSlots.filter(s => completedMatchSet.has(`${s.eventId}-${s.matchNo}`)).length
                        const unassigned = courtSlots.filter(s => !s.participant1 || !s.participant2).length
                        return (
                          <span className="flex items-center gap-1 ml-auto font-normal">
                            <span className="text-[10px] text-gray-400">{courtSlots.length}경기</span>
                            {done > 0 && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">완료 {done}</span>}
                            {unassigned > 0 && <span className="text-[9px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">미배정 {unassigned}</span>}
                          </span>
                        )
                      })()}
                    </h3>
                    {courtSlots.length >= 2 && (() => {
                      const doneN = courtSlots.filter(s => completedMatchSet.has(`${s.eventId}-${s.matchNo}`)).length
                      const pct = Math.round(doneN / courtSlots.length * 100)
                      return (
                        <div className="mb-2">
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                          {pct > 0 && <div className="text-right text-[9px] text-gray-400 mt-0.5">{doneN}/{courtSlots.length} ({pct}%)</div>}
                        </div>
                      )
                    })()}
                    <div className="space-y-1.5">
                      {courtSlots.map((slot, si) => { const isDone = completedMatchSet.has(`${slot.eventId}-${slot.matchNo}`);
                        const toMins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
                        const gapMin = si > 0 && courtSlots[si - 1].endTime ? toMins(slot.startTime) - toMins(courtSlots[si - 1].endTime) : 0
                        return (
                        <div key={slot.id}>
                        {gapMin >= 60 ? (
                          <div className="text-center py-0.5 mb-1">
                            <span className="text-[9px] text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full font-semibold">⚠ 빈 시간대 {gapMin}분</span>
                          </div>
                        ) : gapMin >= 30 ? (
                          <div className="text-center py-0.5 mb-1">
                            <span className="text-[9px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">휴식 {gapMin}분</span>
                          </div>
                        ) : null}
                        <div
                          className={`p-1.5 rounded border ${divColors[slot.division]} ${courtCardAccent(slot.courtNo)} ${conflictSlotIds.has(slot.id) ? 'ring-2 ring-red-400' : ''} ${(!slot.type || slot.type === 'match') ? 'cursor-grab active:cursor-grabbing' : ''} ${draggingSlotId === slot.id ? 'opacity-50' : ''} ${isDone ? 'opacity-60' : ''} ${(!slot.participant1 || !slot.participant2) ? 'border-dashed opacity-70' : ''}`}
                          draggable={!slot.type || slot.type === 'match'}
                          onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('slotId', slot.id); setDraggingSlotId(slot.id); setEditingSlotId(null) }}
                          onDragEnd={() => { setDraggingSlotId(null); setDragOverCourt(null) }}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slotEventColors(slot)}`} />
                            <span className="font-mono text-[11px] text-blue-700 font-semibold">{formatTime12h(slot.startTime)}</span>
                            <span className="text-[10px] text-gray-400">~{formatTime12h(slot.endTime)}</span>
                            {isDone ? <span className="text-[9px] text-green-600 font-bold ml-auto">✓완료</span> : <span className="text-[10px] text-gray-500 ml-auto">{slot.division} {slot.eventType} #{slot.matchNo}</span>}
                            {slot.note && <span className="text-[9px] text-amber-600 ml-0.5 flex-shrink-0" title={slot.note}>✎</span>}
                          </div>
                          {slot.participant1 && slot.participant2 ? (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[12px] font-bold text-gray-800 truncate flex-1">{slot.participant1}</span>
                              <span className="text-[10px] text-gray-400 flex-shrink-0">vs</span>
                              <span className="text-[12px] font-bold text-gray-800 truncate flex-1 text-right">{slot.participant2}</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-gray-400">{slot.gender} · 미배정</div>
                          )}
                          {(!slot.type || slot.type === 'match') && (
                            <div className="mt-1 no-print">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-gray-400">지연</span>
                                {[10, 30].map(d => (
                                  <button key={d} onClick={() => handleDelaySlot(slot.id, d)}
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 font-medium"
                                    title={`이 경기 +${d}분 지연 → 같은 코트 후속 자동 밀림`}>+{d}분</button>
                                ))}
                                <button onClick={() => setEditingSlotId(editingSlotId === slot.id ? null : slot.id)}
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ml-auto ${editingSlotId === slot.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                  title="시작시간·코트 직접 수정">
                                  <Pencil size={9} /> 편집
                                </button>
                              </div>
                              {editingSlotId === slot.id && (
                                <div className="flex items-center gap-1.5 mt-1 p-1.5 rounded bg-blue-50 border border-blue-200">
                                  <input type="time" value={slot.startTime}
                                    onChange={e => e.target.value && handleMoveSlot(slot.id, { startTime: e.target.value })}
                                    className="input py-0.5 px-1 text-[11px] w-24" />
                                  <select value={slot.courtNo}
                                    onChange={e => handleMoveSlot(slot.id, { courtNo: Number(e.target.value) })}
                                    className="select py-0.5 px-1 text-[11px] w-16">
                                    {Array.from({ length: planMaxCourts }, (_, i) => i + 1).map(c => (
                                      <option key={c} value={c}>코트{c}</option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        </div>
                      )})}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {filteredSlots.length === 0 && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              <div className="text-center">
                <Calendar size={40} className="mx-auto mb-2 opacity-30" />
                <p>이 날의 배정된 경기가 없습니다</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 슬롯 상세 팝오버 */}
      {popoverSlot && (
        <div className="fixed z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-sm min-w-[190px] max-w-[240px] no-print"
          style={{ left: popoverPos.x, top: popoverPos.y }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${divColors[popoverSlot.division]}`}>{popoverSlot.division} {popoverSlot.eventType}</span>
            <button onClick={() => setPopoverSlot(null)} className="text-gray-400 hover:text-gray-600 ml-1"><X size={13} /></button>
          </div>
          {popoverSlot.participant1 && popoverSlot.participant2 ? (
            <div className="space-y-0.5 mb-2">
              <div className="font-bold text-gray-800 text-sm">{popoverSlot.participant1}</div>
              <div className="text-[10px] text-gray-400 text-center">vs</div>
              <div className="font-bold text-gray-800 text-sm">{popoverSlot.participant2}</div>
            </div>
          ) : (
            <div className="text-xs text-gray-400 mb-2">{popoverSlot.gender} · 미배정</div>
          )}
          <div className="space-y-0.5 text-xs text-gray-500">
            <div className="flex justify-between"><span>코트</span><span className="font-medium text-gray-700">{popoverSlot.courtNo}번</span></div>
            <div className="flex justify-between"><span>시간</span><span className="font-medium text-gray-700">{formatTime12h(popoverSlot.startTime)}~{formatTime12h(popoverSlot.endTime)}</span></div>
            <div className="flex justify-between items-center">
              <span>경기</span>
              <span className="flex items-center gap-1">
                <span className="font-medium text-gray-700">#{popoverSlot.matchNo}</span>
                {popoverSlot.round && <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-semibold">{popoverSlot.round}</span>}
              </span>
            </div>
            {completedMatchSet.has(`${popoverSlot.eventId}-${popoverSlot.matchNo}`) && (
              <div className="text-center text-green-600 font-bold text-[10px] pt-1">✓ 완료된 경기</div>
            )}
            {popoverSlot.updatedAt && (
              <div className="text-center pt-1">
                <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded-full">수정됨 {new Date(popoverSlot.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}
          </div>
          <div className="mt-2">
            <input
              type="text"
              placeholder="메모 추가..."
              maxLength={50}
              defaultValue={popoverSlot.note ?? ''}
              onBlur={e => handleUpdateSlotNote(popoverSlot.id, e.target.value.trim())}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 placeholder-gray-300 focus:outline-none focus:border-blue-300"
            />
          </div>
          {(() => {
            const courtSlots = filteredSlots.filter(s => s.courtNo === popoverSlot.courtNo).sort((a, b) => a.startTime.localeCompare(b.startTime))
            const idx = courtSlots.findIndex(s => s.id === popoverSlot.id)
            const prev = idx > 0 ? courtSlots[idx - 1] : null
            const next = idx < courtSlots.length - 1 ? courtSlots[idx + 1] : null
            if (!prev && !next) return null
            return (
              <div className="flex items-center justify-between mt-2 gap-1">
                <button onClick={() => prev && setPopoverSlot(prev)} disabled={!prev}
                  className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${prev ? 'border-gray-200 text-gray-600 hover:bg-gray-50' : 'border-gray-100 text-gray-200 cursor-default'}`}>
                  ← {prev ? formatTime12h(prev.startTime) : '처음'}
                </button>
                <button onClick={() => next && setPopoverSlot(next)} disabled={!next}
                  className={`flex-1 text-[10px] py-0.5 rounded border transition-colors ${next ? 'border-gray-200 text-gray-600 hover:bg-gray-50' : 'border-gray-100 text-gray-200 cursor-default'}`}>
                  {next ? formatTime12h(next.startTime) : '마지막'} →
                </button>
              </div>
            )
          })()}
          {popoverSlot.participant1 && popoverSlot.participant2 && (
            <button
              onClick={() => { setPopoverSlot(null); navigate('/score') }}
              disabled={completedMatchSet.has(`${popoverSlot.eventId}-${popoverSlot.matchNo}`)}
              className="mt-2 w-full text-[11px] font-bold py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >⚡ 점수입력</button>
          )}
        </div>
      )}
    </div>
  )
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="font-bold text-sm text-gray-700">{value}</span>
    </div>
  )
}
