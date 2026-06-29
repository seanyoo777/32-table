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
  const { tournaments, players, pairs, scoreRecords, liveMatches, matchCalls, addMatchCall, acknowledgeMatchCall, removeMatchCall, updateMatchCallTable, verifyScoreRecord } = useStore()
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
  const [pendingSearch, setPendingSearch] = useState('')
  const [callTourFilter, setCallTourFilter] = useState('')
  const [bulkTableNo, setBulkTableNo] = useState(1)
  const [pendingSort, setPendingSort] = useState<'round' | 'points' | 'event'>('round')
  const [courtExpanded, setCourtExpanded] = useState(false)
  const [editingCallId, setEditingCallId] = useState<string | null>(null)
  const [editCallTable, setEditCallTable] = useState(1)
  const [copiedCallId, setCopiedCallId] = useState<string | null>(null)
  const [flashAckCallId, setFlashAckCallId] = useState<string | null>(null)
  const [liveEventFilter, setLiveEventFilter] = useState<string | null>(null)
  const [showCallHistory, setShowCallHistory] = useState(false)
  const [dismissPendingBanner, setDismissPendingBanner] = useState(false)
  const [dismissOverdueBanner, setDismissOverdueBanner] = useState(false)

  // 경기 선택 시 첫 번째 빈 코트를 callTableNo에 자동 제안
  useEffect(() => {
    if (!callMatchKey) return
    const firstFree = courts.find(c => c.status === 'free')?.no
    if (firstFree) setCallTableNo(firstFree)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMatchKey])

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
  const avgMatchMin = (() => {
    const withTime = scoreRecords.filter(r => r.sets && r.sets.length > 0)
    if (withTime.length < 3) return null
    const totalSets = withTime.reduce((s, r) => s + (r.sets?.length ?? 0), 0)
    const avgSets = totalSets / withTime.length
    const estMin = Math.round(avgSets * 5)
    return estMin > 0 ? estMin : null
  })()
  const filteredPendingMatches = (() => {
    let list = pendingTourFilter ? pendingMatches.filter(m => m.tournamentId === pendingTourFilter) : pendingMatches
    if (pendingSearch.trim()) {
      const q = pendingSearch.trim().toLowerCase()
      const nameOf = (id: string) => {
        const pl = players.find(p => p.id === id); if (pl) return pl.name
        const pr = pairs.find(p => p.id === id); if (pr) { const p1 = players.find(p => p.id === pr.player1Id); const p2 = players.find(p => p.id === pr.player2Id); return `${p1?.name ?? ''} ${p2?.name ?? ''}` }
        return id
      }
      list = list.filter(m => nameOf(m.participant1Id ?? '').toLowerCase().includes(q) || nameOf(m.participant2Id ?? '').toLowerCase().includes(q))
    }
    return list
  })()
  const pointMap = Object.fromEntries([
    ...players.map(p => [p.id, p.points]),
    ...pairs.map(p => [p.id, Math.max(...[p.player1Id, p.player2Id].map(id => players.find(pl => pl.id === id)?.points ?? 0))]),
  ])
  const maxDiffMatchId = (() => {
    if (filteredPendingMatches.length < 3) return null
    let best: { id: string; diff: number } | null = null
    filteredPendingMatches.forEach(m => {
      if (!m.participant1Id || !m.participant2Id) return
      const diff = Math.abs((pointMap[m.participant1Id] ?? 0) - (pointMap[m.participant2Id] ?? 0))
      if (diff >= 100 && (!best || diff > best.diff)) best = { id: m.id, diff }
    })
    return best?.id ?? null
  })()
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
        const todayRecs = scoreRecords.filter(r => r.recordedAt.slice(0, 10) === todayISO)
        const todayRecords = todayRecs.length
        const hourCounts = Array.from({ length: 24 }, (_, h) => todayRecs.filter(r => new Date(r.recordedAt).getHours() === h).length)
        const maxHour = Math.max(...hourCounts, 1)
        const currentHour = now.getHours()
        const todayStreakStr = (() => {
          if (todayRecs.length < 2) return undefined
          const winMap = new Map<string, number>()
          const sorted = [...todayRecs].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
          sorted.forEach(r => {
            const winner = r.p1Score > r.p2Score ? r.participant1Id : r.participant2Id
            const loser = r.p1Score > r.p2Score ? r.participant2Id : r.participant1Id
            winMap.set(winner, (winMap.get(winner) ?? 0) + 1)
            winMap.set(loser, 0)
          })
          let bestId = '', bestN = 0
          winMap.forEach((n, id) => { if (n > bestN) { bestN = n; bestId = id } })
          if (bestN < 2) return undefined
          return `${pMap[bestId]?.name ?? '?'} ${bestN}연승`
        })()
        return (
          <>
            <div className="flex-shrink-0 grid grid-cols-6 gap-3 px-4 py-3 bg-white border-b border-gray-100">
              <DashCard icon="🏓" label="진행중 대회" value={activeTournaments.length} color="border-blue-200 bg-blue-50" />
              <DashCard icon="⏳" label="대기중 경기" value={pendingMatches.length} color="border-yellow-200 bg-yellow-50" sub={avgMatchMin && pendingMatches.length > 0 ? `약 ${pendingMatches.length * avgMatchMin}분` : undefined} />
              <DashCard icon="✅" label="완료 경기" value={completedMatches.length} color="border-green-200 bg-green-50" sub={todayRecords > 0 ? `오늘 ${todayRecords}건` : undefined} />
              <DashCard icon="🔴" label="실시간 스코어" value={liveMatches.length} color="border-red-200 bg-red-50" sub={(() => {
                if (liveMatches.length === 0) return undefined
                const elapseds = liveMatches.map(lm => {
                  const call = matchCalls.find(c => c.matchId === lm.matchId)
                  return call ? Math.floor((now.getTime() - new Date(call.calledAt).getTime()) / 60000) : null
                }).filter((x): x is number => x !== null)
                if (elapseds.length === 0) return undefined
                return `평균 ${Math.round(elapseds.reduce((s, n) => s + n, 0) / elapseds.length)}분`
              })()} />
              <DashCard icon="📋" label="오늘 기록" value={todayRecords} color="border-purple-200 bg-purple-50" sub={todayStreakStr} />
              {(() => {
                const R = 11, circ = 2 * Math.PI * R
                const verifiedN = todayRecs.filter(r => r.verified).length
                const unverN = todayRecs.length - verifiedN
                if (todayRecs.length === 0) return <DashCard icon="📊" label="검증 현황" value={0} color="border-gray-200 bg-gray-50" />
                const verPct = Math.round(verifiedN / todayRecs.length * 100)
                const dash = (verifiedN / todayRecs.length) * circ
                return (
                  <div className="border-2 border-green-200 bg-green-50 rounded-xl p-3 text-center flex flex-col items-center justify-center">
                    <svg width={26} height={26} viewBox="0 0 26 26" className="mb-0.5">
                      <circle cx={13} cy={13} r={R} fill="none" stroke="#fde68a" strokeWidth={4} />
                      <circle cx={13} cy={13} r={R} fill="none" stroke="#22c55e" strokeWidth={4}
                        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 13 13)" />
                      <text x={13} y={16} textAnchor="middle" fontSize="6" fill="#374151" fontWeight="bold">{verPct}%</text>
                    </svg>
                    <div className="text-[10px] text-gray-500 leading-tight">검증 {verifiedN}/{todayRecs.length}</div>
                    {unverN > 0 && <div className="text-[9px] text-amber-600">미확인 {unverN}</div>}
                  </div>
                )
              })()}
            </div>
            {todayRecords > 0 && (
              <div className="flex-shrink-0 px-4 py-1.5 bg-white border-b border-gray-50 flex items-end gap-0.5" title="오늘 시간대별 경기 기록 수">
                {hourCounts.map((cnt, h) => (
                  <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                    <div
                      className={`w-full rounded-sm transition-all ${cnt > 0 ? (h === currentHour ? 'bg-purple-500' : 'bg-purple-200') : 'bg-gray-100'}`}
                      style={{ height: `${Math.max(2, Math.round(cnt / maxHour * 20))}px` }}
                    />
                  </div>
                ))}
              </div>
            )}
            {todayRecs.length >= 2 && (() => {
              const freq = new Map<string, number>()
              todayRecs.forEach(r => {
                freq.set(r.participant1Id, (freq.get(r.participant1Id) ?? 0) + 1)
                freq.set(r.participant2Id, (freq.get(r.participant2Id) ?? 0) + 1)
              })
              const top3 = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
              if (top3.length === 0 || top3[0][1] < 2) return null
              const maxN = top3[0][1]
              return (
                <div className="flex-shrink-0 px-4 py-1.5 bg-white border-b border-gray-50 flex items-center gap-3">
                  <span className="text-[10px] text-gray-400 flex-shrink-0">오늘 최다</span>
                  {top3.map(([id, n]) => (
                    <div key={id} className="flex items-center gap-1 flex-1 min-w-0">
                      <span className="text-[11px] font-medium text-gray-700 truncate flex-shrink-0 max-w-[60px]">{pMap[id]?.name ?? '?'}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.round(n / maxN * 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-indigo-600 font-bold flex-shrink-0">{n}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </>
        )
      })()}

      {/* 체크인 현황 칩 */}
      {players.length > 0 && (() => {
        const checkedIn = players.filter(p => p.checkedIn).length
        if (checkedIn === 0) return null
        const pct = Math.round(checkedIn / players.length * 100)
        return (
          <div className="flex-shrink-0 px-4 py-1.5 bg-teal-50 border-b border-teal-100">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-teal-600 flex-shrink-0">체크인</span>
              <div className="flex-1 h-1.5 bg-teal-100 rounded-full overflow-hidden max-w-[100px]">
                <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[11px] font-bold text-teal-700">{checkedIn}/{players.length}</span>
              <span className="text-[10px] text-teal-500">{pct}%</span>
              {players.length - checkedIn > 0 && <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-medium ml-auto cursor-pointer hover:bg-orange-200" onClick={() => navigate('/checkin')}>미체크인 {players.length - checkedIn}명</span>}
            </div>
            <div className="flex gap-1 mt-1 overflow-x-auto hide-scrollbar">
              {players.filter(p => p.checkedIn).slice(0, 5).map(p => (
                <span key={p.id} className="text-[10px] bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">{p.name}</span>
              ))}
              {checkedIn > 5 && <span className="text-[10px] text-teal-400 px-1 flex-shrink-0 self-center">+{checkedIn - 5}명</span>}
            </div>
            {(() => {
              const ci = players.filter(p => p.checkedIn)
              const morning = ci.filter(p => new Date(p.createdAt).getHours() < 12).length
              const afternoon = ci.filter(p => { const h = new Date(p.createdAt).getHours(); return h >= 12 && h < 18 }).length
              const evening = ci.filter(p => new Date(p.createdAt).getHours() >= 18).length
              if (morning + afternoon + evening < 2) return null
              return (
                <div className="flex gap-1 mt-0.5">
                  {morning > 0 && <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full font-medium">오전 {morning}</span>}
                  {afternoon > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">오후 {afternoon}</span>}
                  {evening > 0 && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-medium">저녁 {evening}</span>}
                </div>
              )
            })()}
            {players.length - checkedIn > 0 && (
              <div className="flex gap-1 mt-0.5 overflow-x-auto hide-scrollbar">
                {players.filter(p => !p.checkedIn).slice(0, 5).map(p => (
                  <span key={p.id} className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 cursor-pointer hover:bg-orange-200"
                    onClick={() => navigate('/checkin')}>{p.name}</span>
                ))}
                {players.length - checkedIn > 5 && <span className="text-[10px] text-orange-400 px-1 flex-shrink-0 self-center">+{players.length - checkedIn - 5}명</span>}
              </div>
            )}
            {(() => {
              const DIVS = ['초등','중등','고등','대학','일반','생활체육'] as const
              const rows = DIVS.map(d => ({ d, total: players.filter(p => p.division === d).length, done: players.filter(p => p.division === d && p.checkedIn).length })).filter(r => r.total > 0)
              if (rows.length < 2) return null
              return (
                <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-0.5">
                  {rows.map(({ d, total, done }) => (
                    <div key={d} className="flex items-center gap-1">
                      <span className="text-[9px] text-gray-500 w-10 flex-shrink-0">{d}</span>
                      <span className={`text-[9px] font-semibold flex-shrink-0 ${done === total ? 'text-green-600' : done === 0 ? 'text-gray-400' : 'text-teal-600'}`}>{done}/{total}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
            {(() => {
              const fiveMinsAgo = Date.now() - 5 * 60 * 1000
              const recent = players
                .filter(p => p.checkedIn && p.createdAt && new Date(p.createdAt).getTime() >= fiveMinsAgo)
                .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]
              if (!recent) return null
              const diffMs = Date.now() - new Date(recent.createdAt).getTime()
              const diffMin = Math.round(diffMs / 60000)
              return (
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                  <span className="text-[10px] text-green-700 font-medium">방금 체크인: {recent.name}</span>
                  <span className="text-[10px] text-gray-400">{diffMin === 0 ? '방금' : `${diffMin}분 전`}</span>
                </div>
              )
            })()}
            {(() => {
              const todayISO = new Date().toISOString().split('T')[0]
              const todayCheckedIn = players.filter(p => p.checkedIn)
              if (todayCheckedIn.length < 2) return null
              const newToday = todayCheckedIn.filter(p => p.createdAt?.startsWith(todayISO)).length
              const existing = todayCheckedIn.length - newToday
              if (newToday === 0 && existing === 0) return null
              return (
                <div className="flex items-center gap-1.5 mt-1">
                  {newToday > 0 && <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium">신규 {newToday}명</span>}
                  {existing > 0 && <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">기존 {existing}명</span>}
                </div>
              )
            })()}
            {(() => {
              const ci = players.filter(p => p.checkedIn)
              if (ci.length < 3) return null
              const morning = ci.filter(p => new Date(p.createdAt).getHours() < 12).length
              const afternoon = ci.filter(p => { const h = new Date(p.createdAt).getHours(); return h >= 12 && h < 18 }).length
              const evening = ci.filter(p => new Date(p.createdAt).getHours() >= 18).length
              const total = morning + afternoon + evening
              if (total === 0) return null
              const items = [
                { label: '오전', count: morning, color: 'bg-teal-400' },
                { label: '오후', count: afternoon, color: 'bg-amber-400' },
                { label: '저녁', count: evening, color: 'bg-indigo-400' }
              ].filter(i => i.count > 0)
              return (
                <div className="mt-1.5">
                  <div className="flex h-2 rounded-full overflow-hidden gap-px">
                    {items.map(i => (
                      <div key={i.label} className={`${i.color} transition-all`} style={{ width: `${Math.round(i.count / total * 100)}%` }} title={`${i.label} ${i.count}명`} />
                    ))}
                  </div>
                  <div className="flex gap-2 mt-0.5">
                    {items.map(i => (
                      <span key={i.label} className="text-[9px] text-gray-500">{i.label} {i.count}</span>
                    ))}
                  </div>
                </div>
              )
            })()}
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
            .map(ev => ({ tId: t.id, tName: t.name, evLabel: ev.label, pending: ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye && !m.result).length }))
            .filter(r => r.pending > 0)
        )
        if (rows.length === 0) return null
        return (
          <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold text-gray-500 flex-shrink-0">종목 잔여</span>
              {rows.map((r, i) => (
                <button key={i} onClick={() => navigate(`/tournament/${r.tId}`)}
                  className="text-[10px] bg-yellow-50 text-yellow-700 border border-yellow-200 px-1.5 py-0.5 rounded-full whitespace-nowrap hover:bg-yellow-100 transition-colors">
                  {r.tName.length > 6 ? r.tName.slice(0, 6) + '…' : r.tName} · {r.evLabel} <strong>{r.pending}</strong>
                </button>
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

      {/* 미완료 경기 경보 배너 */}
      {!dismissPendingBanner && pendingMatches.length >= 10 && (
        <div className="flex-shrink-0 px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
          <span className="text-amber-600 flex-shrink-0">⚠</span>
          <span className="text-xs font-semibold text-amber-800 flex-shrink-0">미완료 {pendingMatches.length}경기 남음</span>
          <button onClick={() => navigate('/tournament')}
            className="text-xs text-amber-600 hover:text-amber-800 underline flex-shrink-0">대진표 →</button>
          <button onClick={() => setDismissPendingBanner(true)}
            className="ml-auto text-amber-400 hover:text-amber-600 flex-shrink-0">✕</button>
        </div>
      )}

      {/* 미응답 경기 알림 배너 */}
      {!dismissOverdueBanner && (() => {
        const overdueN = matchCalls.filter(c => !c.acknowledged && (Date.now() - new Date(c.calledAt).getTime()) >= 15 * 60 * 1000).length
        if (overdueN === 0) return null
        return (
          <div className="flex-shrink-0 px-4 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2">
            <span className="text-red-500 flex-shrink-0">🚨</span>
            <span className="text-xs font-semibold text-red-700 flex-shrink-0">응답 없음 {overdueN}경기 — 확인 필요</span>
            <button onClick={() => setDismissOverdueBanner(true)} className="ml-auto text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
          </div>
        )
      })()}

      {/* 코트 현황판 */}
      <div className="flex-shrink-0 px-4 py-2 bg-white border-b border-gray-100">
        <div className={courtExpanded ? 'flex flex-col gap-1.5' : 'flex items-center gap-2'}>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-xs font-semibold text-gray-600">코트 현황</span>
            <span className="text-[10px] text-gray-400 flex items-center gap-1.5">
              {liveCourts > 0 && <span className="text-red-500 font-semibold">LIVE {liveCourts}</span>}
              {calledCourts > 0 && <span className="text-orange-500 font-semibold">호출 {calledCourts}</span>}
              <span>빈 {freeCourts}/{courts.length}</span>
            </span>
            {courts.length >= 2 && (
              <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                {liveCourts + calledCourts}활성 · {freeCourts}빈
              </span>
            )}
            {freeCourts > 0 && freeCourts <= 6 && !courtExpanded && (
              <div className="flex items-center gap-1">
                {courts.filter(c => c.status === 'free').map(c => (
                  <span key={c.no} className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">{c.no}번</span>
                ))}
              </div>
            )}
            <button onClick={() => setCourtExpanded(v => !v)}
              className="ml-1 text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50 flex-shrink-0">
              {courtExpanded ? '접기 ▲' : '전체 ▼'}
            </button>
          </div>
          <div className={courtExpanded ? 'flex flex-wrap gap-1 mt-1' : 'flex items-center gap-1.5 overflow-x-auto pb-0.5'}>
            {(() => {
              let oldestLiveCourtNo: number | null = null
              if (liveMatches.length >= 2) {
                let oldest: { tableNo: number; calledAt: string } | null = null
                liveMatches.forEach(lm => {
                  const call = matchCalls.find(mc => mc.matchId === lm.matchId)
                  if (!call?.calledAt) return
                  if (!oldest || call.calledAt < oldest.calledAt) oldest = { tableNo: lm.tableNo, calledAt: call.calledAt }
                })
                if (oldest) oldestLiveCourtNo = (oldest as { tableNo: number; calledAt: string }).tableNo
              }
              return courts.map(c => {
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
                    className={`rounded-lg border px-2 py-1 min-w-[92px] ${cls} ${isActive ? 'cursor-pointer hover:shadow-md transition-shadow' : c.status === 'free' ? 'cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors' : ''} ${c.status === 'free' && callTableNo === c.no ? 'ring-2 ring-blue-400 ring-inset' : ''} ${c.status === 'live' && c.no === oldestLiveCourtNo ? 'animate-pulse ring-2 ring-amber-400' : ''}`}
                    onClick={() => {
                      if (c.status === 'free') {
                        setCallTableNo(c.no)
                        return
                      }
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
                    {c.status === 'live' && (() => {
                      const lm = liveMatches.find(l => l.tableNo === c.no)
                      if (!lm) return null
                      const call = matchCalls.find(mc => mc.matchId === lm.matchId)
                      const elapsedMin = call ? Math.floor((now.getTime() - new Date(call.calledAt).getTime()) / 60000) : null
                      return (
                        <div className="text-[9px] text-red-400 font-medium space-y-0.5">
                          {lm.completedSets.length > 0 && <div>{lm.completedSets.length}세트 완료</div>}
                          {elapsedMin !== null && <div className={elapsedMin >= 20 ? 'text-red-500 font-bold' : ''}>{elapsedMin}분 경과</div>}
                          {elapsedMin === null && <div>진행중</div>}
                        </div>
                      )
                    })()}
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
                              {elapsedMin !== null && <span className={`text-[10px] font-mono px-1 rounded ${elapsedMin >= 15 ? 'bg-red-100 text-red-600' : elapsedMin >= 5 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>{elapsedMin}분 경과</span>}
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
            })
            })()}
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
                      <span className="flex-1 font-medium truncate">
                        <button onClick={() => navigate(`/rankings?search=${encodeURIComponent(p1)}`)} className="hover:text-blue-600 hover:underline">{p1}</button>
                        {' vs '}
                        <button onClick={() => navigate(`/rankings?search=${encodeURIComponent(p2)}`)} className="hover:text-blue-600 hover:underline">{p2}</button>
                      </span>
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
              {liveMatches.length >= 2 && (() => {
                let totalMin = 0
                liveMatches.forEach(lm => {
                  const call = matchCalls.find(mc => mc.matchId === lm.matchId)
                  if (call?.calledAt) totalMin += Math.floor((now.getTime() - new Date(call.calledAt).getTime()) / 60000)
                })
                if (totalMin <= 0) return null
                return <span className="ml-auto text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">총 {totalMin}분</span>
              })()}
            </h2>
            {liveMatches.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-300">진행중 없음</div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                {(() => {
                  const liveEventLabels = [...new Set(liveMatches.map(lm => {
                    const t = tournaments.find(t => t.id === lm.tournamentId)
                    return t?.events.find(ev => ev.id === lm.eventId)?.label ?? lm.eventId
                  }))]
                  return liveEventLabels.length >= 2 && (
                    <div className="flex flex-wrap gap-1 mb-1 flex-shrink-0">
                      <button onClick={() => setLiveEventFilter(null)}
                        className={`text-[10px] px-1.5 py-0.5 rounded-full border ${!liveEventFilter ? 'bg-red-100 text-red-600 border-red-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>전체</button>
                      {liveEventLabels.map(label => (
                        <button key={label} onClick={() => setLiveEventFilter(liveEventFilter === label ? null : label)}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border ${liveEventFilter === label ? 'bg-red-100 text-red-600 border-red-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>{label}</button>
                      ))}
                    </div>
                  )
                })()}
                {(() => {
                  const filteredLiveMatches = liveEventFilter
                    ? liveMatches.filter(lm => {
                        const t = tournaments.find(t => t.id === lm.tournamentId)
                        return t?.events.find(ev => ev.id === lm.eventId)?.label === liveEventFilter
                      })
                    : liveMatches
                  const withElapsed = filteredLiveMatches.map(lm => {
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
                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                              liveElapsed >= 60 ? 'bg-red-200 text-red-700' :
                              liveElapsed >= 30 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-blue-100 text-blue-600'
                            }`}>
                              {liveElapsed}분
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{lm.completedSets.length + 1}세트</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-center">
                        <div className="flex-1">
                          <button className="font-bold text-xs truncate hover:text-blue-600 hover:underline w-full"
                            onClick={e => { e.stopPropagation(); navigate(`/rankings?search=${encodeURIComponent(p1?.name ?? '')}`) }}>{p1?.name ?? '?'}</button>
                          <div className="text-2xl font-black text-blue-600">{lm.currentSetScore[0]}</div>
                          <div className="text-xs text-gray-400">세트 {sets1}</div>
                        </div>
                        <div className="text-gray-300 font-bold">:</div>
                        <div className="flex-1">
                          <button className="font-bold text-xs truncate hover:text-red-600 hover:underline w-full"
                            onClick={e => { e.stopPropagation(); navigate(`/rankings?search=${encodeURIComponent(p2?.name ?? '')}`) }}>{p2?.name ?? '?'}</button>
                          <div className="text-2xl font-black text-red-500">{lm.currentSetScore[1]}</div>
                          <div className="text-xs text-gray-400">세트 {sets2}</div>
                        </div>
                      </div>
                      <button
                        className="mt-2 w-full text-[11px] font-medium text-red-600 bg-red-100 hover:bg-red-200 rounded-lg py-1 flex items-center justify-center gap-1"
                        onClick={e => { e.stopPropagation(); navigate('/score') }}>
                        ⚡ 스코어 입력 →
                      </button>
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
          {pendingMatches.length > 0 && (
            <div className="relative mb-1.5 flex-shrink-0">
              <input
                type="text"
                value={pendingSearch}
                onChange={e => setPendingSearch(e.target.value)}
                placeholder="선수명 검색..."
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 pr-6 bg-white"
              />
              {pendingSearch && (
                <button onClick={() => setPendingSearch('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-[10px]">✕</button>
              )}
            </div>
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
          {(() => {
            const evMap = new Map<string, number>()
            filteredPendingMatches.forEach(m => { if (m.eventLabel) evMap.set(m.eventLabel, (evMap.get(m.eventLabel) ?? 0) + 1) })
            if (evMap.size < 2) return null
            const top4 = [...evMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
            const maxCnt = top4[0][1]
            return (
              <div className="mb-1.5 flex-shrink-0 space-y-0.5">
                {top4.map(([label, cnt]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="text-[9px] text-gray-500 w-16 truncate flex-shrink-0">{label}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-300 rounded-full transition-all" style={{ width: `${Math.round(cnt / maxCnt * 100)}%` }} />
                    </div>
                    <span className="text-[9px] text-gray-500 flex-shrink-0 w-4 text-right">{cnt}</span>
                  </div>
                ))}
              </div>
            )
          })()}
          {(() => {
            const rdMap = new Map<string, number>()
            filteredPendingMatches.forEach(m => { const r = m.round ?? '기타'; rdMap.set(r, (rdMap.get(r) ?? 0) + 1) })
            if (rdMap.size < 2) return null
            const sorted = [...rdMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
            const maxCnt = sorted[0][1]
            return (
              <div className="mb-1.5 flex-shrink-0 space-y-0.5">
                {sorted.map(([rd, cnt]) => (
                  <div key={rd} className="flex items-center gap-1.5">
                    <span className="text-[9px] text-gray-400 w-16 truncate flex-shrink-0">{rd}</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-300 rounded-full transition-all" style={{ width: `${Math.round(cnt / maxCnt * 100)}%` }} />
                    </div>
                    <span className="text-[9px] text-gray-400 flex-shrink-0 w-4 text-right">{cnt}</span>
                  </div>
                ))}
              </div>
            )
          })()}
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
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs ${hasConflict ? 'bg-red-100 border border-red-300 ring-1 ring-red-200 ring-inset' : maxDiffMatchId === m.id ? 'bg-amber-50 ring-1 ring-amber-300' : 'bg-gray-50'}`}>
                    {!alreadyCalled && m.participant1Id && m.participant2Id && (
                      <input
                        type="checkbox"
                        checked={selectedMatchKeys.has(mKey)}
                        onChange={() => toggleSelectMatch(mKey)}
                        onClick={e => e.stopPropagation()}
                        className="flex-shrink-0 w-3 h-3"
                      />
                    )}
                    {(() => {
                      const lbl = m.eventLabel ?? ''
                      const cls = lbl.includes('혼합') || lbl.includes('혼복') ? 'bg-pink-100 text-pink-700' : lbl.includes('복식') ? 'bg-purple-100 text-purple-700' : lbl.includes('단식') ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                      return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded max-w-[60px] truncate flex-shrink-0 ${cls}`} title={lbl}>{lbl.slice(0, 4) || '—'}</span>
                    })()}
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
          {filteredPendingMatches.length >= 2 && (() => {
            const pts = filteredPendingMatches.map(m => ({
              m,
              total: (pointMap[m.participant1Id ?? ''] ?? 0) + (pointMap[m.participant2Id ?? ''] ?? 0),
            }))
            const withPts = pts.filter(x => x.total > 0)
            if (withPts.length === 0) return null
            const avg = Math.round(pts.reduce((s, x) => s + x.total, 0) / pts.length)
            const top = pts.reduce((a, b) => a.total >= b.total ? a : b)
            const topP1 = top.m.participant1Id ? pMap[top.m.participant1Id]?.name ?? '?' : '?'
            const topP2 = top.m.participant2Id ? pMap[top.m.participant2Id]?.name ?? '?' : '?'
            return (
              <div className="mt-1 px-2.5 py-1.5 bg-indigo-50 rounded-lg text-[11px] text-indigo-700 flex items-center gap-2 flex-shrink-0">
                <span className="font-semibold whitespace-nowrap">평균 {avg}pt</span>
                <span className="text-indigo-300">|</span>
                <span className="truncate">최고 {topP1} vs {topP2} <span className="font-bold">{top.total}pt</span></span>
              </div>
            )
          })()}
          {filteredPendingMatches.length >= 2 && pendingCalls.length >= 1 && (() => {
            const pendingAvg = Math.round(filteredPendingMatches.reduce((s, m) => s + (pointMap[m.participant1Id ?? ''] ?? 0) + (pointMap[m.participant2Id ?? ''] ?? 0), 0) / filteredPendingMatches.length)
            const calledPts = pendingCalls.map(c => {
              const m = allMatches.find(am => am.id === c.matchId)
              if (!m) return 0
              return (pointMap[m.participant1Id ?? ''] ?? 0) + (pointMap[m.participant2Id ?? ''] ?? 0)
            }).filter(n => n > 0)
            if (calledPts.length === 0 || pendingAvg === 0) return null
            const calledAvg = Math.round(calledPts.reduce((s, n) => s + n, 0) / calledPts.length)
            return (
              <div className="mt-1 px-2.5 py-1.5 bg-gray-50 rounded-lg text-[10px] text-gray-500 flex items-center gap-2 flex-shrink-0">
                <span>대기 <span className="font-semibold text-gray-700">{pendingAvg}pt</span></span>
                <span className="text-gray-300">vs</span>
                <span>호출 <span className="font-semibold text-orange-600">{calledAvg}pt</span></span>
              </div>
            )
          })()}
          {avgMatchMin && filteredPendingMatches.length >= 2 && (() => {
            const totalMin = filteredPendingMatches.length * avgMatchMin
            const etaMs = now.getTime() + totalMin * 60000
            const eta = new Date(etaMs)
            const hh = String(eta.getHours()).padStart(2, '0')
            const mm = String(eta.getMinutes()).padStart(2, '0')
            return (
              <div className="mt-1 px-2.5 py-1.5 bg-teal-50 rounded-lg text-[11px] text-teal-700 flex items-center gap-2 flex-shrink-0">
                <span className="text-teal-400">🕐</span>
                <span>예상 완료 <span className="font-bold">{hh}:{mm}</span></span>
                <span className="text-teal-400 ml-auto">약 {totalMin}분</span>
              </div>
            )
          })()}
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
              {(() => {
                const todayISO = new Date().toISOString().split('T')[0]
                const todayCalls = matchCalls.filter(c => c.calledAt?.startsWith(todayISO))
                if (todayCalls.length < 3) return null
                const acked = todayCalls.filter(c => c.acknowledged).length
                const rate = Math.round(acked / todayCalls.length * 100)
                const color = rate >= 80 ? 'bg-green-100 text-green-700' : rate >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                return <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${color}`}>응답률 {rate}%</span>
              })()}
              {(() => {
                const unacked = matchCalls.filter(c => !c.acknowledged && c.calledAt)
                if (unacked.length < 2) return null
                const oldest = unacked.sort((a, b) => (a.calledAt ?? '').localeCompare(b.calledAt ?? ''))[0]
                const minAgo = Math.round((Date.now() - new Date(oldest.calledAt!).getTime()) / 60000)
                if (minAgo < 15) return null
                return (
                  <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                    코트 {oldest.tableNo}번 장기 미응답
                  </span>
                )
              })()}
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
            {(() => {
              const todayStr = now.toISOString().slice(0, 10)
              const todayCalls = matchCalls.filter(c => c.calledAt.slice(0, 10) === todayStr)
              if (todayCalls.length === 0) return null
              const confirmed = todayCalls.filter(c => c.acknowledged).length
              return (
                <div className="flex gap-1.5 mb-1.5">
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">오늘 {todayCalls.length}건</span>
                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">확인 {confirmed}건</span>
                  {todayCalls.length - confirmed > 0 && (
                    <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">미확인 {todayCalls.length - confirmed}건</span>
                  )}
                </div>
              )
            })()}
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {matchCalls.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">호출 없음</p>
              ) : (() => {
                const filtered = [...matchCalls].reverse().filter(c => !callTourFilter || c.tournamentId === callTourFilter)
                const todayStr = now.toISOString().slice(0, 10)
                const yestStr = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
                const uniqueDates = [...new Set(filtered.map(c => c.calledAt.slice(0, 10)))]
                const showGroups = uniqueDates.length >= 2
                const nameCount = new Map<string, number>()
                filtered.filter(c => !c.acknowledged).forEach(c => {
                  if (c.participant1Name) nameCount.set(c.participant1Name, (nameCount.get(c.participant1Name) ?? 0) + 1)
                  if (c.participant2Name) nameCount.set(c.participant2Name, (nameCount.get(c.participant2Name) ?? 0) + 1)
                })
                const dupNames = new Set([...nameCount.entries()].filter(([, n]) => n >= 2).map(([k]) => k))
                return filtered.map((c, idx) => {
                  const cDate = c.calledAt.slice(0, 10)
                  const prevDate = idx > 0 ? filtered[idx - 1].calledAt.slice(0, 10) : null
                  const showHeader = showGroups && cDate !== prevDate
                  const dateLabel = cDate === todayStr ? '오늘' : cDate === yestStr ? '어제' : cDate
                  const callElapsed = Math.floor((now.getTime() - new Date(c.calledAt).getTime()) / 60000)
                  const isOverdue = !c.acknowledged && callElapsed >= 5
                  return (
                  <div key={c.id}>
                  {showHeader && (
                    <div className="text-[9px] text-gray-400 font-medium pt-1 pb-0.5">{dateLabel}</div>
                  )}
                  <div id={`call-${c.id}`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-all ${c.acknowledged ? 'bg-gray-50 opacity-60' : isOverdue ? 'bg-red-50 border border-red-400 animate-pulse' : highlightCallId === c.id ? 'bg-yellow-50 border border-yellow-400 ring-2 ring-yellow-300' : 'bg-orange-50 border border-orange-200'} ${!c.acknowledged ? (c.eventLabel?.includes('혼합') ? 'border-l-[3px] border-l-pink-400' : c.eventLabel?.includes('복식') ? 'border-l-[3px] border-l-indigo-400' : 'border-l-[3px] border-l-blue-400') : ''}`}>
                    <span className={`font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${c.acknowledged ? 'bg-gray-200 text-gray-500' : isOverdue ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
                      {c.tableNo}번
                    </span>
                    <span className="flex-1 min-w-0 font-medium flex items-center gap-1">
                      <button onClick={e => { e.stopPropagation(); navigate('/checkin') }} className="truncate hover:underline hover:text-teal-600 text-left" title={`${c.participant1Name} 체크인 확인`}>{c.participant1Name}</button>
                      <span className="text-gray-400 flex-shrink-0">vs</span>
                      <button onClick={e => { e.stopPropagation(); navigate('/checkin') }} className="truncate hover:underline hover:text-teal-600 text-left" title={`${c.participant2Name} 체크인 확인`}>{c.participant2Name}</button>
                    </span>
                    {isOverdue && <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold flex-shrink-0">⚠ 미응답</span>}
                    {!c.acknowledged && (dupNames.has(c.participant1Name) || dupNames.has(c.participant2Name)) && (
                      <span className="text-[9px] bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded font-bold flex-shrink-0">중복</span>
                    )}
                    <span className="text-gray-400 flex-shrink-0 flex items-center gap-1">
                      {new Date(c.calledAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      {!c.acknowledged && (
                        <span className={`font-mono text-[10px] px-1 rounded ${callElapsed >= 15 ? 'bg-red-100 text-red-600' : callElapsed >= 5 ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-500'}`}>
                          {callElapsed}분 경과
                        </span>
                      )}
                    </span>
                    {!c.acknowledged ? (
                      <>
                        {editingCallId === c.id ? (
                          <span className="flex items-center gap-0.5">
                            <input type="number" min={1} max={99} value={editCallTable}
                              onChange={e => setEditCallTable(Number(e.target.value))}
                              className="w-10 text-center text-xs border border-gray-300 rounded px-1 py-0.5" />
                            <button onClick={() => { updateMatchCallTable(c.id, editCallTable); setEditingCallId(null) }}
                              className="text-[10px] bg-blue-500 text-white px-1.5 py-0.5 rounded hover:bg-blue-600">저장</button>
                            <button onClick={() => setEditingCallId(null)} className="text-gray-300 hover:text-gray-500"><X size={10} /></button>
                          </span>
                        ) : (
                          <button onClick={() => { setEditingCallId(c.id); setEditCallTable(c.tableNo) }}
                            className="text-[10px] text-blue-500 hover:text-blue-700 px-1 flex-shrink-0">코트↕</button>
                        )}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${c.participant1Name} vs ${c.participant2Name} | ${c.tableNo}번 코트`)
                            setCopiedCallId(c.id)
                            setTimeout(() => setCopiedCallId(id => id === c.id ? null : id), 1000)
                          }}
                          className="text-gray-400 hover:text-blue-500 p-0.5 flex-shrink-0" title="클립보드 복사">
                          {copiedCallId === c.id ? <CheckCircle size={11} className="text-green-500" /> : <span className="text-[11px]">⎘</span>}
                        </button>
                        <button onClick={() => {
                            if (flashAckCallId === c.id) return
                            setFlashAckCallId(c.id)
                            setTimeout(() => { acknowledgeMatchCall(c.id); setFlashAckCallId(null) }, 500)
                          }}
                          className={`px-1.5 py-0.5 rounded flex items-center gap-0.5 transition-colors ${flashAckCallId === c.id ? 'bg-green-500 text-white' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}>
                          <BellOff size={10} /> {flashAckCallId === c.id ? '확인됨!' : '확인'}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => removeMatchCall(c.id)} className="text-gray-300 hover:text-red-400 p-0.5">
                        <X size={12} />
                      </button>
                    )}
                  </div>
                  </div>
                  )
                })
              })()}
            </div>
          </div>
          {(() => {
            const unacked = pendingCalls.filter(c => c.participant1Name || c.participant2Name)
            if (unacked.length < 2) return null
            const first = unacked[0]
            const n1 = first.participant1Name ?? '?'
            const n2 = first.participant2Name ?? '?'
            return (
              <div className="text-[10px] text-gray-400 px-1 mt-0.5 truncate">
                {n1} vs {n2}{unacked.length > 1 ? ` 외 ${unacked.length - 1}건` : ''}
              </div>
            )
          })()}

          {/* 오늘 호출 완료 히스토리 */}
          {(() => {
            const todayStr = now.toISOString().slice(0, 10)
            const todayAcked = [...matchCalls]
              .filter(c => c.acknowledged && c.calledAt.slice(0, 10) === todayStr)
              .sort((a, b) => b.calledAt.localeCompare(a.calledAt))
              .slice(0, 5)
            if (todayAcked.length === 0) return null
            return (
              <div className="card flex-shrink-0">
                <button
                  onClick={() => setShowCallHistory(v => !v)}
                  className="w-full flex items-center justify-between text-xs text-gray-500 hover:text-gray-700 transition-colors">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle size={12} className="text-green-500" />
                    오늘 호출 완료 {todayAcked.length}건
                  </span>
                  <span>{showCallHistory ? '▲' : '▼'}</span>
                </button>
                {showCallHistory && (
                  <div className="mt-2 space-y-1">
                    {todayAcked.map(c => (
                      <div key={c.id} className="flex items-center gap-2 text-xs text-gray-500 py-0.5">
                        <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium flex-shrink-0">{c.tableNo}번</span>
                        <span className="flex-1 truncate">{c.participant1Name} vs {c.participant2Name}</span>
                        <span className="flex-shrink-0 text-[10px] text-gray-400">
                          {new Date(c.calledAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Event progress */}
          {activeTournaments.length > 0 && (() => {
            const BLOCKS = 8
            const rows = activeTournaments.flatMap(t =>
              t.events.map(ev => {
                const total = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length
                const done = ev.matches.filter(m => m.result && !m.result.walkedOver).length
                const pct = total > 0 ? Math.round(done / total * 100) : 0
                const filled = Math.round(pct / 100 * BLOCKS)
                const bar = '█'.repeat(filled) + '░'.repeat(BLOCKS - filled)
                return { key: `${t.id}-${ev.id}`, label: ev.label, total, done, pct, bar }
              })
            ).slice(0, 12)
            return (
              <div className="card flex-shrink-0">
                <h2 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                  <Trophy size={13} className="text-blue-500" /> 종목별 진행률
                </h2>
                <table className="w-full text-[11px]">
                  <tbody>
                    {rows.map(({ key, label, total, done, pct, bar }) => (
                      <tr key={key} className="border-b border-gray-50 last:border-0">
                        <td className="py-0.5 pr-2 font-medium text-gray-700 truncate max-w-[90px]">{label}</td>
                        <td className="py-0.5 pr-2 text-gray-400 text-right whitespace-nowrap">{done}/{total}</td>
                        <td className={`py-0.5 font-mono tracking-tighter whitespace-nowrap ${pct === 100 ? 'text-green-500' : 'text-blue-400'}`}>{bar}</td>
                        <td className="py-0.5 pl-1.5 text-gray-400 text-right whitespace-nowrap">{pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })()}

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

function DashCard({ icon, label, value, color, sub }: { icon: string; label: string; value: number; color: string; sub?: string }) {
  return (
    <div className={`border-2 rounded-xl p-3 text-center ${color}`}>
      <div className="text-xl mb-0.5">{icon}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}
