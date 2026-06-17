import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { getRoundName, calcStandings } from '../utils/bracketUtils'
import type { TournamentEvent, BracketMatch } from '../types'
import { QRCodeSVG } from 'qrcode.react'
import { fetchTournament, subscribeTournament, SYNC_ENABLED } from '../lib/sync'

// ─── 참가자 이름 맵 ──────────────────────────────────────
function useParticipantMap() {
  const { players, pairs, teams } = useStore()
  return useMemo(() => {
    const m: Record<string, { name: string; school: string }> = {}
    for (const p of players) m[p.id] = { name: p.name, school: p.school }
    for (const p of pairs) m[p.id] = { name: p.name, school: p.school }
    for (const t of teams) m[t.id] = { name: t.name, school: t.school }
    return m
  }, [players, pairs, teams])
}

// ─── 매치 카드 (읽기 전용) ────────────────────────────────
function MatchCard({ m, pMap }: { m: BracketMatch; pMap: Record<string, { name: string; school: string }> }) {
  const p1 = m.participant1Id ? pMap[m.participant1Id] : null
  const p2 = m.participant2Id ? pMap[m.participant2Id] : null
  const w = m.result?.winnerId
  return (
    <div className="border rounded-lg bg-white overflow-hidden shadow-sm" style={{ minWidth: 200 }}>
      {m.isThirdPlace && (
        <div className="text-xs text-center bg-orange-50 text-orange-600 font-semibold py-0.5 border-b">3·4위전</div>
      )}
      <div className={`flex items-center justify-between px-3 py-2 border-b ${w === m.participant1Id ? 'bg-blue-50' : w ? 'bg-gray-50' : ''}`}>
        <span className={`text-sm font-medium ${w === m.participant1Id ? 'text-blue-700 font-bold' : w ? 'text-gray-400' : 'text-gray-800'}`}>
          {p1?.name ?? '-'}
        </span>
        {m.result && (
          <span className="text-sm font-bold ml-2">
            {w === m.participant1Id ? m.result.winnerScore : m.result.loserScore}
          </span>
        )}
      </div>
      <div className={`flex items-center justify-between px-3 py-2 ${w === m.participant2Id ? 'bg-blue-50' : w ? 'bg-gray-50' : ''}`}>
        <span className={`text-sm font-medium ${w === m.participant2Id ? 'text-blue-700 font-bold' : w ? 'text-gray-400' : 'text-gray-800'}`}>
          {p2?.name ?? '-'}
        </span>
        {m.result && (
          <span className="text-sm font-bold ml-2">
            {w === m.participant2Id ? m.result.winnerScore : m.result.loserScore}
          </span>
        )}
      </div>
      {!m.result && p1 && p2 && (
        <div className="text-center text-xs text-gray-400 py-1 bg-gray-50">대기중</div>
      )}
    </div>
  )
}

