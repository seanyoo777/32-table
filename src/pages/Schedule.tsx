import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { generateSmartSlots, previewSmartPlan, calcDayCourtMinutes, matchMinutes, calcRoundsFromParticipants } from '../utils/scheduleUtils'
import type { DayConfig } from '../utils/scheduleUtils'
import { Plus, Calendar, Printer, Clock, Building2, Link, Sun, Users, Download, ChevronLeft } from 'lucide-react'
import type { Division, EventType, Gender, ScheduleEvent, SchedulePlan, ScheduleSlot, SmartEventInput, SmartBracketFormat } from '../types'

const DIVISIONS: Division[] = ['초등', '중등', '고등', '대학', '일반', '생활체육']

const BRACKET_LABELS: Record<SmartBracketFormat, string> = {
  single: '토너먼트',
  group: '조별+토너먼트',
  league: '리그전',
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

type GridRow = { bracketFormat: SmartBracketFormat; counts: Record<string, number>; dayStart: number; dayEnd: number }
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
  const { schedules, addSchedule, deleteSchedule } = useStore()
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [planName, setPlanName] = useState('')
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0])

  const [grid, setGrid] = useState<GridState>(initGrid)

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
        next[div] = { ...next[div], counts: { ...next[div].counts, [colKey]: val } }
      }
      return next
    })
  }

  const smartEvents = useMemo<SmartEventInput[]>(() => {
    const result: SmartEventInput[] = []
    for (const div of DIVISIONS) {
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
          })
        }
      }
    }
    return result
  }, [grid])

  const [totalDays, setTotalDays] = useState(1)
  const [globalMinutesPerMatch, setGlobalMinutesPerMatch] = useState(30)
  const [globalTeamMinutes, setGlobalTeamMinutes] = useState(120)
  const [globalBuffer, setGlobalBuffer] = useState(5)
  const [teamCourtCount, setTeamCourtCount] = useState(0) // 단체전 전용 코트 수 (0=분리 안 함)
  const [dayConfigs, setDayConfigs] = useState<DayConfig[]>([
    { day: 1, date: planDate, startTime: '09:00', endTime: '20:00', courtCount: 4 }
  ])

  function updateDayCount(n: number) {
    const clamped = Math.min(7, Math.max(1, n))
    setTotalDays(clamped)
    setDayConfigs(prev => {
      const next: DayConfig[] = []
      for (let i = 1; i <= clamped; i++) {
        const existing = prev.find(d => d.day === i)
        if (existing) { next.push(existing) }
        else {
          const baseDate = new Date(planDate)
          baseDate.setDate(baseDate.getDate() + i - 1)
          next.push({ day: i, date: baseDate.toISOString().split('T')[0], startTime: '09:00', endTime: '20:00', courtCount: 4 })
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

  const totalCapacityMin = dayCapacities.reduce((s, d) => s + d.capacityMin, 0)
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

  function handleGenerate() {
    if (!planName || smartEvents.length === 0) return
    const slots: ScheduleSlot[] = generateSmartSlots(planEvents, dayConfigs, globalMinutesPerMatch, globalTeamMinutes, globalBuffer)
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
    const plan: SchedulePlan = {
      id: genId(), name: planName, date: planDate,
      startTime: dayConfigs[0]?.startTime ?? '09:00',
      events: derivedEvents, slots, createdAt: new Date().toISOString(),
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
          {/* ① 기본 정보 */}
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">① 기본 정보</h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <label className="text-xs font-medium text-gray-600 block mb-1">일정표 이름 *</label>
                <input className="input text-sm" placeholder="예: 2024 춘계 탁구대회" value={planName} onChange={e => setPlanName(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">대회 시작 날짜</label>
                <input className="input text-sm" type="date" value={planDate} onChange={e => { setPlanDate(e.target.value); updateDayCount(totalDays) }} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">대회 일수</label>
                <div className="flex items-center gap-2">
                  <input className="input w-16 text-center text-sm" type="number" min="1" max="7" value={totalDays} onChange={e => updateDayCount(Number(e.target.value))} />
                  <span className="text-sm text-gray-500">일 (최대 7일)</span>
                </div>
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
                  <th className="text-left py-1.5 font-medium text-gray-600 text-xs">코트 운영시간<br/><span className="text-[10px] text-gray-400 font-normal">(코트수 × 운영시간)</span></th>
                </tr>
              </thead>
              <tbody>
                {dayConfigs.map(d => {
                  const capMin = calcDayCourtMinutes(d)
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
                        <span className="font-bold text-sm text-green-600">{fmtCourtHours(capMin)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50">
                  <td colSpan={5} className="py-2 pr-3 text-xs text-gray-500 font-medium">합계 (전체 일차)</td>
                  <td className="py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold text-sm text-green-600">수용 {fmtCourtHours(totalCapacityMin)}</span>
                      {totalRequiredMin > 0 && (
                        <span className={`text-xs font-semibold ${totalRequiredMin > totalCapacityMin ? 'text-red-600' : 'text-blue-600'}`}>
                          필요 {fmtCourtHours(totalRequiredMin)} ({totalRequiredMatches}경기){totalRequiredMin > totalCapacityMin ? ' ⚠ 초과' : ' ✓'}
                        </span>
                      )}
                    </div>
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
                    const rowHasAny = GRID_COLS.some(c => (row.counts[c.key] ?? 0) >= 2)
                    return (
                      <tr key={div} className={rowHasAny ? 'bg-blue-50/40' : ''}>
                        <td className="py-1 px-2 border border-gray-200">
                          <span className={`badge border text-xs ${divColors[div]}`}>{div}</span>
                        </td>
                        {totalDays > 1 && (
                          <td className="py-1 px-1 border border-gray-200">
                            <div className="flex items-center gap-0.5 justify-center">
                              <select
                                className="text-xs border border-gray-200 rounded px-1 py-1 bg-white w-12"
                                value={row.dayStart}
                                onChange={e => setGridDayStart(div, Number(e.target.value))}
                              >
                                {dayConfigs.map(d => (
                                  <option key={d.day} value={d.day}>{d.day}일</option>
                                ))}
                              </select>
                              <span className="text-xs text-gray-400">~</span>
                              <select
                                className="text-xs border border-gray-200 rounded px-1 py-1 bg-white w-12"
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
                          <select className="w-full text-xs border border-gray-200 rounded px-1 py-1 bg-white"
                            value={row.bracketFormat} onChange={e => setGridBracket(div, e.target.value as SmartBracketFormat)}>
                            {(Object.keys(BRACKET_LABELS) as SmartBracketFormat[]).map(k => (
                              <option key={k} value={k}>{BRACKET_LABELS[k]}</option>
                            ))}
                          </select>
                        </td>
                        {GRID_COLS.map(col => {
                          const val = row.counts[col.key] ?? 0
                          return (
                            <td key={col.key} className="py-1 px-1 border border-gray-200 text-center">
                              <input type="number" min="0" max="512"
                                className={`w-14 text-center text-sm border rounded px-1 py-1 ${val >= 2 ? 'border-blue-300 bg-blue-50 font-medium text-blue-700' : 'border-gray-200 bg-white text-gray-300'}`}
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
                      const cnt = DIVISIONS.reduce((s, div) => s + ((grid[div].counts[col.key] ?? 0) >= 2 ? 1 : 0), 0)
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
                        </div>
                        <span className={`text-sm font-bold ${textColor}`}>
                          {fmtCourtHours(dayPlan.assignedMinutes)} / {fmtCourtHours(dayPlan.capacityMinutes)}{over && ' ⚠ 초과'}
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
                          ⚠ 코트 운영시간({fmtCourtHours(dayPlan.capacityMinutes)})을 초과합니다. 코트 수 또는 운영 시간을 늘려주세요.
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
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{s.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">{s.date} · {formatTime12h(s.startTime)} 시작</p>
                  </div>
                  <span className="badge bg-purple-100 text-purple-700">{s.slots.length}경기</span>
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

function ScheduleDetail({ plan, onBack }: { plan: SchedulePlan; onBack: () => void }) {
  const { tournaments, updateTournament } = useStore()
  const [viewMode, setViewMode] = useState<'time' | 'court'>('time')
  const [activeDay, setActiveDay] = useState<number | null>(null)
  const [assignTourId, setAssignTourId] = useState<string>('')
  const [assignResult, setAssignResult] = useState<string | null>(null)

  const days = [...new Set([
    ...plan.slots.map(s => s.day ?? 1),
    ...plan.events.map(e => e.day ?? 1),
  ])].sort()
  const hasMultipleDays = days.length > 1

  const filteredSlots = activeDay !== null
    ? plan.slots.filter(s => (s.day ?? 1) === activeDay)
    : plan.slots

  const filteredCourts = [...new Set(filteredSlots.map(s => s.courtNo))].sort()
  const filteredTimes = [...new Set(filteredSlots.map(s => s.startTime))].sort()
  const byTime = filteredTimes.map(t => ({ time: t, slots: filteredSlots.filter(s => s.startTime === t) }))

  const specialEvents = plan.events.filter(e =>
    e.type && e.type !== 'match' && (activeDay === null || (e.day ?? 1) === activeDay)
  )

  const endTime = plan.slots.reduce((latest, s) => s.endTime > latest ? s.endTime : latest, '')

  function exportScheduleCSV() {
    const rows = ['날짜,시작,종료,코트,종목,선수1,선수2,라운드']
    for (const slot of filteredSlots) {
      rows.push([plan.date, slot.startTime, slot.endTime, `${slot.courtNo}번`, slot.label, slot.participant1 ?? '', slot.participant2 ?? '', slot.round ?? ''].join(','))
    }
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `경기일정_${plan.name}_${plan.date}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const slotEventColors = (slot: ScheduleSlot) => {
    if (slot.type && slot.type !== 'match') return eventColors[slot.type] ?? 'bg-gray-400'
    return eventColors[slot.eventType] ?? 'bg-gray-400'
  }

  function handleAssignTimes() {
    if (!assignTourId) return
    const tour = tournaments.find(t => t.id === assignTourId)
    if (!tour) return
    const pendingMatches: Array<{ evId: string; matchId: string }> = []
    for (const ev of tour.events) {
      for (const m of ev.matches) {
        if (m.participant1Id && m.participant2Id && !m.isBye && !m.scheduledTime) {
          pendingMatches.push({ evId: ev.id, matchId: m.id })
        }
      }
    }
    const matchSlots = plan.slots.filter(s => !s.type || s.type === 'match')
    const assigned = Math.min(pendingMatches.length, matchSlots.length)
    if (assigned === 0) { setAssignResult('배정할 경기 또는 슬롯이 없습니다.'); return }
    const newEvents = tour.events.map(ev => ({
      ...ev,
      matches: ev.matches.map(m => {
        const idx = pendingMatches.findIndex(pm => pm.evId === ev.id && pm.matchId === m.id)
        if (idx < 0 || idx >= matchSlots.length) return m
        const slot = matchSlots[idx]
        return { ...m, scheduledTime: slot.startTime, tableNo: slot.courtNo }
      })
    }))
    updateTournament(assignTourId, { events: newEvents })
    setAssignResult(`${assigned}개 경기에 시간이 배정되었습니다.`)
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
              <button onClick={() => setActiveDay(null)} className={`px-2 py-1 rounded text-xs font-medium ${activeDay === null ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>전체</button>
              {days.map(d => (
                <button key={d} onClick={() => setActiveDay(d)} className={`px-2 py-1 rounded text-xs font-medium ${activeDay === d ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{d}일차</button>
              ))}
            </div>
          )}
          <button onClick={() => setViewMode('time')} className={`px-2.5 py-1 rounded text-xs font-medium ${viewMode === 'time' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>시간순</button>
          <button onClick={() => setViewMode('court')} className={`px-2.5 py-1 rounded text-xs font-medium ${viewMode === 'court' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>코트순</button>
          <button onClick={exportScheduleCSV} className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"><Download size={12} /> CSV</button>
          <button onClick={() => window.print()} className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1"><Printer size={12} /> 인쇄</button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-2 flex items-center gap-6 no-print">
        <StatMini label="총 경기" value={`${filteredSlots.length}경기`} />
        <StatMini label="코트 수" value={`${filteredCourts.length}개`} />
        <StatMini label="종목 수" value={`${plan.events.length}개`} />
        <StatMini label="예상 종료" value={formatTime12h(endTime) || '-'} />
      </div>

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
                <Link size={11} /> 대회 경기 배정
              </h4>
              <select className="select text-xs w-full mb-2" value={assignTourId}
                onChange={e => { setAssignTourId(e.target.value); setAssignResult(null) }}>
                <option value="">대회 선택...</option>
                {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="btn-primary w-full text-xs py-1.5 flex items-center justify-center gap-1"
                onClick={handleAssignTimes} disabled={!assignTourId}>
                <Clock size={11} /> 시간 자동배정
              </button>
              {assignResult && <p className="text-xs text-green-600 mt-1.5">{assignResult}</p>}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 overflow-auto p-3">
          {viewMode === 'time' && (
            <table className="text-sm border-collapse" style={{ width: 'max-content', minWidth: '100%' }}>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="py-2 px-3 text-left font-semibold text-gray-600 w-24 border border-gray-200 bg-gray-100 whitespace-nowrap">시간</th>
                  {filteredCourts.map(c => (
                    <th key={c} className="py-2 px-2 text-center font-semibold text-gray-600 min-w-[120px] border border-gray-200 bg-gray-100 whitespace-nowrap">코트 {c}</th>
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
                          <div className={`rounded p-1.5 border ${divColors[slot.division]}`}>
                            <div className="flex items-center gap-1 mb-0.5">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slotEventColors(slot)}`} />
                              <span className="font-semibold text-[11px]">{slot.division} {slot.eventType}</span>
                            </div>
                            <div className="text-[10px] text-gray-500">{slot.gender} · {slot.matchNo}번</div>
                            <div className="text-[10px] text-gray-400">{formatTime12h(slot.startTime)}~{formatTime12h(slot.endTime)}</div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {viewMode === 'court' && (
            <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredCourts.map(c => {
                const courtSlots = filteredSlots.filter(s => s.courtNo === c).sort((a, b) => a.startTime.localeCompare(b.startTime))
                return (
                  <div key={c} className="card">
                    <h3 className="font-semibold text-gray-700 mb-2 flex items-center gap-2 text-sm">
                      <Building2 size={14} /> 코트 {c}
                      <span className="text-xs text-gray-400 font-normal">{courtSlots.length}경기</span>
                    </h3>
                    <div className="space-y-1.5">
                      {courtSlots.map(slot => (
                        <div key={slot.id} className={`flex gap-2 p-1.5 rounded border ${divColors[slot.division]}`}>
                          <div className="font-mono text-[11px] text-blue-700 font-semibold w-16 flex-shrink-0 pt-0.5">{formatTime12h(slot.startTime)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${slotEventColors(slot)}`} />
                              <span className="font-medium text-[11px]">{slot.division} {slot.eventType}({slot.gender})</span>
                            </div>
                            <div className="text-[10px] text-gray-400">~{formatTime12h(slot.endTime)} · {slot.matchNo}번</div>
                          </div>
                        </div>
                      ))}
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
