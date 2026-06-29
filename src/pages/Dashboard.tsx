import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Play, Clock, CheckCircle, Trophy, Bell, BellOff, X, AlertTriangle, Download } from 'lucide-react'
import type { MatchCall, ScoreRecord, Tournament } from '../types'

function exportScoreRecordsCSV(records: ScoreRecord[], pMap: Record<string, { name: string; school: string }>, tournaments: Tournament[]) {
  const tourMap: Record<string, string> = {}
  const eventMap: Record<string, string> = {}
  for (const t of tournaments) {
    tourMap[t.id] = t.name
    for (const ev of t.events) eventMap[t.id + '|' + ev.id] = ev.label
  }
  const rows = ['일시,대회명,종목,선수1,선수2,세트결과,세트상세,입력자,검증여부']
  for (const r of [...records].reverse()) {
    const p1 = pMap[r.participant1Id]?.name ?? r.participant1Id
    const p2 = pMap[r.participant2Id]?.name ?? r.participant2Id
    const score = `${r.p1Score}-${r.p2Score}`
    const setDetail = r.sets && r.sets.length > 0 ? r.sets.map(([a, b]) => `${a}-${b}`).join(' ') : ''
    const verified = r.verified ? '확인' : '미확인'
    const at = new Date(r.recordedAt).toLocaleString('ko-KR')
    const tourName = tourMap[r.tournamentId] ?? ''
    const evLabel = eventMap[r.tournamentId + '|' + r.eventId] ?? ''
    rows.push([at, tourName, evLabel, p1, p2, score, setDetail, r.recordedBy ?? '', verified].join(','))
  }
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `경기기록_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportMatchCallsCSV(calls: MatchCall[]) {
  const rows = ['호출시각,코트번호,선수1,선수2,상태']
  for (const c of [...calls].reverse()) {
    const at = new Date(c.calledAt).toLocaleString('ko-KR')
    const status = c.acknowledged ? '확인완료' : '대기중'
    rows.push([at, `${c.tableNo}번`, c.participant1Name, c.participant2Name, status].join(','))
  }
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `경기호출이력_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function genId() { return Math.random().toString(36).slice(2, 10) }

export default function DashboardPage() {
  const { tournaments, players, pairs, scoreRecords, liveMatches, matchCalls, addMatchCall, acknowledgeMatchCall, removeMatchCall, verifyScoreRecord } = useStore()
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())
  const [callTableNo, setCallTableNo] = useState(1)
  const [callMatchKey, setCallMatchKey] = useState('')
  const [callSearch, setCallSearch] = useState('')
  const [courtPopover, setCourtPopover] = useState<number | null>(null)
  const [highlightCallId, setHighlightCallId] = useState<string | null>(null)
  const [rowTableNos, setRowTableNos] = useState<Record<string, number>>({})
  const [selectedMatchKeys, setSelectedMatchKeys] = useState<Set<string>>(new Set())
  const [pendingTourFilter, setPendingTourFilter] = useState('')
  const [callTourFilter, setCallTourFilter] = useState('')
  const [bulkTableNo, setBulkTableNo] = useState(1)
  const [pendingSort, setPendingSort] = useState<'round' | 'points' | 'event'>('round')

  function toggleSelectMatch(key: string) {
    setSelectedMatchKeys(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  }
  function toggleSelectAll(callableKeys: string[]) {
    setSelectedMatchKeys(s => s.size === callableKeys.length ? new Set() : new Set(callableKeys))
  }
  function bulkAssignTable() {
    const updates: Record<string, number> = {}
    selectedMatchKeys.forEach(key => { updates[key] = bulkTableNo })
    setRowTableNos(prev => ({ ...prev, ...updates }))
    setSelectedMatchKeys(new Set())
  }
  function bulkCall() {
    let nextTable = callTableNo
    selectedMatchKeys.forEach(key => {
      const m = pendingMatches.find(pm => `${pm.tournamentId}-${pm.eventId}-${pm.id}` === key)
      if (!m || !m.participant1Id || !m.participant2Id) return
      if (matchCalls.some(c => !c.acknowledged && c.matchId === m.id)) return
      const tNo = rowTableNos[key] ?? m.tableNo ?? nextTable
      const call: MatchCall = {
        id: genId(), matchId: m.id, tournamentId: m.tournamentId,
        eventId: m.eventId, tableNo: tNo,
        participant1Name: pMap[m.participant1Id]?.name ?? '?',
        participant2Name: pMap[m.participant2Id]?.name ?? '?',
        eventLabel: m.eventLabel, calledAt: new Date().toISOString(), acknowledged: false,
      }
      addMatchCall(call)
      if (tNo === nextTable) nextTable++
    })
    setSelectedMatchKeys(new Set())
  }

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const pMap = Object.fromEntries([
    ...players.map(p => [p.id, { name: p.name, school: p.school }]),
    ...pairs.map(p => [p.id, { name: p.name, school: p.school }]),
  ])

  const walkinIds = new Set(players.filter(p => p.school === '현장등록').map(p => p.id))

  // 체크인 검증: 선수 ID가 체크인 안 됐으면 경고(페어/팀은 구성선수 확인)
  const checkedInIds = new Set(players.filter(p => p.checkedIn).map(p => p.id))
  const playerIds = new Set(players.map(p => p.id))
  const pairMembers: Record<string, string[]> = Object.fromEntries(pairs.map(p => [p.id, [p.player1Id, p.player2Id]]))
  function isUnchecked(entityId: string | null): boolean {
    if (!entityId) return false
    const ids = pairMembers[entityId] ?? [entityId]
    return ids.some(id => playerIds.has(id) && !checkedInIds.has(id))
  }

  const activeTournaments = tournaments.filter(t => t.status === 'ongoing')
  const allMatches = activeTournaments.flatMap(t =>
    t.events.flatMap(ev =>
      ev.matches.map(m => ({ ...m, tournamentName: t.name, eventLabel: ev.label, tournamentId: t.id, eventId: ev.id }))
    )
  )
  const pendingMatches = allMatches.filter(m => m.participant1Id && m.participant2Id && !m.result && !m.isBye)
  const filteredPendingMatches = pendingTourFilter
    ? pendingMatches.filter(m => m.tournamentId === pendingTourFilter)
    : pendingMatches
  const pointMap = Object.fromEntries([
    ...players.map(p => [p.id, p.points]),
    ...pairs.map(p => [p.id, Math.max(...[p.player1Id, p.player2Id].map(id => players.find(pl => pl.id === id)?.points ?? 0))]),
  ])
  const sortedPendingMatches = [...filteredPendingMatches].sort((a, b) => {
    if (pendingSort === 'points') {
      const aP = (pointMap[a.participant1Id ?? ''] ?? 0) + (pointMap[a.participant2Id ?? ''] ?? 0)
      const bP = (pointMap[b.participant1Id ?? ''] ?? 0) + (pointMap[b.participant2Id ?? ''] ?? 0)
      return bP - aP
    }
    if (pendingSort === 'event') return (a.eventLabel ?? '').localeCompare(b.eventLabel ?? '', 'ko')
    return 0
  })
  const callablePendingKeys = filteredPendingMatches
    .filter(m => m.participant1Id && m.participant2Id && !matchCalls.some(c => !c.acknowledged && c.matchId === m.id))
    .map(m => `${m.tournamentId}-${m.eventId}-${m.id}`)
  const completedMatches = allMatches.filter(m => m.result)
  const pendingCalls = matchCalls.filter(c => !c.acknowledged)
  const unverifiedRecords = scoreRecords.filter(r => !r.verified)

  // 진행중 대회에서 모든 경기가 완료된 종목
  const completedEvents = activeTournaments.flatMap(t =>
    t.events.filter(ev => {
      const real = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
      return real.length > 0 && real.every(m => m.result)
    }).map(ev => ({ tourName: t.name, label: ev.label, division: ev.division, gender: ev.gender }))
  )

  // 이미 호출된 경기의 참가자 ID 세트 — 대기중 경기 충돌 감지용
  const calledMatchIds = new Set(pendingCalls.map(c => c.matchId))
  const calledParticipantIds = new Set<string>(
    allMatches
      .filter(m => calledMatchIds.has(m.id))
      .flatMap(m => [m.participant1Id, m.participant2Id].filter(Boolean) as string[])
  )

  // ── 코트 현황판: 탁구대별 LIVE / 호출 / 빈 코트 ──
  const maxTable = Math.max(8, 0, ...liveMatches.map(m => m.tableNo), ...pendingCalls.map(c => c.tableNo))
  const courts = Array.from({ length: maxTable }, (_, i) => {
    const no = i + 1
    const live = liveMatches.find(m => m.tableNo === no)
    const call = pendingCalls.find(c => c.tableNo === no)
    if (live) return { no, status: 'live' as const, label: `${pMap[live.participant1Id]?.name ?? '?'} vs ${pMap[live.participant2Id]?.name ?? '?'}` }
    if (call) return { no, status: 'called' as const, label: `${call.participant1Name} vs ${call.participant2Name}` }
    return { no, status: 'free' as const, label: '대기' }
  })
  const freeCourts = courts.filter(c => c.status === 'free').length
  const liveCourts = courts.filter(c => c.status === 'live').length
  const calledCourts = courts.filter(c => c.status === 'called').length

  const formatTime = (d: Date) =>
    `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`

  function handleCallMatch() {
    if (!callMatchKey) return
    const [tournamentId, eventId, matchId] = callMatchKey.split('|')
    const match = allMatches.find(m => m.tournamentId === tournamentId && m.eventId === eventId && m.id === matchId)
    if (!match || !match.participant1Id || !match.participant2Id) return
    const call: MatchCall = {
      id: genId(),
      matchId,
      tournamentId,
      eventId,
      tableNo: callTableNo,
      participant1Name: pMap[match.participant1Id]?.name ?? '?',
      participant2Name: pMap[match.participant2Id]?.name ?? '?',
      eventLabel: match.eventLabel,
      calledAt: new Date().toISOString(),
      acknowledged: false,
    }
    addMatchCall(call)
    setCallMatchKey('')
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`🏓 경기 호출 — ${callTableNo}번대`, {
        body: `${call.participant1Name} vs ${call.participant2Name} (${call.eventLabel})`,
        icon: '/favicon.ico',
      })
    }
  }

  return (
    <div className="page-shell">
      {/* Page header */}
      <div className="page-header">
        <h1 className="text-base font-bold flex items-center gap-2">
          <LayoutDashboard size={17} className="text-indigo-500" /> 운영 대시보드
        </h1>
        <div className="ml-auto flex items-center gap-3">
          {scoreRecords.length > 0 && (
            <button onClick={() => exportScoreRecordsCSV(scoreRecords, pMap, tournaments)}
              className="btn-secondary flex items-center gap-1.5">
              <Download size={13} /> 기록 CSV
            </button>
          )}
          {'Notification' in window && Notification.permission === 'default' && (
            <button onClick={() => Notification.requestPermission()}
              className="text-xs text-gray-500 border border-gray-200 px-2 py-1.5 rounded-lg flex items-center gap-1 hover:bg-gray-50">
              <Bell size={12} /> 알림 허용
            </button>
          )}
          <div className="text-xl font-mono font-bold text-gray-700 tabular-nums">{formatTime(now)}</div>
        </div>
      </div>

      {/* Stats row */}
      {(() => {
        const todayISO = new Date().toISOString().slice(0, 10)
        const todayRecords = scoreRecords.filter(r => r.recordedAt.slice(0, 10) === todayISO).length
        return (
          <div className="flex-shrink-0 grid grid-cols-5 gap-3 px-4 py-3 bg-white border-b border-gray-100">
            <DashCard icon="🏓" label="진행중 대회" value={activeTournaments.length} color="border-blue-200 bg-blue-50" />
            <DashCard icon="⏳" label="대기중 경기" value={pendingMatches.length} color="border-yellow-200 bg-yellow-50" />
            <DashCard icon="✅" label="완료 경기" value={completedMatches.length} color="border-green-200 bg-green-50" />
            <DashCard icon="🔴" label="실시간 스코어" value={liveMatches.length} color="border-red-200 bg-red-50" />
            <DashCard icon="📋" label="오늘 기록" value={todayRecords} color="border-purple-200 bg-purple-50" />
          </div>
        )
      })()}

      {/* 체크인 현황 칩 */}
      {players.length > 0 && (() => {
        const checkedIn = players.filter(p => p.checkedIn).length
        if (checkedIn === 0) return null
        const pct = Math.round(checkedIn / players.length * 100)
        return (
          <div className="flex-shrink-0 px-4 py-1.5 bg-teal-50 border-b border-teal-100 flex items-center gap-2">
            <span className="text-[10px] font-semibold text-teal-600 flex-shrink-0">체크인</span>
            <div className="flex-1 h-1.5 bg-teal-100 rounded-full overflow-hidden max-w-[100px]">
              <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-bold text-teal-700">{checkedIn}/{players.length}</span>
            <span className="text-[10px] text-teal-500">{pct}%</span>
            {players.length - checkedIn > 0 && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium ml-auto">미체크인 {players.length - checkedIn}명</span>}
          </div>
        )
      })()}

      {/* 대회별 진행률 요약 */}
      {activeTournaments.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-gray-50 border-b border-gray-100">
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 items-center">
            {activeTournaments.map(t => {
              const total = t.events.reduce((s, ev) => s + ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length, 0)
              const done = t.events.reduce((s, ev) => s + ev.matches.filter(m => m.result).length, 0)
              const pct = total > 0 ? Math.round(done / total * 100) : 0
              return (
                <div key={t.id} className="flex items-center gap-2 min-w-[180px]">
                  <span className="text-xs text-gray-600 truncate max-w-[100px]" title={t.name}>{t.name}</span>
                  <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={`text-xs font-bold flex-shrink-0 ${pct === 100 ? 'text-green-600' : 'text-blue-600'}`}>{pct}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 활성 대회별 종목 미완료 경기 현황 */}
      {activeTournaments.length > 0 && (() => {
        const rows = activeTournaments.flatMap(t =>
          t.events
            .map(ev => ({ tName: t.name, evLabel: ev.label, pending: ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye && !m.result).length }))
            .filter(r => r.pending > 0)
        )
        if (rows.length === 0) return null
        return (
          <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold text-gray-500 flex-shrink-0">종목 잔여</span>
              {rows.map((r, i) => (
                <span key={i} className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                  {r.tName.length > 6 ? r.tName.slice(0, 6) + '…' : r.tName} · {r.evLabel} <strong>{r.pending}</strong>
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* 종목 완료 알림 배너 */}
      {completedEvents.length > 0 && (
        <div className="flex-shrink-0 px-4 py-2 bg-green-50 border-b border-green-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-green-700 flex-shrink-0">✅ 종목 완료</span>
            {completedEvents.map((ev, i) => (
              <span key={i} className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                {ev.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 코트 현황판 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-semibold text-gray-600">코트 현황</span>
            <span className="text-[10px] text-gray-400 flex items-center gap-1.5">
              {liveCourts > 0 && <span className="text-red-500 font-semibold">LIVE {liveCourts}</span>}
              {calledCourts > 0 && <span className="text-orange-500 font-semibold">호출 {calledCourts}</span>}
              <span>빈 {freeCourts}/{courts.length}</span>
            </span>
            {freeCourts > 0 && freeCourts <= 6 && (
              <div className="flex items-center gap-1">
                {courts.filter(c => c.status === 'free').map(c => (
                  <span key={c.no} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{c.no}번</span>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {courts.map(c => {
              const cls = c.status === 'live'
                ? 'border-red-300 bg-red-50'
                : c.status === 'called'
                ? 'border-orange-300 bg-orange-50'
                : 'border-gray-200 bg-gray-50'
              const dot = c.status === 'live' ? 'bg-red-500 animate-pulse' : c.status === 'called' ? 'bg-orange-400' : 'bg-gray-300'
              const isActive = c.status === 'live' || c.status === 'called'
              return (
                <div key={c.no} className="relative flex-shrink-0">
                  <div
                    className={`rounded-lg border px-2 py-1 min-w-[92px] ${cls} ${isActive ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
                    onClick={() => {
                      if (c.status === 'called') {
                        const call = pendingCalls.find(pc => pc.tableNo === c.no)
                        if (call) {
                          setHighlightCallId(call.id)
                          setTimeout(() => setHighlightCallId(null), 2500)
                          document.getElementById(`call-${call.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                        }
                      }
                      isActive && setCourtPopover(courtPopover === c.no ? null : c.no)
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-gray-700">{c.no}번대</span>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
                    </div>
                    <div className={`text-[10px] truncate ${c.status === 'free' ? 'text-gray-400' : 'text-gray-600 font-medium'}`}>{c.label}</div>
                  </div>
                  {courtPopover === c.no && (() => {
                    const call = pendingCalls.find(pc => pc.tableNo === c.no)
                    const live = liveMatches.find(lm => lm.tableNo === c.no)
                    const elapsedMin = call ? Math.floor((now.getTime() - new Date(call.calledAt).getTime()) / 60000) : null
                    return (
                      <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 min-w-[180px]"
                        onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-gray-700">{c.no}번 코트</span>
                          <button onClick={() => setCourtPopover(null)} className="text-gray-300 hover:text-gray-500"><X size={13} /></button>
                        </div>
                        {call && (
                          <div className="space-y-1">
                            <div className="text-[11px] font-semibold text-orange-700 bg-orange-50 px-2 py-1 rounded">{call.eventLabel}</div>
                            <div className="text-xs font-bold text-gray-800">{call.participant1Name}</div>
                            <div className="text-[10px] text-gray-400 text-center">vs</div>
                            <div className="text-xs font-bold text-gray-800">{call.participant2Name}</div>
                            <div className="flex items-center justify-between mt-1 pt-1 border-t border-gray-100">
                              <span className="text-[10px] text-gray-400">{new Date(call.calledAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 호출</span>
                              {elapsedMin !== null && <span className={`text-[10px] font-mono px-1 rounded ${elapsedMin >= 10 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>{elapsedMin}분</span>}
                            </div>
                            <button onClick={() => { acknowledgeMatchCall(call.id); setCourtPopover(null) }}
                              className="w-full mt-1 bg-green-100 text-green-700 text-xs py-1 rounded hover:bg-green-200 flex items-center justify-center gap-1">
                              <BellOff size={10} /> 호출 확인
                            </button>
                          </div>
                        )}
                        {live && !call && (
                          <div className="space-y-1">
                            <div className="text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-1 rounded flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" /> LIVE
                            </div>
                            <div className="text-xs font-bold text-gray-800">{pMap[live.participant1Id]?.name ?? '?'}</div>
                            <div className="text-center font-black text-lg text-blue-600">{live.currentSetScore[0]}<span className="text-gray-300 mx-1">:</span><span className="text-red-500">{live.currentSetScore[1]}</span></div>
                            <div className="text-xs font-bold text-gray-800 text-right">{pMap[live.participant2Id]?.name ?? '?'}</div>
                            <div className="text-[10px] text-gray-400 text-center">{live.completedSets.length + 1}세트 진행중</div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 3-column content */}
      <div className="flex-1 min-h-0 grid grid-cols-3 gap-3 p-4">

        {/* ── Col 1: Unverified + Live matches ── */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          {unverifiedRecords.length > 0 && (
            <div className="flex-shrink-0 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                  <AlertTriangle size={13} className="text-amber-500" />
                  미확인 기록 {unverifiedRecords.length}건
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => unverifiedRecords.forEach(r => verifyScoreRecord(r.id))}
                    className="px-2 py-1 bg-amber-500 text-white text-xs rounded-lg hover:bg-amber-600">전체 확인</button>
                  <button onClick={() => exportScoreRecordsCSV(scoreRecords, pMap, tournaments)}
                    className="px-2 py-1 bg-white border border-amber-300 text-amber-700 text-xs rounded-lg flex items-center gap-1 hover:bg-amber-50">
                    <Download size={11} /> CSV
                  </button>
                </div>
              </div>
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {unverifiedRecords.slice(0, 8).map(r => {
                  const p1 = pMap[r.participant1Id]?.name ?? '?'
                  const p2 = pMap[r.participant2Id]?.name ?? '?'
                  return (
                    <div key={r.id} className="flex items-center gap-2 bg-white rounded px-2 py-1.5 border border-amber-100 text-xs">
                      <span className="flex-1 font-medium truncate">{p1} vs {p2}</span>
                      <span className="text-gray-500">{r.p1Score}-{r.p2Score}</span>
                      <button onClick={() => verifyScoreRecord(r.id)}
                        className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded hover:bg-green-200">확인</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="card flex-1 min-h-0 flex flex-col overflow-hidden">
            <h2 className="font-semibold text-sm text-gray-700 mb-2 flex-shrink-0 flex items-center gap-2">
              <Play size={13} className="text-red-500" /> 실시간 진행중
              {liveMatches.length > 0 && (
                <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full animate-pulse">LIVE</span>
              )}
            </h2>
            {liveMatches.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-300">진행중 없음</div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                {(() => {
                  const withElapsed = liveMatches.map(lm => {
                    const relatedCall = matchCalls.find(c => c.matchId === lm.matchId)
                    const elapsed = relatedCall ? Math.floor((now.getTime() - new Date(relatedCall.calledAt).getTime()) / 60000) : null
                    return { lm, elapsed }
                  })
                  const maxElapsed = Math.max(...withElapsed.map(x => x.elapsed ?? 0))
                  return withElapsed.map(({ lm, elapsed: liveElapsed }) => {
                  const isLongest = liveElapsed !== null && liveElapsed >= 60 && liveElapsed === maxElapsed
                  const p1 = pMap[lm.participant1Id]
                  const p2 = pMap[lm.participant2Id]
                  const sets1 = lm.completedSets.filter(([a, b]) => a > b).length
                  const sets2 = lm.completedSets.filter(([a, b]) => b > a).length
                  return (
                    <div key={lm.matchId}
                      className={`border-2 rounded-xl p-3 cursor-pointer hover:shadow-md ${isLongest ? 'border-red-500 bg-red-100 ring-1 ring-red-400' : 'border-red-200 bg-red-50'}`}
                      onClick={() => navigate('/score')}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-red-500">탁구대 {lm.tableNo}번</span>
                        <div className="flex items-center gap-1.5">
                          {isLongest && <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold animate-pulse">장기경기</span>}
                          {liveElapsed !== null && (
                            <span className={`text-[10px] font-mono px-1 rounded ${liveElapsed >= 15 ? 'bg-red-200 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                              {liveElapsed}분
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{lm.completedSets.length + 1}세트</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-center">
                        <div className="flex-1">
                          <div className="font-bold text-xs truncate">{p1?.name ?? '?'}</div>
                          <div className="text-2xl font-black text-blue-600">{lm.currentSetScore[0]}</div>
                          <div className="text-xs text-gray-400">세트 {sets1}</div>
                        </div>
                        <div className="text-gray-300 font-bold">:</div>
                        <div className="flex-1">
                          <div className="font-bold text-xs truncate">{p2?.name ?? '?'}</div>
                          <div className="text-2xl font-black text-red-500">{lm.currentSetScore[1]}</div>
                          <div className="text-xs text-gray-400">세트 {sets2}</div>
                        </div>
                      </div>
                    </div>
                  )
                  })
                })()}
              </div>
            )}
          </div>
        </div>

        {/* ── Col 2: Pending matches ── */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          <h2 className="font-semibold text-sm text-gray-700 mb-2 flex-shrink-0 flex items-center gap-2">
            <Clock size={13} className="text-yellow-500" /> 대기중인 경기
            <span className="text-xs text-gray-400 font-normal">
              ({pendingTourFilter ? `${filteredPendingMatches.length}/` : ''}{pendingMatches.length})
            </span>
            {pendingMatches.length >= 20 && (
              <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">
                ⚠ {pendingMatches.length}적체
              </span>
            )}
            {callablePendingKeys.length > 0 && (
              <div className="ml-auto flex items-center gap-1.5">
                <label className="flex items-center gap-1 cursor-pointer text-[11px] text-gray-500">
                  <input
                    type="checkbox"
                    checked={selectedMatchKeys.size === callablePendingKeys.length && callablePendingKeys.length > 0}
                    onChange={() => toggleSelectAll(callablePendingKeys)}
                    className="w-3 h-3"
                  />
                  전체
                </label>
                {selectedMatchKeys.size > 0 && (
                  <>
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number" min={1} max={30} value={bulkTableNo}
                        onChange={e => setBulkTableNo(Number(e.target.value) || 1)}
                        className="w-8 text-xs text-center border border-gray-200 rounded px-0.5 py-0.5 bg-white"
                        title="일괄 배정 코트 번호"
                      />
                      <button onClick={bulkAssignTable}
                        className="text-[11px] bg-blue-500 text-white px-2 py-0.5 rounded font-medium whitespace-nowrap">
                        {selectedMatchKeys.size}개 코트배정
                      </button>
                    </div>
                    <button onClick={bulkCall}
                      className="text-[11px] bg-orange-500 text-white px-2 py-0.5 rounded font-medium whitespace-nowrap">
                      {selectedMatchKeys.size}개 일괄 호출
                    </button>
                  </>
                )}
              </div>
            )}
          </h2>
          {activeTournaments.length > 1 && (
            <select
              value={pendingTourFilter}
              onChange={e => { setPendingTourFilter(e.target.value); setSelectedMatchKeys(new Set()) }}
              className="mb-1.5 w-full text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white flex-shrink-0"
            >
              <option value="">전체 대회</option>
              {activeTournaments.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          )}
          {pendingMatches.length > 1 && (
            <div className="flex items-center gap-1 mb-1.5 flex-shrink-0">
              <span className="text-[10px] text-gray-400">정렬:</span>
              {(['round', 'event', 'points'] as const).map(opt => (
                <button key={opt} onClick={() => setPendingSort(opt)}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${pendingSort === opt ? 'bg-blue-100 text-blue-600 border-blue-300 font-semibold' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                  {opt === 'round' ? '라운드순' : opt === 'event' ? '종목별' : '포인트순'}
                </button>
              ))}
            </div>
          )}
          {sortedPendingMatches.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-300">대기중 없음</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
              {sortedPendingMatches.map(m => {
                const mKey = `${m.tournamentId}-${m.eventId}-${m.id}`
                const p1 = m.participant1Id ? pMap[m.participant1Id] : null
                const p2 = m.participant2Id ? pMap[m.participant2Id] : null
                const alreadyCalled = matchCalls.some(c => !c.acknowledged && c.matchId === m.id)
                const hasConflict = !alreadyCalled && (
                  (!!m.participant1Id && calledParticipantIds.has(m.participant1Id)) ||
                  (!!m.participant2Id && calledParticipantIds.has(m.participant2Id))
                )
                return (
                  <div key={mKey}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs ${hasConflict ? 'bg-red-50 border border-red-100' : 'bg-gray-50'}`}>
                    {!alreadyCalled && m.participant1Id && m.participant2Id && (
                      <input
                        type="checkbox"
                        checked={selectedMatchKeys.has(mKey)}
                        onChange={() => toggleSelectMatch(mKey)}
                        onClick={e => e.stopPropagation()}
                        className="flex-shrink-0 w-3 h-3"
                      />
                    )}
                    <span className="text-gray-400 font-medium w-14 truncate flex-shrink-0">{m.eventLabel}</span>
                    <span className="flex-1 font-medium truncate">{p1?.name ?? '?'} vs {p2?.name ?? '?'}</span>
                    {hasConflict && (
                      <span className="text-red-600 bg-red-100 border border-red-200 px-1 rounded flex-shrink-0 text-[10px]" title="이 경기의 선수가 이미 다른 경기에 호출되어 있습니다">충돌</span>
                    )}
                    {(isUnchecked(m.participant1Id) || isUnchecked(m.participant2Id)) && (
                      <span className="text-amber-600 bg-amber-50 border border-amber-200 px-1 rounded flex-shrink-0 text-[10px]" title="체크인하지 않은 선수가 있습니다">미체크인</span>
                    )}
                    {(walkinIds.has(m.participant1Id ?? '') || walkinIds.has(m.participant2Id ?? '')) && (
                      <span className="text-orange-600 bg-orange-50 border border-orange-200 px-1 rounded flex-shrink-0 text-[10px]" title="현장 신규등록 선수">현장</span>
                    )}
                    {m.tableNo && (
                      <span className="text-blue-600 bg-blue-50 border border-blue-200 px-1 rounded flex-shrink-0 text-[10px]" title="일정표 배정 코트">
                        배정 {m.tableNo}번
                      </span>
                    )}
                    {alreadyCalled && <span className="text-orange-500 flex-shrink-0 text-[10px]">호출됨</span>}
                    {!alreadyCalled && (() => {
                      const tNo = rowTableNos[mKey] ?? m.tableNo ?? callTableNo
                      return (
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <input
                            type="number" min={1} max={30} value={tNo}
                            onChange={e => setRowTableNos(prev => ({ ...prev, [mKey]: Number(e.target.value) || 1 }))}
                            onClick={e => e.stopPropagation()}
                            className="w-8 text-xs text-center border border-gray-200 rounded px-0.5 py-0.5 bg-white"
                            title="코트 번호"
                          />
                          <button
                            onClick={() => {
                              if (!m.participant1Id || !m.participant2Id) return
                              const call: MatchCall = {
                                id: genId(), matchId: m.id, tournamentId: m.tournamentId,
                                eventId: m.eventId, tableNo: tNo,
                                participant1Name: pMap[m.participant1Id]?.name ?? '?',
                                participant2Name: pMap[m.participant2Id]?.name ?? '?',
                                eventLabel: m.eventLabel, calledAt: new Date().toISOString(), acknowledged: false,
                              }
                              addMatchCall(call)
                              if ('Notification' in window && Notification.permission === 'granted') {
                                new Notification(`🏓 경기 호출 — ${tNo}번대`, {
                                  body: `${call.participant1Name} vs ${call.participant2Name}`,
                                  icon: '/favicon.ico',
                                })
                              }
                            }}
                            className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded hover:bg-orange-200">
                            <Bell size={9} className="inline mr-0.5" />호출
                          </button>
                        </div>
                      )
                    })()}
                    <button onClick={() => navigate('/score')}
                      className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-200 flex-shrink-0">
                      입력
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Col 3: Match calling + progress + recent results ── */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Match calling */}
          <div className="card flex-shrink-0">
            <h2 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
              <Bell size={13} className="text-orange-500" /> 경기 호출
              {pendingCalls.length > 0 && (
                <span className="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full animate-pulse">
                  {pendingCalls.length}건
                </span>
              )}
            </h2>
            <div className="flex gap-1.5 mb-1.5 items-center">
              <input
                className="input flex-1 min-w-0 py-1 text-xs"
                placeholder="선수명 검색..."
                value={callSearch}
                onChange={e => setCallSearch(e.target.value)}
              />
              {(() => {
                const firstFree = courts.find(c => c.status === 'free')?.no
                return firstFree && firstFree !== callTableNo ? (
                  <button type="button" onClick={() => setCallTableNo(firstFree)}
                    className="text-[10px] px-1.5 py-1 rounded bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 flex-shrink-0 whitespace-nowrap"
                    title="비어 있는 코트로 설정">빈 {firstFree}번</button>
                ) : null
              })()}
              <input className="input w-14 text-center py-1" type="number" min={1} max={99}
                value={callTableNo} onChange={e => setCallTableNo(Number(e.target.value))} />
            </div>
            <div className="flex gap-1.5 mb-2">
              <select className="select flex-1 min-w-0 py-1" value={callMatchKey}
                onChange={e => setCallMatchKey(e.target.value)}>
                <option value="">경기 선택... ({pendingMatches.length}개 대기)</option>
                {pendingMatches
                  .filter(m => {
                    if (!callSearch) return true
                    const p1 = m.participant1Id ? pMap[m.participant1Id]?.name ?? '' : ''
                    const p2 = m.participant2Id ? pMap[m.participant2Id]?.name ?? '' : ''
                    const q = callSearch.toLowerCase()
                    return p1.toLowerCase().includes(q) || p2.toLowerCase().includes(q) || (m.eventLabel ?? '').toLowerCase().includes(q)
                  })
                  .map(m => {
                    const p1 = m.participant1Id ? pMap[m.participant1Id]?.name : '?'
                    const p2 = m.participant2Id ? pMap[m.participant2Id]?.name : '?'
                    const key = `${m.tournamentId}|${m.eventId}|${m.id}`
                    return <option key={key} value={key}>[{m.eventLabel}] {p1} vs {p2}</option>
                  })}
              </select>
              <button onClick={handleCallMatch} disabled={!callMatchKey}
                className="px-2.5 py-1 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50 flex items-center gap-1 hover:bg-blue-700 flex-shrink-0">
                <Bell size={11} /> 호출
              </button>
            </div>
            {activeTournaments.length > 1 && matchCalls.length > 0 && (
              <select className="select w-full py-0.5 text-xs mb-1.5" value={callTourFilter}
                onChange={e => setCallTourFilter(e.target.value)}>
                <option value="">전체 대회</option>
                {activeTournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {matchCalls.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">호출 없음</p>
              ) : (
                [...matchCalls].reverse().filter(c => !callTourFilter || c.tournamentId === callTourFilter).map(c => {
                  const callElapsed = Math.floor((now.getTime() - new Date(c.calledAt).getTime()) / 60000)
                  const isOverdue = !c.acknowledged && callElapsed >= 5
                  return (
                  <div key={c.id} id={`call-${c.id}`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all ${c.acknowledged ? 'bg-gray-50 opacity-60' : isOverdue ? 'bg-red-50 border border-red-400 animate-pulse' : highlightCallId === c.id ? 'bg-yellow-50 border border-yellow-400 ring-2 ring-yellow-300' : 'bg-orange-50 border border-orange-200'}`}>
                    <span className={`font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${c.acknowledged ? 'bg-gray-200 text-gray-500' : isOverdue ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
                      {c.tableNo}번
                    </span>
                    <span className="flex-1 truncate font-medium">{c.participant1Name} vs {c.participant2Name}</span>
                    {isOverdue && <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold flex-shrink-0">⚠ 미응답</span>}
                    <span className="text-gray-400 flex-shrink-0 flex items-center gap-1">
                      {new Date(c.calledAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      {!c.acknowledged && (
                        <span className={`font-mono text-[10px] px-1 rounded ${callElapsed >= 5 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                          {callElapsed}분
                        </span>
                      )}
                    </span>
                    {!c.acknowledged ? (
                      <button onClick={() => acknowledgeMatchCall(c.id)}
                        className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded hover:bg-green-200 flex items-center gap-0.5">
                        <BellOff size={10} /> 확인
                      </button>
                    ) : (
                      <button onClick={() => removeMatchCall(c.id)} className="text-gray-300 hover:text-red-400 p-0.5">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Event progress */}
          {activeTournaments.length > 0 && (
            <div className="card flex-shrink-0">
              <h2 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                <Trophy size={13} className="text-blue-500" /> 종목별 진행률
              </h2>
              <div className="space-y-1.5">
                {activeTournaments.flatMap(t =>
                  t.events.map(ev => {
                    const total = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length
                    const done = ev.matches.filter(m => m.result && !m.result.walkedOver).length
                    const pct = total > 0 ? Math.round(done / total * 100) : 0
                    return { key: `${t.id}-${ev.id}`, label: ev.label, total, done, pct }
                  })
                ).slice(0, 10).map(({ key, label, total, done, pct }) => (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-medium truncate flex-1 mr-2">{label}</span>
                      <span className="text-gray-400 flex-shrink-0">{done}/{total} ({pct}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Call history */}
          {(() => {
            const recentCalls = [...matchCalls].filter(c => c.acknowledged).reverse().slice(0, 5)
            if (recentCalls.length === 0) return null
            return (
              <div className="card flex-shrink-0">
                <h2 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                  <Bell size={13} className="text-gray-400" /> 최근 호출 이력
                  <span className="text-xs text-gray-400 font-normal">최근 {recentCalls.length}건</span>
                  <button onClick={() => exportMatchCallsCSV(matchCalls)}
                    className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-100">
                    <Download size={11} /> CSV
                  </button>
                </h2>
                <div className="space-y-1">
                  {recentCalls.map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-xs bg-gray-50 rounded px-2 py-1">
                      <span className="text-gray-400 font-medium flex-shrink-0">{c.tableNo}번대</span>
                      <span className="flex-1 truncate">{c.participant1Name} vs {c.participant2Name}</span>
                      <span className="text-gray-300 flex-shrink-0">
                        {new Date(c.calledAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Recent results */}
          <div className="card flex-1 min-h-0 flex flex-col overflow-hidden">
            <h2 className="font-semibold text-sm text-gray-700 mb-2 flex-shrink-0 flex items-center gap-2">
              <CheckCircle size={13} className="text-green-500" /> 최근 완료 경기
            </h2>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
              {scoreRecords.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">완료된 경기 없음</p>
              ) : (
                [...scoreRecords].reverse().slice(0, 20).map(r => {
                  const n1 = pMap[r.participant1Id]?.name ?? '?'
                  const n2 = pMap[r.participant2Id]?.name ?? '?'
                  const winner = r.p1Score > r.p2Score ? n1 : n2
                  return (
                    <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded text-xs">
                      <Trophy size={10} className="text-yellow-500 flex-shrink-0" />
                      <span className="font-medium text-blue-700 flex-shrink-0">{winner}</span>
                      <span className="flex-1 text-gray-400 truncate">
                        ({n1} {r.p1Score}-{r.p2Score} {n2})
                      </span>
                      <span className="text-gray-300 flex-shrink-0">
                        {new Date(r.recordedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

function DashCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className={`border-2 rounded-xl p-3 text-center ${color}`}>
      <div className="text-xl mb-0.5">{icon}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}
