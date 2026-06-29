import { useState, useMemo, useRef } from 'react'
import { useStore } from '../store/useStore'
import { Plus, Search, Trash2, X, Trophy, Users, TrendingUp, Edit2, Upload, Download, AlertCircle, BarChart2, Zap, CheckCircle } from 'lucide-react'
import type { Player, Pair, Division, Gender, Tournament, ScoreRecord } from '../types'
import { getRatingLabel, pointsToRating } from '../utils/ratingUtils'
import { generatePlayers, generatePairs } from '../data/mockData'

const DIVISIONS: Division[] = ['초등', '중등', '고등', '대학', '일반', '생활체육']

const divColors: Record<Division, string> = {
  초등: 'bg-yellow-100 text-yellow-700', 중등: 'bg-green-100 text-green-700',
  고등: 'bg-blue-100 text-blue-700', 대학: 'bg-purple-100 text-purple-700',
  일반: 'bg-gray-100 text-gray-700', 생활체육: 'bg-orange-100 text-orange-700',
}
const divBorder: Record<Division, string> = {
  초등: 'border-yellow-400 bg-yellow-50 text-yellow-700',
  중등: 'border-green-400 bg-green-50 text-green-700',
  고등: 'border-blue-400 bg-blue-50 text-blue-700',
  대학: 'border-purple-400 bg-purple-50 text-purple-700',
  일반: 'border-gray-400 bg-gray-50 text-gray-700',
  생활체육: 'border-orange-400 bg-orange-50 text-orange-700',
}

type RankView = '통합' | '남자' | '여자' | Division
type SortBy = 'points' | 'elo' | 'wins'

function genId() { return Math.random().toString(36).slice(2, 10) }

type ImportRow = { name: string; school: string; division: Division; gender: '남' | '여'; points: number; photoUrl?: string; error?: string }

function parseQuickText(text: string): ImportRow[] {
  const validDivs = new Set<string>(['초등', '중등', '고등', '대학', '일반', '생활체육'])
  const lines = text.trim().split('\n').filter(l => l.trim())
  return lines.map(line => {
    // Support tab or multiple spaces as delimiter
    const cols = line.trim().split(/[\t ]+/)
    const [name, school, division, gender, pointsStr] = cols
    const points = Number(pointsStr ?? 0) || 0
    const errors: string[] = []
    if (!name) errors.push('이름 없음')
    if (!school) errors.push('소속 없음')
    if (!validDivs.has(division)) errors.push(`부문 오류(${division ?? '없음'})`)
    if (gender !== '남' && gender !== '여') errors.push(`성별 오류(${gender ?? '없음'})`)
    return {
      name: name || '',
      school: school || '',
      division: (validDivs.has(division) ? division : '일반') as Division,
      gender: (gender === '남' || gender === '여') ? gender : '남',
      points,
      error: errors.length ? errors.join(', ') : undefined,
    }
  })
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.trim().split('\n').filter(l => l.trim())
  const validDivs = new Set<string>(['초등', '중등', '고등', '대학', '일반', '생활체육'])
  const rows: ImportRow[] = []
  const startIdx = lines[0].includes('이름') ? 1 : 0
  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const [name, school, division, gender, pointsStr, , , , , , photoUrl] = cols
    const points = Number(pointsStr ?? 0) || 0
    const errors: string[] = []
    if (!name) errors.push('이름 없음')
    if (!school) errors.push('학교 없음')
    if (!validDivs.has(division)) errors.push(`부문 오류(${division})`)
    if (gender !== '남' && gender !== '여') errors.push(`성별 오류(${gender})`)
    rows.push({
      name: name || '',
      school: school || '',
      division: (validDivs.has(division) ? division : '일반') as Division,
      gender: (gender === '남' || gender === '여') ? gender : '남',
      points,
      photoUrl: photoUrl || undefined,
      error: errors.length ? errors.join(', ') : undefined,
    })
  }
  return rows
}

