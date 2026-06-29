import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { Monitor, Trophy, Clock, Zap, Bell } from 'lucide-react'

// TV/프로젝터 전용 실시간 경기 현황판
// 전체화면으로 사용: 경기장 내 모니터/빔프로젝터에 띄워두세요

export default function LiveBoardPage() {
  const { tournaments, players, pairs, liveMatches, matchCalls, announcement, setAnnouncement } = useStore()
  const [now, setNow] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const ongoingTournaments = tournaments.filter(t => t.status !== 'draft')
  const activeTournament = activeTournamentId
    ? tournaments.find(t => t.id === activeTournamentId)
    : ongoingTournaments[0]

  // Build participant name map
  const nameMap: Record<string, string> = {}
  const photoMap: Record<string, string> = {}
  players.forEach(p => { nameMap[p.id] = p.name; if (p.photoUrl) photoMap[p.id] = p.photoUrl })
  pairs.forEach(p => { nameMap[p.id] = p.name })

  // Get pending + live matches for active tournament
  const pendingMatches = activeTournament
    ? activeTournament.events.flatMap(ev =>
        ev.matches
          .filter(m => m.participant1Id && m.participant2Id && !m.result && !m.isBye)
          .map(m => ({ ...m, eventLabel: ev.label, eventId: ev.id }))
      )
    : []

  const recentResults = activeTournament
    ? activeTournament.events.flatMap(ev =>
        ev.matches
          .filter(m => m.result && !m.result.walkedOver)
          .slice(-3)
          .map(m => ({ ...m, eventLabel: ev.label }))
      ).slice(-6)
    : []

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = now.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-950 text-white">
      {/* Control Bar */}
      <div className="flex-shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Monitor size={14} />
          <span>라이브 경기 현황판 — TV/프로젝터 모드</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="bg-gray-800 border border-gray-700 text-sm text-white rounded px-2 py-1"
            value={activeTournamentId ?? ''}
            onChange={e => setActiveTournamentId(e.target.value || null)}
          >
            <option value="">자동 선택 (최근 대회)</option>
            {ongoingTournaments.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={announcement}
              onChange={e => setAnnouncement(e.target.value)}
              placeholder="공지사항 입력 (라이브보드에 표시됩니다)"
              className="bg-gray-800 border border-gray-700 text-sm text-white rounded px-2 py-1 w-64 placeholder-gray-500"
            />
            {announcement && (
              <button onClick={() => setAnnouncement('')} className="text-gray-400 hover:text-white text-xs px-1">✕</button>
            )}
          </div>
          <button
            onClick={toggleFullscreen}
            className="bg-blue-600 hover:bg-blue-700 text-sm px-3 py-1 rounded"
          >
            {isFullscreen ? '전체화면 해제' : '⛶ 전체화면'}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-4xl">🏓</span>
              <div>
                <h1 className="text-3xl font-black text-white tracking-tight">
                  {activeTournament?.name ?? '탁구 대회 실시간 현황'}
                </h1>
                {activeTournament && (
                  <p className="text-gray-400 text-sm mt-0.5">
                    {activeTournament.date} · {activeTournament.venue}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-mono font-bold text-blue-400">{timeStr}</div>
            <div className="text-gray-400 text-sm mt-1">{dateStr}</div>
          </div>
        </div>

        {/* 공지사항 배너 */}
        {announcement && (
          <div className="flex items-center gap-3 bg-yellow-500/20 border border-yellow-500/40 rounded-xl px-4 py-3">
            <span className="text-yellow-400 text-xl flex-shrink-0">📢</span>
            <p className="text-yellow-100 font-semibold text-lg leading-snug">{announcement}</p>
          </div>
        )}

        {/* 미확인 호출 선수 이름 배너 */}
        {matchCalls.filter(c => !c.acknowledged).length > 0 && (
          <div className="overflow-hidden bg-orange-500/20 border border-orange-500/40 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <Bell size={16} className="text-orange-400 animate-pulse flex-shrink-0" />
            <div className="overflow-hidden flex-1">
              <div className="flex gap-6 animate-marquee whitespace-nowrap"
                style={{ animation: 'marquee 18s linear infinite' }}>
                {matchCalls.filter(c => !c.acknowledged).map(c => (
                  <span key={c.id} className="text-sm font-bold text-orange-200 flex-shrink-0">
                    📍 {c.tableNo}번대 — {c.participant1Name} vs {c.participant2Name}
                    <span className="text-orange-400 font-normal ml-2 text-xs">[{c.eventLabel}]</span>
                  </span>
                ))}
                {matchCalls.filter(c => !c.acknowledged).map(c => (
                  <span key={c.id + '-dup'} className="text-sm font-bold text-orange-200 flex-shrink-0">
                    📍 {c.tableNo}번대 — {c.participant1Name} vs {c.participant2Name}
                    <span className="text-orange-400 font-normal ml-2 text-xs">[{c.eventLabel}]</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>

        {/* Live Matches (from liveMatches store) */}
        {liveMatches.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <h2 className="text-lg font-bold text-red-400 uppercase tracking-widest text-sm">
                LIVE — 현재 경기 중
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {liveMatches.map(lm => {
                const p1Name = nameMap[lm.participant1Id] ?? '선수1'
                const p2Name = nameMap[lm.participant2Id] ?? '선수2'
                const p1Sets = lm.completedSets.filter(([a, b]) => a > b).length
                const p2Sets = lm.completedSets.filter(([a, b]) => b > a).length
                return (
                  <div key={lm.matchId} className="bg-gray-800 border border-red-500/40 rounded-2xl p-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 to-orange-500 animate-pulse" />
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-red-400 font-semibold">🔴 LIVE</span>
                      <span className="text-xs text-gray-400">대 {lm.tableNo}번</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 text-center">
                        {photoMap[lm.participant1Id] && (
                          <img src={photoMap[lm.participant1Id]} alt={p1Name} className="w-10 h-10 rounded-full object-cover mx-auto mb-1 border-2 border-blue-400" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        )}
                        <div className="text-xl font-black text-white">{p1Name}</div>
                        <div className="text-5xl font-black text-blue-400 my-1">{lm.currentSetScore[0]}</div>
                        <div className="text-sm text-gray-400">{p1Sets}세트</div>
                      </div>
                      <div className="text-center px-2">
                        <div className="text-gray-500 text-2xl font-thin">:</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {lm.completedSets.length + 1}세트
                        </div>
                      </div>
                      <div className="flex-1 text-center">
                        {photoMap[lm.participant2Id] && (
                          <img src={photoMap[lm.participant2Id]} alt={p2Name} className="w-10 h-10 rounded-full object-cover mx-auto mb-1 border-2 border-orange-400" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        )}
                        <div className="text-xl font-black text-white">{p2Name}</div>
                        <div className="text-5xl font-black text-orange-400 my-1">{lm.currentSetScore[1]}</div>
                        <div className="text-sm text-gray-400">{p2Sets}세트</div>
                      </div>
                    </div>
                    {lm.completedSets.length > 0 && (
                      <div className="mt-3 flex justify-center gap-1.5">
                        {lm.completedSets.map(([a, b], i) => (
                          <span key={i} className={`text-xs px-2 py-0.5 rounded font-mono ${a > b ? 'bg-blue-900 text-blue-300' : 'bg-orange-900 text-orange-300'}`}>
                            {a}-{b}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Match Calls (콜링) */}
        {matchCalls.filter(c => !c.acknowledged).length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bell size={16} className="text-orange-400 animate-pulse" />
              <h2 className="text-sm font-bold text-orange-400 uppercase tracking-widest">
                경기 호출 ({matchCalls.filter(c => !c.acknowledged).length})
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {matchCalls.filter(c => !c.acknowledged).map(c => (
                <div key={c.id} className="bg-orange-900/30 border border-orange-500/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-orange-400 bg-orange-900/50 px-2 py-0.5 rounded">
                      {c.tableNo}번대 입장
                    </span>
                    <span className={`text-[10px] font-semibold ${Math.floor((now.getTime() - new Date(c.calledAt).getTime()) / 60000) >= 10 ? 'text-red-400' : 'text-gray-400'}`}>
                      {Math.floor((now.getTime() - new Date(c.calledAt).getTime()) / 60000)}분 경과
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 mb-1">{c.eventLabel}</div>
                  <div className="text-sm font-bold text-white">{c.participant1Name}</div>
                  <div className="text-xs text-gray-400 my-0.5">vs</div>
                  <div className="text-sm font-bold text-white">{c.participant2Name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending Matches (next up) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-yellow-400" />
            <h2 className="text-sm font-bold text-yellow-400 uppercase tracking-widest">
              대기중인 경기 ({pendingMatches.length})
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {pendingMatches.slice(0, 16).map((m, i) => (
              <div key={m.id} className={`bg-gray-800/60 border border-gray-700 rounded-xl p-3 ${i < 4 ? 'border-yellow-500/30 bg-yellow-900/10' : ''}`}>
                {i < 4 && (
                  <div className="flex items-center gap-1 mb-1.5">
                    <Zap size={10} className="text-yellow-400" />
                    <span className="text-[10px] text-yellow-400 font-semibold">다음 경기</span>
                  </div>
                )}
                <div className="text-[10px] text-gray-500 mb-1">{m.eventLabel}</div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm font-semibold text-white truncate">{nameMap[m.participant1Id ?? ''] ?? '-'}</span>
                  <span className="text-gray-500 text-xs">vs</span>
                  <span className="text-sm font-semibold text-white truncate text-right">{nameMap[m.participant2Id ?? ''] ?? '-'}</span>
                </div>
                {m.tableNo && (
                  <div className="text-[10px] text-blue-400 mt-1">대 {m.tableNo}번</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Results */}
        {recentResults.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={16} className="text-green-400" />
              <h2 className="text-sm font-bold text-green-400 uppercase tracking-widest">
                최근 경기 결과
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {recentResults.map(m => {
                const w = nameMap[m.result!.winnerId] ?? '?'
                const l = nameMap[m.result!.loserId] ?? '?'
                return (
                  <div key={m.id} className="bg-gray-800/40 rounded-xl p-3 border border-gray-700">
                    <div className="text-[10px] text-gray-500 mb-1.5">{m.eventLabel}</div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] bg-yellow-500 text-black px-1 rounded font-bold">승</span>
                        <span className="text-sm font-bold text-white">{w}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] bg-gray-700 text-gray-400 px-1 rounded">패</span>
                        <span className="text-sm text-gray-400">{l}</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1.5 font-mono">
                      {m.result!.winnerScore}-{m.result!.loserScore}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tournament Progress */}
        {activeTournament && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 bg-blue-400 rounded-full" />
              <h2 className="text-sm font-bold text-blue-400 uppercase tracking-widest">
                종목별 진행률
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {activeTournament.events.map(ev => {
                const total = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length
                const done = ev.matches.filter(m => m.result).length
                const pct = total > 0 ? Math.round(done / total * 100) : 0
                return (
                  <div key={ev.id} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700">
                    <div className="text-xs text-gray-300 font-medium mb-2 truncate">{ev.label}</div>
                    <div className="flex items-end justify-between mb-1">
                      <span className="text-2xl font-black text-white">{pct}%</span>
                      <span className="text-xs text-gray-500">{done}/{total}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full">
                      <div
                        className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer ticker */}
        <div className="border-t border-gray-800 pt-3 overflow-hidden">
          <div className="flex items-center gap-4 animate-pulse">
            <span className="text-[10px] text-gray-600 uppercase tracking-widest shrink-0">공지</span>
            <span className="text-xs text-gray-500">
              🏓 탁구 대회 관리 시스템 · USATT Elo 레이팅 통합 · 실시간 경기 현황 · QR 체크인 시스템 운영 중
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
