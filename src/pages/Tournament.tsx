import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import {
  generateTournamentBracket, generateLeagueMatches, generateGroups,
  calcStandings, getRoundName, genId
} from '../utils/bracketUtils'
import {
  Plus, Trash2, Trophy, ChevronRight, X, Printer,
  Shuffle, Users, Layers, Check, ChevronDown, ChevronUp, Info
} from 'lucide-react'
import type {
  Division, EventType, Gender, BracketFormat,
  Tournament, TournamentEvent, BracketMatch, MatchResult, Player, Pair,
  TournamentGrade, MatchFormat
} from '../types'
import { TOURNAMENT_GRADES } from '../utils/rankingUtils'
import { calcNewRatings } from '../utils/ratingUtils'

const DIVISIONS: Division[] = ['초등', '중등', '고등', '대학', '일반', '생활체육']
const EVENT_TYPES: EventType[] = ['단식', '복식', '혼합복식', '단체전']
const GENDERS: Gender[] = ['남', '여', '혼합']
const FORMATS: BracketFormat[] = ['토너먼트', '리그', '조별+토너먼트']

const divColors: Record<Division, string> = {
  초등: 'bg-yellow-100 text-yellow-700', 중등: 'bg-green-100 text-green-700',
  고등: 'bg-blue-100 text-blue-700', 대학: 'bg-purple-100 text-purple-700', 일반: 'bg-gray-100 text-gray-700',
  생활체육: 'bg-orange-100 text-orange-700',
}
const genderColors: Record<string, string> = {
  남: 'bg-blue-50 text-blue-600', 여: 'bg-pink-50 text-pink-600', 혼합: 'bg-purple-50 text-purple-600'
}

// ─── 참가자 이름 조회 ─────────────────────────────────────
function useParticipantMap(players: Player[], pairs: Pair[]) {
  return useMemo(() => {
    const m: Record<string, { name: string; school: string; points: number; gender: string }> = {}
    for (const p of players) m[p.id] = { name: p.name, school: p.school, points: p.points, gender: p.gender }
    for (const p of pairs) m[p.id] = { name: p.name, school: p.school, points: p.points, gender: p.gender }
    return m
  }, [players, pairs])
}

