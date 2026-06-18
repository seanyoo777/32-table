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
  const rows = ['일시,대회명,종목,선수1,선수2,세트스코어,입력자,검증여부']
  for (const r of [...records].reverse()) {
    const p1 = pMap[r.participant1Id]?.name ?? r.participant1Id
    const p2 = pMap[r.participant2Id]?.name ?? r.participant2Id
    const score = `${r.p1Score}-${r.p2Score}`
    const verified = r.verified ? '확인' : '미확인'
    const at = new Date(r.recordedAt).toLocaleString('ko-KR')
    const tourName = tourMap[r.tournamentId] ?? ''
    const evLabel = eventMap[r.tournamentId + '|' + r.eventId] ?? ''
    rows.push([at, tourName, evLabel, p1, p2, score, r.recordedBy ?? '', verified].join(','))
  }
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `경기기록_${new Date().toISOString().slice(0, 10)}.csv`
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

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const pMap = Object.fromEntries([
    ...players.map(p => [p.id, { name: p.name, school: p.school }]),
    ...pairs.map(p => [p.id, { name: p.name, school: p.school }]),
  ])

  const activeTournaments = tournaments.filter(t => t.status === 'ongoing')
  const allMatches = activeTournaments.flatMap(t =>
    t.events.flatMap(ev =>
      ev.matches.map(m => ({ ...m, tournamentName: t.name, eventLabel: ev.label, tournamentId: t.id, eventId: ev.id }))
    )
  )
  const pendingMatches = allMatches.filter(m => m.participant1Id && m.participant2Id && !m.result && !m.isBye)
  const completedMatches = allMatches.filter(m => m.result)
  const pendingCalls = matchCalls.filter(c => !c.acknowledged)
  const unverifiedRecords = scoreRecords.filter(r => !r.verified)

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
      <div className="flex-shrink-0 grid grid-cols-4 gap-3 px-4 py-3 bg-white border-b border-gray-100">
        <DashCard icon="🏓" label="진행중 대회" value={activeTournaments.length} color="border-blue-200 bg-blue-50" />
        <DashCard icon="⏳" label="대기중 경기" value={pendingMatches.length} color="border-yellow-200 bg-yellow-50" />
        <DashCard icon="✅" label="완료 경기" value={completedMatches.length} color="border-green-200 bg-green-50" />
        <DashCard icon="🔴" label="실시간 스코어" value={liveMatches.length} color="border-red-200 bg-red-50" />
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
                {liveMatches.map(lm => {
                  const p1 = pMap[lm.participant1Id]
                  const p2 = pMap[lm.participant2Id]
                  const sets1 = lm.completedSets.filter(([a, b]) => a > b).length
                  const sets2 = lm.completedSets.filter(([a, b]) => b > a).length
                  return (
                    <div key={lm.matchId}
                      className="border-2 border-red-200 rounded-xl p-3 bg-red-50 cursor-pointer hover:shadow-md"
                      onClick={() => navigate('/score')}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-red-500">탁구대 {lm.tableNo}번</span>
                        <span className="text-xs text-gray-400">{lm.completedSets.length + 1}세트</span>
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
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Col 2: Pending matches ── */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          <h2 className="font-semibold text-sm text-gray-700 mb-2 flex-shrink-0 flex items-center gap-2">
            <Clock size={13} className="text-yellow-500" /> 대기중인 경기
            <span className="text-xs text-gray-400 font-normal">({pendingMatches.length})</span>
          </h2>
          {pendingMatches.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-300">대기중 없음</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
              {pendingMatches.map(m => {
                const p1 = m.participant1Id ? pMap[m.participant1Id] : null
                const p2 = m.participant2Id ? pMap[m.participant2Id] : null
                const alreadyCalled = matchCalls.some(c => !c.acknowledged && c.matchId === m.id)
                return (
                  <div key={`${m.tournamentId}-${m.eventId}-${m.id}`}
                    className="flex items-center gap-2 px-2.5 py-2 bg-gray-50 rounded-lg text-xs">
                    <span className="text-gray-400 font-medium w-14 truncate flex-shrink-0">{m.eventLabel}</span>
                    <span className="flex-1 font-medium truncate">{p1?.name ?? '?'} vs {p2?.name ?? '?'}</span>
                    {alreadyCalled && <span className="text-orange-500 flex-shrink-0 text-[10px]">호출됨</span>}
                    {!alreadyCalled && (
                      <button
                        onClick={() => {
                          if (!m.participant1Id || !m.participant2Id) return
                          const call: MatchCall = {
                            id: genId(), matchId: m.id, tournamentId: m.tournamentId,
                            eventId: m.eventId, tableNo: callTableNo,
                            participant1Name: pMap[m.participant1Id]?.name ?? '?',
                            participant2Name: pMap[m.participant2Id]?.name ?? '?',
                            eventLabel: m.eventLabel, calledAt: new Date().toISOString(), acknowledged: false,
                          }
                          addMatchCall(call)
                          if ('Notification' in window && Notification.permission === 'granted') {
                            new Notification(`🏓 경기 호출 — ${callTableNo}번대`, {
                              body: `${call.participant1Name} vs ${call.participant2Name}`,
                              icon: '/favicon.ico',
                            })
                          }
                        }}
                        className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded hover:bg-orange-200 flex-shrink-0">
                        <Bell size={9} className="inline mr-0.5" />호출
                      </button>
                    )}
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
            <div className="flex gap-1.5 mb-1.5">
              <input
                className="input flex-1 min-w-0 py-1 text-xs"
                placeholder="선수명 검색..."
                value={callSearch}
                onChange={e => setCallSearch(e.target.value)}
              />
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
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {matchCalls.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">호출 없음</p>
              ) : (
                [...matchCalls].reverse().map(c => (
                  <div key={c.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${c.acknowledged ? 'bg-gray-50 opacity-60' : 'bg-orange-50 border border-orange-200'}`}>
                    <span className={`font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${c.acknowledged ? 'bg-gray-200 text-gray-500' : 'bg-orange-500 text-white'}`}>
                      {c.tableNo}번
                    </span>
                    <span className="flex-1 truncate font-medium">{c.participant1Name} vs {c.participant2Name}</span>
                    <span className="text-gray-400 flex-shrink-0">
                      {new Date(c.calledAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
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
                ))
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