export default function Rankings() {
  const { players, pairs, teams, tournaments, scoreRecords, addPlayer, updatePlayer, deletePlayer, addPlayerPoints, addPair, deletePair, importPlayers, addTeam, deleteTeam } = useStore()
  const [tab, setTab] = useState<'singles' | 'doubles' | 'teams'>('singles')
  const [rankView, setRankView] = useState<RankView>('통합')
  const [subGender, setSubGender] = useState<'all' | '남' | '여'>('all')
  const [sortBy, setSortBy] = useState<SortBy>('points')
  const [filterPairDiv, setFilterPairDiv] = useState<Division | 'all'>('all')
  const [filterTournamentId, setFilterTournamentId] = useState<string>('')
  const [filterCheckIn, setFilterCheckIn] = useState<'all' | 'checked' | 'unchecked'>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [pointsModal, setPointsModal] = useState<{ id: string; name: string } | null>(null)
  const [addPts, setAddPts] = useState('')
  const [addWin, setAddWin] = useState(true)
  const [editModal, setEditModal] = useState<Player | null>(null)
  const [statsModal, setStatsModal] = useState<Player | null>(null)
  const [pairStatsModal, setPairStatsModal] = useState<Pair | null>(null)
  const [importModal, setImportModal] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null)
  const [quickModal, setQuickModal] = useState(false)
  const [quickText, setQuickText] = useState('')
  const [quickRows, setQuickRows] = useState<ImportRow[]>([])
  const [mockGenModal, setMockGenModal] = useState(false)
  const [mockGenCount, setMockGenCount] = useState(500)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50
  const [pairPage, setPairPage] = useState(1)
  const PAIR_PAGE_SIZE = 30
  const [teamPage, setTeamPage] = useState(1)
  const TEAM_PAGE_SIZE = 30

  // Player form
  const [pForm, setPForm] = useState({ name: '', school: '', division: '초등' as Division, gender: '남' as '남' | '여', points: '0', registrationNo: '', phone: '', photoUrl: '' })
  // Pair form
  const [pairForm, setPairForm] = useState({
    player1Id: '', player2Id: '', division: '초등' as Division,
    pairType: '남복' as '남복' | '여복' | '혼복',
  })
  // Team form
  const [teamForm, setTeamForm] = useState({
    name: '', school: '', division: '초등' as Division, gender: '남' as '남' | '여' | '혼합',
    playerIds: [] as string[],
  })

  const isDivView = DIVISIONS.includes(rankView as Division)

  const tournamentParticipantIds = useMemo(() => {
    if (!filterTournamentId) return null
    const t = tournaments.find(x => x.id === filterTournamentId)
    if (!t) return null
    return new Set(t.events.flatMap(ev => ev.participantIds))
  }, [filterTournamentId, tournaments])

  const filteredPlayers = useMemo(() => {
    setPage(1)
    let list = [...players]
    if (tournamentParticipantIds) list = list.filter(p => tournamentParticipantIds.has(p.id))
    if (rankView === '남자') list = list.filter(p => p.gender === '남')
    else if (rankView === '여자') list = list.filter(p => p.gender === '여')
    else if (isDivView) {
      list = list.filter(p => p.division === rankView)
      if (subGender !== 'all') list = list.filter(p => p.gender === subGender)
    }
    if (search) list = list.filter(p => p.name.includes(search) || p.school.includes(search))
    if (filterCheckIn === 'checked') list = list.filter(p => p.checkedIn)
    else if (filterCheckIn === 'unchecked') list = list.filter(p => !p.checkedIn)
    return list.sort((a, b) =>
      sortBy === 'elo' ? (b.rating ?? 1000) - (a.rating ?? 1000)
      : sortBy === 'wins' ? b.wins - a.wins
      : b.points - a.points
    )
  }, [players, rankView, subGender, sortBy, search, filterCheckIn, isDivView, tournamentParticipantIds])

  const totalPages = Math.ceil(filteredPlayers.length / PAGE_SIZE)
  const pagedPlayers = filteredPlayers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const filteredPairs = pairs
    .filter(p => filterPairDiv === 'all' || p.division === filterPairDiv)
    .filter(p => !search || p.name.includes(search) || p.school.includes(search))
    .sort((a, b) => b.points - a.points)
  const totalPairPages = Math.ceil(filteredPairs.length / PAIR_PAGE_SIZE)
  const pagedPairs = filteredPairs.slice((pairPage - 1) * PAIR_PAGE_SIZE, pairPage * PAIR_PAGE_SIZE)

  const sortedTeams = [...teams].sort((a, b) => b.points - a.points)
  const totalTeamPages = Math.ceil(sortedTeams.length / TEAM_PAGE_SIZE)
  const pagedTeams = sortedTeams.slice((teamPage - 1) * TEAM_PAGE_SIZE, teamPage * TEAM_PAGE_SIZE)

  const rankTitle = rankView === '통합' ? '통합 랭킹' : rankView === '남자' ? '남자 통합 랭킹' : rankView === '여자' ? '여자 통합 랭킹' : `${rankView} ${subGender === 'all' ? '전체' : subGender === '남' ? '남자' : '여자'} 랭킹`

  function handleAddPlayer() {
    if (!pForm.name || !pForm.school) return
    const pts = Number(pForm.points) || 0
    addPlayer({
      id: genId(), ...pForm, points: pts, wins: 0, losses: 0,
      createdAt: new Date().toISOString().split('T')[0],
      rating: pointsToRating(pts), gamesPlayed: 0,
      registrationNo: pForm.registrationNo || undefined,
      phone: pForm.phone || undefined,
      photoUrl: pForm.photoUrl || undefined,
    })
    setPForm({ name: '', school: '', division: '초등', gender: '남', points: '0', registrationNo: '', phone: '', photoUrl: '' })
    setShowAdd(false)
  }

  function handleAddPair() {
    if (!pairForm.player1Id || !pairForm.player2Id || pairForm.player1Id === pairForm.player2Id) return
    const p1 = players.find(p => p.id === pairForm.player1Id)!
    const p2 = players.find(p => p.id === pairForm.player2Id)!
    const gender = pairForm.pairType === '혼복' ? '혼합' : pairForm.pairType === '남복' ? '남' : '여'
    const school = p1.school === p2.school ? p1.school : `${p1.school} / ${p2.school}`
    addPair({
      id: genId(),
      player1Id: p1.id, player2Id: p2.id,
      name: `${p1.name} / ${p2.name}`,
      school, division: pairForm.division,
      gender: gender as any,
      points: Math.floor((p1.points + p2.points) / 2),
      wins: 0, losses: 0,
    })
    setPairForm({ player1Id: '', player2Id: '', division: '초등', pairType: '남복' })
    setShowAdd(false)
  }

  function handleAddTeam() {
    if (!teamForm.name || teamForm.playerIds.length < 2) return
    const avgPts = Math.floor(teamForm.playerIds.reduce((s, id) => s + (players.find(p => p.id === id)?.points ?? 0), 0) / teamForm.playerIds.length)
    addTeam({
      id: Math.random().toString(36).slice(2, 10),
      name: teamForm.name, school: teamForm.school,
      division: teamForm.division, gender: teamForm.gender as any,
      playerIds: teamForm.playerIds, points: avgPts, wins: 0, losses: 0,
    })
    setTeamForm({ name: '', school: '', division: '초등', gender: '남', playerIds: [] })
    setShowAdd(false)
  }

  function handleAddPoints() {
    if (!pointsModal || !addPts) return
    addPlayerPoints(pointsModal.id, Number(addPts), addWin)
    setPointsModal(null); setAddPts('')
  }

  function handleEditSave() {
    if (!editModal) return
    updatePlayer(editModal.id, {
      name: editModal.name, school: editModal.school,
      division: editModal.division, gender: editModal.gender,
      points: editModal.points, rating: pointsToRating(editModal.points),
      registrationNo: editModal.registrationNo || undefined,
      phone: editModal.phone || undefined,
      photoUrl: editModal.photoUrl || undefined,
    })
    setEditModal(null)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setImportRows(parseCSV(text))
      setImportModal(true)
      setImportResult(null)
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  function handleImportConfirm() {
    const validRows = importRows.filter(r => !r.error)
    const newPlayers = validRows.map(r => ({
      id: Math.random().toString(36).slice(2, 10),
      ...r,
      wins: 0, losses: 0,
      createdAt: new Date().toISOString().split('T')[0],
      rating: pointsToRating(r.points), gamesPlayed: 0,
    }))
    const result = importPlayers(newPlayers)
    setImportResult(result)
    setImportRows([])
  }

  function handleQuickConfirm() {
    const validRows = quickRows.filter(r => !r.error)
    const newPlayers = validRows.map(r => ({
      id: Math.random().toString(36).slice(2, 10),
      ...r,
      wins: 0, losses: 0,
      createdAt: new Date().toISOString().split('T')[0],
      rating: pointsToRating(r.points), gamesPlayed: 0,
    }))
    const result = importPlayers(newPlayers)
    setImportResult(result)
    setQuickRows([])
    setQuickText('')
  }

  function exportCSV() {
    const header = '이름,학교,부문,성별,포인트,승,패,Elo등급,등록번호,연락처,사진URL\n'
    const rows = filteredPlayers.map(p =>
      `${p.name},${p.school},${p.division},${p.gender},${p.points},${p.wins},${p.losses},${p.rating ?? 1000},${p.registrationNo ?? ''},${p.phone ?? ''},${p.photoUrl ?? ''}`
    ).join('\n')
    const blob = new Blob(['﻿' + header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `선수명단_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  function downloadTemplate() {
    const content = '이름,학교,부문,성별,포인트\n홍길동,서울초등학교,초등,남,100\n김영희,부산중학교,중등,여,50\n'
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = '선수등록_양식.csv'; a.click(); URL.revokeObjectURL(url)
  }

  // Available players for pair form
  const availForPair1 = players.filter(p => {
    if (pairForm.pairType === '남복') return p.gender === '남'
    if (pairForm.pairType === '여복') return p.gender === '여'
    return true // 혼복
  })
  const availForPair2 = players.filter(p => {
    if (pairForm.pairType === '남복') return p.gender === '남' && p.id !== pairForm.player1Id
    if (pairForm.pairType === '여복') return p.gender === '여' && p.id !== pairForm.player1Id
    // 혼복: opposite gender of player1
    const p1 = players.find(x => x.id === pairForm.player1Id)
    if (p1) return p.gender !== p1.gender && p.id !== pairForm.player1Id
    return p.id !== pairForm.player1Id
  })

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gray-50">
      {/* Fixed top bar: header + tabs + search + filter */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 space-y-3 bg-gray-50 border-b border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2"><Trophy size={20} className="text-yellow-500" />랭킹 관리</h1>
        <div className="flex gap-2 flex-wrap">
          {tab === 'singles' && (
            <>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
              <button onClick={() => setMockGenModal(true)} className="btn-secondary flex items-center gap-1.5 text-sm bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100">
                <Zap size={14} /> 가상 데이터 생성
              </button>
              <button onClick={() => { setQuickModal(true); setQuickText(''); setQuickRows([]); setImportResult(null) }} className="btn-secondary flex items-center gap-1.5 text-sm bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100">
                ⚡ 빠른 등록
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="btn-secondary flex items-center gap-1.5 text-sm">
                <Upload size={14} /> CSV 가져오기
              </button>
              <button onClick={exportCSV} className="btn-secondary flex items-center gap-1.5 text-sm">
                <Download size={14} /> CSV 내보내기
              </button>
            </>
          )}
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5">
            <Plus size={15} /> {tab === 'singles' ? '선수 등록' : tab === 'doubles' ? '페어 등록' : '팀 등록'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => { setTab('singles'); setPage(1) }} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${tab === 'singles' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          <Trophy size={14} /> 단식 랭킹 <span className="text-xs opacity-70">({players.length}명)</span>
        </button>
        <button onClick={() => { setTab('doubles'); setPairPage(1) }} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${tab === 'doubles' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          <Users size={14} /> 복식 페어 <span className="text-xs opacity-70">({pairs.length}페어)</span>
        </button>
        <button onClick={() => { setTab('teams'); setTeamPage(1) }} className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${tab === 'teams' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          <Users size={14} /> 단체전 팀 <span className="text-xs opacity-70">({teams.length}팀)</span>
        </button>
      </div>

      {/* Search + tournament filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8" placeholder="이름·학교 검색" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {tab === 'singles' && tournaments.length > 0 && (
          <select
            className="select text-sm min-w-[160px]"
            value={filterTournamentId}
            onChange={e => { setFilterTournamentId(e.target.value); setPage(1) }}
          >
            <option value="">전체 대회</option>
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        {tab === 'singles' && players.some(p => p.checkedIn) && (
          <div className="flex gap-1 flex-shrink-0">
            {(['all', 'checked', 'unchecked'] as const).map(v => (
              <button key={v} onClick={() => { setFilterCheckIn(v); setPage(1) }}
                className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border transition-colors ${filterCheckIn === v ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-500 border-gray-200 hover:border-green-400'}`}>
                {v === 'all' ? '전체' : v === 'checked' ? <><CheckCircle size={11} />체크인</> : '미체크인'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Rank view selector — singles only */}
      {tab === 'singles' && (
        <div className="card space-y-3 py-3">
          <div className="flex flex-wrap gap-2 items-center">
            {/* 통합 그룹 */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {(['통합', '남자', '여자'] as const).map(v => (
                <button key={v} onClick={() => { setRankView(v); setSubGender('all') }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${rankView === v ? 'bg-white shadow-sm text-blue-700 font-bold' : 'text-gray-500 hover:text-gray-700'}`}>
                  {v === '통합' ? '🏆 통합' : v === '남자' ? '👨 남자' : '👩 여자'}
                </button>
              ))}
            </div>
            {/* 부문별 */}
            {DIVISIONS.map(div => (
              <button key={div} onClick={() => { setRankView(div); setSubGender('all') }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors whitespace-nowrap ${rankView === div ? divBorder[div] : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {div}
              </button>
            ))}
            {/* 정렬 */}
            <div className="ml-auto flex gap-1 bg-gray-100 rounded-xl p-1">
              <button onClick={() => setSortBy('points')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${sortBy === 'points' ? 'bg-white shadow-sm text-blue-700' : 'text-gray-500'}`}>
                포인트
              </button>
              <button onClick={() => setSortBy('elo')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${sortBy === 'elo' ? 'bg-white shadow-sm text-purple-700' : 'text-gray-500'}`}>
                Elo
              </button>
              <button onClick={() => setSortBy('wins')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${sortBy === 'wins' ? 'bg-white shadow-sm text-green-700' : 'text-gray-500'}`}>
                승수
              </button>
            </div>
          </div>
          {/* 부문 선택 시 성별 서브탭 */}
          {isDivView && (
            <div className="flex gap-1.5 pt-1 border-t border-gray-100">
              <span className="text-xs text-gray-400 self-center mr-1">성별:</span>
              {(['all', '남', '여'] as const).map(g => (
                <button key={g} onClick={() => setSubGender(g)}
                  className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${subGender === g ? (g === '남' ? 'bg-blue-600 text-white' : g === '여' ? 'bg-pink-500 text-white' : 'bg-gray-700 text-white') : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {g === 'all' ? '전체' : g === '남' ? '남자' : '여자'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Doubles filter */}
      {tab === 'doubles' && (
        <div className="flex gap-2 flex-wrap">
          {(['all', ...DIVISIONS] as const).map(d => (
            <button key={d} onClick={() => { setFilterPairDiv(d as any); setPairPage(1) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${filterPairDiv === d ? (d === 'all' ? 'border-blue-500 bg-blue-50 text-blue-700' : divBorder[d as Division]) : 'border-gray-200 text-gray-500'}`}>
              {d === 'all' ? '전체' : d}
            </button>
          ))}
        </div>
      )}
      </div>{/* /fixed-top-bar */}

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">

      {/* Singles Table */}
      {tab === 'singles' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">{rankTitle}</span>
            <span className="text-xs text-gray-400">{filteredPlayers.length}명 · {sortBy === 'elo' ? 'Elo 순' : '포인트 순'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left text-gray-600 w-12">순위</th>
                  <th className="py-3 px-4 text-left text-gray-600">이름</th>
                  <th className="py-3 px-4 text-left text-gray-600">학교</th>
                  {(rankView === '통합' || rankView === '남자' || rankView === '여자') && (
                    <th className="py-3 px-4 text-left text-gray-600">부문</th>
                  )}
                  {(rankView === '통합' || isDivView) && (
                    <th className="py-3 px-4 text-center text-gray-600">성별</th>
                  )}
                  <th className="py-3 px-4 text-right text-gray-600 font-bold text-blue-600">포인트</th>
                  <th className="py-3 px-4 text-right text-gray-600 font-bold text-purple-600">
                    <span className="flex items-center gap-1 justify-end"><TrendingUp size={12} />Elo</span>
                  </th>
                  <th className="py-3 px-4 text-center text-gray-600">승/패</th>
                  <th className="py-3 px-4 text-center text-gray-600">관리</th>
                </tr>
              </thead>
              <tbody>
                {pagedPlayers.map((p, i) => {
                  const globalRank = (page - 1) * PAGE_SIZE + i + 1
                  const rLabel = getRatingLabel(p.rating ?? 1000)
                  const showDiv = rankView === '통합' || rankView === '남자' || rankView === '여자'
                  const showGender = rankView === '통합' || isDivView
                  return (
                  <tr key={p.id} className={`border-b last:border-0 hover:bg-gray-50 ${globalRank <= 3 ? 'bg-yellow-50/20' : ''}`}>
                    <td className="py-3 px-4 text-center"><RankIcon rank={globalRank} /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {p.photoUrl
                          ? <img src={p.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400 flex-shrink-0 font-bold">{p.name[0]}</div>
                        }
                        <button
                          onClick={() => setStatsModal(p)}
                          className="font-medium text-left hover:text-blue-600 hover:underline underline-offset-2 transition-colors"
                        >{p.name}</button>
                        {p.checkedIn && <CheckCircle size={11} className="text-green-500 flex-shrink-0" title="체크인 완료" />}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{p.school}</td>
                    {showDiv && <td className="py-3 px-4"><span className={`badge ${divColors[p.division]}`}>{p.division}</span></td>}
                    {showGender && (
                      <td className="py-3 px-4 text-center">
                        <span className={`badge ${p.gender === '남' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>{p.gender}</span>
                      </td>
                    )}
                    <td className="py-3 px-4 text-right">
                      <span className="font-bold text-blue-600 text-base">{p.points.toLocaleString()}</span>
                      <span className="text-xs text-gray-400 ml-1">P</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className={`text-sm font-bold ${rLabel.color}`}>{p.rating ?? '-'}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${rLabel.bg} ${rLabel.color}`}>{rLabel.label}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-green-600 font-medium">{p.wins}승</span>
                      <span className="text-gray-300 mx-1">/</span>
                      <span className="text-red-500">{p.losses}패</span>
                      {p.wins + p.losses > 0 && (
                        <span className="ml-1.5 text-xs bg-blue-50 text-blue-600 font-medium px-1.5 py-0.5 rounded-full">
                          {Math.round(p.wins / (p.wins + p.losses) * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setStatsModal(p)}
                          className="text-gray-400 hover:text-indigo-600 p-1" title="전적 보기"><BarChart2 size={13} /></button>
                        <button onClick={() => setPointsModal({ id: p.id, name: p.name })}
                          className="text-xs bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-1 rounded font-medium">+P</button>
                        <button onClick={() => setEditModal({ ...p })} className="text-gray-400 hover:text-gray-700 p-1"><Edit2 size={13} /></button>
                        <button onClick={() => { if (window.confirm(`${p.name} 선수를 삭제하시겠습니까?`)) deletePlayer(p.id) }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                )})}
                {pagedPlayers.length === 0 && (
                  <tr><td colSpan={9} className="py-12 text-center text-gray-400">선수가 없습니다</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <span className="text-xs text-gray-400">
                {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filteredPlayers.length)} / {filteredPlayers.length}명
              </span>
              <div className="flex gap-1">
                <button onClick={() => setPage(1)} disabled={page === 1}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">«</button>
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">‹</button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4))
                  const p = start + i
                  return (
                    <button key={p} onClick={() => setPage(p)}
                      className={`px-2.5 py-1 text-xs rounded border ${page === p ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
                      {p}
                    </button>
                  )
                })}
                <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">›</button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">»</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Doubles / Pairs Table */}
      {tab === 'doubles' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">복식 페어 랭킹</span>
            <span className="text-xs text-gray-400">{filteredPairs.length}페어 · 포인트 순</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left text-gray-600 w-12">순위</th>
                  <th className="py-3 px-4 text-left text-gray-600">페어</th>
                  <th className="py-3 px-4 text-left text-gray-600">학교</th>
                  <th className="py-3 px-4 text-left text-gray-600">부문</th>
                  <th className="py-3 px-4 text-center text-gray-600">종류</th>
                  <th className="py-3 px-4 text-right text-blue-600 font-bold">포인트</th>
                  <th className="py-3 px-4 text-center text-gray-600">승/패</th>
                  <th className="py-3 px-4 text-center text-gray-600">삭제</th>
                </tr>
              </thead>
              <tbody>
                {pagedPairs.map((p, i) => {
                  const globalRank = (pairPage - 1) * PAIR_PAGE_SIZE + i + 1
                  return (
                  <tr key={p.id} className={`border-b last:border-0 hover:bg-gray-50 ${globalRank <= 3 ? 'bg-yellow-50/20' : ''}`}>
                    <td className="py-3 px-4 text-center"><RankIcon rank={globalRank} /></td>
                    <td className="py-3 px-4 font-medium">{p.name}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{p.school}</td>
                    <td className="py-3 px-4"><span className={`badge ${divColors[p.division]}`}>{p.division}</span></td>
                    <td className="py-3 px-4 text-center">
                      <span className={`badge ${p.gender === '남' ? 'bg-blue-50 text-blue-600' : p.gender === '여' ? 'bg-pink-50 text-pink-600' : 'bg-purple-50 text-purple-600'}`}>
                        {p.gender === '남' ? '남복' : p.gender === '여' ? '여복' : '혼복'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-bold text-blue-600">{p.points.toLocaleString()}</span>
                      <span className="text-xs text-gray-400 ml-1">P</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-green-600 font-medium">{p.wins}승</span>
                      <span className="text-gray-300 mx-1">/</span>
                      <span className="text-red-500">{p.losses}패</span>
                      {p.wins + p.losses > 0 && (
                        <span className="ml-1.5 text-xs bg-blue-50 text-blue-600 font-medium px-1.5 py-0.5 rounded-full">
                          {Math.round(p.wins / (p.wins + p.losses) * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center flex items-center justify-center gap-1">
                      <button onClick={() => setPairStatsModal(p)} className="text-gray-400 hover:text-indigo-600 p-1" title="페어 전적 보기"><BarChart2 size={13} /></button>
                      <button onClick={() => deletePair(p.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                )})}
                {filteredPairs.length === 0 && (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-400">등록된 복식 페어가 없습니다<br /><span className="text-xs">우상단 '페어 등록' 버튼으로 추가하세요</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPairPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <span className="text-xs text-gray-400">
                {(pairPage-1)*PAIR_PAGE_SIZE+1}–{Math.min(pairPage*PAIR_PAGE_SIZE, filteredPairs.length)} / {filteredPairs.length}페어
              </span>
              <div className="flex gap-1">
                <button onClick={() => setPairPage(1)} disabled={pairPage === 1}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">«</button>
                <button onClick={() => setPairPage(p => p - 1)} disabled={pairPage === 1}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">‹</button>
                {Array.from({ length: Math.min(5, totalPairPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(pairPage - 2, totalPairPages - 4))
                  const p = start + i
                  return (
                    <button key={p} onClick={() => setPairPage(p)}
                      className={`px-2.5 py-1 text-xs rounded border ${pairPage === p ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
                      {p}
                    </button>
                  )
                })}
                <button onClick={() => setPairPage(p => p + 1)} disabled={pairPage === totalPairPages}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">›</button>
                <button onClick={() => setPairPage(totalPairPages)} disabled={pairPage === totalPairPages}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">»</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Teams Table */}
      {tab === 'teams' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-gray-700 text-sm">단체전 팀 랭킹</span>
            <span className="text-xs text-gray-400">{teams.length}팀 · 포인트 순</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="py-3 px-4 text-left text-gray-600 w-12">순위</th>
                  <th className="py-3 px-4 text-left text-gray-600">팀명</th>
                  <th className="py-3 px-4 text-left text-gray-600">학교/소속</th>
                  <th className="py-3 px-4 text-left text-gray-600">부문</th>
                  <th className="py-3 px-4 text-center text-gray-600">성별</th>
                  <th className="py-3 px-4 text-center text-gray-600">선수 수</th>
                  <th className="py-3 px-4 text-right text-blue-600 font-bold">평균 포인트</th>
                  <th className="py-3 px-4 text-center text-gray-600">삭제</th>
                </tr>
              </thead>
              <tbody>
                {pagedTeams.map((t, i) => {
                  const globalRank = (teamPage - 1) * TEAM_PAGE_SIZE + i + 1
                  return (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-3 px-4 text-center"><RankIcon rank={globalRank} /></td>
                    <td className="py-3 px-4 font-medium">{t.name}</td>
                    <td className="py-3 px-4 text-gray-500 text-xs">{t.school}</td>
                    <td className="py-3 px-4"><span className={`badge ${divColors[t.division]}`}>{t.division}</span></td>
                    <td className="py-3 px-4 text-center">
                      <span className={`badge ${t.gender === '남' ? 'bg-blue-50 text-blue-600' : t.gender === '여' ? 'bg-pink-50 text-pink-600' : 'bg-purple-50 text-purple-600'}`}>{t.gender}</span>
                    </td>
                    <td className="py-3 px-4 text-center">{t.playerIds.length}명</td>
                    <td className="py-3 px-4 text-right"><span className="font-bold text-blue-600">{t.points.toLocaleString()}</span><span className="text-xs text-gray-400 ml-1">P</span></td>
                    <td className="py-3 px-4 text-center">
                      <button onClick={() => deleteTeam(t.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                )})}
                {teams.length === 0 && (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-400">등록된 팀이 없습니다<br /><span className="text-xs">우상단 '팀 등록' 버튼으로 추가하세요</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalTeamPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <span className="text-xs text-gray-400">
                {(teamPage-1)*TEAM_PAGE_SIZE+1}–{Math.min(teamPage*TEAM_PAGE_SIZE, teams.length)} / {teams.length}팀
              </span>
              <div className="flex gap-1">
                <button onClick={() => setTeamPage(1)} disabled={teamPage === 1}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">«</button>
                <button onClick={() => setTeamPage(p => p - 1)} disabled={teamPage === 1}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">‹</button>
                {Array.from({ length: Math.min(5, totalTeamPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(teamPage - 2, totalTeamPages - 4))
                  const p = start + i
                  return (
                    <button key={p} onClick={() => setTeamPage(p)}
                      className={`px-2.5 py-1 text-xs rounded border ${teamPage === p ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-100'}`}>
                      {p}
                    </button>
                  )
                })}
                <button onClick={() => setTeamPage(p => p + 1)} disabled={teamPage === totalTeamPages}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">›</button>
                <button onClick={() => setTeamPage(totalTeamPages)} disabled={teamPage === totalTeamPages}
                  className="px-2 py-1 text-xs rounded border disabled:opacity-30 hover:bg-gray-100">»</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Division summary cards — clickable */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {DIVISIONS.map(div => {
          const dp = players.filter((p: Player) => p.division === div)
          const males = dp.filter(p => p.gender === '남')
          const females = dp.filter(p => p.gender === '여')
          const topM = [...males].sort((a, b) => b.points - a.points)[0]
          const topF = [...females].sort((a, b) => b.points - a.points)[0]
          const isActive = rankView === div
          return (
            <div key={div} onClick={() => { setTab('singles'); setRankView(div); setSubGender('all') }}
              className={`card text-center py-3 cursor-pointer transition-all hover:shadow-md border-2 ${isActive ? divBorder[div] : 'border-transparent'}`}>
              <span className={`badge ${divColors[div]} mb-2`}>{div}</span>
              <div className="text-xl font-bold text-gray-700">{dp.length}</div>
              <div className="flex justify-center gap-2 text-[10px] text-gray-500 mb-2">
                <span className="text-blue-500">남 {males.length}</span>
                <span>·</span>
                <span className="text-pink-500">여 {females.length}</span>
              </div>
              {topM && <div className="text-[10px] text-blue-600 truncate">👨 {topM.name}</div>}
              {topF && <div className="text-[10px] text-pink-500 truncate">👩 {topF.name}</div>}
            </div>
          )
        })}
      </div>
      </div>{/* /scrollable-content */}

      {/* Add Player Modal */}
      {showAdd && tab === 'singles' && (
        <Modal title="선수 등록" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <Field label="이름 *"><input className="input" placeholder="선수 이름" value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="학교/소속 *"><input className="input" placeholder="학교 또는 소속" value={pForm.school} onChange={e => setPForm(f => ({ ...f, school: e.target.value }))} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="부문">
                <select className="select" value={pForm.division} onChange={e => setPForm(f => ({ ...f, division: e.target.value as Division }))}>
                  {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="성별">
                <select className="select" value={pForm.gender} onChange={e => setPForm(f => ({ ...f, gender: e.target.value as '남' | '여' }))}>
                  <option value="남">남</option><option value="여">여</option>
                </select>
              </Field>
            </div>
            <Field label="초기 포인트"><input className="input" type="number" placeholder="0" value={pForm.points} onChange={e => setPForm(f => ({ ...f, points: e.target.value }))} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="등록번호 (선택)"><input className="input" placeholder="예: KR-001" value={pForm.registrationNo} onChange={e => setPForm(f => ({ ...f, registrationNo: e.target.value }))} /></Field>
              <Field label="연락처 (선택)"><input className="input" placeholder="010-0000-0000" value={pForm.phone} onChange={e => setPForm(f => ({ ...f, phone: e.target.value }))} /></Field>
            </div>
            <Field label="사진 URL (선택)"><input className="input" placeholder="https://..." value={pForm.photoUrl} onChange={e => setPForm(f => ({ ...f, photoUrl: e.target.value }))} /></Field>
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={handleAddPlayer}>등록</button>
              <button className="btn-secondary flex-1" onClick={() => setShowAdd(false)}>취소</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Pair Modal */}
      {showAdd && tab === 'doubles' && (
        <Modal title="복식 페어 등록" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <Field label="복식 종류">
              <div className="flex gap-2">
                {(['남복', '여복', '혼복'] as const).map(t => (
                  <button key={t} onClick={() => setPairForm(f => ({ ...f, pairType: t, player1Id: '', player2Id: '' }))}
                    className={`flex-1 py-2 rounded-lg text-sm border-2 font-medium transition-colors ${pairForm.pairType === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="부문">
              <select className="select" value={pairForm.division} onChange={e => setPairForm(f => ({ ...f, division: e.target.value as Division }))}>
                {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label={pairForm.pairType === '혼복' ? '남자 선수' : '선수 1'}>
              <select className="select" value={pairForm.player1Id} onChange={e => setPairForm(f => ({ ...f, player1Id: e.target.value, player2Id: '' }))}>
                <option value="">선택...</option>
                {availForPair1.map(p => <option key={p.id} value={p.id}>{p.name} ({p.school}) {p.points}P</option>)}
              </select>
            </Field>
            <Field label={pairForm.pairType === '혼복' ? '여자 선수' : '선수 2'}>
              <select className="select" value={pairForm.player2Id} onChange={e => setPairForm(f => ({ ...f, player2Id: e.target.value }))}>
                <option value="">선택...</option>
                {availForPair2.map(p => <option key={p.id} value={p.id}>{p.name} ({p.school}) {p.points}P</option>)}
              </select>
            </Field>
            {pairForm.player1Id && pairForm.player2Id && (
              <div className="bg-blue-50 rounded-lg p-3 text-sm text-center text-blue-700">
                <span className="font-semibold">
                  {players.find(p => p.id === pairForm.player1Id)?.name} / {players.find(p => p.id === pairForm.player2Id)?.name}
                </span>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={handleAddPair} disabled={!pairForm.player1Id || !pairForm.player2Id}>등록</button>
              <button className="btn-secondary flex-1" onClick={() => setShowAdd(false)}>취소</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Points Modal */}
      {pointsModal && (
        <Modal title={`포인트 추가 — ${pointsModal.name}`} onClose={() => setPointsModal(null)}>
          <div className="space-y-4">
            <Field label="추가 포인트">
              <input className="input" type="number" placeholder="예: 50" value={addPts} onChange={e => setAddPts(e.target.value)} />
            </Field>
            <div className="flex gap-2">
              <button onClick={() => setAddWin(true)} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 ${addWin ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'}`}>승리</button>
              <button onClick={() => setAddWin(false)} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 ${!addWin ? 'border-red-400 bg-red-50 text-red-600' : 'border-gray-200 text-gray-500'}`}>패배</button>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" onClick={handleAddPoints}>적용</button>
              <button className="btn-secondary flex-1" onClick={() => setPointsModal(null)}>취소</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Player Modal */}
      {editModal && (
        <Modal title="선수 정보 수정" onClose={() => setEditModal(null)}>
          <div className="space-y-3">
            <Field label="이름 *">
              <input className="input" value={editModal.name} onChange={e => setEditModal(m => m ? { ...m, name: e.target.value } : m)} />
            </Field>
            <Field label="학교/소속 *">
              <input className="input" value={editModal.school} onChange={e => setEditModal(m => m ? { ...m, school: e.target.value } : m)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="부문">
                <select className="select" value={editModal.division} onChange={e => setEditModal(m => m ? { ...m, division: e.target.value as Division } : m)}>
                  {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="성별">
                <select className="select" value={editModal.gender} onChange={e => setEditModal(m => m ? { ...m, gender: e.target.value as '남' | '여' } : m)}>
                  <option value="남">남</option><option value="여">여</option>
                </select>
              </Field>
            </div>
            <Field label="포인트">
              <input className="input" type="number" value={editModal.points} onChange={e => setEditModal(m => m ? { ...m, points: Number(e.target.value) } : m)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="등록번호">
                <input className="input" placeholder="예: KR-001" value={editModal.registrationNo ?? ''} onChange={e => setEditModal(m => m ? { ...m, registrationNo: e.target.value } : m)} />
              </Field>
              <Field label="연락처">
                <input className="input" placeholder="010-0000-0000" value={editModal.phone ?? ''} onChange={e => setEditModal(m => m ? { ...m, phone: e.target.value } : m)} />
              </Field>
            </div>
            <Field label="사진 URL">
              <input className="input" placeholder="https://..." value={editModal.photoUrl ?? ''} onChange={e => setEditModal(m => m ? { ...m, photoUrl: e.target.value } : m)} />
            </Field>
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={handleEditSave}>저장</button>
              <button className="btn-secondary flex-1" onClick={() => setEditModal(null)}>취소</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Team Modal */}
      {showAdd && tab === 'teams' && (
        <Modal title="단체전 팀 등록" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <Field label="팀명 *"><input className="input" placeholder="예: 서울중학교 A팀" value={teamForm.name} onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="학교/소속"><input className="input" placeholder="학교 또는 소속" value={teamForm.school} onChange={e => setTeamForm(f => ({ ...f, school: e.target.value }))} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="부문">
                <select className="select" value={teamForm.division} onChange={e => setTeamForm(f => ({ ...f, division: e.target.value as Division, playerIds: [] }))}>
                  {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="성별">
                <select className="select" value={teamForm.gender} onChange={e => setTeamForm(f => ({ ...f, gender: e.target.value as any, playerIds: [] }))}>
                  <option value="남">남자팀</option><option value="여">여자팀</option><option value="혼합">혼성팀</option>
                </select>
              </Field>
            </div>
            <Field label={`선수 선택 (2~7명, 선택: ${teamForm.playerIds.length}명)`}>
              <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                {players.filter(p => p.division === teamForm.division && (teamForm.gender === '혼합' || p.gender === teamForm.gender)).map(p => {
                  const checked = teamForm.playerIds.includes(p.id)
                  return (
                    <label key={p.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${checked ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                      <input type="checkbox" checked={checked} onChange={() => setTeamForm(f => ({ ...f, playerIds: checked ? f.playerIds.filter(x => x !== p.id) : [...f.playerIds, p.id] }))} className="rounded" />
                      <span className="font-medium text-sm flex-1">{p.name}</span>
                      <span className="text-xs text-gray-400">{p.school}</span>
                      <span className="text-xs text-blue-600">{p.points}P</span>
                    </label>
                  )
                })}
              </div>
            </Field>
            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" onClick={handleAddTeam} disabled={!teamForm.name || teamForm.playerIds.length < 2}>팀 등록</button>
              <button className="btn-secondary flex-1" onClick={() => setShowAdd(false)}>취소</button>
            </div>
          </div>
        </Modal>
      )}

      {/* CSV Import Modal */}
      {statsModal && (
        <PlayerStatsModal
          player={statsModal}
          tournaments={tournaments}
          scoreRecords={scoreRecords}
          pMap={Object.fromEntries(players.map(p => [p.id, p.name]))}
          onClose={() => setStatsModal(null)}
          onSave={updates => { updatePlayer(statsModal.id, updates); setStatsModal(p => p ? { ...p, ...updates } : p) }}
        />
      )}

      {pairStatsModal && (
        <PairStatsModal
          pair={pairStatsModal}
          tournaments={tournaments}
          scoreRecords={scoreRecords}
          pMap={Object.fromEntries([...players.map(p => [p.id, p.name]), ...pairs.map(p => [p.id, p.name])])}
          onClose={() => setPairStatsModal(null)}
        />
      )}

      {quickModal && (
        <Modal title="⚡ 빠른 선수 일괄 등록" onClose={() => { setQuickModal(false); setQuickRows([]); setQuickText(''); setImportResult(null) }}>
          <div className="space-y-4">
            {importResult ? (
              <div className="space-y-3">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{importResult.added}명 등록 완료</div>
                  {importResult.skipped > 0 && <div className="text-sm text-gray-500 mt-1">{importResult.skipped}명 중복 건너뜀</div>}
                </div>
                <button className="btn-primary w-full" onClick={() => { setQuickModal(false); setQuickRows([]); setQuickText(''); setImportResult(null) }}>확인</button>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 space-y-1">
                  <div className="font-semibold">입력 형식 (한 줄 = 한 명)</div>
                  <div className="font-mono">이름 소속 부문 성별 [포인트]</div>
                  <div className="text-amber-600 opacity-80">예) 홍길동 서울초 초등 남 100</div>
                  <div className="text-amber-600 opacity-80">부문: 초등/중등/고등/대학/일반/생활체육 · 성별: 남/여</div>
                </div>
                <textarea
                  className="w-full border rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                  rows={8}
                  placeholder={"홍길동 서울초등학교 초등 남 100\n김영희 부산중학교 중등 여 50\n이철수 대전고등학교 고등 남"}
                  value={quickText}
                  onChange={e => {
                    setQuickText(e.target.value)
                    setQuickRows(e.target.value.trim() ? parseQuickText(e.target.value) : [])
                  }}
                />
                {quickRows.length > 0 && (
                  <>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{quickRows.length}행 인식 · <span className="text-green-600 font-medium">{quickRows.filter(r => !r.error).length}행 유효</span>{quickRows.filter(r => r.error).length > 0 && <span className="text-red-500 ml-1">{quickRows.filter(r => r.error).length}행 오류</span>}</span>
                    </div>
                    <div className="border rounded-lg overflow-auto max-h-48">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="px-2 py-1.5 text-left">이름</th>
                            <th className="px-2 py-1.5 text-left">소속</th>
                            <th className="px-2 py-1.5">부문</th>
                            <th className="px-2 py-1.5">성별</th>
                            <th className="px-2 py-1.5 text-right">P</th>
                            <th className="px-2 py-1.5">상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {quickRows.map((r, i) => (
                            <tr key={i} className={r.error ? 'bg-red-50' : 'hover:bg-gray-50'}>
                              <td className="px-2 py-1 font-medium">{r.name}</td>
                              <td className="px-2 py-1 text-gray-500">{r.school}</td>
                              <td className="px-2 py-1 text-center"><span className={`badge ${divColors[r.division]}`}>{r.division}</span></td>
                              <td className="px-2 py-1 text-center">
                                <span className={r.gender === '남' ? 'text-blue-600' : 'text-pink-500'}>{r.gender}</span>
                              </td>
                              <td className="px-2 py-1 text-right text-blue-600">{r.points}</td>
                              <td className="px-2 py-1 text-center">
                                {r.error
                                  ? <span className="text-red-500 flex items-center gap-0.5 text-[10px]"><AlertCircle size={10} />{r.error}</span>
                                  : <span className="text-green-500">✓</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                <div className="flex gap-2">
                  <button
                    className="btn-primary flex-1"
                    onClick={handleQuickConfirm}
                    disabled={quickRows.filter(r => !r.error).length === 0}
                  >
                    {quickRows.filter(r => !r.error).length > 0 ? `${quickRows.filter(r => !r.error).length}명 등록` : '등록'}
                  </button>
                  <button className="btn-secondary flex-1" onClick={() => { setQuickModal(false); setQuickRows([]); setQuickText('') }}>취소</button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Mock Data Generation Modal */}
      {mockGenModal && (
        <Modal title="🎲 가상 선수 데이터 생성" onClose={() => setMockGenModal(false)}>
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-700 space-y-1">
              <div className="font-semibold">테스트용 가상 선수를 자동 생성합니다</div>
              <div className="text-xs text-purple-600">초등~생활체육 6개 부문, 남녀 균형 배분, 포인트/Elo 자동 계산</div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">생성 인원 (최대 1000명)</label>
              <div className="flex gap-2">
                {[100, 200, 500, 1000].map(n => (
                  <button key={n} onClick={() => setMockGenCount(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${mockGenCount === n ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                    {n}명
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-0.5">
              <div>• 기존 선수와 이름이 겹치면 건너뜁니다</div>
              <div>• 복식 페어도 함께 생성됩니다 (약 65쌍)</div>
              <div>• 언제든 개별 삭제/수정 가능합니다</div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1 bg-purple-600 hover:bg-purple-700"
                onClick={() => {
                  const allPlayers = generatePlayers()
                  const ratio = mockGenCount / 1000
                  const subset = allPlayers.slice(0, Math.round(allPlayers.length * ratio))
                  const result = importPlayers(subset)
                  const newPairs = generatePairs(subset)
                  newPairs.forEach(p => addPair(p))
                  setMockGenModal(false)
                  alert(`✅ 선수 ${result.added}명 + 복식 페어 ${newPairs.length}쌍 생성 완료\n(중복 ${result.skipped}명 건너뜀)`)
                }}
              >
                {mockGenCount}명 생성하기
              </button>
              <button className="btn-secondary flex-1" onClick={() => setMockGenModal(false)}>취소</button>
            </div>
          </div>
        </Modal>
      )}

      {importModal && (
        <Modal title="CSV 일괄 선수 등록" onClose={() => { setImportModal(false); setImportRows([]); setImportResult(null) }}>
          <div className="space-y-4">
            {importResult ? (
              <div className="space-y-3">
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{importResult.added}명 등록</div>
                  {importResult.skipped > 0 && <div className="text-sm text-gray-500 mt-1">{importResult.skipped}명 중복 건너뜀</div>}
                </div>
                <button className="btn-primary w-full" onClick={() => { setImportModal(false); setImportRows([]); setImportResult(null) }}>확인</button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{importRows.length}행 인식됨 · {importRows.filter(r => !r.error).length}행 유효</span>
                  <button onClick={downloadTemplate} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Download size={11} />양식 다운로드</button>
                </div>
                <div className="border rounded-lg overflow-auto max-h-64">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-left">이름</th>
                        <th className="px-2 py-1.5 text-left">학교</th>
                        <th className="px-2 py-1.5">부문</th>
                        <th className="px-2 py-1.5">성별</th>
                        <th className="px-2 py-1.5 text-right">포인트</th>
                        <th className="px-2 py-1.5">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importRows.map((r, i) => (
                        <tr key={i} className={r.error ? 'bg-red-50' : 'hover:bg-gray-50'}>
                          <td className="px-2 py-1">{r.name}</td>
                          <td className="px-2 py-1">{r.school}</td>
                          <td className="px-2 py-1 text-center">{r.division}</td>
                          <td className="px-2 py-1 text-center">{r.gender}</td>
                          <td className="px-2 py-1 text-right">{r.points}</td>
                          <td className="px-2 py-1 text-center">
                            {r.error
                              ? <span className="text-red-500 flex items-center gap-0.5"><AlertCircle size={10} />{r.error}</span>
                              : <span className="text-green-500">✓</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-400">CSV 형식: 이름,학교,부문(초등/중등/고등/대학/일반/생활체육),성별(남/여),포인트</p>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={handleImportConfirm} disabled={importRows.filter(r => !r.error).length === 0}>
                    유효한 {importRows.filter(r => !r.error).length}명 등록
                  </button>
                  <button className="btn-secondary flex-1" onClick={() => { setImportModal(false); setImportRows([]) }}>취소</button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>
  if (rank === 2) return <span className="text-lg">🥈</span>
  if (rank === 3) return <span className="text-lg">🥉</span>
  return <span className="text-sm font-semibold text-gray-400 w-6 inline-block text-center">{rank}</span>
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1">{label}</label>
      {children}
    </div>
  )
}

function PlayerStatsModal({ player, tournaments, scoreRecords, pMap, onClose, onSave }: {
  player: Player
  tournaments: Tournament[]
  scoreRecords: ScoreRecord[]
  pMap: Record<string, string>
  onClose: () => void
  onSave?: (updates: Partial<Player>) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(player.name)
  const [editSchool, setEditSchool] = useState(player.school)
  const [editDiv, setEditDiv] = useState<Division>(player.division)
  const [editGender, setEditGender] = useState<'남' | '여'>(player.gender as '남' | '여')

  function saveEdit() {
    if (!editName.trim()) return
    onSave?.({ name: editName.trim(), school: editSchool.trim(), division: editDiv, gender: editGender })
    setEditing(false)
  }

  const playerRecords = scoreRecords.filter(r => r.participant1Id === player.id || r.participant2Id === player.id)
  const recentRecords = [...playerRecords].reverse().slice(0, 20)

  const tourMatches = tournaments.flatMap(t =>
    t.events.flatMap(ev =>
      ev.matches
        .filter(m => m.result && !m.isBye && (m.participant1Id === player.id || m.participant2Id === player.id))
        .map(m => ({ match: m, tournamentName: t.name, eventLabel: ev.label }))
    )
  ).reverse().slice(0, 20)

  const rLabel = getRatingLabel(player.rating ?? 1000)

  function handleExportCSV() {
    const rows: string[] = ['﻿유형,상대,결과,점수,대회/종목,날짜']
    tourMatches.forEach(({ match, tournamentName, eventLabel }) => {
      const oppId = match.participant1Id === player.id ? match.participant2Id! : match.participant1Id!
      const oppName = pMap[oppId] ?? '?'
      const isWin = match.result?.winnerId === player.id
      const score = match.result?.sets?.map(([a, b]) => `${a}-${b}`).join(' ') ?? `${match.result?.winnerScore ?? 0}-${match.result?.loserScore ?? 0}`
      rows.push(`대회,"${oppName}",${isWin ? '승' : '패'},"${score}","${tournamentName} ${eventLabel}",`)
    })
    recentRecords.forEach(r => {
      const isP1 = r.participant1Id === player.id
      const oppId = isP1 ? r.participant2Id : r.participant1Id
      const oppName = pMap[oppId] ?? '?'
      const myScore = isP1 ? r.p1Score : r.p2Score
      const oppScore = isP1 ? r.p2Score : r.p1Score
      const date = new Date(r.recordedAt).toLocaleDateString('ko-KR')
      rows.push(`점수기록,"${oppName}",${myScore > oppScore ? '승' : '패'},${myScore}-${oppScore},,${date}`)
    })
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${player.name}_전적_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><BarChart2 size={16} /> {player.name} 전적</h3>
          <div className="flex items-center gap-2">
            {onSave && !editing && (
              <button onClick={() => setEditing(true)} className="btn-secondary flex items-center gap-1 text-xs py-1 px-2">
                <Edit2 size={12} /> 편집
              </button>
            )}
            {(tourMatches.length > 0 || recentRecords.length > 0) && !editing && (
              <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1 text-xs py-1 px-2">
                <Download size={12} /> CSV
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>

        {/* Player info / edit form */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">이름 *</label>
                  <input className="input w-full text-sm" value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">소속</label>
                  <input className="input w-full text-sm" value={editSchool} onChange={e => setEditSchool(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">부문</label>
                  <select className="input w-full text-sm" value={editDiv} onChange={e => setEditDiv(e.target.value as Division)}>
                    {(['초등','중등','고등','대학','일반','생활체육'] as Division[]).map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">성별</label>
                  <select className="input w-full text-sm" value={editGender} onChange={e => setEditGender(e.target.value as '남'|'여')}>
                    <option value="남">남</option>
                    <option value="여">여</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditing(false)} className="btn-secondary flex-1 text-sm">취소</button>
                <button onClick={saveEdit} disabled={!editName.trim()} className="btn-primary flex-1 text-sm disabled:opacity-40">저장</button>
              </div>
            </div>
          ) : (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
              {player.name[0]}
            </div>
            <div className="flex-1">
              <div className="font-bold text-lg">{player.name}</div>
              <div className="text-sm text-gray-500">{player.school} · {player.division} · {player.gender}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-blue-600 text-lg">{player.points.toLocaleString()}P</div>
              <div className={`text-xs px-2 py-0.5 rounded-full ${rLabel.bg} ${rLabel.color}`}>{player.rating ?? 1000} ({rLabel.label})</div>
            </div>
          </div>
          )}
          {!editing && (
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <div className="bg-white rounded-lg p-2">
              <div className="font-bold text-green-600 text-lg">{player.wins}</div>
              <div className="text-xs text-gray-400">승</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="font-bold text-red-500 text-lg">{player.losses}</div>
              <div className="text-xs text-gray-400">패</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="font-bold text-gray-700 text-lg">{player.wins + player.losses > 0 ? Math.round(player.wins / (player.wins + player.losses) * 100) : 0}%</div>
              <div className="text-xs text-gray-400">승률</div>
            </div>
          </div>
          )}
        </div>

        {/* Tournament match history */}
        {tourMatches.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-sm text-gray-700 mb-2">대회 경기 기록</h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {tourMatches.map(({ match, tournamentName, eventLabel }, idx) => {
                const isP1 = match.participant1Id === player.id
                const oppId = isP1 ? match.participant2Id! : match.participant1Id!
                const oppName = pMap[oppId] ?? '?'
                const isWin = match.result?.winnerId === player.id
                const setStr = match.result?.sets?.map(([a, b]) => `${a}-${b}`).join(' ') ?? `${match.result?.winnerScore ?? 0}-${match.result?.loserScore ?? 0}`
                return (
                  <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${isWin ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <span className={`font-bold text-xs px-2 py-0.5 rounded flex-shrink-0 ${isWin ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}`}>
                      {isWin ? '승' : '패'}
                    </span>
                    <span className="flex-1 font-medium truncate">vs {oppName}</span>
                    <span className="text-xs text-gray-400 truncate">{tournamentName} {eventLabel}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{setStr}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Score records */}
        {recentRecords.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm text-gray-700 mb-2">점수 기록</h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {recentRecords.map(r => {
                const isP1 = r.participant1Id === player.id
                const oppId = isP1 ? r.participant2Id : r.participant1Id
                const oppName = pMap[oppId] ?? '?'
                const myScore = isP1 ? r.p1Score : r.p2Score
                const oppScore = isP1 ? r.p2Score : r.p1Score
                const isWin = myScore > oppScore
                return (
                  <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${isWin ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <span className={`font-bold text-xs px-2 py-0.5 rounded flex-shrink-0 ${isWin ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}`}>
                      {isWin ? '승' : '패'}
                    </span>
                    <span className="flex-1 font-medium truncate">vs {oppName}</span>
                    <span className="text-xs font-medium">{myScore} - {oppScore}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{new Date(r.recordedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tourMatches.length === 0 && recentRecords.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">아직 경기 기록이 없습니다</p>
        )}
      </div>
    </div>
  )
}

function PairStatsModal({ pair, tournaments, scoreRecords, pMap, onClose }: {
  pair: Pair
  tournaments: Tournament[]
  scoreRecords: ScoreRecord[]
  pMap: Record<string, string>
  onClose: () => void
}) {
  const pairRecords = scoreRecords.filter(r => r.participant1Id === pair.id || r.participant2Id === pair.id)
  const recentRecords = [...pairRecords].reverse().slice(0, 20)

  const tourMatches = tournaments.flatMap(t =>
    t.events.flatMap(ev =>
      ev.matches
        .filter(m => m.result && !m.isBye && (m.participant1Id === pair.id || m.participant2Id === pair.id))
        .map(m => ({ match: m, tournamentName: t.name, eventLabel: ev.label }))
    )
  ).reverse().slice(0, 20)

  function handleExportCSV() {
    const rows: string[] = ['﻿유형,상대,결과,점수,대회/종목,날짜']
    tourMatches.forEach(({ match, tournamentName, eventLabel }) => {
      const oppId = match.participant1Id === pair.id ? match.participant2Id! : match.participant1Id!
      const oppName = pMap[oppId] ?? '?'
      const isWin = match.result?.winnerId === pair.id
      const score = match.result?.sets?.map(([a, b]) => `${a}-${b}`).join(' ') ?? `${match.result?.winnerScore ?? 0}-${match.result?.loserScore ?? 0}`
      rows.push(`대회,"${oppName}",${isWin ? '승' : '패'},"${score}","${tournamentName} ${eventLabel}",`)
    })
    recentRecords.forEach(r => {
      const isP1 = r.participant1Id === pair.id
      const oppId = isP1 ? r.participant2Id : r.participant1Id
      const oppName = pMap[oppId] ?? '?'
      const myScore = isP1 ? r.p1Score : r.p2Score
      const oppScore = isP1 ? r.p2Score : r.p1Score
      const date = new Date(r.recordedAt).toLocaleDateString('ko-KR')
      rows.push(`점수기록,"${oppName}",${myScore > oppScore ? '승' : '패'},${myScore}-${oppScore},,${date}`)
    })
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${pair.name}_전적_${new Date().toISOString().split('T')[0]}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><BarChart2 size={16} /> {pair.name} 전적</h3>
          <div className="flex items-center gap-2">
            {(tourMatches.length > 0 || recentRecords.length > 0) && (
              <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1 text-xs py-1 px-2">
                <Download size={12} /> CSV
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xl font-bold">
              {pair.name[0]}
            </div>
            <div className="flex-1">
              <div className="font-bold text-lg">{pair.name}</div>
              <div className="text-sm text-gray-500">{pair.school} · {pair.division} · {pair.gender === '남' ? '남복' : pair.gender === '여' ? '여복' : '혼복'}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-blue-600 text-lg">{pair.points.toLocaleString()}P</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4 text-center">
            <div className="bg-white rounded-lg p-2">
              <div className="font-bold text-green-600 text-lg">{pair.wins}</div>
              <div className="text-xs text-gray-400">승</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="font-bold text-red-500 text-lg">{pair.losses}</div>
              <div className="text-xs text-gray-400">패</div>
            </div>
            <div className="bg-white rounded-lg p-2">
              <div className="font-bold text-gray-700 text-lg">{pair.wins + pair.losses > 0 ? Math.round(pair.wins / (pair.wins + pair.losses) * 100) : 0}%</div>
              <div className="text-xs text-gray-400">승률</div>
            </div>
          </div>
        </div>

        {tourMatches.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-sm text-gray-700 mb-2">대회 경기 기록</h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {tourMatches.map(({ match, tournamentName, eventLabel }, idx) => {
                const oppId = match.participant1Id === pair.id ? match.participant2Id! : match.participant1Id!
                const oppName = pMap[oppId] ?? '?'
                const isWin = match.result?.winnerId === pair.id
                const setStr = match.result?.sets?.map(([a, b]) => `${a}-${b}`).join(' ') ?? `${match.result?.winnerScore ?? 0}-${match.result?.loserScore ?? 0}`
                return (
                  <div key={idx} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${isWin ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <span className={`font-bold text-xs px-2 py-0.5 rounded flex-shrink-0 ${isWin ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}`}>{isWin ? '승' : '패'}</span>
                    <span className="flex-1 font-medium truncate">vs {oppName}</span>
                    <span className="text-xs text-gray-400 truncate">{tournamentName} {eventLabel}</span>
                    <span className="text-xs text-gray-500 flex-shrink-0">{setStr}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {recentRecords.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm text-gray-700 mb-2">점수 기록</h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {recentRecords.map(r => {
                const isP1 = r.participant1Id === pair.id
                const oppId = isP1 ? r.participant2Id : r.participant1Id
                const oppName = pMap[oppId] ?? '?'
                const myScore = isP1 ? r.p1Score : r.p2Score
                const oppScore = isP1 ? r.p2Score : r.p1Score
                const isWin = myScore > oppScore
                return (
                  <div key={r.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${isWin ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <span className={`font-bold text-xs px-2 py-0.5 rounded flex-shrink-0 ${isWin ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}`}>{isWin ? '승' : '패'}</span>
                    <span className="flex-1 font-medium truncate">vs {oppName}</span>
                    <span className="text-xs font-medium">{myScore} - {oppScore}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{new Date(r.recordedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tourMatches.length === 0 && recentRecords.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">아직 경기 기록이 없습니다</p>
        )}
      </div>
    </div>
  )
}