// ─── 이벤트 브래킷 (읽기전용) ────────────────────────────
function EventView({ event, pMap }: {
  event: TournamentEvent
  pMap: Record<string, { name: string; school: string }>
}) {
  const [tab, setTab] = useState<'bracket' | 'standings'>('bracket')
  const isLeague = event.bracketFormat === '리그'
  const isGrouped = event.bracketFormat === '조별+토너먼트'

  const mainMatches = event.matches.filter(m => !m.isThirdPlace)
  const thirdPlaceMatch = event.matches.find(m => m.isThirdPlace)
  const maxRound = Math.max(...mainMatches.filter(m => !m.groupId).map(m => m.round), 1)
  const totalRounds = event.bracketFormat === '토너먼트'
    ? Math.max(...mainMatches.map(m => m.round), 1)
    : maxRound

  const rounds = [...new Set(event.matches.map(m => m.round))].sort((a, b) => a - b)

  // Champion
  const finalMatch = event.bracketFormat === '토너먼트'
    ? mainMatches.filter(m => m.round === maxRound && m.result && !m.isBye && !m.groupId).sort((a, b) => a.position - b.position)[0]
    : null
  const champion = finalMatch?.result ? pMap[finalMatch.result.winnerId] : null
  const runnerUp = finalMatch?.result ? pMap[finalMatch.result.loserId] : null
  const thirdPlaceWinner = thirdPlaceMatch?.result ? pMap[thirdPlaceMatch.result.winnerId] : null

  const standings = (isLeague || isGrouped)
    ? calcStandings(event.matches, event.participantIds)
    : {}

  return (
    <div className="space-y-3">
      {/* Champion banner */}
      {champion && (
        <div className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl p-3 text-white">
          <div className="flex items-center gap-6 flex-wrap justify-center">
            <div className="text-center">
              <div className="text-2xl mb-0.5">🏆</div>
              <div className="font-black text-lg">{champion.name}</div>
              <div className="text-yellow-100 text-xs">{champion.school}</div>
              <div className="text-xs bg-white/20 rounded-full px-2 py-0.5 mt-0.5">우승</div>
            </div>
            {runnerUp && (
              <div className="text-center">
                <div className="text-xl mb-0.5">🥈</div>
                <div className="font-bold text-base">{runnerUp.name}</div>
                <div className="text-yellow-100 text-xs">{runnerUp.school}</div>
                <div className="text-xs bg-white/20 rounded-full px-2 py-0.5 mt-0.5">준우승</div>
              </div>
            )}
            {thirdPlaceWinner && (
              <div className="text-center">
                <div className="text-xl mb-0.5">🥉</div>
                <div className="font-bold text-base">{thirdPlaceWinner.name}</div>
                <div className="text-yellow-100 text-xs">{thirdPlaceWinner.school}</div>
                <div className="text-xs bg-white/20 rounded-full px-2 py-0.5 mt-0.5">3위</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('bracket')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'bracket' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          대진표
        </button>
        {(isLeague || isGrouped) && (
          <button onClick={() => setTab('standings')} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${tab === 'standings' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            순위표
          </button>
        )}
      </div>

      {tab === 'bracket' && (
        <div className="space-y-4">
          {rounds.map(r => {
            const rMatches = event.matches.filter(m => m.round === r && !m.isBye && !m.isThirdPlace && m.participant1Id && m.participant2Id)
            if (rMatches.length === 0) return null
            const isGroupRound = isGrouped && event.groups.length > 0 && r <= (event.groups[0]?.participantIds.length - 1)
            const label = isGroupRound
              ? `예선 ${r}라운드`
              : getRoundName(r - (isGrouped ? event.groups[0]?.participantIds.length - 1 : 0), totalRounds)
            const done = rMatches.filter(m => m.result).length
            return (
              <div key={r}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm text-gray-700">{label}</span>
                  <span className="text-xs text-gray-400">{done}/{rMatches.length}경기</span>
                  {done === rMatches.length && <span className="text-xs text-green-600 font-medium">완료</span>}
                </div>
                <div className="flex flex-wrap gap-3">
                  {rMatches.map(m => <MatchCard key={m.id} m={m} pMap={pMap} />)}
                </div>
              </div>
            )
          })}
          {thirdPlaceMatch && thirdPlaceMatch.participant1Id && thirdPlaceMatch.participant2Id && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-sm text-orange-600">3·4위전</span>
              </div>
              <MatchCard m={thirdPlaceMatch} pMap={pMap} />
            </div>
          )}
        </div>
      )}

      {tab === 'standings' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">순위</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500">선수</th>
                <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500">승</th>
                <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500">패</th>
                <th className="text-center px-2 py-2 text-xs font-semibold text-gray-500">승점</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {Object.entries(standings)
                .sort((a, b) => b[1].pts - a[1].pts || (b[1].setsW - b[1].setsL) - (a[1].setsW - a[1].setsL))
                .map(([id, s], i) => (
                  <tr key={id} className={i < 3 ? 'bg-yellow-50' : ''}>
                    <td className="px-3 py-2 text-xs text-gray-500">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{pMap[id]?.name ?? id}</td>
                    <td className="px-2 py-2 text-center text-blue-600 font-semibold">{s.wins}</td>
                    <td className="px-2 py-2 text-center text-red-400">{s.losses}</td>
                    <td className="px-2 py-2 text-center font-bold">{s.pts}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── 메인 공개 페이지 ─────────────────────────────────────
export default function PublicTournament() {
  const { id } = useParams<{ id: string }>()
  const { tournaments, liveMatches, updateTournament } = useStore()
  const pMap = useParticipantMap()

  const localTournament = tournaments.find(t => t.id === id)
  const [remoteTournament, setRemoteTournament] = useState(localTournament ?? null)
  const tournament = localTournament ?? remoteTournament
  const [activeEventId, setActiveEventId] = useState<string | null>(null)
  const [showQR, setShowQR] = useState(false)
  const [liveIndicator, setLiveIndicator] = useState(false)

  // Fetch from Supabase if not in local store (shared device / spectator)
  useEffect(() => {
    if (!SYNC_ENABLED || !id || localTournament) return
    fetchTournament(id).then(t => { if (t) setRemoteTournament(t) })
  }, [id, localTournament])

  // Subscribe to Realtime updates
  useEffect(() => {
    if (!SYNC_ENABLED || !id) return
    const unsub = subscribeTournament(id, (updated) => {
      setLiveIndicator(true)
      setTimeout(() => setLiveIndicator(false), 3000)
      if (localTournament) {
        updateTournament(id, updated)
      } else {
        setRemoteTournament(updated)
      }
    })
    return unsub
  }, [id, localTournament, updateTournament])

  // 30초마다 자동 새로고침 (같은 기기에서 운영자가 점수입력 시 반영)
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveEventId(prev => prev)
    }, 30_000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (tournament && !activeEventId) {
      setActiveEventId(tournament.events[0]?.id ?? null)
    }
  }, [tournament, activeEventId])

  const publicUrl = typeof window !== 'undefined' ? window.location.href : ''
  const activeEvent = tournament?.events.find(e => e.id === activeEventId)

  // 현재 진행 중인 라이브 매치 (이 대회)
  const liveTournamentMatches = liveMatches.filter(m => m.tournamentId === id)

  if (!tournament) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-3">🏓</div>
          <h2 className="text-xl font-bold text-gray-700 mb-2">대회를 찾을 수 없습니다</h2>
          <p className="text-gray-400 text-sm">URL을 다시 확인해주세요</p>
        </div>
      </div>
    )
  }

  const totalMatches = tournament.events.reduce((s, e) => s + e.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length, 0)
  const doneMatches = tournament.events.reduce((s, e) => s + e.matches.filter(m => m.result).length, 0)
  const pct = totalMatches > 0 ? Math.round(doneMatches / totalMatches * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">🏓</span>
            <div className="min-w-0">
              <h1 className="font-bold text-gray-900 text-base leading-tight truncate">{tournament.name}</h1>
              <p className="text-xs text-gray-400">{tournament.date}{tournament.venue ? ` · ${tournament.venue}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {liveIndicator && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium animate-pulse">
                ● 업데이트됨
              </span>
            )}
            {SYNC_ENABLED && !liveIndicator && (
              <span className="text-xs text-gray-300 flex items-center gap-1">● 실시간</span>
            )}
            <div className="text-right">
              <div className="text-xs font-bold text-blue-600">{pct}%</div>
              <div className="text-xs text-gray-400">{doneMatches}/{totalMatches}</div>
            </div>
            <button onClick={() => setShowQR(v => !v)} className="text-xs px-2 py-1.5 bg-gray-100 rounded-lg text-gray-600 hover:bg-gray-200">
              QR
            </button>
          </div>
        </div>

        {/* QR 패널 */}
        {showQR && (
          <div className="border-t bg-gray-50 flex flex-col items-center py-4 gap-2">
            <QRCodeSVG value={publicUrl} size={120} />
            <p className="text-xs text-gray-500 text-center px-4 break-all">{publicUrl}</p>
            <p className="text-xs text-gray-400">이 QR로 대진표를 공유하세요</p>
          </div>
        )}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* 라이브 매치 */}
        {liveTournamentMatches.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-bold text-red-700">LIVE — 진행 중 경기</span>
            </div>
            <div className="space-y-2">
              {liveTournamentMatches.map(lm => {
                const p1 = pMap[lm.participant1Id]
                const p2 = pMap[lm.participant2Id]
                const p1Sets = lm.completedSets.filter(([a, b]) => a > b).length + (lm.currentSetScore[0] > lm.currentSetScore[1] ? 0 : 0)
                const p2Sets = lm.completedSets.filter(([a, b]) => b > a).length
                const p1Total = lm.completedSets.filter(([a, b]) => a > b).length
                const p2Total = lm.completedSets.filter(([a, b]) => b > a).length
                return (
                  <div key={lm.matchId} className="bg-white rounded-lg px-3 py-2 flex items-center gap-3 text-sm">
                    <span className="text-xs text-gray-400 w-6">{lm.tableNo}번</span>
                    <span className="flex-1 font-medium truncate">{p1?.name ?? '-'}</span>
                    <span className="font-bold text-lg text-red-600 tabular-nums">{p1Total} : {p2Total}</span>
                    <span className="flex-1 font-medium text-right truncate">{p2?.name ?? '-'}</span>
                    <span className="text-xs text-gray-400">{lm.currentSetScore[0]}-{lm.currentSetScore[1]}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 종목 탭 */}
        <div className="flex gap-2 flex-wrap">
          {tournament.events.map(ev => {
            const evMatches = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
            const evDone = evMatches.filter(m => m.result).length
            const active = activeEventId === ev.id
            return (
              <button key={ev.id} onClick={() => setActiveEventId(ev.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'}`}>
                {ev.label}
                <span className={`ml-1.5 text-xs ${active ? 'text-blue-200' : 'text-gray-400'}`}>{evDone}/{evMatches.length}</span>
              </button>
            )
          })}
        </div>

        {/* 이벤트 대진표 */}
        {activeEvent && (
          <div className="bg-white rounded-xl border p-4">
            <EventView event={activeEvent} pMap={pMap} />
          </div>
        )}

        {/* 푸터 */}
        <div className="text-center text-xs text-gray-400 py-2">
          🏓 탁구 대회 관리 시스템 v3.0
        </div>
      </div>
    </div>
  )
}