// ─── 메인 ────────────────────────────────────────────────
export default function TournamentPage() {
  const { players, pairs, tournaments, addTournament, deleteTournament, recordMatchResult, addPlayerPoints, updatePlayerRating } = useStore()
  const pMap = useParticipantMap(players, pairs)

  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = tournaments.find(t => t.id === selectedId)

  function open(id: string) { setSelectedId(id); setView('detail') }

  if (view === 'create') {
    return <CreateForm
      players={players} pairs={pairs}
      onCancel={() => setView('list')}
      onCreate={(t) => { addTournament(t); open(t.id) }}
    />
  }

  if (view === 'detail' && selected) {
    return <TournamentDetail
      tournament={selected}
      pMap={pMap}
      onBack={() => setView('list')}
      onRecord={(evId, mId, result) => {
        recordMatchResult(selected.id, evId, mId, result)
        // Points: winner gets event.pointsForWin, loser gets 20%
        const ev = selected.events.find(e => e.id === evId)
        if (ev) {
          addPlayerPoints(result.winnerId, ev.pointsForWin, true)
          addPlayerPoints(result.loserId, Math.floor(ev.pointsForWin * 0.2), false)
        }
        // Elo 레이팅 업데이트 (단식 선수만)
        const winner = players.find(p => p.id === result.winnerId)
        const loser = players.find(p => p.id === result.loserId)
        if (winner && loser) {
          const { newA, newB } = calcNewRatings(
            winner.rating, winner.gamesPlayed,
            loser.rating, loser.gamesPlayed,
            true
          )
          updatePlayerRating(winner.id, newA, winner.gamesPlayed + 1)
          updatePlayerRating(loser.id, newB, loser.gamesPlayed + 1)
        }
      }}
    />
  }

  // ── 목록 ──
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Trophy size={20} className="text-blue-500" /> 대회 관리
        </h1>
        <button onClick={() => setView('create')} className="btn-primary flex items-center gap-1.5">
          <Plus size={15} /> 새 대회 생성
        </button>
      </div>

      {tournaments.length === 0 ? (
        <div className="card text-center py-16">
          <Trophy size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400 mb-4">생성된 대회가 없습니다</p>
          <button onClick={() => setView('create')} className="btn-primary">첫 대회 만들기</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...tournaments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(t => {
            const totalMatches = t.events.reduce((s, e) => s + e.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length, 0)
            const doneMatches = t.events.reduce((s, e) => s + e.matches.filter(m => m.result && !m.result.walkedOver).length, 0)
            const pct = totalMatches > 0 ? Math.round(doneMatches / totalMatches * 100) : 0
            const totalPlayers = t.events.reduce((s, e) => s + e.participantIds.length, 0)
            return (
              <div key={t.id} className="card hover:shadow-md transition-shadow cursor-pointer" onClick={() => open(t.id)}>
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-800">{t.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{t.date}{t.venue ? ` · ${t.venue}` : ''}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                {/* Events */}
                <div className="flex flex-wrap gap-1 my-2">
                  {t.events.map(ev => (
                    <span key={ev.id} className={`badge border text-xs ${genderColors[ev.gender]}`}>
                      {ev.label}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-400 mb-2">{t.events.length}개 종목 · {totalPlayers}명</div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{doneMatches}/{totalMatches}경기 완료</span><span>{pct}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={e => { e.stopPropagation(); deleteTournament(t.id) }} className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded">삭제</button>
                  <span className="text-xs text-blue-600 font-medium flex items-center gap-0.5">상세보기 <ChevronRight size={12} /></span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 대회 생성 폼 ─────────────────────────────────────────
function CreateForm({ players, pairs, onCancel, onCreate }: {
  players: Player[]; pairs: Pair[]
  onCancel: () => void
  onCreate: (t: Tournament) => void
}) {
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [venue, setVenue] = useState('')
  const [grade, setGrade] = useState<TournamentGrade>('B급')
  const [defaultMatchFormat, setDefaultMatchFormat] = useState<MatchFormat>({ sets: 5, pointsPerGame: 11 })
  const [events, setEvents] = useState<TournamentEvent[]>([])
  const [showEventForm, setShowEventForm] = useState(false)

  // Event form state
  const [ef, setEf] = useState({
    division: '고등' as Division, eventType: '단식' as EventType,
    gender: '남' as Gender, format: '토너먼트' as BracketFormat,
    pointsForWin: 50, groupSize: 4, advanceCount: 2,
    selectedIds: [] as string[],
  })

  const isDoubles = ef.eventType === '복식' || ef.eventType === '혼합복식'

  // Available participants based on event type
  const availableParticipants = useMemo(() => {
    if (isDoubles) {
      return pairs.filter(p =>
        p.division === ef.division &&
        (ef.gender === '혼합' || p.gender === ef.gender || ef.eventType === '혼합복식')
      ).map(p => ({ id: p.id, name: p.name, school: p.school, points: p.points, gender: p.gender }))
    }
    return players.filter(p =>
      p.division === ef.division &&
      (ef.gender === '혼합' || p.gender === ef.gender)
    ).map(p => ({ id: p.id, name: p.name, school: p.school, points: p.points, gender: p.gender }))
  }, [players, pairs, ef.division, ef.gender, ef.eventType, isDoubles])

  function autoSelect() {
    setEf(f => ({ ...f, selectedIds: availableParticipants.sort((a, b) => b.points - a.points).map(p => p.id) }))
  }

  function toggleId(id: string) {
    setEf(f => ({ ...f, selectedIds: f.selectedIds.includes(id) ? f.selectedIds.filter(x => x !== id) : [...f.selectedIds, id] }))
  }

  function addEvent() {
    if (ef.selectedIds.length < 2) return
    const label = `${ef.division} ${ef.gender !== '혼합' ? ef.gender + '자 ' : ''}${ef.eventType}`
    let matches: BracketMatch[] = []
    let groups: import('../types').Group[] = []
    const seeded = availableParticipants.filter(p => ef.selectedIds.includes(p.id)).sort((a, b) => b.points - a.points)

    if (ef.format === '토너먼트') {
      matches = generateTournamentBracket(seeded)
    } else if (ef.format === '리그') {
      matches = generateLeagueMatches(seeded)
    } else {
      const result = generateGroups(seeded, ef.groupSize, ef.advanceCount)
      groups = result.groups
      matches = result.matches
    }

    const ev: TournamentEvent = {
      id: genId(), label, eventType: ef.eventType, gender: ef.gender,
      division: ef.division, bracketFormat: ef.format,
      participantIds: ef.selectedIds, groups, matches,
      pointsForWin: ef.pointsForWin, status: 'ongoing',
    }
    setEvents(evs => [...evs, ev])
    setShowEventForm(false)
    setEf(f => ({ ...f, selectedIds: [] }))
  }

  function handleCreate() {
    if (!name || events.length === 0) return
    onCreate({
      id: genId(), name, date, venue, events, grade, defaultMatchFormat,
      status: 'ongoing', createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="btn-secondary py-1.5 text-sm">← 목록</button>
        <h1 className="text-xl font-bold">새 대회 생성</h1>
      </div>

      {/* 기본 정보 */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-700">대회 기본 정보</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className="text-sm font-medium text-gray-700 block mb-1">대회명 *</label>
            <input className="input" placeholder="예: 2024 전국 탁구 선수권대회" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">날짜</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">장소</label>
            <input className="input" placeholder="예: 국민체육센터" value={venue} onChange={e => setVenue(e.target.value)} />
          </div>
        </div>
      </div>

      {/* 종목 목록 */}
      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">종목 구성 ({events.length}개)</h2>
          <button onClick={() => setShowEventForm(!showEventForm)} className="btn-primary flex items-center gap-1.5 text-sm py-1.5">
            <Plus size={14} /> 종목 추가
          </button>
        </div>

        {events.length === 0 && !showEventForm && (
          <div className="text-center py-6 text-gray-400 text-sm border-2 border-dashed rounded-lg">
            종목을 추가해주세요 (남자단식, 여자단식, 혼합복식 등)
          </div>
        )}

        {/* Event form */}
        {showEventForm && (
          <div className="border-2 border-blue-200 rounded-xl p-4 bg-blue-50/30 space-y-4">
            <h3 className="font-semibold text-blue-700 text-sm">종목 설정</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">부문</label>
                <select className="select" value={ef.division} onChange={e => setEf(f => ({ ...f, division: e.target.value as Division, selectedIds: [] }))}>
                  {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">종목</label>
                <select className="select" value={ef.eventType} onChange={e => setEf(f => ({ ...f, eventType: e.target.value as EventType, selectedIds: [] }))}>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">성별</label>
                <select className="select" value={ef.gender}
                  onChange={e => setEf(f => ({ ...f, gender: e.target.value as Gender, selectedIds: [] }))}
                  disabled={ef.eventType === '혼합복식'}
                >
                  {(ef.eventType === '혼합복식' ? ['혼합'] : GENDERS).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">대진 방식</label>
                <select className="select" value={ef.format} onChange={e => setEf(f => ({ ...f, format: e.target.value as BracketFormat }))}>
                  {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">승리 포인트</label>
                <input className="input" type="number" value={ef.pointsForWin} onChange={e => setEf(f => ({ ...f, pointsForWin: Number(e.target.value) }))} />
              </div>
              {ef.format === '조별+토너먼트' && (<>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">조당 인원</label>
                  <input className="input" type="number" min="3" max="8" value={ef.groupSize} onChange={e => setEf(f => ({ ...f, groupSize: Number(e.target.value) }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">조당 본선진출</label>
                  <input className="input" type="number" min="1" value={ef.advanceCount} onChange={e => setEf(f => ({ ...f, advanceCount: Number(e.target.value) }))} />
                </div>
              </>)}
            </div>

            {/* Participant selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-600">
                  참가자 선택 ({ef.selectedIds.length}명) — {isDoubles ? '복식 페어' : '선수'}
                </label>
                <div className="flex gap-2">
                  <button onClick={autoSelect} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Shuffle size={11} /> 전체선택</button>
                  <button onClick={() => setEf(f => ({ ...f, selectedIds: [] }))} className="text-xs text-gray-400 hover:underline">초기화</button>
                </div>
              </div>
              {availableParticipants.length === 0 ? (
                <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                  {isDoubles
                    ? '등록된 복식 페어가 없습니다. 먼저 랭킹 페이지에서 페어를 등록해주세요.'
                    : '해당 부문/성별 선수가 없습니다.'}
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y bg-white">
                  {availableParticipants.sort((a, b) => b.points - a.points).map((p, i) => {
                    const checked = ef.selectedIds.includes(p.id)
                    return (
                      <label key={p.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={checked} onChange={() => toggleId(p.id)} className="rounded flex-shrink-0" />
                        <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                        <span className="font-medium text-sm flex-1">{p.name}</span>
                        <span className="text-xs text-gray-400">{p.school}</span>
                        <span className="text-xs font-semibold text-blue-600">{p.points.toLocaleString()}P</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={addEvent} disabled={ef.selectedIds.length < 2}>
                종목 추가 ({ef.selectedIds.length}명)
              </button>
              <button className="btn-secondary px-4" onClick={() => setShowEventForm(false)}>취소</button>
            </div>
          </div>
        )}

        {/* Added events */}
        <div className="space-y-2">
          {events.map((ev, i) => (
            <div key={ev.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-xs text-gray-400 w-5">{i + 1}</span>
              <span className={`badge ${genderColors[ev.gender]}`}>{ev.label}</span>
              <span className="badge bg-gray-100 text-gray-600 text-xs">{ev.bracketFormat}</span>
              <span className="text-sm text-gray-600">{ev.participantIds.length}명</span>
              <span className="text-xs text-gray-400">{ev.matches.length}경기 생성</span>
              <button onClick={() => setEvents(evs => evs.filter(e => e.id !== ev.id))} className="ml-auto text-red-400 hover:text-red-600 p-1">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button className="btn-primary flex-1 text-base" onClick={handleCreate} disabled={!name || events.length === 0}>
          🏓 대회 생성
        </button>
        <button className="btn-secondary px-6" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}

// ─── 대회 상세 (종목 탭) ──────────────────────────────────
function TournamentDetail({ tournament, pMap, onBack, onRecord }: {
  tournament: Tournament
  pMap: Record<string, { name: string; school: string; points: number; gender: string }>
  onBack: () => void
  onRecord: (evId: string, mId: string, result: MatchResult) => void
}) {
  const [activeEventId, setActiveEventId] = useState(tournament.events[0]?.id ?? '')
  const activeEvent = tournament.events.find(e => e.id === activeEventId)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="btn-secondary py-1.5 text-sm">← 목록</button>
          <div>
            <h1 className="text-xl font-bold">{tournament.name}</h1>
            <p className="text-sm text-gray-400">{tournament.date}{tournament.venue ? ` · ${tournament.venue}` : ''}</p>
          </div>
        </div>
        <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1.5 no-print">
          <Printer size={14} /> 인쇄
        </button>
      </div>

      {/* Event tabs */}
      <div className="flex gap-2 flex-wrap no-print">
        {tournament.events.map(ev => {
          const done = ev.matches.filter(m => m.result && !m.result.walkedOver).length
          const total = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length
          return (
            <button key={ev.id} onClick={() => setActiveEventId(ev.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${activeEventId === ev.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
              {ev.label}
              <span className={`ml-1.5 text-xs ${activeEventId === ev.id ? 'text-blue-200' : 'text-gray-400'}`}>{done}/{total}</span>
            </button>
          )
        })}
      </div>

      {/* Active event bracket */}
      {activeEvent && (
        <EventBracket event={activeEvent} pMap={pMap} onRecord={(mId, result) => onRecord(activeEvent.id, mId, result)} />
      )}
    </div>
  )
}

// ─── 종목 대진표 ──────────────────────────────────────────
function EventBracket({ event, pMap, onRecord }: {
  event: TournamentEvent
  pMap: Record<string, { name: string; school: string; points: number; gender: string }>
  onRecord: (matchId: string, result: MatchResult) => void
}) {
  const [activeView, setActiveView] = useState<'bracket' | 'standings'>('bracket')
  const [selectedRound, setSelectedRound] = useState(1)
  const [resultModal, setResultModal] = useState<BracketMatch | null>(null)

  const realMatches = event.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
  const maxRound = Math.max(...realMatches.map(m => m.round), 1)
  const totalRounds = event.bracketFormat === '토너먼트'
    ? Math.max(...event.matches.map(m => m.round), 1)
    : maxRound

  // Large bracket: > 32 participants → round-list view only
  const isLarge = event.participantIds.length > 32
  const isLeague = event.bracketFormat === '리그'
  const isGrouped = event.bracketFormat === '조별+토너먼트'

  const rounds = [...new Set(event.matches.map(m => m.round))].sort((a, b) => a - b)
  const roundMatches = event.matches.filter(m => m.round === selectedRound && m.participant1Id && m.participant2Id && !m.isBye)
  const standings = isLeague || isGrouped
    ? calcStandings(event.matches, event.participantIds)
    : {}

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-2 items-center flex-wrap">
        <button onClick={() => setActiveView('bracket')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === 'bracket' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          대진표
        </button>
        {(isLeague || isGrouped) && (
          <button onClick={() => setActiveView('standings')} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeView === 'standings' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            순위표
          </button>
        )}
        <span className="text-xs text-gray-400 ml-2">
          {event.participantIds.length}명 · {event.bracketFormat}
          {isLarge && <span className="ml-1 text-amber-600">(대규모)</span>}
        </span>
      </div>

      {activeView === 'standings' && (
        <StandingsTable participantIds={event.participantIds} standings={standings} pMap={pMap} />
      )}

      {activeView === 'bracket' && (
        <>
          {/* Round selector */}
          <div className="flex gap-1.5 flex-wrap">
            {rounds.map(r => {
              const rMatches = event.matches.filter(m => m.round === r && !m.isBye && m.participant1Id && m.participant2Id)
              const done = rMatches.filter(m => m.result && !m.result.walkedOver).length
              const isGroupRound = isGrouped && event.groups.length > 0 && r <= (event.groups[0]?.participantIds.length - 1)
              const label = isGroupRound
                ? `예선 ${r}라운드`
                : getRoundName(r - (isGrouped ? event.groups[0]?.participantIds.length - 1 : 0), totalRounds)
              return (
                <button key={r} onClick={() => setSelectedRound(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${selectedRound === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
                  {label}
                  <span className={`ml-1 ${selectedRound === r ? 'text-blue-200' : 'text-gray-400'}`}>{done}/{rMatches.length}</span>
                </button>
              )
            })}
          </div>

          {/* Match list (always list for large, tree option for small) */}
          {isLarge || isLeague || isGrouped ? (
            <MatchList
              matches={roundMatches}
              pMap={pMap}
              onClickMatch={(m) => !m.result && setResultModal(m)}
              groupMap={Object.fromEntries(event.groups.map(g => [g.id, g.name]))}
            />
          ) : (
            <BracketTree
              event={event}
              pMap={pMap}
              onClickMatch={(m) => !m.result && setResultModal(m)}
            />
          )}
        </>
      )}

      {/* Result modal */}
      {resultModal && (
        <ResultModal
          match={resultModal}
          pMap={pMap}
          onSubmit={(result) => { onRecord(resultModal.id, result); setResultModal(null) }}
          onClose={() => setResultModal(null)}
        />
      )}
    </div>
  )
}

// ─── 대진표 트리 (≤32명) ─────────────────────────────────
function BracketTree({ event, pMap, onClickMatch }: {
  event: TournamentEvent
  pMap: Record<string, any>
  onClickMatch: (m: BracketMatch) => void
}) {
  const rounds = [...new Set(event.matches.map(m => m.round))].sort((a, b) => a - b)
  const totalRounds = rounds.length

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-8 min-w-max">
        {rounds.map(round => {
          const rMatches = event.matches.filter(m => m.round === round && !m.isBye).sort((a, b) => a.position - b.position)
          return (
            <div key={round} className="flex flex-col">
              <div className="text-center mb-3">
                <span className="font-semibold text-sm text-gray-600">
                  {getRoundName(round, totalRounds)}
                </span>
                <div className="text-xs text-gray-400">{rMatches.length}경기</div>
              </div>
              <div className="flex flex-col justify-around flex-1 gap-4">
                {rMatches.map(m => {
                  const p1 = m.participant1Id ? pMap[m.participant1Id] : null
                  const p2 = m.participant2Id ? pMap[m.participant2Id] : null
                  const isPlayable = p1 && p2 && !m.result
                  const w = m.result?.winnerId
                  return (
                    <div key={m.id}
                      className={`bracket-match ${m.result ? 'winner-determined' : ''} ${isPlayable ? 'cursor-pointer hover:border-blue-500' : ''}`}
                      onClick={() => isPlayable && onClickMatch(m)}
                      style={{ minWidth: 180 }}>
                      <div className={`bracket-player border-b border-gray-100 ${w === p1?.id ? 'winner' : w ? 'loser' : ''}`}>
                        <span className="truncate max-w-32 text-xs">{p1 ? p1.name : '-'}</span>
                        {m.result && <span className="text-sm font-bold">{w === m.participant1Id ? m.result.winnerScore : m.result.loserScore}</span>}
                      </div>
                      <div className={`bracket-player ${w === p2?.id ? 'winner' : w ? 'loser' : ''}`}>
                        <span className="truncate max-w-32 text-xs">{p2 ? p2.name : '-'}</span>
                        {m.result && <span className="text-sm font-bold">{w === m.participant2Id ? m.result.winnerScore : m.result.loserScore}</span>}
                      </div>
                      {isPlayable && <div className="text-center text-xs text-blue-500 py-0.5 bg-blue-50">클릭 → 결과입력</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 경기 리스트 (대규모용) ───────────────────────────────
function MatchList({ matches, pMap, onClickMatch, groupMap }: {
  matches: BracketMatch[]
  pMap: Record<string, any>
  onClickMatch: (m: BracketMatch) => void
  groupMap: Record<string, string>
}) {
  if (matches.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">이 라운드에 경기가 없습니다</div>
  }

  // Group by groupId if exists
  const byGroup = matches.reduce((acc, m) => {
    const key = m.groupId ?? '__main'
    if (!acc[key]) acc[key] = []
    acc[key].push(m)
    return acc
  }, {} as Record<string, BracketMatch[]>)

  return (
    <div className="space-y-4">
      {Object.entries(byGroup).map(([gId, gMatches]) => (
        <div key={gId} className="card p-0 overflow-hidden">
          {gId !== '__main' && (
            <div className="bg-gray-50 px-4 py-2 border-b">
              <span className="font-semibold text-sm text-gray-700">{groupMap[gId] ?? gId}</span>
              <span className="text-xs text-gray-400 ml-2">{gMatches.length}경기</span>
            </div>
          )}
          <div className="divide-y">
            {gMatches.map((m, i) => {
              const p1 = m.participant1Id ? pMap[m.participant1Id] : null
              const p2 = m.participant2Id ? pMap[m.participant2Id] : null
              const isPlayable = p1 && p2 && !m.result
              const w = m.result?.winnerId
              return (
                <div key={m.id}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${isPlayable ? 'hover:bg-blue-50 cursor-pointer' : ''}`}
                  onClick={() => isPlayable && onClickMatch(m)}>
                  <span className="text-xs text-gray-400 w-6">{i + 1}</span>
                  {/* P1 */}
                  <div className={`flex-1 text-sm font-medium text-right ${w === m.participant1Id ? 'text-blue-700' : w ? 'text-gray-400' : ''}`}>
                    <div>{p1?.name ?? '-'}</div>
                    <div className="text-xs text-gray-400 font-normal">{p1?.school}</div>
                  </div>
                  {/* Score */}
                  <div className="text-center w-20 flex-shrink-0">
                    {m.result ? (
                      <span className="font-bold text-gray-700">
                        {m.result.winnerId === m.participant1Id ? m.result.winnerScore : m.result.loserScore}
                        <span className="text-gray-300 mx-1">-</span>
                        {m.result.winnerId === m.participant2Id ? m.result.winnerScore : m.result.loserScore}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-sm">vs</span>
                    )}
                  </div>
                  {/* P2 */}
                  <div className={`flex-1 text-sm font-medium ${w === m.participant2Id ? 'text-blue-700' : w ? 'text-gray-400' : ''}`}>
                    <div>{p2?.name ?? '-'}</div>
                    <div className="text-xs text-gray-400 font-normal">{p2?.school}</div>
                  </div>
                  {/* Status */}
                  <div className="w-16 flex-shrink-0 text-right">
                    {m.result && !m.result.walkedOver && <span className="text-xs text-green-500">✓완료</span>}
                    {m.result?.walkedOver && <span className="text-xs text-gray-400">부전승</span>}
                    {isPlayable && <span className="text-xs text-blue-500">입력 →</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── 순위표 ───────────────────────────────────────────────
function StandingsTable({ participantIds, standings, pMap }: {
  participantIds: string[]
  standings: Record<string, any>
  pMap: Record<string, any>
}) {
  const sorted = participantIds
    .map(id => ({ id, ...(standings[id] ?? { played: 0, wins: 0, losses: 0, pts: 0, setsW: 0, setsL: 0, pointsW: 0, pointsL: 0 }) }))
    .sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts
      if (b.wins !== a.wins) return b.wins - a.wins
      const setDiffA = a.setsW - a.setsL
      const setDiffB = b.setsW - b.setsL
      if (setDiffB !== setDiffA) return setDiffB - setDiffA
      const ptDiffA = (a.pointsW ?? 0) - (a.pointsL ?? 0)
      const ptDiffB = (b.pointsW ?? 0) - (b.pointsL ?? 0)
      return ptDiffB - ptDiffA
    })

  return (
    <div className="card p-0 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="py-3 px-4 text-left text-gray-600 w-10">순위</th>
            <th className="py-3 px-4 text-left text-gray-600">선수</th>
            <th className="py-3 px-4 text-center text-gray-600">경기</th>
            <th className="py-3 px-4 text-center text-gray-600 text-green-600">승</th>
            <th className="py-3 px-4 text-center text-gray-600 text-red-500">패</th>
            <th className="py-3 px-4 text-center text-gray-600">세트</th>
            <th className="py-3 px-4 text-center text-gray-600 text-blue-600 font-bold">승점</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => {
            const p = pMap[s.id]
            return (
              <tr key={s.id} className={`border-b last:border-0 ${i === 0 ? 'bg-yellow-50' : i < 3 ? 'bg-gray-50/30' : ''}`}>
                <td className="py-3 px-4 text-center font-bold">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</td>
                <td className="py-3 px-4"><div className="font-medium">{p?.name}</div><div className="text-xs text-gray-400">{p?.school}</div></td>
                <td className="py-3 px-4 text-center">{s.played}</td>
                <td className="py-3 px-4 text-center text-green-600 font-medium">{s.wins}</td>
                <td className="py-3 px-4 text-center text-red-500">{s.losses}</td>
                <td className="py-3 px-4 text-center text-gray-500">{s.setsW}-{s.setsL}</td>
                <td className="py-3 px-4 text-center font-bold text-blue-600 text-base">{s.pts}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── 결과 입력 모달 ───────────────────────────────────────
function ResultModal({ match, pMap, onSubmit, onClose }: {
  match: BracketMatch
  pMap: Record<string, any>
  onSubmit: (r: MatchResult) => void
  onClose: () => void
}) {
  const [sets, setSets] = useState<Array<[string, string]>>([['', '']])
  const p1 = match.participant1Id ? pMap[match.participant1Id] : null
  const p2 = match.participant2Id ? pMap[match.participant2Id] : null

  function calcWinner() {
    let w1 = 0, w2 = 0
    for (const [a, b] of sets) {
      const na = Number(a), nb = Number(b)
      if (a && b) { if (na > nb) w1++; else if (nb > na) w2++ }
    }
    return { w1, w2 }
  }

  const { w1, w2 } = calcWinner()
  const hasWinner = w1 !== w2 && sets.some(([a, b]) => a !== '' && b !== '')

  function handleSubmit() {
    if (!hasWinner || !match.participant1Id || !match.participant2Id) return
    const winnerId = w1 > w2 ? match.participant1Id : match.participant2Id
    const loserId = w1 > w2 ? match.participant2Id : match.participant1Id
    onSubmit({
      winnerId, loserId,
      winnerScore: Math.max(w1, w2),
      loserScore: Math.min(w1, w2),
      sets: sets.filter(([a, b]) => a !== '' && b !== '').map(([a, b]) => [Number(a), Number(b)]),
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-800">경기 결과 입력</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {/* VS header */}
        <div className="flex items-center justify-center gap-4 mb-5 py-3 bg-gray-50 rounded-lg">
          <div className="text-center flex-1">
            <div className="font-bold text-blue-600">{p1?.name}</div>
            <div className="text-xs text-gray-400">{p1?.school}</div>
          </div>
          <div className="text-gray-300 font-bold">VS</div>
          <div className="text-center flex-1">
            <div className="font-bold text-red-500">{p2?.name}</div>
            <div className="text-xs text-gray-400">{p2?.school}</div>
          </div>
        </div>

        {/* Set scores */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center text-xs text-gray-400 px-2">
            <span className="flex-1 text-center">SET</span>
            <span className="flex-1 text-center">{p1?.name}</span>
            <span className="w-6" />
            <span className="flex-1 text-center">{p2?.name}</span>
            <span className="w-6" />
          </div>
          {sets.map(([a, b], i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-gray-400 w-8 text-center">{i + 1}</span>
              <input className="input text-center font-bold text-lg flex-1" type="number" min="0" placeholder="0"
                value={a} onChange={e => setSets(s => s.map((set, si) => si === i ? [e.target.value, set[1]] : set))} />
              <span className="text-gray-300 font-bold">-</span>
              <input className="input text-center font-bold text-lg flex-1" type="number" min="0" placeholder="0"
                value={b} onChange={e => setSets(s => s.map((set, si) => si === i ? [set[0], e.target.value] : set))} />
              {sets.length > 1 && (
                <button onClick={() => setSets(s => s.filter((_, si) => si !== i))} className="text-gray-300 hover:text-red-400 w-6"><X size={14} /></button>
              )}
            </div>
          ))}
          <button onClick={() => setSets(s => [...s, ['', '']])} className="text-xs text-blue-500 hover:underline w-full text-center py-1">
            + 세트 추가
          </button>
        </div>

        {/* Winner preview */}
        {hasWinner && (
          <div className="bg-blue-50 rounded-lg p-3 mb-4 text-center">
            <div className="text-xs text-gray-500 mb-1">최종 결과</div>
            <div className="font-bold text-blue-700">
              {w1 > w2 ? p1?.name : p2?.name} 승리
            </div>
            <div className="text-sm text-gray-500">{Math.max(w1, w2)} : {Math.min(w1, w2)} 세트</div>
          </div>
        )}

        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={handleSubmit} disabled={!hasWinner}>결과 저장</button>
          <button className="btn-secondary flex-1" onClick={onClose}>취소</button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { label: string; cls: string }> = {
    draft: { label: '준비중', cls: 'bg-gray-100 text-gray-600' },
    ongoing: { label: '진행중', cls: 'bg-green-100 text-green-700' },
    completed: { label: '완료', cls: 'bg-blue-100 text-blue-700' },
  }
  const { label, cls } = m[status] || m.draft
  return <span className={`badge ${cls}`}>{label}</span>
}
