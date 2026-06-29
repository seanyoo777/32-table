import { useState, useMemo } from 'react'
import { useStore } from '../store/useStore'
import { SYNC_ENABLED } from '../lib/sync'
import {
  generateTournamentBracket, generateLeagueMatches, generateGroups, generateSeededBracket,
  generateDoubleElimBracket, calcStandings, getRoundName, genId
} from '../utils/bracketUtils'

// 더블 엘리미네이션: 2의 거듭제곱 인원만 지원 → 가장 가까운 하위 2^k로 정리
function floorPow2(n: number): number { return n < 2 ? 0 : 1 << Math.floor(Math.log2(n)) }
import { getMedalists, isEventComplete } from '../utils/tournamentScoring'
import {
  Plus, Trash2, Trophy, ChevronRight, ChevronLeft, X, Printer,
  Shuffle, Users, Layers, Check, ChevronDown, ChevronUp, Info, Download, Upload, Cloud, CloudOff
} from 'lucide-react'
import type {
  Division, EventType, Gender, BracketFormat,
  Tournament, TournamentEvent, BracketMatch, MatchResult, Player, Pair,
  TournamentGrade, MatchFormat, TeamSubMatch
} from '../types'
import { TOURNAMENT_GRADES } from '../utils/rankingUtils'

const DIVISIONS: Division[] = ['초등', '중등', '고등', '대학', '일반', '생활체육']
const EVENT_TYPES: EventType[] = ['단식', '복식', '혼합복식', '단체전']
const GENDERS: Gender[] = ['남', '여', '혼합']
const FORMATS: BracketFormat[] = ['토너먼트', '리그', '조별+토너먼트', '시드예선', '더블엘리미네이션']

const divColors: Record<Division, string> = {
  초등: 'bg-yellow-100 text-yellow-700', 중등: 'bg-green-100 text-green-700',
  고등: 'bg-blue-100 text-blue-700', 대학: 'bg-purple-100 text-purple-700', 일반: 'bg-gray-100 text-gray-700',
  생활체육: 'bg-orange-100 text-orange-700',
}
const genderColors: Record<string, string> = {
  남: 'bg-blue-50 text-blue-600', 여: 'bg-pink-50 text-pink-600', 혼합: 'bg-purple-50 text-purple-600'
}

// ─── 결과 CSV 내보내기 ────────────────────────────────────
function exportTournamentCSV(
  tournament: Tournament,
  pMap: Record<string, { name: string; school: string; points: number; gender: string }>
) {
  const MAX_SETS = 5
  const setHeaders = Array.from({ length: MAX_SETS }, (_, i) => `세트${i + 1}`)
  const rows: string[] = [`대회명,종목,라운드,선수1,학교1,선수2,학교2,승자,세트수,총점스코어,${setHeaders.join(',')}`]
  for (const ev of tournament.events) {
    const completed = ev.matches
      .filter(m => m.result && m.participant1Id && m.participant2Id && !m.isBye)
      .sort((a, b) => a.round !== b.round ? a.round - b.round : a.position - b.position)
    for (const m of completed) {
      const p1 = pMap[m.participant1Id!]
      const p2 = pMap[m.participant2Id!]
      const winner = pMap[m.result!.winnerId]
      const sets = m.result!.sets ?? []
      const totalStr = `${m.result!.winnerScore}-${m.result!.loserScore}`
      const setCols = Array.from({ length: MAX_SETS }, (_, i) => sets[i] ? `${sets[i][0]}-${sets[i][1]}` : '')
      rows.push([
        tournament.name, ev.label, `R${m.round}`,
        p1?.name ?? '', p1?.school ?? '',
        p2?.name ?? '', p2?.school ?? '',
        winner?.name ?? '',
        m.result!.walkedOver ? '부전승' : sets.length || '',
        m.result!.walkedOver ? '' : totalStr,
        ...setCols
      ].join(','))
    }
  }
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url
  a.download = `${tournament.name}_결과_${new Date().toISOString().split('T')[0]}.csv`
  a.click(); URL.revokeObjectURL(url)
}

// ─── 참가자 이름 조회 ─────────────────────────────────────
function useParticipantMap(players: Player[], pairs: Pair[], teams: import('../types').Team[]) {
  return useMemo(() => {
    const m: Record<string, { name: string; school: string; points: number; gender: string }> = {}
    for (const p of players) m[p.id] = { name: p.name, school: p.school, points: p.points, gender: p.gender }
    for (const p of pairs) m[p.id] = { name: p.name, school: p.school, points: p.points, gender: p.gender }
    for (const t of teams) m[t.id] = { name: t.name, school: t.school, points: t.points, gender: t.gender }
    return m
  }, [players, pairs, teams])
}

// ─── 메인 ────────────────────────────────────────────────
export default function TournamentPage() {
  const { players, pairs, teams, tournaments, addTournament, deleteTournament, updateTournament, recordMatchResult, clearMatchResult, addMatchCall } = useStore()
  const pMap = useParticipantMap(players, pairs, teams)

  const openId = new URLSearchParams(window.location.search).get('open')
  const [view, setView] = useState<'list' | 'create' | 'detail'>(openId ? 'detail' : 'list')
  const [selectedId, setSelectedId] = useState<string | null>(openId)
  const [tourPage, setTourPage] = useState(0)
  const [tourFilter, setTourFilter] = useState<'all' | 'ongoing' | 'completed' | 'draft'>('all')
  const [tourSearch, setTourSearch] = useState('')
  const TOUR_PAGE_SIZE = 12
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
      onStatusChange={(status) => updateTournament(selected.id, { status })}
      onRecord={(evId, mId, result) => {
        recordMatchResult(selected.id, evId, mId, result)
      }}
      onClearResult={(evId, mId) => clearMatchResult(selected.id, evId, mId)}
    />
  }

  // ── 목록 ──
  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
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
        (() => {
          const filterLabels: Array<{ key: typeof tourFilter; label: string }> = [
            { key: 'all', label: `전체 (${tournaments.length})` },
            { key: 'ongoing', label: `진행중 (${tournaments.filter(t => t.status === 'ongoing').length})` },
            { key: 'completed', label: `완료 (${tournaments.filter(t => t.status === 'completed').length})` },
            { key: 'draft', label: `준비중 (${tournaments.filter(t => t.status === 'draft').length})` },
          ]
          const sorted = [...tournaments]
            .filter(t => tourFilter === 'all' || t.status === tourFilter)
            .filter(t => !tourSearch || t.name.includes(tourSearch))
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          const totalPages = Math.ceil(sorted.length / TOUR_PAGE_SIZE)
          const paged = sorted.slice(tourPage * TOUR_PAGE_SIZE, (tourPage + 1) * TOUR_PAGE_SIZE)
          return (<>
        <div className="flex gap-2 mb-2 items-center">
          <input
            className="input flex-1 text-sm"
            placeholder="대회 이름 검색..."
            value={tourSearch}
            onChange={e => { setTourSearch(e.target.value); setTourPage(0) }}
          />
          {tourSearch && (
            <button onClick={() => { setTourSearch(''); setTourPage(0) }} className="text-gray-400 hover:text-gray-600 px-2">✕</button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {filterLabels.map(({ key, label }) => (
            <button key={key} onClick={() => { setTourFilter(key); setTourPage(0) }}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${tourFilter === key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {label}
            </button>
          ))}
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">해당 상태의 대회가 없습니다</p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paged.map(t => {
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
                  <div className="flex items-center gap-1.5">
                    {totalMatches > 0 && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pct === 100 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                        {pct === 100 ? '완료' : `${pct}%`}
                      </span>
                    )}
                    <StatusBadge status={t.status} />
                  </div>
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
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-2">
            <button onClick={() => setTourPage(p => Math.max(0, p - 1))} disabled={tourPage === 0}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-50">← 이전</button>
            <span className="text-sm text-gray-500">{tourPage + 1} / {totalPages}</span>
            <button onClick={() => setTourPage(p => Math.min(totalPages - 1, p + 1))} disabled={tourPage === totalPages - 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white disabled:opacity-40 hover:bg-gray-50">다음 →</button>
          </div>
        )}
        </>)
        })()
      )}
    </div>
  </div>
  )
}

