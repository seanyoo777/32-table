import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, Play, Clock, CheckCircle, Trophy, Bell, BellOff, X } from 'lucide-react'
import type { MatchCall } from '../types'

function genId() { return Math.random().toString(36).slice(2, 10) }

export default function DashboardPage() {
  const { tournaments, players, pairs, scoreRecords, liveMatches, matchCalls, addMatchCall, acknowledgeMatchCall, removeMatchCall } = useStore()
  const navigate = useNavigate()
  const [now, setNow] = useState(new Date())
  const [callTableNo, setCallTableNo] = useState(1)
  const [callMatchKey, setCallMatchKey] = useState('')

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

  const formatTime = (d: Date) =>
    `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`

  function handleCallMatch() {
    if (!callMatchKey) return
    const [tournamentId, eventId, matchId] = callMatchKey.split('|')
    const match = allMatches.find(m => m.tournamentId === tournamentId && m.eventId === eventId && m.id === matchId)
    if (!match || !match.participant1Id || !match.participant2Id) return
    const tournament = activeTournaments.find(t => t.id === tournamentId)
    const ev = tournament?.events.find(e => e.id === eventId)
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
    void ev
    addMatchCall(call)
    setCallMatchKey('')
  }

  const pendingCalls = matchCalls.filter(c => !c.acknowledged)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <LayoutDashboard size={20} className="text-indigo-500" /> 운영 대시보드
        </h1>
        <div className="text-2xl font-mono font-bold text-gray-700">{formatTime(now)}</div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashCard icon="🏓" label="진행중 대회" value={activeTournaments.length} color="bg-blue-50 border-blue-200" />
        <DashCard icon="⏳" label="대기중 경기" value={pendingMatches.length} color="bg-yellow-50 border-yellow-200" />
        <DashCard icon="✅" label="완료 경기" value={completedMatches.length} color="bg-green-50 border-green-200" />
        <DashCard icon="🔴" label="실시간 스코어" value={liveMatches.length} color="bg-red-50 border-red-200" />
      </div>

      {/* Live matches */}
      {liveMatches.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Play size={16} className="text-red-500" /> 실시간 진행중
            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {liveMatches.map(lm => {
              const p1 = pMap[lm.participant1Id]
              const p2 = pMap[lm.participant2Id]
              const sets1 = lm.completedSets.filter(([a, b]) => a > b).length
              const sets2 = lm.completedSets.filter(([a, b]) => b > a).length
              return (
                <div key={lm.matchId} className="border-2 border-red-200 rounded-xl p-4 bg-red-50 cursor-pointer hover:shadow-md"
                  onClick={() => navigate('/score')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-red-500">탁구대 {lm.tableNo}번</span>
                    <span className="text-xs text-gray-400">{lm.completedSets.length + 1}세트</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 text-center">
                      <div className="font-bold text-sm truncate">{p1?.name ?? '?'}</div>
                      <div className="text-3xl font-black text-blue-600">{lm.currentSetScore[0]}</div>
                      <div className="text-sm text-gray-500">세트 {sets1}</div>
                    </div>
                    <div className="text-gray-300 font-bold">:</div>
                    <div className="flex-1 text-center">
                      <div className="font-bold text-sm truncate">{p2?.name ?? '?'}</div>
                      <div className="text-3xl font-black text-red-500">{lm.currentSetScore[1]}</div>
                      <div className="text-sm text-gray-500">세트 {sets2}</div>
                    </div>
                  </div>
                  {lm.completedSets.length > 0 && (
                    <div className="mt-2 text-center text-xs text-gray-400">
                      {lm.completedSets.map(([a, b], i) => `${a}-${b}`).join(' · ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pending matches */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Clock size={16} className="text-yellow-500" /> 대기중인 경기 ({pendingMatches.length})
        </h2>
        {pendingMatches.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">대기중인 경기가 없습니다</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pendingMatches.slice(0, 20).map(m => {
              const p1 = m.participant1Id ? pMap[m.participant1Id] : null
              const p2 = m.participant2Id ? pMap[m.participant2Id] : null
              return (
                <div key={`${m.tournamentId}-${m.eventId}-${m.id}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                  {m.tableNo && <span className="text-xs bg-gray-200 px-2 py-0.5 rounded font-mono">{m.tableNo}번대</span>}
                  <span className="text-xs text-gray-400 font-medium flex-shrink-0">{m.eventLabel}</span>
                  <span className="flex-1 font-medium truncate">{p1?.name ?? '?'} vs {p2?.name ?? '?'}</span>
                  {m.scheduledTime && <span className="text-xs text-blue-500 flex-shrink-0">{m.scheduledTime}</span>}
                  <button onClick={() => navigate('/score')} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded flex-shrink-0">
                    점수입력
                  </button>
                </div>
              )
            })}
            {pendingMatches.length > 20 && (
              <p className="text-xs text-center text-gray-400">+{pendingMatches.length - 20}개 더</p>
            )}
          </div>
        )}
      </div>

      {/* Match Call (콜링) */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Bell size={16} className="text-orange-500" /> 경기 호출 (콜링)
          {pendingCalls.length > 0 && (
            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full animate-pulse">
              {pendingCalls.length}건 대기
            </span>
          )}
        </h2>

        {/* 호출 입력 */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <select
            className="select flex-1 min-w-0"
            value={callMatchKey}
            onChange={e => setCallMatchKey(e.target.value)}
          >
            <option value="">경기 선택...</option>
            {pendingMatches.slice(0, 30).map(m => {
              const p1 = m.participant1Id ? pMap[m.participant1Id]?.name : '?'
              const p2 = m.participant2Id ? pMap[m.participant2Id]?.name : '?'
              const key = `${m.tournamentId}|${m.eventId}|${m.id}`
              return (
                <option key={key} value={key}>
                  [{m.eventLabel}] {p1} vs {p2}
                </option>
              )
            })}
          </select>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500 whitespace-nowrap">탁구대</label>
            <input
              className="input w-16 text-center"
              type="number" min={1} max={30}
              value={callTableNo}
              onChange={e => setCallTableNo(Number(e.target.value))}
            />
          </div>
          <button
            onClick={handleCallMatch}
            disabled={!callMatchKey}
            className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
          >
            <Bell size={14} /> 호출
          </button>
        </div>

        {/* 현재 호출 목록 */}
        {matchCalls.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">호출된 경기가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {[...matchCalls].reverse().map(c => (
              <div key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${c.acknowledged ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-orange-50 border-orange-200'}`}>
                <span className={`text-xs font-bold px-2 py-0.5 rounded flex-shrink-0 ${c.acknowledged ? 'bg-gray-200 text-gray-500' : 'bg-orange-500 text-white'}`}>
                  {c.tableNo}번대
                </span>
                <span className="text-xs text-gray-400 flex-shrink-0">{c.eventLabel}</span>
                <span className="flex-1 font-medium truncate">{c.participant1Name} vs {c.participant2Name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(c.calledAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {!c.acknowledged ? (
                  <button onClick={() => acknowledgeMatchCall(c.id)} className="flex-shrink-0 text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center gap-1">
                    <BellOff size={11} /> 확인
                  </button>
                ) : (
                  <button onClick={() => removeMatchCall(c.id)} className="flex-shrink-0 text-gray-300 hover:text-red-400 p-1">
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Progress by event */}
      {activeTournaments.length > 0 && (
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Trophy size={16} className="text-blue-500" /> 종목별 진행률
          </h2>
          <div className="space-y-3">
            {activeTournaments.flatMap(t =>
              t.events.map(ev => {
                const total = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length
                const done = ev.matches.filter(m => m.result && !m.result.walkedOver).length
                const pct = total > 0 ? Math.round(done / total * 100) : 0
                return { key: `${t.id}-${ev.id}`, tournamentName: t.name, label: ev.label, total, done, pct }
              })
            ).map(({ key, label, total, done, pct }) => (
              <div key={key}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{label}</span>
                  <span className="text-gray-400">{done}/{total}경기 ({pct}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent results */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <CheckCircle size={16} className="text-green-500" /> 최근 완료 경기
        </h2>
        {scoreRecords.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">아직 완료된 경기가 없습니다</p>
        ) : (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {[...scoreRecords].reverse().slice(0, 10).map(r => {
              const n1 = pMap[r.participant1Id]?.name ?? '?'
              const n2 = pMap[r.participant2Id]?.name ?? '?'
              const winner = r.p1Score > r.p2Score ? n1 : n2
              return (
                <div key={r.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                  <Trophy size={12} className="text-yellow-500 flex-shrink-0" />
                  <span className="font-medium text-blue-700 flex-shrink-0">{winner}</span>
                  <span className="text-gray-400 flex-shrink-0">승</span>
                  <span className="flex-1 text-gray-500 truncate">({n1} {r.p1Score}-{r.p2Score} {n2})</span>
                  <span className="text-xs text-gray-300 flex-shrink-0">{new Date(r.recordedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function DashCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className={`card border-2 ${color} text-center py-4`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-2xl font-bold text-gray-800">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  )
}
