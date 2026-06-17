import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { generateSmartSlots, previewSmartPlan, calcDayCapacity, calcRoundsFromParticipants } from '../utils/scheduleUtils'
import type { DayConfig } from '../utils/scheduleUtils'
import { Plus, Calendar, Printer, Clock, Building2, Link, Sun, Users } from 'lucide-react'
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

type GridRow = { bracketFormat: SmartBracketFormat; counts: Record<string, number> }
type GridState = Record<Division, GridRow>
const initGrid = (): GridState =>
  Object.fromEntries(DIVISIONS.map(d => [d, { bracketFormat: 'single' as SmartBracketFormat, counts: {} }])) as GridState

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

export default function SchedulePage() {
  const { schedules, addSchedule, deleteSchedule } = useStore()
  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [planName, setPlanName] = useState('')
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0])

  // ── 종목/인원 그리드 ────────────────────────────────
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
          })
        }
      }
    }
    return result
  }, [grid])

  // ── 멀티데이 운영 설정 ───────────────────────────────
  const [totalDays, setTotalDays] = useState(1)
  const [globalMinutesPerMatch, setGlobalMinutesPerMatch] = useState(30)
  const [globalBuffer, setGlobalBuffer] = useState(5)
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
          next.push({
            day: i,
            date: baseDate.toISOString().split('T')[0],
            startTime: '09:00',
            endTime: '20:00',
            courtCount: 4,
          })
        }
      }
      return next
    })
  }

  function updateDayConfig(day: number, field: keyof DayConfig, value: string | number) {
    setDayConfigs(prev => prev.map(d => d.day === day ? { ...d, [field]: value } : d))
  }

  const dayCapacities = useMemo(() =>
    dayConfigs.map(d => ({
      day: d.day,
      capacity: calcDayCapacity(d, globalMinutesPerMatch, globalBuffer),
      label: d.label ?? `${d.day}일차`,
      date: d.date,
    })),
    [dayConfigs, globalMinutesPerMatch, globalBuffer]
  )

  const totalCapacity = dayCapacities.reduce((s, d) => s + d.capacity, 0)

  // Smart preview — compute per-day plan
  const smartPreview = useMemo(() => {
    if (smartEvents.length === 0 || dayConfigs.length === 0) return null
    return previewSmartPlan(smartEvents, dayConfigs, globalMinutesPerMatch, globalBuffer)
  }, [smartEvents, dayConfigs, globalMinutesPerMatch, globalBuffer])

  function handleGenerate() {
    if (!planName || smartEvents.length === 0) return

    const slots: ScheduleSlot[] = generateSmartSlots(smartEvents, dayConfigs, globalMinutesPerMatch, globalBuffer)

    // Derive ScheduleEvent[] from smartEvents (one per event, matchCount = sum of all rounds)
    const derivedEvents: ScheduleEvent[] = smartEvents.map(se => {
      const rounds = calcRoundsFromParticipants(se)
      const totalMatches = rounds.reduce((s, r) => s + r.matchCount, 0)
      return {
        id: se.id,
        label: se.label,
        division: se.division,
        eventType: se.eventType,
        gender: se.gender,
        matchCount: totalMatches,
        minutesPerMatch: globalMinutesPerMatch,
        courtCount: dayConfigs[0]?.courtCount ?? 4,
        bufferMinutes: globalBuffer,
        type: 'match' as const,
      }
    })

    const plan: SchedulePlan = {
      id: genId(),
      name: planName,
      date: planDate,
      startTime: dayConfigs[0]?.startTime ?? '09:00',
      events: derivedEvents,
      slots,
      createdAt: new Date().toISOString(),
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
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setView('list')} className="btn-secondary py-1.5 text-sm">← 목록</button>
          <h1 className="text-xl font-bold">경기일정 생성</h1>
        </div>

        {/* Section 1 - 기본 정보 */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">① 기본 정보</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="text-sm font-medium text-gray-700 block mb-1">일정표 이름 *</label>
              <input className="input" placeholder="예: 2024 춘계 탁구대회 일정표" value={planName} onChange={e => setPlanName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">대회 시작 날짜</label>
              <input className="input" type="date" value={planDate} onChange={e => {
                setPlanDate(e.target.value)
                updateDayCount(totalDays)
              }} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">대회 일수</label>
              <div className="flex items-center gap-2">
                <input className="input w-20 text-center" type="number" min="1" max="7" value={totalDays}
                  onChange={e => updateDayCount(Number(e.target.value))} />
                <span className="text-sm text-gray-500">일 (최대 7일)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2 - 일자별 운영 시간 */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Sun size={16} className="text-orange-500" /> ② 일자별 운영 시간 설정
            </h2>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <label className="text-gray-600">경기당</label>
                <input className="input w-16 text-center py-1 text-sm" type="number" min="10" max="120"
                  value={globalMinutesPerMatch} onChange={e => setGlobalMinutesPerMatch(Number(e.target.value))} />
                <span className="text-gray-500">분</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-gray-600">여유</label>
                <input className="input w-14 text-center py-1 text-sm" type="number" min="0" max="30"
                  value={globalBuffer} onChange={e => setGlobalBuffer(Number(e.target.value))} />
                <span className="text-gray-500">분</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 font-medium text-gray-600 whitespace-nowrap">일차</th>
                  <th className="text-left py-2 pr-3 font-medium text-gray-600">날짜</th>
                  <th className="text-left py-2 pr-3 font-medium text-gray-600">시작</th>
                  <th className="text-left py-2 pr-3 font-medium text-gray-600">종료</th>
                  <th className="text-left py-2 pr-3 font-medium text-gray-600">코트 수</th>
                  <th className="text-left py-2 font-medium text-gray-600">수용 경기</th>
                </tr>
              </thead>
              <tbody>
                {dayConfigs.map(d => {
                  const cap = calcDayCapacity(d, globalMinutesPerMatch, globalBuffer)
                  return (
                    <tr key={d.day} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-xs">{d.day}일차</span>
                      </td>
                      <td className="py-2 pr-3">
                        <input className="input py-1 text-sm w-36" type="date" value={d.date ?? ''} onChange={e => updateDayConfig(d.day, 'date', e.target.value)} />
                      </td>
                      <td className="py-2 pr-3">
                        <input className="input py-1 text-sm w-24" type="time" value={d.startTime} onChange={e => updateDayConfig(d.day, 'startTime', e.target.value)} />
                      </td>
                      <td className="py-2 pr-3">
                        <input className="input py-1 text-sm w-24" type="time" value={d.endTime} onChange={e => updateDayConfig(d.day, 'endTime', e.target.value)} />
                      </td>
                      <td className="py-2 pr-3">
                        <input className="input py-1 text-sm w-16 text-center" type="number" min="1" max="20" value={d.courtCount} onChange={e => updateDayConfig(d.day, 'courtCount', Number(e.target.value))} />
                      </td>
                      <td className="py-2">
                        <span className="font-bold text-sm text-green-600">{cap}경기 가능</span>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {d.courtCount}코트 × {Math.floor((
                            parseInt(d.endTime.split(':')[0]) * 60 + parseInt(d.endTime.split(':')[1]) -
                            parseInt(d.startTime.split(':')[0]) * 60 - parseInt(d.startTime.split(':')[1])
                          ) / (globalMinutesPerMatch + globalBuffer))}슬롯
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50">
                  <td colSpan={5} className="py-2 pr-3 text-xs text-gray-500 font-medium">전체 합계</td>
                  <td className="py-2">
                    <span className="font-bold text-blue-700">{totalCapacity}경기 가능</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Section 3 - 종목 및 인원 입력 (그리드) */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Users size={16} className="text-blue-500" /> ③ 종목 및 인원 입력
            </h2>
            <p className="text-xs text-gray-400">인원 수 입력 시 라운드·경기 수 자동 계산 · 빈칸=미참가</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left py-2 px-3 font-medium text-gray-600 border border-gray-200 whitespace-nowrap w-[72px]">부문</th>
                  <th className="text-center py-2 px-2 font-medium text-gray-600 border border-gray-200 whitespace-nowrap w-[110px]">대진방식</th>
                  {GRID_COLS.map(col => (
                    <th key={col.key} className="text-center py-2 px-1 font-medium text-gray-600 border border-gray-200 whitespace-nowrap min-w-[72px] text-xs">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIVISIONS.map(div => {
                  const row = grid[div]
                  const rowHasAny = GRID_COLS.some(c => (row.counts[c.key] ?? 0) >= 2)
                  return (
                    <tr key={div} className={rowHasAny ? 'bg-blue-50/40' : ''}>
                      <td className="py-2 px-3 border border-gray-200">
                        <span className={`badge border text-xs ${divColors[div]}`}>{div}</span>
                      </td>
                      <td className="py-1.5 px-2 border border-gray-200">
                        <select
                          className="w-full text-xs border border-gray-200 rounded px-1 py-1 bg-white"
                          value={row.bracketFormat}
                          onChange={e => setGridBracket(div, e.target.value as SmartBracketFormat)}
                        >
                          {(Object.keys(BRACKET_LABELS) as SmartBracketFormat[]).map(k => (
                            <option key={k} value={k}>{BRACKET_LABELS[k]}</option>
                          ))}
                        </select>
                      </td>
                      {GRID_COLS.map(col => {
                        const val = row.counts[col.key] ?? 0
                        return (
                          <td key={col.key} className="py-1 px-1.5 border border-gray-200 text-center">
                            <input
                              type="number" min="0" max="512"
                              className={`w-[64px] text-center text-sm border rounded px-1 py-1 ${val >= 2 ? 'border-blue-300 bg-blue-50 font-medium text-blue-700' : 'border-gray-200 bg-white text-gray-300'}`}
                              value={val || ''}
                              placeholder="—"
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
                  <td colSpan={2} className="py-2 px-3 text-xs text-gray-500 border border-gray-200 font-medium">참가 부문</td>
                  {GRID_COLS.map(col => {
                    const cnt = DIVISIONS.reduce((s, div) => s + ((grid[div].counts[col.key] ?? 0) >= 2 ? 1 : 0), 0)
                    return (
                      <td key={col.key} className="py-2 px-1 border border-gray-200 text-center">
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

        {/* Section 4 - 스마트 자동 배정 미리보기 */}
        {smartPreview && smartEvents.length > 0 && (
          <div className="card space-y-4">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              📊 ④ 스마트 자동 배정 미리보기
            </h2>
            <div className="space-y-4">
              {smartPreview.map(dayPlan => {
                const dayConfig = dayConfigs.find(d => d.day === dayPlan.day)
                const pct = dayPlan.capacity > 0 ? Math.min(100, Math.round(dayPlan.assignedMatches / dayPlan.capacity * 100)) : 0
                const over = dayPlan.assignedMatches > dayPlan.capacity
                const barColor = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-orange-400' : 'bg-green-500'
                const textColor = over ? 'text-red-600' : pct >= 70 ? 'text-orange-600' : 'text-green-600'

                // Group rounds by event label
                const byEvent = new Map<string, typeof dayPlan.rounds>()
                for (const r of dayPlan.rounds) {
                  const existing = byEvent.get(r.eventLabel) ?? []
                  byEvent.set(r.eventLabel, [...existing, r])
                }

                return (
                  <div key={dayPlan.day} className="border rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <span className="font-bold text-purple-700 text-sm">{dayPlan.day}일차</span>
                        {dayConfig?.date && (
                          <span className="text-xs text-gray-400 ml-2">({dayConfig.date})</span>
                        )}
                      </div>
                      <span className={`text-sm font-bold ${textColor}`}>
                        {dayPlan.assignedMatches} / {dayPlan.capacity}경기
                        {over && ' ⚠ 초과'}
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {/* Round list grouped by event */}
                    {dayPlan.rounds.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">배정된 라운드 없음</p>
                    ) : (
                      <div className="space-y-1">
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
                      <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                        ⚠ 이 날의 경기 수가 코트 수용 가능 경기({dayPlan.capacity}경기)를 초과합니다. 코트 수를 늘리거나 운영 시간을 늘려주세요.
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            className="btn-primary flex-1 text-base"
            onClick={handleGenerate}
            disabled={!planName || smartEvents.length === 0}
          >
            📅 일정표 자동생성
          </button>
          <button className="btn-secondary" onClick={() => setView('list')}>취소</button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2"><Calendar size={20} className="text-purple-500" />경기 일정표</h1>
        <button onClick={() => setView('create')} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> 일정 생성
        </button>
      </div>

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
                  <p className="text-xs text-gray-400 mt-1">{s.date} · 시작 {s.startTime}</p>
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
  )
}

function ScheduleDetail({ plan, onBack }: { plan: SchedulePlan; onBack: () => void }) {
  const { tournaments, updateTournament } = useStore()
  const [viewMode, setViewMode] = useState<'time' | 'court'>('time')
  const [activeDay, setActiveDay] = useState<number | null>(null)
  const [assignTourId, setAssignTourId] = useState<string>('')
  const [assignResult, setAssignResult] = useState<string | null>(null)

  const courts = [...new Set(plan.slots.map(s => s.courtNo))].sort()
  void courts

  // Detect days
  const days = [...new Set([
    ...plan.slots.map(s => s.day ?? 1),
    ...plan.events.map(e => e.day ?? 1),
  ])].sort()
  const hasMultipleDays = days.length > 1

  // Filter slots by active day
  const filteredSlots = activeDay !== null
    ? plan.slots.filter(s => (s.day ?? 1) === activeDay)
    : plan.slots

  const filteredCourts = [...new Set(filteredSlots.map(s => s.courtNo))].sort()
  const filteredTimes = [...new Set(filteredSlots.map(s => s.startTime))].sort()
  const byTime = filteredTimes.map(t => ({ time: t, slots: filteredSlots.filter(s => s.startTime === t) }))

  // Special events for current day
  const specialEvents = plan.events.filter(e =>
    e.type && e.type !== 'match' &&
    (activeDay === null || (e.day ?? 1) === activeDay)
  )

  const endTime = plan.slots.reduce((latest, s) => s.endTime > latest ? s.endTime : latest, '')

  const slotEventColors = (slot: ScheduleSlot) => {
    if (slot.type && slot.type !== 'match') return eventColors[slot.type] ?? 'bg-gray-400'
    return eventColors[slot.eventType] ?? 'bg-gray-400'
  }

  // ── 대회 경기에 시간 배정 ──────────────────────────────
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

    const newEvents = tour.events.map(ev => {
      const newMatches = ev.matches.map(m => {
        const idx = pendingMatches.findIndex(pm => pm.evId === ev.id && pm.matchId === m.id)
        if (idx < 0 || idx >= matchSlots.length) return m
        const slot = matchSlots[idx]
        return {
          ...m,
          scheduledTime: slot.startTime,
          tableNo: slot.courtNo,
        }
      })
      return { ...ev, matches: newMatches }
    })

    updateTournament(assignTourId, { events: newEvents })
    setAssignResult(`${assigned}개 경기에 시간이 배정되었습니다.`)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-secondary py-1.5 text-sm">← 목록</button>
          <div>
            <h1 className="text-xl font-bold">{plan.name}</h1>
            <p className="text-sm text-gray-400">{plan.date} · 시작 {plan.startTime} ~ 종료 {endTime}</p>
          </div>
        </div>
        <div className="flex gap-2 no-print">
          <button onClick={() => setViewMode('time')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === 'time' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>시간순</button>
          <button onClick={() => setViewMode('court')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${viewMode === 'court' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>코트순</button>
          <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1.5"><Printer size={14} /> 인쇄</button>
        </div>
      </div>

      {/* Day tabs */}
      {hasMultipleDays && (
        <div className="flex gap-2 flex-wrap no-print">
          <button onClick={() => setActiveDay(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${activeDay === null ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            전체
          </button>
          {days.map(d => (
            <button key={d} onClick={() => setActiveDay(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${activeDay === d ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {d}일차
            </button>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
        <StatCard label="총 경기 수" value={`${filteredSlots.length}경기`} icon="🏓" />
        <StatCard label="코트 수" value={`${filteredCourts.length}개`} icon="🏟️" />
        <StatCard label="종목 수" value={`${plan.events.length}개`} icon="📋" />
        <StatCard label="예상 종료" value={endTime || '-'} icon="⏰" />
      </div>

      {/* Assign times to tournament matches */}
      {tournaments.length > 0 && (
        <div className="card no-print space-y-3">
          <h3 className="font-semibold text-gray-700 text-sm flex items-center gap-2"><Link size={14} /> 대회 경기에 시간 배정</h3>
          <div className="flex gap-2 items-center flex-wrap">
            <select
              className="select flex-1 min-w-40"
              value={assignTourId}
              onChange={e => { setAssignTourId(e.target.value); setAssignResult(null) }}
            >
              <option value="">대회 선택...</option>
              {tournaments.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.date})</option>
              ))}
            </select>
            <button
              className="btn-primary flex items-center gap-1.5 text-sm py-1.5"
              onClick={handleAssignTimes}
              disabled={!assignTourId}
            >
              <Clock size={13} /> 시간 자동배정
            </button>
          </div>
          {assignResult && (
            <p className="text-sm text-green-600 font-medium">{assignResult}</p>
          )}
          {assignTourId && (
            <p className="text-xs text-gray-400">
              이 일정표의 슬롯을 선택한 대회의 미배정 경기(scheduledTime 없는 경기)에 순서대로 배정합니다.
            </p>
          )}
        </div>
      )}

      {/* Special events for the day */}
      {specialEvents.length > 0 && (
        <div className="card no-print">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">특별 일정</h3>
          <div className="flex flex-wrap gap-3">
            {specialEvents.map(e => (
              <div key={e.id} className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
                <div className={`w-2 h-2 rounded-full ${eventColors[e.type ?? 'break']}`} />
                <span className="text-sm font-medium">{e.label}</span>
                <span className="text-xs text-gray-400">{e.minutesPerMatch}분</span>
                {e.day && hasMultipleDays && <span className="text-xs text-gray-300">{e.day}일차</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="card no-print">
        <div className="flex flex-wrap gap-3">
          {plan.events.filter(e => !e.type || e.type === 'match').map(e => (
            <div key={e.id} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${eventColors[e.eventType] ?? 'bg-gray-400'}`} />
              <span className={`badge border ${divColors[e.division]}`}>{e.division} {e.eventType}({e.gender})</span>
              <span className="text-xs text-gray-400">{e.minutesPerMatch}분</span>
            </div>
          ))}
        </div>
      </div>

      {/* Time Table */}
      {viewMode === 'time' && (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left font-semibold text-gray-600 w-24">시간</th>
                  {filteredCourts.map(c => (
                    <th key={c} className="py-3 px-4 text-center font-semibold text-gray-600 min-w-32">코트 {c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byTime.map(({ time, slots }) => (
                  <tr key={time} className="border-b last:border-0">
                    <td className="py-3 px-4 font-mono text-gray-500 font-medium align-top">{time}</td>
                    {filteredCourts.map(c => {
                      const slot = slots.find(s => s.courtNo === c)
                      if (!slot) return <td key={c} className="py-3 px-4" />
                      return (
                        <td key={c} className="py-2 px-3">
                          <div className={`rounded-lg p-2 border ${divColors[slot.division]}`}>
                            <div className="flex items-center gap-1 mb-1">
                              <div className={`w-2 h-2 rounded-full ${slotEventColors(slot)}`} />
                              <span className="font-medium text-xs">{slot.division} {slot.eventType}</span>
                            </div>
                            <div className="text-xs text-gray-500">{slot.gender} · {slot.matchNo}번째 경기</div>
                            <div className="text-xs text-gray-400 mt-0.5">{slot.startTime}~{slot.endTime}</div>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'court' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCourts.map(c => {
            const courtSlots = filteredSlots.filter(s => s.courtNo === c).sort((a, b) => a.startTime.localeCompare(b.startTime))
            return (
              <div key={c} className="card">
                <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Building2 size={16} /> 코트 {c}
                  <span className="text-xs text-gray-400 font-normal">{courtSlots.length}경기</span>
                </h3>
                <div className="space-y-2">
                  {courtSlots.map(slot => (
                    <div key={slot.id} className={`flex gap-2 p-2 rounded-lg border ${divColors[slot.division]}`}>
                      <div className="font-mono text-xs text-gray-500 w-10 flex-shrink-0 pt-0.5">{slot.startTime}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${slotEventColors(slot)}`} />
                          <span className="font-medium text-xs">{slot.division} {slot.eventType}({slot.gender})</span>
                        </div>
                        <div className="text-xs text-gray-400">~{slot.endTime} · {slot.matchNo}번</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="card text-center py-4">
      <div className="text-2xl mb-1">{icon}</div>
      <div className="font-bold text-gray-700">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  )
}
