import { useState } from 'react'
import { useStore } from '../store/useStore'
import { ClipboardList, Check, X, Zap, Keyboard } from 'lucide-react'
import type { ScoreRecord, MatchResult, MatchFormat, LiveMatch } from '../types'
import { calcNewRatings } from '../utils/ratingUtils'

function genId() { return Math.random().toString(36).slice(2, 10) }

const DEFAULT_FORMAT: MatchFormat = { sets: 5, pointsPerGame: 11 }

// ── Live Scoreboard ─────────────────────────────────────
function LiveScoreboard({ onClose }: { onClose: () => void }) {
  const { tournaments, players, pairs, teams, liveMatches, setLiveMatch, removeLiveMatch, recordMatchResult, addScoreRecord, addPlayerPoints, updatePlayerRating } = useStore()

  const pMap = Object.fromEntries([
    ...players.map(p => [p.id, { name: p.name, school: p.school }]),
    ...pairs.map(p => [p.id, { name: p.name, school: p.school }]),
    ...teams.map(t => [t.id, { name: t.name, school: t.school }]),
  ])

  const [sel, setSel] = useState({ tournamentId: '', eventId: '', matchId: '' })
  const [tableNo, setTableNo] = useState(1)
  const [format, setFormat] = useState<MatchFormat>(DEFAULT_FORMAT)
  const [recorder, setRecorder] = useState('')

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
        const ev = tournaments.find(t => t.id === lm.tournamentId)?.events.find(e => e.id === lm.eventId)
        if (ev) {
          addPlayerPoints(winnerId, ev.pointsForWin, true)
          addPlayerPoints(loserId, Math.floor(ev.pointsForWin * 0.2), false)
        }
        // Elo 레이팅 업데이트 (단식 선수만 — pairs는 rating 없음)
        const winner = players.find(p => p.id === winnerId)
        const loser = players.find(p => p.id === loserId)
        if (winner && loser) {
          const { newA, newB } = calcNewRatings(
            winner.rating, winner.gamesPlayed,
            loser.rating, loser.gamesPlayed,
            true
          )
          updatePlayerRating(winner.id, newA, winner.gamesPlayed + 1)
          updatePlayerRating(loser.id, newB, loser.gamesPlayed + 1)
        }
        const record: ScoreRecord = {
          id: genId(), tournamentId: lm.tournamentId, eventId: lm.eventId, matchId: lm.matchId,
          participant1Id: lm.participant1Id, participant2Id: lm.participant2Id,
          p1Score: sets1, p2Score: sets2, sets: newCompleted,
          recordedBy: recorder || '스코어보드', recordedAt: new Date().toISOString(), verified: false,
        }
        addScoreRecord(record)
        removeLiveMatch(lm.matchId)
        setSel(s => ({ ...s, matchId: '' }))
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
    const svcInterval = (activeLM.matchFormat.pointsPerGame === 21 && !isDeuce) ? 5 : 2
    const baseServer = activeLM.currentSet % 2 === 1 ? 0 : 1
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

  // suppress unused warning
  void p1; void p2; void setsToWin; void onClose

  return (
    <div className="space-y-4">
      {/* Match selector */}
      {!activeLM && (
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
              <input className="input" placeholder="심판 이름" value={recorder} onChange={e => setRecorder(e.target.value)} />
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
  const { players, pairs, tournaments, scoreRecords, addScoreRecord, verifyScoreRecord, recordMatchResult, addPlayerPoints, updatePlayerRating } = useStore()
  const [submitted, setSubmitted] = useState(false)
  const [sel, setSel] = useState({ tournamentId: '', eventId: '', matchId: '' })
  const [recorder, setRecorder] = useState('')
  const [sets, setSets] = useState<Array<[string, string]>>([['', '']])

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
    addPlayerPoints(winnerId, selEvent.pointsForWin, true)
    addPlayerPoints(loserId, Math.floor(selEvent.pointsForWin * 0.2), false)
    // Elo 레이팅 업데이트 (단식 선수만)
    const winner = players.find(p => p.id === winnerId)
    const loser = players.find(p => p.id === loserId)
    if (winner && loser) {
      const { newA, newB } = calcNewRatings(
        winner.rating, winner.gamesPlayed,
        loser.rating, loser.gamesPlayed,
        true
      )
      updatePlayerRating(winner.id, newA, winner.gamesPlayed + 1)
      updatePlayerRating(loser.id, newB, loser.gamesPlayed + 1)
    }

    const record: ScoreRecord = {
      id: genId(), tournamentId: selTournament.id, eventId: selEvent.id,
      matchId: selMatch.id,
      participant1Id: selMatch.participant1Id!, participant2Id: selMatch.participant2Id!,
      p1Score: w1, p2Score: w2,
      sets: sets.filter(([a, b]) => a !== '' && b !== '').map(([a, b]) => [Number(a), Number(b)]),
      recordedBy: recorder || '입력자', recordedAt: new Date().toISOString(), verified: false,
    }
    addScoreRecord(record)
    setSel(s => ({ ...s, matchId: '' }))
    setSets([['', '']])
    setSubmitted(true)
    setTimeout(() => setSubmitted(false), 3000)
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
              <label className="text-sm font-medium text-gray-700 block mb-1">경기 ({pendingMatches.length}경기 대기)</label>
              <select className="select" value={sel.matchId} onChange={e => { setSel(s => ({ ...s, matchId: e.target.value })); setSets([['', '']]) }}>
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
            <label className="text-sm font-medium text-gray-700 block mb-1">입력자</label>
            <input className="input" placeholder="심판 이름" value={recorder} onChange={e => setRecorder(e.target.value)} />
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
              <div key={i} className={`flex items-center gap-2 p-2 rounded-lg ${a && b && Number(a) !== Number(b) ? (Number(a) > Number(b) ? 'bg-blue-50' : 'bg-red-50') : 'bg-gray-50'}`}>
                <span className="text-xs text-gray-400 w-8 text-center">SET {i + 1}</span>
                <input className="input text-center font-bold text-lg flex-1" type="number" min="0" placeholder="0"
                  value={a} onChange={e => setSets(s => s.map((set, si) => si === i ? [e.target.value, set[1]] : set))} />
                <span className="text-gray-300 font-bold">-</span>
                <input className="input text-center font-bold text-lg flex-1" type="number" min="0" placeholder="0"
                  value={b} onChange={e => setSets(s => s.map((set, si) => si === i ? [set[0], e.target.value] : set))}
                  onKeyDown={e => e.key === 'Enter' && setSets(s => [...s, ['', '']])} />
                {sets.length > 1 && (
                  <button onClick={() => setSets(s => s.filter((_, si) => si !== i))} className="text-gray-300 hover:text-red-400 p-1"><X size={14} /></button>
                )}
              </div>
            ))}
            <button onClick={() => setSets(s => [...s, ['', '']])} className="text-xs text-blue-500 hover:underline w-full text-center py-1">
              + 세트 추가 (Enter)
            </button>
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

        <div className="card">
          <h3 className="font-semibold text-gray-700 mb-3">최근 입력 기록</h3>
          {scoreRecords.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">입력된 기록이 없습니다</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {[...scoreRecords].reverse().slice(0, 15).map(r => {
                const n1 = pMap[r.participant1Id]?.name ?? '?'
                const n2 = pMap[r.participant2Id]?.name ?? '?'
                const isP1Win = r.p1Score > r.p2Score
                return (
                  <div key={r.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg text-sm">
                    <span className={`flex-1 text-right truncate font-medium ${isP1Win ? 'text-blue-600' : 'text-gray-400'}`}>{n1}</span>
                    <span className="font-bold text-gray-600 flex-shrink-0">{r.p1Score} - {r.p2Score}</span>
                    <span className={`flex-1 truncate font-medium ${!isP1Win ? 'text-blue-600' : 'text-gray-400'}`}>{n2}</span>
                    {!r.verified
                      ? <button onClick={() => verifyScoreRecord(r.id)} className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded flex-shrink-0">확인</button>
                      : <Check size={12} className="text-green-500 flex-shrink-0" />
                    }
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────
export default function ScorePage() {
  const [mode, setMode] = useState<'live' | 'manual'>('live')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
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

      {mode === 'live' ? <LiveScoreboard onClose={() => setMode('manual')} /> : <ManualEntry />}
    </div>
  )
}