// ─── 대회 생성 폼 ─────────────────────────────────────────
type CreateFormProps = {
  players: Player[]
  pairs: Pair[]
  onCancel: () => void
  onCreate: (t: Tournament) => void
}
function CreateForm({ players, pairs, onCancel, onCreate }: CreateFormProps) {
  const { teams } = useStore()
  const [name, setName] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [venue, setVenue] = useState('')
  const [grade, setGrade] = useState<TournamentGrade>('B급')
  const [defaultMatchFormat, setDefaultMatchFormat] = useState<MatchFormat>({ sets: 5, pointsPerGame: 11 })
  const [events, setEvents] = useState<TournamentEvent[]>([])
  const [showEventForm, setShowEventForm] = useState(false)
  const [showAutoSetup, setShowAutoSetup] = useState(false)

  // Auto setup state
  type AutoDiv = { division: Division; gender: '남' | '여' | 'both'; format: BracketFormat; maxPlayers: number; enabled: boolean; seedCount?: number }
  const [autoConfig, setAutoConfig] = useState<AutoDiv[]>([
    { division: '초등', gender: 'both', format: '토너먼트', maxPlayers: 32, enabled: true },
    { division: '중등', gender: 'both', format: '조별+토너먼트', maxPlayers: 32, enabled: true },
    { division: '고등', gender: 'both', format: '조별+토너먼트', maxPlayers: 64, enabled: true },
    { division: '대학', gender: 'both', format: '토너먼트', maxPlayers: 32, enabled: false },
    { division: '일반', gender: 'both', format: '토너먼트', maxPlayers: 32, enabled: false },
    { division: '생활체육', gender: 'both', format: '토너먼트', maxPlayers: 32, enabled: true },
  ])

  function getPlayersForDiv(division: Division, gender: '남' | '여') {
    return players.filter(p => p.division === division && p.gender === gender).sort((a, b) => b.points - a.points)
  }

  function buildAutoEvents(): TournamentEvent[] {
    const result: TournamentEvent[] = []
    for (const cfg of autoConfig) {
      if (!cfg.enabled) continue
      const genders: Array<'남' | '여'> = cfg.gender === 'both' ? ['남', '여'] : [cfg.gender]
      for (const gender of genders) {
        const pool = getPlayersForDiv(cfg.division, gender)
        let participants = pool.slice(0, cfg.maxPlayers)
        if (participants.length < 2) continue
        const label = `${cfg.division} ${gender}자 단식`
        let matches: BracketMatch[] = []
        let groups: import('../types').Group[] = []
        if (cfg.format === '토너먼트') {
          matches = generateTournamentBracket(participants, { thirdPlace: participants.length >= 4, preserveOrder: true })
        } else if (cfg.format === '리그') {
          matches = generateLeagueMatches(participants)
        } else if (cfg.format === '더블엘리미네이션') {
          participants = participants.slice(0, floorPow2(participants.length))  // 2^k 인원
          if (participants.length < 4) continue
          matches = generateDoubleElimBracket(participants, { preserveOrder: true })
        } else if (cfg.format === '시드예선') {
          const sc = cfg.seedCount ?? 4
          const r = generateSeededBracket(participants, sc)
          groups = r.groups; matches = r.matches
        } else {
          const r = generateGroups(participants, 4, 2)
          groups = r.groups; matches = r.matches
        }
        result.push({
          id: genId(), label, eventType: '단식', gender, division: cfg.division,
          bracketFormat: cfg.format, participantIds: participants.map(p => p.id),
          groups, matches, pointsForWin: 50, status: 'ongoing',
          hasThirdPlace: cfg.format === '토너먼트' && participants.length >= 4,
          seedCount: cfg.format === '시드예선' ? (cfg.seedCount ?? 4) : undefined,
        })
      }
    }
    return result
  }

  // Seeding state
  const [seedCount, setSeedCount] = useState(4)
  const [seedOrderIds, setSeedOrderIds] = useState<string[]>([])

  // Event form state
  const [ef, setEf] = useState({
    division: '고등' as Division, eventType: '단식' as EventType,
    gender: '남' as Gender, format: '토너먼트' as BracketFormat,
    pointsForWin: 50, groupSize: 4, advanceCount: 2,
    selectedIds: [] as string[],
    thirdPlace: false,
    seedCount: 4,
  })

  const isDoubles = ef.eventType === '복식' || ef.eventType === '혼합복식'
  const isTeam = ef.eventType === '단체전'

  // Available participants based on event type
  const availableParticipants = useMemo(() => {
    if (isTeam) {
      return teams.filter(t =>
        t.division === ef.division &&
        (ef.gender === '혼합' || t.gender === ef.gender)
      ).map(t => ({ id: t.id, name: t.name, school: t.school, points: t.points, gender: t.gender }))
    }
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
  }, [players, pairs, teams, ef.division, ef.gender, ef.eventType, isDoubles, isTeam])

  function autoSelect() {
    const sorted = availableParticipants.sort((a, b) => b.points - a.points).map(p => p.id)
    setEf(f => ({ ...f, selectedIds: sorted }))
    setSeedOrderIds(sorted)
  }

  function toggleId(id: string) {
    setEf(f => ({ ...f, selectedIds: f.selectedIds.includes(id) ? f.selectedIds.filter(x => x !== id) : [...f.selectedIds, id] }))
    setSeedOrderIds([])
  }

  function autoSeedByRanking() {
    const sorted = availableParticipants
      .filter(p => ef.selectedIds.includes(p.id))
      .sort((a, b) => b.points - a.points)
      .map(p => p.id)
    setSeedOrderIds(sorted)
  }

  function moveSeed(idx: number, delta: -1 | 1) {
    setSeedOrderIds(prev => {
      const arr = [...prev]
      const target = idx + delta
      if (target < 0 || target >= arr.length) return prev
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return arr
    })
  }

  function drawNonSeeds() {
    const base = seedOrderIds.length > 0
      ? seedOrderIds.filter(id => ef.selectedIds.includes(id))
      : availableParticipants.filter(p => ef.selectedIds.includes(p.id)).sort((a, b) => b.points - a.points).map(p => p.id)
    const seeds = base.slice(0, seedCount)
    const rest = [...base.slice(seedCount)].sort(() => Math.random() - 0.5)
    setSeedOrderIds([...seeds, ...rest])
  }

  function addEvent() {
    if (ef.selectedIds.length < 2) return
    const label = `${ef.division} ${ef.gender !== '혼합' ? ef.gender + '자 ' : ''}${ef.eventType}`
    let matches: BracketMatch[] = []
    let groups: import('../types').Group[] = []

    // 시드 순서가 지정된 경우 그대로 사용, 아니면 랭킹순 정렬
    const finalOrder = seedOrderIds.length > 0
      ? seedOrderIds.filter(id => ef.selectedIds.includes(id))
      : null
    const seeded = finalOrder
      ? finalOrder.map(id => availableParticipants.find(p => p.id === id)!).filter(Boolean)
      : availableParticipants.filter(p => ef.selectedIds.includes(p.id)).sort((a, b) => b.points - a.points)

    let deParticipantIds = ef.selectedIds
    if (ef.format === '토너먼트') {
      matches = generateTournamentBracket(seeded, { thirdPlace: ef.thirdPlace, preserveOrder: !!finalOrder })
    } else if (ef.format === '리그') {
      matches = generateLeagueMatches(seeded)
    } else if (ef.format === '더블엘리미네이션') {
      const deList = seeded.slice(0, floorPow2(seeded.length))   // 2^k 인원으로 정리
      matches = generateDoubleElimBracket(deList, { preserveOrder: !!finalOrder })
      deParticipantIds = deList.map(p => p.id)
    } else if (ef.format === '시드예선') {
      const result = generateSeededBracket(seeded, ef.seedCount)
      groups = result.groups
      matches = result.matches
    } else {
      const result = generateGroups(seeded, ef.groupSize, ef.advanceCount)
      groups = result.groups
      matches = result.matches
    }

    const ev: TournamentEvent = {
      id: genId(), label, eventType: ef.eventType, gender: ef.gender,
      division: ef.division, bracketFormat: ef.format,
      participantIds: deParticipantIds, groups, matches,
      pointsForWin: ef.pointsForWin, status: 'ongoing',
      hasThirdPlace: ef.format === '토너먼트' && ef.thirdPlace,
      seedCount: ef.format === '시드예선' ? ef.seedCount : undefined,
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
      {/* 스티키 헤더 + 단계 네비게이션 */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200 -mx-4 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={onCancel} className="btn-secondary py-1.5 text-sm flex-shrink-0">← 목록</button>
          <h1 className="text-lg font-bold flex-shrink-0">새 대회 생성</h1>
          <div className="flex gap-1 ml-auto flex-wrap">
            {[
              { label: '① 기본정보', href: 'sec-basic' },
              { label: '② 종목구성', href: 'sec-events' },
            ].map(s => (
              <button key={s.href} onClick={() => document.getElementById(s.href)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-300 bg-white hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors">
                {s.label}
              </button>
            ))}
            <button onClick={handleCreate} disabled={!name || events.length === 0}
              className="text-xs px-3 py-1.5 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium">
              ✓ 대회 생성
            </button>
          </div>
        </div>
      </div>

      {/* 기본 정보 */}
      <div id="sec-basic" className="card space-y-4">
        <h2 className="font-semibold text-gray-700">① 대회 기본 정보</h2>
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
      <div id="sec-events" className="card space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-700">② 종목 구성 ({events.length}개)</h2>
          <div className="flex gap-2">
            <button onClick={() => setShowAutoSetup(!showAutoSetup)} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5 bg-green-50 border-green-300 text-green-700 hover:bg-green-100">
              <Shuffle size={14} /> ⚡ 자동 구성
            </button>
            <button onClick={() => setShowEventForm(!showEventForm)} className="btn-primary flex items-center gap-1.5 text-sm py-1.5">
              <Plus size={14} /> 종목 추가
            </button>
          </div>
        </div>

        {/* 자동 구성 패널 */}
        {showAutoSetup && (
          <div className="border-2 border-green-200 rounded-xl p-4 bg-green-50/30 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-green-700 text-sm">⚡ 자동 대진 구성 — 부문별 설정</h3>
              <span className="text-xs text-gray-400">체크된 부문이 자동으로 추가됩니다</span>
            </div>
            <div className="space-y-2">
              {autoConfig.map((cfg, idx) => {
                const maleCount = getPlayersForDiv(cfg.division, '남').length
                const femaleCount = getPlayersForDiv(cfg.division, '여').length
                return (
                  <div key={cfg.division} className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${cfg.enabled ? 'border-green-300 bg-white' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                    <input type="checkbox" checked={cfg.enabled} onChange={e => setAutoConfig(prev => prev.map((c, i) => i === idx ? { ...c, enabled: e.target.checked } : c))} className="rounded w-4 h-4 flex-shrink-0" />
                    <span className={`badge text-xs font-bold ${divColors[cfg.division]}`}>{cfg.division}</span>
                    <span className="text-xs text-gray-500">
                      <span className="text-blue-500">남 {maleCount}</span>
                      <span className="mx-1">·</span>
                      <span className="text-pink-500">여 {femaleCount}</span>
                      명 등록
                    </span>
                    <div className="ml-auto flex items-center gap-2 flex-wrap">
                      <select
                        className="text-xs border rounded px-1.5 py-1 bg-white"
                        value={cfg.format}
                        onChange={e => setAutoConfig(prev => prev.map((c, i) => i === idx ? { ...c, format: e.target.value as BracketFormat } : c))}
                      >
                        <option value="토너먼트">토너먼트</option>
                        <option value="조별+토너먼트">조별+토너먼트</option>
                        <option value="리그">리그</option>
                        <option value="시드예선">시드예선</option>
                        <option value="더블엘리미네이션">더블엘리미네이션</option>
                      </select>
                      {cfg.format === '시드예선' && (
                        <select
                          className="text-xs border rounded px-1.5 py-1 bg-white text-purple-700 font-medium"
                          value={cfg.seedCount ?? 4}
                          onChange={e => setAutoConfig(prev => prev.map((c, i) => i === idx ? { ...c, seedCount: Number(e.target.value) } : c))}
                        >
                          {[2, 4, 8, 16, 32].map(n => <option key={n} value={n}>시드 {n}명</option>)}
                        </select>
                      )}
                      <select
                        className="text-xs border rounded px-1.5 py-1 bg-white"
                        value={cfg.maxPlayers}
                        onChange={e => setAutoConfig(prev => prev.map((c, i) => i === idx ? { ...c, maxPlayers: Number(e.target.value) } : c))}
                      >
                        {[8, 16, 32, 64, 128].map(n => <option key={n} value={n}>{n}강</option>)}
                      </select>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="btn-primary flex-1 bg-green-600 hover:bg-green-700"
                onClick={() => {
                  const newEvents = buildAutoEvents()
                  if (newEvents.length === 0) { alert('등록된 선수가 없습니다. 먼저 랭킹 페이지에서 선수를 등록하세요.'); return }
                  setEvents(evs => [...evs, ...newEvents])
                  setShowAutoSetup(false)
                }}
              >
                ✓ {autoConfig.filter(c => c.enabled).length}개 부문 자동 생성
              </button>
              <button className="btn-secondary px-4" onClick={() => setShowAutoSetup(false)}>취소</button>
            </div>
          </div>
        )}


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
                <select className="select" value={ef.division} onChange={e => { setEf(f => ({ ...f, division: e.target.value as Division, selectedIds: [] })); setSeedOrderIds([]) }}>
                  {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">종목</label>
                <select className="select" value={ef.eventType} onChange={e => { setEf(f => ({ ...f, eventType: e.target.value as EventType, selectedIds: [] })); setSeedOrderIds([]) }}>
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">성별</label>
                <select className="select" value={ef.gender}
                  onChange={e => { setEf(f => ({ ...f, gender: e.target.value as Gender, selectedIds: [] })); setSeedOrderIds([]) }}
                  disabled={ef.eventType === '혼합복식'}
                >
                  {(ef.eventType === '혼합복식' ? ['혼합'] : GENDERS).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">대진 방식</label>
                <select className="select" value={ef.format} onChange={e => setEf(f => ({ ...f, format: e.target.value as BracketFormat, thirdPlace: false }))}>
                  {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                {ef.format === '토너먼트' && ef.selectedIds.length >= 4 && (
                  <label className="flex items-center gap-1.5 mt-2 cursor-pointer select-none">
                    <input type="checkbox" checked={ef.thirdPlace} onChange={e => setEf(f => ({ ...f, thirdPlace: e.target.checked }))} className="rounded" />
                    <span className="text-xs text-gray-600">3·4위전 자동 생성</span>
                  </label>
                )}
                {ef.format === '더블엘리미네이션' && (
                  <p className="text-[11px] text-amber-600 mt-1.5 leading-snug">
                    {ef.selectedIds.length < 4
                      ? '⚠ 최소 4명 필요 (2의 거듭제곱)'
                      : `승자조·패자조 운영. 2의 거듭제곱 인원만 지원 → 상위 ${floorPow2(ef.selectedIds.length)}명으로 대진 생성`}
                  </p>
                )}
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
              {ef.format === '시드예선' && (
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">시드 수 (직행)</label>
                  <select className="select" value={ef.seedCount} onChange={e => setEf(f => ({ ...f, seedCount: Number(e.target.value) }))}>
                    {[2, 4, 8, 16, 32].map(n => <option key={n} value={n}>{n}명</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">상위 {ef.seedCount}명 본선 직행, 나머지는 예선 후 진출</p>
                </div>
              )}
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
                  {isTeam
                    ? '등록된 팀이 없습니다. 먼저 랭킹 페이지 단체전 탭에서 팀을 등록해주세요.'
                    : isDoubles
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

            {/* 시드 배정 패널 (토너먼트 2명 이상 선택 시) */}
            {ef.selectedIds.length >= 2 && (
              <div className="border rounded-xl p-3 bg-yellow-50/60 border-yellow-200 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Trophy size={14} className="text-yellow-600" />
                    <span className="text-sm font-semibold text-yellow-700">시드 배정</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-500">시드 수:</span>
                      <select
                        className="text-xs border border-yellow-300 rounded px-1 py-0.5 bg-white"
                        value={seedCount}
                        onChange={e => setSeedCount(Number(e.target.value))}
                      >
                        {[0, 1, 2, 3, 4, 8].filter(n => n <= ef.selectedIds.length).map(n => (
                          <option key={n} value={n}>{n}명</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={autoSeedByRanking}
                      className="text-xs px-2.5 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center gap-1"
                    >
                      <Users size={11} /> 랭킹순 배정
                    </button>
                    <button
                      onClick={drawNonSeeds}
                      className="text-xs px-2.5 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 flex items-center gap-1"
                    >
                      <Shuffle size={11} /> 추첨
                    </button>
                  </div>
                </div>

                {seedOrderIds.length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-1">
                    「랭킹순 배정」으로 시드 자동 배정 후 「추첨」으로 나머지를 무작위 배정합니다
                  </p>
                ) : (
                  <div className="max-h-44 overflow-y-auto space-y-0.5 mt-1">
                    {seedOrderIds.filter(id => ef.selectedIds.includes(id)).map((id, i) => {
                      const p = availableParticipants.find(x => x.id === id)
                      if (!p) return null
                      const isSeeded = i < seedCount
                      return (
                        <div key={id} className={`flex items-center gap-1.5 px-2 py-1 rounded text-sm ${isSeeded ? 'bg-yellow-100 border border-yellow-200' : 'bg-white border border-gray-100'}`}>
                          <div className="flex flex-col gap-0.5">
                            <button onClick={() => moveSeed(i, -1)} disabled={i === 0} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▲</button>
                            <button onClick={() => moveSeed(i, 1)} disabled={i === seedOrderIds.filter(id2 => ef.selectedIds.includes(id2)).length - 1} className="text-gray-300 hover:text-gray-600 disabled:opacity-20 leading-none text-xs">▼</button>
                          </div>
                          <span className="text-xs font-bold text-gray-400 w-5 text-right">{i + 1}</span>
                          {isSeeded ? (
                            <span className="text-[10px] px-1 py-0.5 bg-yellow-500 text-white rounded font-bold min-w-[22px] text-center">S{i + 1}</span>
                          ) : (
                            <span className="text-[10px] px-1 py-0.5 bg-gray-100 text-gray-400 rounded min-w-[22px] text-center">추첨</span>
                          )}
                          <span className="font-medium flex-1 truncate">{p.name}</span>
                          <span className="text-xs text-gray-400 truncate">{p.school}</span>
                          <span className="text-xs text-gray-500 font-medium">{p.points.toLocaleString()}P</span>
                        </div>
                      )
                    })}
                    {seedCount > 0 && (
                      <div className="text-[10px] text-gray-400 pt-1 px-1">
                        * S1·S2는 결승에서만 만남 · S3·S4는 각 준결승 반대편에 배치
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={addEvent} disabled={ef.selectedIds.length < 2}>
                종목 추가 ({ef.selectedIds.length}명)
              </button>
              <button className="btn-secondary px-4" onClick={() => { setShowEventForm(false); setSeedOrderIds([]) }}>취소</button>
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
function TournamentDetail({ tournament, pMap, onBack, onStatusChange, onRecord, onClearResult }: {
  tournament: Tournament
  pMap: Record<string, { name: string; school: string; points: number; gender: string }>
  onBack: () => void
  onStatusChange: (status: Tournament['status']) => void
  onRecord: (evId: string, mId: string, result: MatchResult) => void
  onClearResult: (evId: string, mId: string) => void
}) {
  const { syncStatus, syncTournament } = useStore()
  const [activeEventId, setActiveEventId] = useState<string>(tournament.events[0]?.id ?? '')
  const [showSummary, setShowSummary] = useState(false)
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
        <div className="flex gap-2 no-print flex-wrap">
          {tournament.status === 'ongoing' && (
            <button onClick={() => onStatusChange('completed')}
              className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 flex items-center gap-1.5">
              <Check size={14} /> 대회 종료
            </button>
          )}
          {tournament.status === 'completed' && (
            <button onClick={() => onStatusChange('ongoing')}
              className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 flex items-center gap-1.5">
              <Shuffle size={14} /> 대회 재개
            </button>
          )}
          <button
            onClick={() => {
              const url = `${window.location.origin}/public/${tournament.id}`
              navigator.clipboard?.writeText(url).then(() => alert(`공개 링크 복사됨:\n${url}`)).catch(() => alert(url))
            }}
            className="btn-secondary flex items-center gap-1.5 text-sm">
            <Info size={14} /> 공개 링크
          </button>
          {SYNC_ENABLED && (
            <button
              onClick={() => syncTournament(tournament.id)}
              disabled={syncStatus === 'syncing'}
              title={syncStatus === 'error' ? '동기화 실패 - 재시도' : '클라우드 동기화'}
              className={`btn-secondary flex items-center gap-1.5 text-sm ${syncStatus === 'error' ? 'text-red-600' : ''}`}>
              {syncStatus === 'syncing'
                ? <><Cloud size={14} className="animate-pulse" /> 동기화 중…</>
                : syncStatus === 'error'
                ? <><CloudOff size={14} /> 동기화 실패</>
                : <><Upload size={14} /> 동기화</>}
            </button>
          )}
          <button onClick={() => exportTournamentCSV(tournament, pMap)} className="btn-secondary flex items-center gap-1.5 text-sm">
            <Download size={14} /> 결과 CSV
          </button>
          <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1.5">
            <Printer size={14} /> 인쇄
          </button>
        </div>
      </div>

      {/* Event tabs */}
      <div className="flex gap-2 flex-wrap no-print">
        <button
          onClick={() => setShowSummary(true)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border flex items-center gap-1.5 ${showSummary ? 'bg-yellow-500 text-white border-yellow-500' : 'bg-white text-yellow-600 border-yellow-300 hover:bg-yellow-50'}`}
        >
          🏆 결과 요약
        </button>
        {tournament.events.map(ev => {
          const done = ev.matches.filter(m => m.result && !m.result.walkedOver).length
          const total = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length
          return (
            <button key={ev.id} onClick={() => { setActiveEventId(ev.id); setShowSummary(false) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${!showSummary && activeEventId === ev.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}>
              {ev.label}
              <span className={`ml-1.5 text-xs ${!showSummary && activeEventId === ev.id ? 'text-blue-200' : 'text-gray-400'}`}>{done}/{total}</span>
            </button>
          )
        })}
      </div>

      {/* 결과 요약 뷰 */}
      {showSummary && (
        <TournamentSummary tournament={tournament} pMap={pMap} />
      )}

      {/* Active event bracket */}
      {!showSummary && activeEvent && (
        <EventBracket
          event={activeEvent}
          pMap={pMap}
          onRecord={(mId, result) => onRecord(activeEvent.id, mId, result)}
          onClearResult={(mId) => onClearResult(activeEvent.id, mId)}
          tournamentId={tournament.id}
        />
      )}
    </div>
  )
}

// ─── 결과 요약 ───────────────────────────────────────────
function TournamentSummary({ tournament, pMap }: {
  tournament: Tournament
  pMap: Record<string, { name: string; school: string; points: number; gender: string }>
}) {
  const results = tournament.events.map(ev => {
    // 시상은 정산 로직과 동일한 getMedalists로 계산 (포인트와 일치)
    const medals = getMedalists(ev)
    const ready = ev.bracketFormat === '리그' ? isEventComplete(ev) : true
    const gold: string | null = ready ? medals.gold : null
    const silver: string | null = ready ? medals.silver : null
    const bronze: string[] = ready ? medals.bronze : []

    const done = ev.matches.filter(m => m.result && m.participant1Id && m.participant2Id && !m.isBye).length
    const total = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length
    const pct = total > 0 ? Math.round(done / total * 100) : 0

    return { ev, gold, silver, bronze, done, total, pct }
  })

  const medalColors: Record<string, string> = {
    gold: 'bg-yellow-400 text-yellow-900',
    silver: 'bg-gray-200 text-gray-700',
    bronze: 'bg-amber-600 text-white',
  }

  return (
    <div className="space-y-4">
      {/* 전체 진행률 */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">전체 진행률</span>
          <span className="text-sm font-bold text-blue-600">
            {results.reduce((s, r) => s + r.done, 0)} / {results.reduce((s, r) => s + r.total, 0)}경기
          </span>
        </div>
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${results.reduce((s, r) => s + r.total, 0) > 0 ? Math.round(results.reduce((s, r) => s + r.done, 0) / results.reduce((s, r) => s + r.total, 0) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* 종목별 결과 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {results.map(({ ev, gold, silver, bronze, done, total, pct }) => (
          <div key={ev.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800 text-sm">{ev.label}</h3>
                <p className="text-xs text-gray-400">{ev.bracketFormat} · {ev.participantIds.length}명</p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${pct === 100 ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600'}`}>
                {pct === 100 ? '완료' : `${pct}%`}
              </span>
            </div>

            <div className="h-1 bg-gray-100 rounded-full">
              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
            </div>

            <div className="space-y-1.5">
              {gold ? (
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${medalColors.gold}`}>🥇</span>
                  <span className="text-sm font-bold">{pMap[gold]?.name ?? '?'}</span>
                  <span className="text-xs text-gray-400">{pMap[gold]?.school}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-300 px-1.5 py-0.5 rounded border border-dashed border-gray-200">🥇</span>
                  <span className="text-xs text-gray-300">진행 중</span>
                </div>
              )}
              {silver && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${medalColors.silver}`}>🥈</span>
                  <span className="text-sm">{pMap[silver]?.name ?? '?'}</span>
                  <span className="text-xs text-gray-400">{pMap[silver]?.school}</span>
                </div>
              )}
              {bronze.map((bid, i) => bid && pMap[bid] ? (
                <div key={i} className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${medalColors.bronze}`}>🥉</span>
                  <span className="text-sm">{pMap[bid]?.name}</span>
                  <span className="text-xs text-gray-400">{pMap[bid]?.school}</span>
                </div>
              ) : null)}
            </div>

            <div className="text-xs text-gray-400 text-right">{done}/{total}경기 완료</div>
          </div>
        ))}
      </div>

      {/* 인쇄용 요약 테이블 */}
      <div className="hidden print:block">
        <h2 className="font-bold text-lg mb-3">{tournament.name} — 결과 요약</h2>
        <table className="w-full text-sm border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left">종목</th>
              <th className="border border-gray-300 px-3 py-2">🥇 금메달</th>
              <th className="border border-gray-300 px-3 py-2">🥈 은메달</th>
              <th className="border border-gray-300 px-3 py-2">🥉 동메달</th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ ev, gold, silver, bronze }) => (
              <tr key={ev.id}>
                <td className="border border-gray-300 px-3 py-2 font-medium">{ev.label}</td>
                <td className="border border-gray-300 px-3 py-2 text-center">{gold ? `${pMap[gold]?.name} (${pMap[gold]?.school})` : '-'}</td>
                <td className="border border-gray-300 px-3 py-2 text-center">{silver ? `${pMap[silver]?.name} (${pMap[silver]?.school})` : '-'}</td>
                <td className="border border-gray-300 px-3 py-2 text-center">{bronze.filter(b => pMap[b]).map(b => `${pMap[b].name}`).join(', ') || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── 종목 대진표 ──────────────────────────────────────────
function EventBracket({ event, pMap, onRecord, onClearResult, tournamentId }: {
  event: TournamentEvent
  pMap: Record<string, { name: string; school: string; points: number; gender: string }>
  onRecord: (matchId: string, result: MatchResult) => void
  onClearResult: (matchId: string) => void
  tournamentId?: string
}) {
  const [activeView, setActiveView] = useState<'bracket' | 'standings'>('bracket')
  const [selectedRound, setSelectedRound] = useState(1)
  const [resultModal, setResultModal] = useState<BracketMatch | null>(null)
  const [matchSearch, setMatchSearch] = useState('')
  const [completionToast, setCompletionToast] = useState<string | null>(null)

  const realMatches = event.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
  // 미완료 경기 목록 (라운드→포지션 순) — 모달 next/prev 이동용
  const pendingMatches = realMatches
    .filter(m => !m.result)
    .sort((a, b) => a.round !== b.round ? a.round - b.round : a.position - b.position)
  const modalIdx = resultModal ? pendingMatches.findIndex(m => m.id === resultModal.id) : -1

  function openNextPending(dir: 1 | -1) {
    const nextIdx = modalIdx + dir
    if (nextIdx >= 0 && nextIdx < pendingMatches.length) setResultModal(pendingMatches[nextIdx])
  }
  const maxRound = Math.max(...realMatches.map(m => m.round), 1)
  const totalRounds = event.bracketFormat === '토너먼트'
    ? Math.max(...event.matches.map(m => m.round), 1)
    : maxRound

  // Large bracket: > 32 participants → round-list view only
  const isLarge = event.participantIds.length > 32
  const isLeague = event.bracketFormat === '리그'
  const isGrouped = event.bracketFormat === '조별+토너먼트'
  const isSeededQual = event.bracketFormat === '시드예선'
  const isDoubleElim = event.bracketFormat === '더블엘리미네이션'

  const rounds = [...new Set(event.matches.map(m => m.round))].sort((a, b) => a - b)
  const roundMatches = event.matches.filter(m => m.round === selectedRound && m.participant1Id && m.participant2Id && !m.isBye)
  const displayMatches = matchSearch
    ? roundMatches.filter(m => {
        const n1 = (pMap[m.participant1Id!]?.name ?? '').toLowerCase()
        const n2 = (pMap[m.participant2Id!]?.name ?? '').toLowerCase()
        return n1.includes(matchSearch.toLowerCase()) || n2.includes(matchSearch.toLowerCase())
      })
    : roundMatches
  const standings = isLeague || isGrouped
    ? calcStandings(event.matches, event.participantIds)
    : {}

  // 우승/준우승/3위 — 정산 로직과 동일한 getMedalists 사용 (표시·포인트 일치 보장)
  // 리그는 모든 경기가 끝났을 때만 시상 (중간 순위로 우승 표기 방지)
  const medals = getMedalists(event)
  const medalsReady = isLeague ? isEventComplete(event) : true
  const champion = medalsReady && medals.gold ? pMap[medals.gold] : null
  const runnerUp = medalsReady && medals.silver ? pMap[medals.silver] : null
  const bronzeList = medalsReady ? medals.bronze.map(id => pMap[id]).filter(Boolean) : []

  return (
    <div className="space-y-4">
      {/* Champion banner */}
      {(champion || runnerUp || bronzeList.length > 0) && (
        <div className="bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl p-4 text-white">
          <div className="flex items-center gap-6 flex-wrap justify-center sm:justify-start">
            {champion && (
              <div className="text-center">
                <div className="text-3xl mb-1">🏆</div>
                <div className="font-black text-xl">{champion.name ?? '?'}</div>
                <div className="text-yellow-100 text-xs">{champion.school ?? ''}</div>
                <div className="text-xs bg-white/20 rounded-full px-2 py-0.5 mt-1">우승</div>
              </div>
            )}
            {runnerUp && (
              <div className="text-center">
                <div className="text-2xl mb-1">🥈</div>
                <div className="font-bold text-lg">{runnerUp.name ?? '?'}</div>
                <div className="text-yellow-100 text-xs">{runnerUp.school ?? ''}</div>
                <div className="text-xs bg-white/20 rounded-full px-2 py-0.5 mt-1">준우승</div>
              </div>
            )}
            {bronzeList.map((b, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl mb-1">🥉</div>
                <div className="font-bold text-lg">{b.name}</div>
                <div className="text-yellow-100 text-xs">{b.school}</div>
                <div className="text-xs bg-white/20 rounded-full px-2 py-0.5 mt-1">3위</div>
              </div>
            ))}
          </div>
        </div>
      )}

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
          {/* Round selector — arrow navigation */}
          {!isDoubleElim && rounds.length > 0 && (() => {
            const rIdx = rounds.indexOf(selectedRound)
            const rMatches = event.matches.filter(m => m.round === selectedRound && !m.isBye && m.participant1Id && m.participant2Id)
            const done = rMatches.filter(m => m.result && !m.result.walkedOver).length
            const isGroupRound = isGrouped && event.groups.length > 0 && selectedRound <= (event.groups[0]?.participantIds.length - 1)
            const isQualRound = isSeededQual && rMatches.length > 0 && event.matches.find(m => m.round === selectedRound && m.participant1Id && m.participant2Id)?.phase === 'qual'
            const label = isGroupRound
              ? `예선 ${selectedRound}라운드`
              : isQualRound
              ? `예선 ${selectedRound}라운드`
              : getRoundName(selectedRound - (isGrouped ? event.groups[0]?.participantIds.length - 1 : 0), totalRounds)
            return (
              <div className="flex items-center gap-2 flex-wrap">
                {/* ← → arrows */}
                <button
                  onClick={() => rIdx > 0 && setSelectedRound(rounds[rIdx - 1])}
                  disabled={rIdx === 0}
                  className="px-3 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-30 hover:bg-gray-50 text-sm font-medium">
                  ←
                </button>
                <div className="flex-1 text-center bg-blue-600 text-white px-4 py-2 rounded-lg">
                  <span className="font-bold text-sm">{label}</span>
                  <span className="text-blue-200 text-xs ml-2">{done}/{rMatches.length}경기 완료</span>
                  <span className="text-blue-300 text-xs ml-2">({rIdx + 1}/{rounds.length})</span>
                </div>
                <button
                  onClick={() => rIdx < rounds.length - 1 && setSelectedRound(rounds[rIdx + 1])}
                  disabled={rIdx === rounds.length - 1}
                  className="px-3 py-2 rounded-lg border border-gray-200 bg-white disabled:opacity-30 hover:bg-gray-50 text-sm font-medium">
                  →
                </button>
                {/* All rounds quick-jump */}
                <div className="w-full flex gap-1 flex-wrap mt-1">
                  {rounds.map(r => {
                    const rm = event.matches.filter(m => m.round === r && !m.isBye && m.participant1Id && m.participant2Id)
                    const d = rm.filter(m => m.result && !m.result.walkedOver).length
                    const isGR = isGrouped && event.groups.length > 0 && r <= (event.groups[0]?.participantIds.length - 1)
                    const isQR = isSeededQual && event.matches.find(m => m.round === r && m.participant1Id && m.participant2Id)?.phase === 'qual'
                    const lbl = isGR || isQR ? `예선${r}R` : getRoundName(r - (isGrouped ? event.groups[0]?.participantIds.length - 1 : 0), totalRounds)
                    return (
                      <button key={r} onClick={() => setSelectedRound(r)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${selectedRound === r ? 'bg-blue-600 text-white border-blue-600' : d === rm.length && rm.length > 0 ? 'bg-green-50 text-green-700 border-green-300' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'}`}>
                        {lbl} {d}/{rm.length}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Match list (always list for large, tree option for small) */}
          {isDoubleElim ? (
            <DoubleElimView
              event={event}
              pMap={pMap}
              onClickMatch={(m) => setResultModal(m)}
              onClearResult={onClearResult}
            />
          ) : isLarge || isLeague || isGrouped ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <input
                  className="input flex-1 text-sm py-1.5"
                  placeholder="선수명 검색..."
                  value={matchSearch}
                  onChange={e => setMatchSearch(e.target.value)}
                />
                {matchSearch && (
                  <button onClick={() => setMatchSearch('')} className="text-xs px-2 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200">✕</button>
                )}
              </div>
              <MatchList
                matches={displayMatches}
                pMap={pMap}
                onClickMatch={(m) => setResultModal(m)}
                onClearResult={onClearResult}
                groupMap={Object.fromEntries(event.groups.map(g => [g.id, g.name]))}
                tournamentId={tournamentId}
                eventId={event.id}
                eventLabel={event.label}
              />
            </>
          ) : (
            <BracketTree
              event={event}
              pMap={pMap}
              onClickMatch={(m) => setResultModal(m)}
              onClearResult={onClearResult}
            />
          )}
        </>
      )}

      {/* Result modal */}
      {resultModal && (
        <ResultModal
          match={resultModal}
          pMap={pMap}
          event={event}
          matchIndex={modalIdx}
          totalPending={pendingMatches.length}
          onSubmit={(result) => {
            onRecord(resultModal.id, result)
            // 마지막 미완료 경기 완료 시 토스트
            if (pendingMatches.length === 1) {
              setCompletionToast(`🎉 ${event.label} 완료!`)
              setTimeout(() => setCompletionToast(null), 1500)
            }
            // 다음 미완료 경기로 자동 이동 (없으면 닫기)
            const next = pendingMatches.find((m, i) => i > modalIdx)
            setResultModal(next ?? null)
          }}
          onPrev={modalIdx > 0 ? () => openNextPending(-1) : undefined}
          onNext={modalIdx < pendingMatches.length - 1 ? () => openNextPending(1) : undefined}
          onClose={() => setResultModal(null)}
        />
      )}
      {completionToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-xl animate-bounce pointer-events-none">
          {completionToast}
        </div>
      )}
    </div>
  )
}

// ─── 대진표 트리 (≤32명) ─────────────────────────────────
function BracketTree({ event, pMap, onClickMatch, onClearResult }: {
  event: TournamentEvent
  pMap: Record<string, any>
  onClickMatch: (m: BracketMatch) => void
  onClearResult: (matchId: string) => void
}) {
  const mainMatches = event.matches.filter(m => !m.isThirdPlace)
  const thirdPlaceMatch = event.matches.find(m => m.isThirdPlace)
  const rounds = [...new Set(mainMatches.map(m => m.round))].sort((a, b) => a - b)
  const totalRounds = rounds.length

  function MatchCard({ m }: { m: BracketMatch }) {
    const p1 = m.participant1Id ? pMap[m.participant1Id] : null
    const p2 = m.participant2Id ? pMap[m.participant2Id] : null
    const isPlayable = p1 && p2 && !m.result
    const w = m.result?.winnerId
    return (
      <div
        className={`bracket-match ${m.result ? 'winner-determined' : ''} ${isPlayable ? 'cursor-pointer hover:border-blue-500' : ''}`}
        onClick={() => isPlayable && onClickMatch(m)}
        style={{ minWidth: 180 }}>
        <div className={`bracket-player border-b border-gray-100 ${w === m.participant1Id ? 'winner' : w ? 'loser' : ''}`}>
          <span className="truncate max-w-32 text-xs">{p1 ? p1.name : '-'}</span>
          {m.result && <span className="text-sm font-bold">{w === m.participant1Id ? m.result.winnerScore : m.result.loserScore}</span>}
        </div>
        <div className={`bracket-player ${w === m.participant2Id ? 'winner' : w ? 'loser' : ''}`}>
          <span className="truncate max-w-32 text-xs">{p2 ? p2.name : '-'}</span>
          {m.result && <span className="text-sm font-bold">{w === m.participant2Id ? m.result.winnerScore : m.result.loserScore}</span>}
        </div>
        {isPlayable && <div className="text-center text-xs text-blue-500 py-0.5 bg-blue-50">클릭 → 결과입력</div>}
        {m.result && (
          <button
            onClick={e => { e.stopPropagation(); if (confirm('결과를 취소하시겠습니까?')) onClearResult(m.id) }}
            className="w-full text-center text-[10px] text-red-400 hover:text-red-600 hover:bg-red-50 py-0.5 transition-colors no-print">
            결과 취소
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto pb-4 space-y-4">
      <div className="flex gap-8 min-w-max">
        {rounds.map(round => {
          const rMatches = mainMatches.filter(m => m.round === round && !m.isBye).sort((a, b) => a.position - b.position)
          return (
            <div key={round} className="flex flex-col">
              <div className="text-center mb-3">
                <span className="font-semibold text-sm text-gray-600">
                  {getRoundName(round, totalRounds)}
                </span>
                <div className="text-xs text-gray-400">{rMatches.length}경기</div>
              </div>
              <div className="flex flex-col justify-around flex-1 gap-4">
                {rMatches.map(m => <MatchCard key={m.id} m={m} />)}
              </div>
            </div>
          )
        })}
      </div>

      {thirdPlaceMatch && (
        <div className="border-t pt-3">
          <div className="text-xs font-semibold text-orange-600 mb-2">3·4위전</div>
          <MatchCard m={thirdPlaceMatch} />
        </div>
      )}
    </div>
  )
}

// ─── 경기 리스트 (대규모용) ───────────────────────────────
// 더블 엘리미네이션 전용 뷰: 승자조 / 패자조 / 결승 섹션
function DoubleElimView({ event, pMap, onClickMatch, onClearResult }: {
  event: TournamentEvent
  pMap: Record<string, any>
  onClickMatch: (m: BracketMatch) => void
  onClearResult: (matchId: string) => void
}) {
  const wb = event.matches.filter(m => m.phase === 'wb')
  const lb = event.matches.filter(m => m.phase === 'lb')
  // 결승: gf 항상 표시, 리셋(gf2)은 활성(양 선수 배정)일 때만
  const gf = event.matches.filter(m => m.phase === 'gf' && (m.id !== 'gf2' || (m.participant1Id && m.participant2Id)))
  const k = Math.max(...wb.map(m => m.round), 1)
  const wbRounds = [...new Set(wb.map(m => m.round))].sort((a, b) => a - b)
  const lbRounds = [...new Set(lb.map(m => m.round))].sort((a, b) => a - b)

  const wbLabel = (r: number) => r === k ? '승자조 결승' : `승자조 ${getRoundName(r, k)}`
  const lbLabel = (idx: number) => idx === lbRounds.length - 1 ? '패자조 결승' : `패자조 ${idx + 1}R`

  const RoundBlock = ({ title, matches, accent }: { title: string; matches: BracketMatch[]; accent: string }) => {
    const done = matches.filter(m => m.result).length
    return (
      <div className="card p-0 overflow-hidden">
        <div className={`px-3 py-1.5 border-b flex items-center justify-between ${accent}`}>
          <span className="font-semibold text-xs">{title}</span>
          <span className="text-[11px] opacity-80">{done}/{matches.length}</span>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {matches.map((m, i) => {
            const p1 = m.participant1Id ? pMap[m.participant1Id] : null
            const p2 = m.participant2Id ? pMap[m.participant2Id] : null
            const playable = p1 && p2 && !m.result
            const w = m.result?.winnerId
            return (
              <div key={m.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm ${playable ? 'hover:bg-blue-50 cursor-pointer' : ''}`}
                onClick={() => playable && onClickMatch(m)}>
                <span className="text-[10px] text-gray-400 w-4 flex-shrink-0">{i + 1}</span>
                <div className={`flex-1 text-right truncate ${w === m.participant1Id ? 'font-bold text-blue-700' : w ? 'text-gray-400' : ''}`}>{p1?.name ?? '─'}</div>
                <div className="w-12 text-center flex-shrink-0 font-bold text-gray-600">
                  {m.result ? `${m.result.winnerId === m.participant1Id ? m.result.winnerScore : m.result.loserScore}:${m.result.winnerId === m.participant1Id ? m.result.loserScore : m.result.winnerScore}` : 'vs'}
                </div>
                <div className={`flex-1 truncate ${w === m.participant2Id ? 'font-bold text-blue-700' : w ? 'text-gray-400' : ''}`}>{p2?.name ?? '─'}</div>
                {m.result && (
                  <button onClick={(e) => { e.stopPropagation(); onClearResult(m.id) }}
                    className="text-[10px] text-gray-300 hover:text-red-400 flex-shrink-0">취소</button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-blue-700 mb-2 flex items-center gap-1.5">🏆 승자조</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {wbRounds.map(r => (
            <RoundBlock key={r} title={wbLabel(r) as string} accent="bg-blue-50 text-blue-700"
              matches={wb.filter(m => m.round === r).sort((a, b) => a.position - b.position)} />
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-bold text-orange-600 mb-2 flex items-center gap-1.5">🔻 패자조</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {lbRounds.map((r, idx) => (
            <RoundBlock key={r} title={lbLabel(idx)} accent="bg-orange-50 text-orange-700"
              matches={lb.filter(m => m.round === r).sort((a, b) => a.position - b.position)} />
          ))}
        </div>
      </div>
      {gf.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-amber-600 mb-2 flex items-center gap-1.5">🏁 최종 결승</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
            {gf.map(m => (
              <RoundBlock key={m.id} title={m.id === 'gf2' ? '그랜드 파이널 (리셋)' : '그랜드 파이널'}
                accent="bg-amber-50 text-amber-700" matches={[m]} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MatchList({ matches, pMap, onClickMatch, onClearResult, groupMap, tournamentId, eventId, eventLabel }: {
  matches: BracketMatch[]
  pMap: Record<string, any>
  onClickMatch: (m: BracketMatch) => void
  onClearResult: (matchId: string) => void
  groupMap: Record<string, string>
  tournamentId?: string
  eventId?: string
  eventLabel?: string
}) {
  const { addMatchCall, matchCalls } = useStore()
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

  const doneCount = matches.filter(m => m.result).length
  const pendingCount = matches.filter(m => !m.result && m.participant1Id && m.participant2Id).length
  const pct = matches.length > 0 ? Math.round(doneCount / matches.length * 100) : 0

  return (
    <div className="space-y-4">
      {/* 진행 현황 바 */}
      <div className="flex items-center gap-3 px-1">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-gray-500 flex-shrink-0">
          <span className="text-green-600 font-bold">{doneCount}완료</span>
          {pendingCount > 0 && <span className="text-yellow-600 ml-1.5 font-bold">{pendingCount}대기</span>}
          <span className="text-gray-400 ml-1.5">{pct}%</span>
        </span>
      </div>
      {Object.entries(byGroup).map(([gId, gMatches]) => {
        const gDone = gMatches.filter(m => m.result).length
        return (
        <div key={gId} className="card p-0 overflow-hidden">
          {gId !== '__main' && (
            <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
              <div>
                <span className="font-semibold text-sm text-gray-700">{groupMap[gId] ?? gId}</span>
                <span className="text-xs text-gray-400 ml-2">{gMatches.length}경기</span>
              </div>
              <span className="text-xs">
                <span className="text-green-600 font-medium">{gDone}/{gMatches.length}</span>
              </span>
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
                  <div className="flex flex-col items-center w-10 flex-shrink-0">
                    <span className="text-xs text-gray-400">{i + 1}</span>
                    {m.tableNo && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded font-bold">T{m.tableNo}</span>}
                  </div>
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
                  <div className="w-20 flex-shrink-0 text-right flex flex-col items-end gap-0.5">
                    {m.result && !m.result.walkedOver && <span className="text-xs text-green-500">✓완료</span>}
                    {m.result?.walkedOver && <span className="text-xs text-gray-400">부전승</span>}
                    {isPlayable && <span className="text-xs text-blue-500">입력 →</span>}
                    {isPlayable && tournamentId && eventId && !matchCalls.some(c => !c.acknowledged && c.matchId === m.id) && (
                      <button
                        onClick={e => { e.stopPropagation(); addMatchCall({ id: Math.random().toString(36).slice(2,10), matchId: m.id, tournamentId, eventId, tableNo: m.tableNo ?? 1, participant1Name: p1?.name ?? '?', participant2Name: p2?.name ?? '?', eventLabel: eventLabel ?? '', calledAt: new Date().toISOString(), acknowledged: false }) }}
                        className="text-[10px] bg-orange-100 text-orange-600 hover:bg-orange-200 px-1.5 py-0.5 rounded no-print">
                        호출
                      </button>
                    )}
                    {m.result && (
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm('결과를 취소하시겠습니까?')) onClearResult(m.id) }}
                        className="text-[10px] text-red-400 hover:text-red-600 no-print">
                        취소
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
        )
      })}
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
function ResultModal({ match, pMap, event, onSubmit, onClose, onPrev, onNext, matchIndex, totalPending }: {
  match: BracketMatch
  pMap: Record<string, any>
  event: TournamentEvent
  onSubmit: (r: MatchResult) => void
  onClose: () => void
  onPrev?: () => void
  onNext?: () => void
  matchIndex?: number
  totalPending?: number
}) {
  const { players, teams } = useStore()
  const isTeamEvent = event.eventType === '단체전'
  const p1 = match.participant1Id ? pMap[match.participant1Id] : null
  const p2 = match.participant2Id ? pMap[match.participant2Id] : null

  // 단체전: 팀 구성원 조회
  const team1 = isTeamEvent && match.participant1Id ? teams.find(t => t.id === match.participant1Id) : null
  const team2 = isTeamEvent && match.participant2Id ? teams.find(t => t.id === match.participant2Id) : null
  const team1Players = team1 ? team1.playerIds.map(id => players.find(p => p.id === id)).filter(Boolean) : []
  const team2Players = team2 ? team2.playerIds.map(id => players.find(p => p.id === id)).filter(Boolean) : []
  const maxPlayers = Math.max(team1Players.length, team2Players.length, 1)

  // 단체전 서브매치 상태
  const [subMatches, setSubMatches] = useState<TeamSubMatch[]>(() =>
    Array.from({ length: Math.max(maxPlayers * 2 - 1, 3) }, (_, i) => ({
      player1Id: team1Players[i % Math.max(team1Players.length, 1)]?.id ?? null,
      player2Id: team2Players[i % Math.max(team2Players.length, 1)]?.id ?? null,
      winnerId: null,
    }))
  )

  // 일반 세트 상태
  const [sets, setSets] = useState<Array<[string, string]>>([['', '']])

  // 단체전: 팀 승수 계산
  const team1Wins = subMatches.filter(s => s.winnerId === 'team1').length
  const team2Wins = subMatches.filter(s => s.winnerId === 'team2').length
  const teamHasWinner = team1Wins !== team2Wins

  // 일반: 세트 합산
  function calcWinner() {
    let w1 = 0, w2 = 0
    for (const [a, b] of sets) {
      const na = Number(a), nb = Number(b)
      if (a && b) { if (na > nb) w1++; else if (nb > na) w2++ }
    }
    return { w1, w2 }
  }
  const { w1, w2 } = calcWinner()
  const hasWinner = isTeamEvent ? teamHasWinner : (w1 !== w2 && sets.some(([a, b]) => a !== '' && b !== ''))

  function handleSubmit() {
    if (!match.participant1Id || !match.participant2Id) return
    if (isTeamEvent) {
      if (!teamHasWinner) return
      const winnerId = team1Wins > team2Wins ? match.participant1Id : match.participant2Id
      const loserId = team1Wins > team2Wins ? match.participant2Id : match.participant1Id
      onSubmit({
        winnerId, loserId,
        winnerScore: Math.max(team1Wins, team2Wins),
        loserScore: Math.min(team1Wins, team2Wins),
        teamSubMatches: subMatches,
      })
    } else {
      if (!hasWinner) return
      const winnerId = w1 > w2 ? match.participant1Id : match.participant2Id
      const loserId = w1 > w2 ? match.participant2Id : match.participant1Id
      onSubmit({
        winnerId, loserId,
        winnerScore: Math.max(w1, w2),
        loserScore: Math.min(w1, w2),
        sets: sets.filter(([a, b]) => a !== '' && b !== '').map(([a, b]) => [Number(a), Number(b)]),
      })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-800">
              {isTeamEvent ? '단체전 결과 입력' : '경기 결과 입력'}
            </h3>
            {totalPending !== undefined && totalPending > 0 && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {(matchIndex ?? 0) + 1} / {totalPending}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {onPrev && (
              <button onClick={onPrev} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="이전 경기">
                <ChevronLeft size={16} />
              </button>
            )}
            {onNext && (
              <button onClick={onNext} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="다음 경기">
                <ChevronRight size={16} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 ml-1"><X size={18} /></button>
          </div>
        </div>

        {/* VS header */}
        <div className="flex items-center justify-center gap-4 mb-4 py-3 bg-gray-50 rounded-lg">
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

        {isTeamEvent ? (
          /* 단체전 서브매치 UI */
          <div className="space-y-2 mb-4">
            <div className="text-xs font-medium text-gray-500 mb-1">개인전 결과 (클릭으로 승자 선택)</div>
            {subMatches.map((sm, i) => {
              const sp1 = sm.player1Id ? players.find(p => p.id === sm.player1Id) : null
              const sp2 = sm.player2Id ? players.find(p => p.id === sm.player2Id) : null
              return (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg border border-gray-100">
                  <span className="text-xs text-gray-400 w-5 text-center">{i + 1}</span>
                  <button
                    onClick={() => setSubMatches(s => s.map((x, xi) => xi === i ? { ...x, winnerId: 'team1' } : x))}
                    className={`flex-1 text-left px-2 py-1.5 rounded text-xs font-medium transition-colors ${sm.winnerId === 'team1' ? 'bg-blue-100 text-blue-700' : 'bg-gray-50 text-gray-600 hover:bg-blue-50'}`}>
                    {sp1?.name ?? `${p1?.name} ${i + 1}번`}
                  </button>
                  <span className="text-gray-300 text-xs">vs</span>
                  <button
                    onClick={() => setSubMatches(s => s.map((x, xi) => xi === i ? { ...x, winnerId: 'team2' } : x))}
                    className={`flex-1 text-right px-2 py-1.5 rounded text-xs font-medium transition-colors ${sm.winnerId === 'team2' ? 'bg-red-100 text-red-600' : 'bg-gray-50 text-gray-600 hover:bg-red-50'}`}>
                    {sp2?.name ?? `${p2?.name} ${i + 1}번`}
                  </button>
                  <button onClick={() => setSubMatches(s => s.filter((_, xi) => xi !== i))} className="text-gray-300 hover:text-red-400 w-5 flex-shrink-0"><X size={12} /></button>
                </div>
              )
            })}
            <button onClick={() => setSubMatches(s => [...s, { player1Id: null, player2Id: null, winnerId: null }])}
              className="text-xs text-blue-500 hover:underline w-full text-center py-1">
              + 개인전 추가
            </button>
            {teamHasWinner && (
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">단체전 결과</div>
                <div className="font-bold text-blue-700">{team1Wins > team2Wins ? p1?.name : p2?.name} 승리</div>
                <div className="text-sm text-gray-500">{Math.max(team1Wins, team2Wins)} : {Math.min(team1Wins, team2Wins)}</div>
              </div>
            )}
          </div>
        ) : (
          /* 일반 세트 UI */
          <div className="space-y-2 mb-4">
            <div className="flex items-center text-xs text-gray-400 px-2">
              <span className="flex-1 text-center">세트</span>
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
            {hasWinner && (
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <div className="text-xs text-gray-500 mb-1">최종 결과</div>
                <div className="font-bold text-blue-700">{w1 > w2 ? p1?.name : p2?.name} 승리</div>
                <div className="text-sm text-gray-500">{Math.max(w1, w2)} : {Math.min(w1, w2)} 세트</div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={handleSubmit} disabled={!hasWinner}>
            {onNext ? '저장 후 다음 →' : '결과 저장'}
          </button>
          <button className="btn-secondary" onClick={onClose}>닫기</button>
        </div>

        {/* 부전승 처리 */}
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-2 text-center">기권/불참</p>
          <div className="flex gap-2">
            <button
              onClick={() => { if (!match.participant1Id || !match.participant2Id) return; onSubmit({ winnerId: match.participant1Id, loserId: match.participant2Id, winnerScore: 1, loserScore: 0, walkedOver: true }) }}
              className="flex-1 text-xs py-2 px-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-center">
              <span className="font-medium text-blue-600">{p1?.name ?? '-'}</span> 부전승
            </button>
            <button
              onClick={() => { if (!match.participant1Id || !match.participant2Id) return; onSubmit({ winnerId: match.participant2Id, loserId: match.participant1Id, winnerScore: 1, loserScore: 0, walkedOver: true }) }}
              className="flex-1 text-xs py-2 px-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-center">
              <span className="font-medium text-red-500">{p2?.name ?? '-'}</span> 부전승
            </button>
          </div>
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
