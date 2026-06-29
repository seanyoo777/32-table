import { useState, useEffect, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { ClipboardList, Check, X, Zap, Keyboard, AlertTriangle } from 'lucide-react'
import type { ScoreRecord, MatchResult, MatchFormat, LiveMatch } from '../types'

function genId() { return Math.random().toString(36).slice(2, 10) }

// 탁구 세트 점수 유효성: needed점(11/21) 도달 + 2점 차 마무리(듀스는 정확히 2점 차)
function isValidSetScore(a: number, b: number, needed: number): boolean {
  if (a < 0 || b < 0 || a === b) return false
  const hi = Math.max(a, b), lo = Math.min(a, b)
  if (hi < needed) return false                 // 아무도 목표점 미도달
  if (hi === needed) return lo <= needed - 2     // 11:0 ~ 11:9
  return hi - lo === 2 && lo >= needed - 1       // 듀스: 12:10, 13:11 …
}

const DEFAULT_FORMAT: MatchFormat = { sets: 5, pointsPerGame: 11 }

// ── Live Scoreboard ─────────────────────────────────────
function LiveScoreboard({ onClose }: { onClose: () => void }) {
  const { tournaments, players, pairs, teams, liveMatches, setLiveMatch, removeLiveMatch, recordMatchResult, addScoreRecord } = useStore()

  const pMap = Object.fromEntries([
    ...players.map(p => [p.id, { name: p.name, school: p.school, photoUrl: p.photoUrl }]),
    ...pairs.map(p => [p.id, { name: p.name, school: p.school, photoUrl: undefined }]),
    ...teams.map(t => [t.id, { name: t.name, school: t.school, photoUrl: undefined }]),
  ])

  const [sel, setSel] = useState({ tournamentId: '', eventId: '', matchId: '' })
  const [tableNo, setTableNo] = useState(1)
  const [format, setFormat] = useState<MatchFormat>(DEFAULT_FORMAT)
  const [recorder, setRecorder] = useState(() => localStorage.getItem('pp-recorder') ?? '')
  const [matchDone, setMatchDone] = useState<{ name: string; sets: string } | null>(null)
  const [matchSearch, setMatchSearch] = useState('')

  const selTournament = tournaments.find(t => t.id === sel.tournamentId)
  const selEvent = selTournament?.events.find(e => e.id === sel.eventId)
  const pendingMatches = selEvent?.matches.filter(m =>
    m.participant1Id && m.participant2Id && !m.result && !m.isBye
  ) ?? []
  const selMatch = selEvent?.matches.find(m => m.id === sel.matchId)

  const activeLM = liveMatches.find(lm => lm.matchId === sel.matchId)

  function startMatch() {
    if (!selMatch?.participant1Id || !selMatch?.participant2Id) return
    const lm: LiveMatch = {
      tournamentId: sel.tournamentId,
      eventId: sel.eventId,
      matchId: sel.matchId,
      participant1Id: selMatch.participant1Id,
      participant2Id: selMatch.participant2Id,
      matchFormat: selEvent?.matchFormat ?? format,
      currentSet: 1,
      currentSetScore: [0, 0],
      completedSets: [],
      tableNo,
    }
    setLiveMatch(lm)
  }

  function addPoint(lm: LiveMatch, player: 0 | 1) {
    const newScore: [number, number] = [...lm.currentSetScore] as [number, number]
    newScore[player]++

    const needed = lm.matchFormat.pointsPerGame
    const setsToWin = Math.ceil(lm.matchFormat.sets / 2)
    const [a, b] = newScore

    const isSetWon = (a >= needed || b >= needed) &&
      (Math.abs(a - b) >= 2) &&
      (a !== b)

    if (isSetWon) {
      const newCompleted: Array<[number, number]> = [...lm.completedSets, newScore]
      const sets1 = newCompleted.filter(([x, y]) => x > y).length
      const sets2 = newCompleted.filter(([x, y]) => y > x).length

      if (sets1 === setsToWin || sets2 === setsToWin) {
        // Match over
        const winnerId = sets1 >= setsToWin ? lm.participant1Id : lm.participant2Id
        const loserId = sets1 >= setsToWin ? lm.participant2Id : lm.participant1Id
        const result: MatchResult = {
          winnerId, loserId,
          winnerScore: Math.max(sets1, sets2), loserScore: Math.min(sets1, sets2),
          sets: newCompleted,
        }
        recordMatchResult(lm.tournamentId, lm.eventId, lm.matchId, result)
        const record: ScoreRecord = {
          id: genId(), tournamentId: lm.tournamentId, eventId: lm.eventId, matchId: lm.matchId,
          participant1Id: lm.participant1Id, participant2Id: lm.participant2Id,
          p1Score: sets1, p2Score: sets2, sets: newCompleted,
          recordedBy: recorder || '스코어보드', recordedAt: new Date().toISOString(), verified: false,
        }
        addScoreRecord(record)
        removeLiveMatch(lm.matchId)
        setSel(s => ({ ...s, matchId: '' }))
        const winnerName = pMap[winnerId]?.name ?? '승자'
        const setsStr = newCompleted.map(([a, b]) => `${a}-${b}`).join(', ')
        setMatchDone({ name: winnerName, sets: setsStr })
        setTimeout(() => setMatchDone(null), 4000)
        return
      } else {
        setLiveMatch({ ...lm, completedSets: newCompleted, currentSet: lm.currentSet + 1, currentSetScore: [0, 0] })
      }
    } else {
      setLiveMatch({ ...lm, currentSetScore: newScore })
    }
  }

  function undoPoint(lm: LiveMatch, player: 0 | 1) {
    if (lm.currentSetScore[player] <= 0) return
    const newScore: [number, number] = [...lm.currentSetScore] as [number, number]
    newScore[player]--
    setLiveMatch({ ...lm, currentSetScore: newScore })
  }

  const p1 = selMatch?.participant1Id ? pMap[selMatch.participant1Id] : null
  const p2 = selMatch?.participant2Id ? pMap[selMatch.participant2Id] : null

  const setsToWin = activeLM ? Math.ceil(activeLM.matchFormat.sets / 2) : 3
  const sets1Won = activeLM ? activeLM.completedSets.filter(([a, b]) => a > b).length : 0
  const sets2Won = activeLM ? activeLM.completedSets.filter(([a, b]) => b > a).length : 0
  const isDeuce = activeLM ? (activeLM.currentSetScore[0] >= activeLM.matchFormat.pointsPerGame - 1 &&
    activeLM.currentSetScore[1] >= activeLM.matchFormat.pointsPerGame - 1) : false

  const servicePlayer = activeLM ? (() => {
    const totalPoints = activeLM.currentSetScore[0] + activeLM.currentSetScore[1]
    const baseServer = activeLM.currentSet % 2 === 1 ? 0 : 1
    // 듀스(양쪽 needed-1 이상)에서는 매 1점마다 서브 교대. 그 전엔 11점제 2점·21점제 5점마다.
    if (isDeuce) {
      const deucePoints = totalPoints - 2 * (activeLM.matchFormat.pointsPerGame - 1)
      const preChanges = Math.floor((2 * (activeLM.matchFormat.pointsPerGame - 1)) / (activeLM.matchFormat.pointsPerGame === 21 ? 5 : 2))
      return (baseServer + preChanges + deucePoints) % 2
    }
    const svcInterval = activeLM.matchFormat.pointsPerGame === 21 ? 5 : 2
    const changes = Math.floor(totalPoints / svcInterval)
    return (baseServer + changes) % 2
  })() : 0

  const roundName = (round: number) => {
    const maxRound = Math.max(...(selEvent?.matches.map(m => m.round) ?? [1]))
    const fromEnd = maxRound - round
    if (fromEnd === 0) return '결승'
    if (fromEnd === 1) return '준결승'
    if (fromEnd === 2) return '8강'
    return `R${round}`
  }

  // Keyboard shortcuts: [ = P1+1, ] = P2+1, z = P1 undo, x = P2 undo
  useEffect(() => {
    if (!activeLM) return
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if (e.key === '[') addPoint(activeLM, 0)
      else if (e.key === ']') addPoint(activeLM, 1)
      else if (e.key === 'z') undoPoint(activeLM, 0)
      else if (e.key === 'x') undoPoint(activeLM, 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeLM])

  // suppress unused warning
  void p1; void p2; void setsToWin; void onClose

  return (
    <div className="space-y-4">
      {/* Match completed banner */}
      {matchDone && (
        <div className="card bg-green-50 border-2 border-green-400 text-center py-5 animate-pulse">
          <div className="text-3xl mb-1">🏆</div>
          <div className="font-black text-xl text-green-700">{matchDone.name} 승!</div>
          <div className="text-sm text-green-600 mt-1 font-mono">{matchDone.sets}</div>
          <div className="text-xs text-green-500 mt-1">결과 저장 완료</div>
        </div>
      )}

      {/* Match selector */}
      {!activeLM && !matchDone && (
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">경기 선택</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">대회</label>
              <select className="select" value={sel.tournamentId} onChange={e => setSel({ tournamentId: e.target.value, eventId: '', matchId: '' })}>
                <option value="">대회 선택...</option>
                {tournaments.filter(t => t.status !== 'completed').map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            {selTournament && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">종목</label>
                <select className="select" value={sel.eventId} onChange={e => setSel(s => ({ ...s, eventId: e.target.value, matchId: '' }))}>
                  <option value="">종목 선택...</option>
                  {selTournament.events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.label}</option>
                  ))}
                </select>
              </div>
            )}
            {selEvent && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">경기</label>
                <select className="select" value={sel.matchId} onChange={e => setSel(s => ({ ...s, matchId: e.target.value }))}>
                  <option value="">경기 선택...</option>
                  {pendingMatches.map(m => {
                    const n1 = m.participant1Id ? pMap[m.participant1Id]?.name : '?'
                    const n2 = m.participant2Id ? pMap[m.participant2Id]?.name : '?'
                    return <option key={m.id} value={m.id}>{roundName(m.round)} — {n1} vs {n2}</option>
                  })}
                </select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">탁구대 번호</label>
              <input className="input" type="number" min={1} max={20} value={tableNo} onChange={e => setTableNo(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">세트 방식</label>
              <select className="select" value={format.sets} onChange={e => setFormat(f => ({ ...f, sets: Number(e.target.value) as 3 | 5 | 7 }))}>
                <option value={3}>3세트제 (2세트 선취)</option>
                <option value={5}>5세트제 (3세트 선취)</option>
                <option value={7}>7세트제 (4세트 선취)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">점수 방식</label>
              <select className="select" value={format.pointsPerGame} onChange={e => setFormat(f => ({ ...f, pointsPerGame: Number(e.target.value) as 11 | 21 }))}>
                <option value={11}>11점제</option>
                <option value={21}>21점제</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">심판</label>
              <input className="input" placeholder="심판 이름" value={recorder} onChange={e => { setRecorder(e.target.value); localStorage.setItem('pp-recorder', e.target.value) }} />
            </div>
          </div>
          {selMatch && (
            <button onClick={startMatch} className="btn-primary w-full flex items-center justify-center gap-2">
              <Zap size={16} /> 스코어보드 시작
            </button>
          )}
        </div>
      )}

      {/* Live scoreboard */}
      {activeLM && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium animate-pulse">LIVE</span>
              <span className="text-sm text-gray-500">탁구대 {activeLM.tableNo}번 · {activeLM.matchFormat.sets}세트제 {activeLM.matchFormat.pointsPerGame}점</span>
              <span className="hidden sm:inline text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-mono">
                <Keyboard size={10} className="inline mr-1" />[ ] 점수 · z x 취소
              </span>
            </div>
            <button onClick={() => removeLiveMatch(activeLM.matchId)} className="text-xs text-red-400 hover:text-red-600 border border-red-200 px-2 py-1 rounded">
              경기 취소
            </button>
          </div>

          {/* Set score summary */}
          <div className="card p-3">
            <div className="flex justify-center gap-6 items-center">
              <div className="text-center flex-1">
                <div className="font-bold text-sm text-gray-600 truncate">{pMap[activeLM.participant1Id]?.name ?? '선수1'}</div>
                <div className={`text-5xl font-black mt-1 ${sets1Won > sets2Won ? 'text-blue-600' : 'text-gray-700'}`}>{sets1Won}</div>
                <div className="text-xs text-gray-400 mt-1">세트</div>
              </div>
              <div className="text-2xl text-gray-300 font-bold">:</div>
              <div className="text-center flex-1">
                <div className="font-bold text-sm text-gray-600 truncate">{pMap[activeLM.participant2Id]?.name ?? '선수2'}</div>
                <div className={`text-5xl font-black mt-1 ${sets2Won > sets1Won ? 'text-red-500' : 'text-gray-700'}`}>{sets2Won}</div>
                <div className="text-xs text-gray-400 mt-1">세트</div>
              </div>
            </div>
            <div className="text-center text-xs text-gray-400 mt-2">
              {activeLM.completedSets.length > 0 &&
                activeLM.completedSets.map(([a, b], i) => (
                  <span key={i} className="mr-2">{a}-{b}</span>
                ))
              }
            </div>
          </div>

          {/* Current set score */}
          <div className={`card ${isDeuce ? 'border-2 border-orange-300 bg-orange-50' : ''}`}>
            {isDeuce && <div className="text-center text-orange-600 font-bold text-sm mb-2">듀스!</div>}
            <div className="text-center text-xs text-gray-400 mb-3">{activeLM.currentSet}세트</div>

            <div className="flex items-stretch gap-3">
              {/* Player 1 */}
              <div className="flex-1 flex flex-col items-center gap-2">
                <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${servicePlayer === 0 ? 'bg-blue-100 text-blue-700' : 'text-gray-400'}`}>
                  {servicePlayer === 0 ? '🏓 서브' : '리시브'}
                </div>
                {pMap[activeLM.participant1Id]?.photoUrl && (
                  <img src={pMap[activeLM.participant1Id].photoUrl!} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-blue-300" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
                <div className="font-semibold text-sm text-gray-700 truncate max-w-full text-center">
                  {pMap[activeLM.participant1Id]?.name ?? '선수1'}
                </div>
                <div className={`text-7xl sm:text-8xl font-black tabular-nums leading-none ${activeLM.currentSetScore[0] > activeLM.currentSetScore[1] ? 'text-blue-600' : 'text-gray-600'}`}>
                  {activeLM.currentSetScore[0]}
                </div>
                <button onClick={() => addPoint(activeLM, 0)}
                  className="w-full min-h-[80px] sm:min-h-[100px] bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white font-black text-4xl sm:text-5xl rounded-2xl transition-colors select-none touch-manipulation shadow-lg">
                  +1
                </button>
                <button onClick={() => undoPoint(activeLM, 0)}
                  className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm rounded-lg transition-colors touch-manipulation">
                  ↩ 취소
                </button>
              </div>

              <div className="flex flex-col items-center justify-center text-gray-200 font-bold text-2xl pt-16">:</div>

              {/* Player 2 */}
              <div className="flex-1 flex flex-col items-center gap-2">
                <div className={`text-xs font-medium px-2 py-0.5 rounded-full ${servicePlayer === 1 ? 'bg-red-100 text-red-700' : 'text-gray-400'}`}>
                  {servicePlayer === 1 ? '🏓 서브' : '리시브'}
                </div>
                {pMap[activeLM.participant2Id]?.photoUrl && (
                  <img src={pMap[activeLM.participant2Id].photoUrl!} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-red-300" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                )}
                <div className="font-semibold text-sm text-gray-700 truncate max-w-full text-center">
                  {pMap[activeLM.participant2Id]?.name ?? '선수2'}
                </div>
                <div className={`text-7xl sm:text-8xl font-black tabular-nums leading-none ${activeLM.currentSetScore[1] > activeLM.currentSetScore[0] ? 'text-red-500' : 'text-gray-600'}`}>
                  {activeLM.currentSetScore[1]}
                </div>
                <button onClick={() => addPoint(activeLM, 1)}
                  className="w-full min-h-[80px] sm:min-h-[100px] bg-red-500 hover:bg-red-600 active:bg-red-700 text-white font-black text-4xl sm:text-5xl rounded-2xl transition-colors select-none touch-manipulation shadow-lg">
                  +1
                </button>
                <button onClick={() => undoPoint(activeLM, 1)}
                  className="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm rounded-lg transition-colors touch-manipulation">
                  ↩ 취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other live matches */}
      {liveMatches.filter(lm => lm.matchId !== sel.matchId).length > 0 && (
        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-3 text-sm">다른 진행중인 경기</h3>
          <div className="space-y-2">
            {liveMatches.filter(lm => lm.matchId !== sel.matchId).map(lm => {
              const lp1 = pMap[lm.participant1Id]
              const lp2 = pMap[lm.participant2Id]
              const s1 = lm.completedSets.filter(([a, b]) => a > b).length
              const s2 = lm.completedSets.filter(([a, b]) => b > a).length
              return (
                <div key={lm.matchId} className="flex items-center gap-3 p-2 bg-red-50 rounded-lg text-sm">
                  <span className="text-xs text-red-500">{lm.tableNo}번대</span>
                  <span className="flex-1">{lp1?.name} vs {lp2?.name}</span>
                  <span className="font-bold">{s1}:{s2} (현재 {lm.currentSetScore[0]}-{lm.currentSetScore[1]})</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Manual Entry ─────────────────────────────────────────
function ManualEntry() {
  const { players, pairs, tournaments, scoreRecords, addScoreRecord, updateScoreRecord, verifyScoreRecord, removeScoreRecord, recordMatchResult } = useStore()
  const [submitted, setSubmitted] = useState(false)
  const [lastResult, setLastResult] = useState<{ winner: string; loser: string; score: string } | null>(null)
  const [sel, setSel] = useState({ tournamentId: '', eventId: '', matchId: '' })
  const [recorder, setRecorder] = useState(() => localStorage.getItem('pp-recorder') ?? '')
  const [sets, setSets] = useState<Array<[string, string]>>([['', '']])
  const [matchSearch, setMatchSearch] = useState('')
  const [recSearch, setRecSearch] = useState('')
  const [recUnverifiedOnly, setRecUnverifiedOnly] = useState(false)
  const [winnerOnly, setWinnerOnly] = useState(false)
  const [recTournamentId, setRecTournamentId] = useState('')
  const [recPage, setRecPage] = useState(0)
  const [recPeriod, setRecPeriod] = useState<'all' | 'today' | '7d' | '30d'>('all')
  const [showRecStats, setShowRecStats] = useState(false)
  const REC_PAGE_SIZE = 12
  const [expandedRecords, setExpandedRecords] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editP1, setEditP1] = useState('')
  const [editP2, setEditP2] = useState('')

  function toggleExpand(id: string) {
    setExpandedRecords(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  useEffect(() => {
    if (!sel.tournamentId) {
      const ongoing = tournaments.find(t => t.status === 'ongoing')
      if (ongoing) setSel(s => ({ ...s, tournamentId: ongoing.id }))
    }
  }, [tournaments])

  const pMap = Object.fromEntries([
    ...players.map(p => [p.id, { name: p.name, school: p.school }]),
    ...pairs.map(p => [p.id, { name: p.name, school: p.school }]),
  ])

  const selTournament = tournaments.find(t => t.id === sel.tournamentId)
  const selEvent = selTournament?.events.find(e => e.id === sel.eventId)
  const pendingMatches = selEvent?.matches.filter(m =>
    m.participant1Id && m.participant2Id && !m.result && !m.isBye
  ) ?? []
  const selMatch = selEvent?.matches.find(m => m.id === sel.matchId)

  function calcWinner() {
    let w1 = 0, w2 = 0
    for (const [a, b] of sets) {
      const na = Number(a), nb = Number(b)
      if (a !== '' && b !== '') { if (na > nb) w1++; else if (nb > na) w2++ }
    }
    return { w1, w2, hasWinner: w1 !== w2 && sets.some(([a, b]) => a !== '' && b !== '') }
  }

  const { w1, w2, hasWinner } = calcWinner()
  const p1 = selMatch?.participant1Id ? pMap[selMatch.participant1Id] : null
  const p2 = selMatch?.participant2Id ? pMap[selMatch.participant2Id] : null

  // 세트 점수 검증 (입력된 세트 중 비정상 인덱스)
  const neededPts = selEvent?.matchFormat?.pointsPerGame ?? 11
  const invalidSetIdx = sets.reduce<number[]>((acc, [a, b], i) => {
    if (a !== '' && b !== '' && !isValidSetScore(Number(a), Number(b), neededPts)) acc.push(i)
    return acc
  }, [])

  // 최근 입력 기록: 검색 + 미확인 필터 + 대회 필터 + 기간 필터 + 페이지네이션
  const filteredRecords = [...scoreRecords].reverse().filter(r => {
    if (recUnverifiedOnly && r.verified) return false
    if (recTournamentId && r.tournamentId !== recTournamentId) return false
    if (recPeriod !== 'all') {
      const now = new Date()
      const cutoff = recPeriod === 'today'
        ? new Date(now.toISOString().slice(0, 10))
        : recPeriod === '7d'
        ? new Date(now.getTime() - 7 * 86400000)
        : new Date(now.getTime() - 30 * 86400000)
      if (new Date(r.recordedAt) < cutoff) return false
    }
    if (!recSearch) return true
    const q = recSearch.toLowerCase()
    const n1 = (pMap[r.participant1Id]?.name ?? '').toLowerCase()
    const n2 = (pMap[r.participant2Id]?.name ?? '').toLowerCase()
    if (winnerOnly) {
      const winnerName = r.p1Score > r.p2Score ? n1 : n2
      return winnerName.includes(q)
    }
    return n1.includes(q) || n2.includes(q)
  })
  const recTotalPages = Math.max(1, Math.ceil(filteredRecords.length / REC_PAGE_SIZE))
  const recPageClamped = Math.min(recPage, recTotalPages - 1)
  const pagedRecords = filteredRecords.slice(recPageClamped * REC_PAGE_SIZE, (recPageClamped + 1) * REC_PAGE_SIZE)
  const recUnverifiedCount = scoreRecords.filter(r => !r.verified).length

  const tourStats = useMemo(() => {
    const map: Record<string, { tourName: string; count: number; setTotal: number; recWithSets: number; maxSet: number }> = {}
    scoreRecords.forEach(r => {
      if (!r.tournamentId) return
      if (!map[r.tournamentId]) {
        const t = tournaments.find(t => t.id === r.tournamentId)
        map[r.tournamentId] = { tourName: t?.name ?? r.tournamentId, count: 0, setTotal: 0, recWithSets: 0, maxSet: 0 }
      }
      const entry = map[r.tournamentId]
      entry.count++
      if (r.sets && r.sets.length > 0) {
        entry.setTotal += r.sets.length
        entry.recWithSets++
        r.sets.forEach(([a, b]) => { entry.maxSet = Math.max(entry.maxSet, a, b) })
      }
    })
    return Object.values(map).filter(e => e.count >= 2).sort((a, b) => b.count - a.count)
  }, [scoreRecords, tournaments])

  // suppress unused warning
  void submitted

  function handleSubmit() {
    if (!hasWinner || !selMatch || !selTournament || !selEvent) return
    const winnerId = w1 > w2 ? selMatch.participant1Id! : selMatch.participant2Id!
    const loserId = w1 > w2 ? selMatch.participant2Id! : selMatch.participant1Id!
    const result: MatchResult = {
      winnerId, loserId,
      winnerScore: Math.max(w1, w2), loserScore: Math.min(w1, w2),
      sets: sets.filter(([a, b]) => a !== '' && b !== '').map(([a, b]) => [Number(a), Number(b)]),
    }
    recordMatchResult(selTournament.id, selEvent.id, selMatch.id, result)

    const record: ScoreRecord = {
      id: genId(), tournamentId: selTournament.id, eventId: selEvent.id,
      matchId: selMatch.id,
      participant1Id: selMatch.participant1Id!, participant2Id: selMatch.participant2Id!,
      p1Score: w1, p2Score: w2,
      sets: sets.filter(([a, b]) => a !== '' && b !== '').map(([a, b]) => [Number(a), Number(b)]),
      recordedBy: recorder || '입력자', recordedAt: new Date().toISOString(), verified: false,
    }
    addScoreRecord(record)
    setLastResult({
      winner: pMap[winnerId]?.name ?? '?',
      loser: pMap[loserId]?.name ?? '?',
      score: `${Math.max(w1, w2)}-${Math.min(w1, w2)}`,
    })
    setSets([['', '']])
    setSubmitted(true)
    setTimeout(() => { setSubmitted(false); setLastResult(null) }, 3000)
    // 저장 후 다음 미완료 경기로 자동 이동 (없으면 다음 종목으로)
    const remaining = pendingMatches.filter(m => m.id !== selMatch.id)
    if (remaining[0]) {
      setSel(s => ({ ...s, matchId: remaining[0].id }))
    } else {
      const nextEv = selTournament.events.find(ev =>
        ev.id !== selEvent.id &&
        ev.matches.some(m => m.participant1Id && m.participant2Id && !m.result && !m.isBye)
      )
      if (nextEv) {
        const firstPending = nextEv.matches.find(m => m.participant1Id && m.participant2Id && !m.result && !m.isBye)
        setSel({ tournamentId: selTournament.id, eventId: nextEv.id, matchId: firstPending?.id ?? '' })
      } else {
        setSel(s => ({ ...s, matchId: '' }))
      }
    }
  }

  const roundName = (round: number) => {
    const maxRound = Math.max(...(selEvent?.matches.map(m => m.round) ?? [1]))
    const fromEnd = maxRound - round
    if (fromEnd === 0) return '결승'
    if (fromEnd === 1) return '준결승'
    if (fromEnd === 2) return '8강'
    return `R${round}`
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div className="space-y-4">
        <div className="card space-y-4">
          <h2 className="font-semibold text-gray-700">경기 선택</h2>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">대회</label>
            <select className="select" value={sel.tournamentId} onChange={e => setSel({ tournamentId: e.target.value, eventId: '', matchId: '' })}>
              <option value="">대회 선택...</option>
              {tournaments.filter(t => t.status !== 'completed').map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.date})</option>
              ))}
            </select>
          </div>
          {selTournament && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">종목</label>
              <select className="select" value={sel.eventId} onChange={e => setSel(s => ({ ...s, eventId: e.target.value, matchId: '' }))}>
                <option value="">종목 선택...</option>
                {selTournament.events.map(ev => {
                  const pending = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.result && !m.isBye).length
                  return <option key={ev.id} value={ev.id}>{ev.label} ({pending}경기 대기)</option>
                })}
              </select>
            </div>
          )}
          {selEvent && (
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">
                경기 <span className="text-gray-400 font-normal text-xs">({pendingMatches.length}경기 대기 · Tab=다음경기)</span>
              </label>
              <input
                className="input mb-1 text-sm"
                placeholder="선수명 검색..."
                value={matchSearch}
                onChange={e => setMatchSearch(e.target.value)}
              />
              <select className="select" value={sel.matchId}
                onChange={e => { setSel(s => ({ ...s, matchId: e.target.value })); setSets([['', '']]) }}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault()
                    const filtered = pendingMatches.filter(m => {
                      if (!matchSearch) return true
                      const n1 = m.participant1Id ? pMap[m.participant1Id]?.name ?? '' : ''
                      const n2 = m.participant2Id ? pMap[m.participant2Id]?.name ?? '' : ''
                      return n1.includes(matchSearch) || n2.includes(matchSearch)
                    })
                    const idx = filtered.findIndex(m => m.id === sel.matchId)
                    const next = filtered[e.shiftKey ? idx - 1 : idx + 1]
                    if (next) { setSel(s => ({ ...s, matchId: next.id })); setSets([['', '']]) }
                  }
                }}
              >
                <option value="">경기 선택...</option>
                {pendingMatches
                  .filter(m => {
                    if (!matchSearch) return true
                    const n1 = m.participant1Id ? pMap[m.participant1Id]?.name ?? '' : ''
                    const n2 = m.participant2Id ? pMap[m.participant2Id]?.name ?? '' : ''
                    return n1.includes(matchSearch) || n2.includes(matchSearch)
                  })
                  .map(m => {
                    const n1 = m.participant1Id ? pMap[m.participant1Id]?.name : '?'
                    const n2 = m.participant2Id ? pMap[m.participant2Id]?.name : '?'
                    return <option key={m.id} value={m.id}>{roundName(m.round)} — {n1} vs {n2}</option>
                  })}
              </select>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">입력자</label>
            <input className="input" placeholder="심판 이름" value={recorder} onChange={e => { setRecorder(e.target.value); localStorage.setItem('pp-recorder', e.target.value) }} />
          </div>
        </div>

        {selMatch && p1 && p2 && (
          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700">세트 점수</h2>
            <div className="flex items-center justify-center gap-4 py-2 bg-gray-50 rounded-lg">
              <div className="text-center flex-1"><div className="font-bold text-blue-600 text-sm">{p1.name}</div></div>
              <span className="text-gray-300 text-sm font-bold">VS</span>
              <div className="text-center flex-1"><div className="font-bold text-red-500 text-sm">{p2.name}</div></div>
            </div>
            {sets.map(([a, b], i) => (
              <div key={i} className={`flex items-center gap-2 p-2 rounded-lg ${invalidSetIdx.includes(i) ? 'bg-amber-50 ring-1 ring-amber-300' : a && b && Number(a) !== Number(b) ? (Number(a) > Number(b) ? 'bg-blue-50' : 'bg-red-50') : 'bg-gray-50'}`}>
                <span className="text-xs text-gray-400 w-8 text-center">SET {i + 1}</span>
                <input className="input text-center font-bold text-lg flex-1" type="number" min="0" placeholder="0"
                  value={a} onChange={e => {
                    const newA = e.target.value
                    setSets(s => {
                      const updated = s.map((set, si) => si === i ? [newA, set[1]] : set)
                      const [ca, cb] = updated[i]
                      if (i === updated.length - 1 && ca !== '' && cb !== '' && isValidSetScore(Number(ca), Number(cb), neededPts))
                        return [...updated, ['', '']]
                      return updated
                    })
                  }} />
                <span className="text-gray-300 font-bold">-</span>
                <input className="input text-center font-bold text-lg flex-1" type="number" min="0" placeholder="0"
                  value={b} onChange={e => {
                    const newB = e.target.value
                    setSets(s => {
                      const updated = s.map((set, si) => si === i ? [set[0], newB] : set)
                      const [ca, cb] = updated[i]
                      if (i === updated.length - 1 && ca !== '' && cb !== '' && isValidSetScore(Number(ca), Number(cb), neededPts))
                        return [...updated, ['', '']]
                      return updated
                    })
                  }}
                  onKeyDown={e => e.key === 'Enter' && setSets(s => [...s, ['', '']])} />
                {sets.length > 1 && (
                  <button onClick={() => setSets(s => s.filter((_, si) => si !== i))} className="text-gray-300 hover:text-red-400 p-1"><X size={14} /></button>
                )}
              </div>
            ))}
            <button onClick={() => setSets(s => [...s, ['', '']])} className="text-xs text-blue-500 hover:underline w-full text-center py-1">
              + 세트 추가 (Enter)
            </button>
            {invalidSetIdx.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5">
                <AlertTriangle size={12} className="flex-shrink-0" />
                비정상 세트 점수 {invalidSetIdx.map(i => `SET${i + 1}`).join(', ')} — {neededPts}점 도달·2점 차로 마무리되어야 합니다. (저장은 가능)
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {selMatch && hasWinner && p1 && p2 && (
          <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <h3 className="font-semibold text-gray-700 mb-4">결과 미리보기</h3>
            <div className="text-center py-4">
              <div className="text-4xl mb-2">🏆</div>
              <div className="font-bold text-xl text-blue-700">{w1 > w2 ? p1.name : p2.name}</div>
              <div className="text-sm text-gray-500 mb-3">{w1 > w2 ? p1.school : p2.school}</div>
              <div className="text-3xl font-bold text-gray-700">{Math.max(w1, w2)} : {Math.min(w1, w2)}</div>
              <div className="text-sm text-gray-400 mt-1">세트 스코어</div>
            </div>
            <div className="space-y-1 mt-3 mb-4">
              {sets.filter(([a, b]) => a !== '' && b !== '').map(([a, b], i) => (
                <div key={i} className="flex justify-between text-sm px-4 py-1">
                  <span className="text-gray-400">SET {i + 1}</span>
                  <span className={Number(a) > Number(b) ? 'font-bold text-blue-600' : 'text-gray-400'}>{a}</span>
                  <span className="text-gray-300">-</span>
                  <span className={Number(b) > Number(a) ? 'font-bold text-red-500' : 'text-gray-400'}>{b}</span>
                </div>
              ))}
            </div>
            <button className="btn-primary w-full text-base" onClick={handleSubmit}>
              ✓ 결과 저장 & 포인트 반영
            </button>
          </div>
        )}

        {lastResult && (
          <div className="card bg-green-50 border border-green-200 flex items-center gap-3 py-3 animate-pulse-once">
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 text-base">✓</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-green-600 font-semibold mb-0.5">방금 입력한 경기</div>
              <div className="text-sm font-bold text-green-800 truncate">
                🏆 {lastResult.winner} <span className="font-normal text-green-600">vs</span> {lastResult.loser}
              </div>
              <div className="text-xs text-green-600">세트 {lastResult.score}</div>
            </div>
            <div className="text-[10px] text-green-400 flex-shrink-0">3초 후 닫힘</div>
          </div>
        )}

        <div className="card">
          <div className="flex items-center justify-between mb-2 gap-2">
            <h3 className="font-semibold text-gray-700 flex-shrink-0">
              최근 입력 기록 <span className="text-xs text-gray-400 font-normal">({filteredRecords.length})</span>
            </h3>
            {recUnverifiedCount > 0 && (
              <button onClick={() => { setRecUnverifiedOnly(v => !v); setRecPage(0) }}
                className={`text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0 transition-colors ${recUnverifiedOnly ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                미확인만 {recUnverifiedCount}
              </button>
            )}
            {recUnverifiedCount >= 3 && (
              <button
                onClick={() => {
                  filteredRecords.filter(r => !r.verified).forEach(r => verifyScoreRecord(r.id))
                  setRecUnverifiedOnly(false)
                }}
                className="text-xs px-2 py-1 rounded-lg font-medium flex-shrink-0 bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
                일괄확인 {filteredRecords.filter(r => !r.verified).length}건
              </button>
            )}
          </div>
          {scoreRecords.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">입력된 기록이 없습니다</p>
          ) : (
            <>
              <div className="flex gap-2 mb-2">
                <div className="flex flex-1 rounded-lg overflow-hidden border border-gray-200 focus-within:border-blue-400">
                  <input
                    className="flex-1 text-sm px-3 py-2 bg-white focus:outline-none"
                    placeholder={winnerOnly ? '승자 이름 검색...' : '선수명으로 검색...'}
                    value={recSearch}
                    onChange={e => { setRecSearch(e.target.value); setRecPage(0) }}
                  />
                  <button
                    onClick={() => { setWinnerOnly(v => !v); setRecPage(0) }}
                    title="승자만 필터"
                    className={`px-2 text-xs font-bold flex-shrink-0 border-l border-gray-200 transition-colors ${winnerOnly ? 'bg-green-500 text-white' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}>
                    W
                  </button>
                </div>
                <select
                  className="select text-sm flex-shrink-0"
                  value={recPeriod}
                  onChange={e => { setRecPeriod(e.target.value as typeof recPeriod); setRecPage(0) }}>
                  <option value="all">전체 기간</option>
                  <option value="today">오늘</option>
                  <option value="7d">최근 7일</option>
                  <option value="30d">최근 30일</option>
                </select>
                {tournaments.length > 0 && (
                  <select
                    className="select text-sm min-w-[120px]"
                    value={recTournamentId}
                    onChange={e => { setRecTournamentId(e.target.value); setRecPage(0) }}
                  >
                    <option value="">전체 대회</option>
                    {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                {(recSearch || recTournamentId || recUnverifiedOnly || winnerOnly || recPeriod !== 'all') && (
                  <button
                    onClick={() => { setRecSearch(''); setRecTournamentId(''); setRecUnverifiedOnly(false); setWinnerOnly(false); setRecPeriod('all'); setRecPage(0) }}
                    className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium whitespace-nowrap"
                  >초기화 ✕</button>
                )}
              </div>
              {scoreRecords.length >= 10 && (() => {
                const today = new Date()
                const days = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(today)
                  d.setDate(today.getDate() - (6 - i))
                  return d.toISOString().split('T')[0]
                })
                const counts = days.map(d => scoreRecords.filter(r => r.recordedAt?.startsWith(d)).length)
                const maxCount = Math.max(...counts, 1)
                const W = 180, H = 34, PAD = 5
                const cx = (i: number) => PAD + (i / 6) * (W - PAD * 2)
                const cy = (v: number) => H - PAD - (v / maxCount) * (H - PAD * 2)
                const nonZeroPoints = counts.map((v, i) => ({ v, i })).filter(p => p.v > 0)
                const polylinePoints = nonZeroPoints.map(p => `${cx(p.i)},${cy(p.v)}`).join(' ')
                return (
                  <div className="mb-3 flex items-center gap-3">
                    <span className="text-[10px] text-gray-400 flex-shrink-0 whitespace-nowrap">7일 추이</span>
                    <div className="flex-1 min-w-0">
                      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 34 }}>
                        {nonZeroPoints.length >= 2 && (
                          <polyline points={polylinePoints} fill="none" stroke="#c7d2fe" strokeWidth="1.5" strokeLinejoin="round" />
                        )}
                        {counts.map((v, i) => {
                          const isToday = i === 6
                          const x = cx(i)
                          const y = cy(v)
                          if (v === 0) {
                            return <circle key={i} cx={x} cy={H - PAD - (H - PAD * 2) * 0.1} r="2" fill="none" stroke="#d1d5db" strokeWidth="1" strokeDasharray="2,2" />
                          }
                          return (
                            <g key={i}>
                              <circle cx={x} cy={y} r={isToday ? 3.5 : 2.5} fill={isToday ? '#6366f1' : '#a5b4fc'} />
                              <text x={x} y={y - 4} textAnchor="middle" fontSize="7" fill={isToday ? '#6366f1' : '#9ca3af'}>{v}</text>
                            </g>
                          )
                        })}
                      </svg>
                      <div className="flex justify-between px-1" style={{ marginTop: -2 }}>
                        {days.map((d, i) => {
                          const isToday = i === 6
                          const label = isToday ? '오늘' : `${parseInt(d.split('-')[2])}일`
                          return <span key={d} className={`text-[8px] ${isToday ? 'text-indigo-500 font-bold' : 'text-gray-300'}`}>{label}</span>
                        })}
                      </div>
                    </div>
                  </div>
                )
              })()}
              {filteredRecords.length >= 2 && (
                <div className="mb-2">
                  <button
                    onClick={() => setShowRecStats(v => !v)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${showRecStats ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
                  >
                    {showRecStats ? '▲ 선수별 요약 닫기' : '▼ 선수별 요약 보기'}
                  </button>
                  {showRecStats && (() => {
                    const statMap = new Map<string, { name: string; wins: number; losses: number }>()
                    filteredRecords.forEach(r => {
                      const p1Won = r.p1Score > r.p2Score
                      const addStat = (id: string | undefined, won: boolean) => {
                        if (!id) return
                        const name = pMap[id]?.name ?? '?'
                        const cur = statMap.get(id) ?? { name, wins: 0, losses: 0 }
                        statMap.set(id, won ? { ...cur, wins: cur.wins + 1 } : { ...cur, losses: cur.losses + 1 })
                      }
                      addStat(r.participant1Id, p1Won)
                      addStat(r.participant2Id, !p1Won)
                    })
                    const top5 = [...statMap.entries()]
                      .map(([id, s]) => ({ id, ...s, total: s.wins + s.losses, rate: s.wins / (s.wins + s.losses) * 100 }))
                      .filter(s => s.total > 0)
                      .sort((a, b) => b.wins - a.wins || b.rate - a.rate)
                      .slice(0, 5)
                    if (top5.length === 0) return null
                    return (
                      <div className="mt-2 space-y-1.5">
                        {top5.map((s, i) => (
                          <div key={s.id} className="flex items-center gap-2 text-xs">
                            <span className="w-4 text-center text-gray-400 font-bold flex-shrink-0">{i + 1}</span>
                            <span className="flex-1 font-medium text-gray-700 truncate">{s.name}</span>
                            <span className="text-green-600 font-bold flex-shrink-0">{s.wins}승</span>
                            <span className="text-red-400 flex-shrink-0">{s.losses}패</span>
                            <span className="text-gray-400 flex-shrink-0 w-10 text-right">{Math.round(s.rate)}%</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}
              {filteredRecords.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <span className="text-3xl">🔍</span>
                  <p className="text-sm text-gray-500 font-medium">검색 결과가 없습니다</p>
                  <p className="text-xs text-gray-400">필터 조건을 변경해 보세요</p>
                  <button
                    onClick={() => { setRecSearch(''); setRecTournamentId(''); setRecUnverifiedOnly(false); setRecPage(0) }}
                    className="mt-1 text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 font-medium"
                  >필터 초기화</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {pagedRecords.map(r => {
                    const n1 = pMap[r.participant1Id]?.name ?? '?'
                    const n2 = pMap[r.participant2Id]?.name ?? '?'
                    const isP1Win = r.p1Score > r.p2Score
                    const hasSets = r.sets && r.sets.length > 0
                    const isExpanded = expandedRecords.has(r.id)
                    const isEditing = editingId === r.id
                    return (
                      <div key={r.id} className="bg-gray-50 rounded-lg text-sm overflow-hidden">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 p-2">
                            <span className="text-xs text-gray-500 truncate flex-1">{n1}</span>
                            <input type="number" min={0} value={editP1}
                              onChange={e => setEditP1(e.target.value)}
                              className="w-10 text-center border border-blue-300 rounded px-1 py-0.5 text-xs font-bold" />
                            <span className="text-gray-300">-</span>
                            <input type="number" min={0} value={editP2}
                              onChange={e => setEditP2(e.target.value)}
                              className="w-10 text-center border border-red-300 rounded px-1 py-0.5 text-xs font-bold" />
                            <span className="text-xs text-gray-500 truncate flex-1 text-right">{n2}</span>
                            <button onClick={e => { e.stopPropagation(); const p1 = Number(editP1); const p2 = Number(editP2); if (p1 === p2) return; updateScoreRecord(r.id, { p1Score: p1, p2Score: p2 }); setEditingId(null) }}
                              className="text-[11px] bg-blue-600 text-white px-2 py-0.5 rounded flex-shrink-0">저장</button>
                            <button onClick={() => setEditingId(null)}
                              className="text-[11px] text-gray-400 hover:text-gray-600 px-1 flex-shrink-0"><X size={11} /></button>
                          </div>
                        ) : (
                        <div
                          className={`flex items-center gap-2 p-2 ${hasSets ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                          onClick={hasSets ? () => toggleExpand(r.id) : undefined}
                        >
                          <span className={`flex-1 text-right truncate font-medium ${isP1Win ? 'text-blue-600' : 'text-gray-400'}`}>{n1}</span>
                          <span className="font-bold text-gray-700 flex-shrink-0">{r.p1Score} - {r.p2Score}</span>
                          <span className={`flex-1 truncate font-medium ${!isP1Win ? 'text-blue-600' : 'text-gray-400'}`}>{n2}</span>
                          {hasSets && (
                            <span className="text-[10px] text-gray-400 flex-shrink-0">{isExpanded ? '▲' : '▼'}</span>
                          )}
                          {!r.verified
                            ? <button onClick={e => { e.stopPropagation(); verifyScoreRecord(r.id) }} className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded flex-shrink-0">확인</button>
                            : <Check size={12} className="text-green-500 flex-shrink-0" />
                          }
                          <button
                            onClick={e => { e.stopPropagation(); setEditingId(r.id); setEditP1(String(r.p1Score)); setEditP2(String(r.p2Score)) }}
                            className="text-[11px] text-blue-400 hover:text-blue-600 px-1 flex-shrink-0"
                            title="점수 수정"
                          ><Keyboard size={11} /></button>
                          <button
                            onClick={e => { e.stopPropagation(); if (window.confirm('이 기록을 삭제하시겠습니까?')) removeScoreRecord(r.id) }}
                            className="text-xs text-red-400 hover:text-red-600 px-1.5 py-0.5 rounded flex-shrink-0"
                            title="기록 삭제"
                          ><X size={11} /></button>
                        </div>
                        )}
                        {hasSets && isExpanded && (
                          <div className="px-2 pb-2 border-t border-gray-100">
                            <div className="flex gap-1 justify-center flex-wrap pt-1.5">
                              {r.sets!.map(([a, b], i) => (
                                <span key={i} className={`text-[10px] px-2 py-0.5 rounded font-mono font-medium ${a > b ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                                  {i + 1}세트 {a}-{b}
                                </span>
                              ))}
                            </div>
                            {r.recordedBy && (
                              <div className="text-[10px] text-gray-400 text-center mt-1">심판: {r.recordedBy}</div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
              {recTotalPages > 1 && (
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-100">
                  <button onClick={() => setRecPage(p => Math.max(0, p - 1))} disabled={recPageClamped === 0}
                    className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-40">이전</button>
                  <span className="text-xs text-gray-500">{recPageClamped + 1} / {recTotalPages}</span>
                  <button onClick={() => setRecPage(p => Math.min(recTotalPages - 1, p + 1))} disabled={recPageClamped >= recTotalPages - 1}
                    className="btn-secondary text-xs py-1 px-2.5 disabled:opacity-40">다음</button>
                </div>
              )}
            </>
          )}
        </div>

        {tourStats.length > 0 && (
          <div className="card">
            <h3 className="font-semibold text-gray-700 mb-2 text-sm">대회별 통계</h3>
            <div className="space-y-2">
              {tourStats.map(s => (
                <div key={s.tourName} className="bg-gray-50 rounded-lg px-3 py-2">
                  <div className="text-xs font-medium text-gray-700 truncate mb-1">{s.tourName}</div>
                  <div className="flex gap-3 flex-wrap text-[11px] text-gray-500">
                    <span>기록 <strong className="text-gray-700">{s.count}</strong>경기</span>
                    {s.recWithSets > 0 && (
                      <span>평균 <strong className="text-gray-700">{(s.setTotal / s.recWithSets).toFixed(1)}</strong>세트</span>
                    )}
                    {s.maxSet > 0 && (
                      <span>최다 득점 <strong className="text-gray-700">{s.maxSet}</strong>점</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────
export default function ScorePage() {
  const [mode, setMode] = useState<'live' | 'manual'>('live')
  const { scoreRecords } = useStore()
  const todayISO = new Date().toISOString().slice(0, 10)
  const todayAll = scoreRecords.filter(r => r.recordedAt.slice(0, 10) === todayISO)
  const todayVerified = todayAll.filter(r => r.verified).length
  const todayUnver = todayAll.length - todayVerified

  return (
    <div className="h-full overflow-y-auto px-5 py-4 space-y-4 bg-gray-50">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <ClipboardList size={20} className="text-red-500" /> 점수 입력
        </h1>
        <div className="flex gap-2">
          <button onClick={() => setMode('live')} className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${mode === 'live' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
            <Zap size={13} /> 실시간 스코어
          </button>
          <button onClick={() => setMode('manual')} className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            <Keyboard size={13} /> 직접입력
          </button>
        </div>
      </div>
      {todayAll.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full font-semibold">오늘 {todayAll.length}건</span>
          <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full">검증 {todayVerified}건</span>
          {todayUnver > 0 && <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full font-medium">미검증 {todayUnver}건</span>}
        </div>
      )}

      {mode === 'live' ? <LiveScoreboard onClose={() => setMode('manual')} /> : <ManualEntry />}
    </div>
  )
}
