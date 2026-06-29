import { useState, useMemo, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  const [hideZeroPoints, setHideZeroPoints] = useState(false)
  const [groupBySchool, setGroupBySchool] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('search') ?? ''
  function setSearch(val: string) {
    setSearchParams(val ? { search: val } : {}, { replace: true })
  }

  function highlight(text: string) {
    if (!search) return <>{text}</>
    const idx = text.toLowerCase().indexOf(search.toLowerCase())
    if (idx === -1) return <>{text}</>
    return <>{text.slice(0, idx)}<mark className="bg-yellow-200 rounded-sm">{text.slice(idx, idx + search.length)}</mark>{text.slice(idx + search.length)}</>
  }

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
  const [selectedRow, setSelectedRow] = useState<string | null>(null)
  const [selectedDiv, setSelectedDiv] = useState<Division | null>(null)
  const [mvpSlideIdx, setMvpSlideIdx] = useState(0)
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
    let list = [...players]
    if (tournamentParticipantIds) list = list.filter(p => tournamentParticipantIds.has(p.id))
    if (rankView === '남자') list = list.filter(p => p.gender === '남')
    else if (rankView === '여자') list = list.filter(p => p.gender === '여')
    else if (isDivView) {
      list = list.filter(p => p.division === rankView)
      if (subGender !== 'all') list = list.filter(p => p.gender === subGender)
    }
    if (selectedDiv) list = list.filter(p => p.division === selectedDiv)
    if (search) list = list.filter(p => p.name.includes(search) || p.school.includes(search))
    if (filterCheckIn === 'checked') list = list.filter(p => p.checkedIn)
    else if (filterCheckIn === 'unchecked') list = list.filter(p => !p.checkedIn)
    if (hideZeroPoints) list = list.filter(p => p.points > 0)
    return list.sort((a, b) =>
      sortBy === 'elo' ? (b.rating ?? 1000) - (a.rating ?? 1000)
      : sortBy === 'wins' ? b.wins - a.wins
      : b.points - a.points
    )
  }, [players, rankView, subGender, sortBy, search, filterCheckIn, hideZeroPoints, isDivView, tournamentParticipantIds, selectedDiv])

  const totalPages = Math.ceil(filteredPlayers.length / PAGE_SIZE)
  const pagedPlayers = filteredPlayers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const todayPlayerMatchCount = useMemo(() => {
    const todayISO = new Date().toISOString().split('T')[0]
    const m = new Map<string, number>()
    scoreRecords.filter(r => r.recordedAt?.startsWith(todayISO)).forEach(r => {
      if (r.participant1Id) m.set(r.participant1Id, (m.get(r.participant1Id) ?? 0) + 1)
      if (r.participant2Id) m.set(r.participant2Id, (m.get(r.participant2Id) ?? 0) + 1)
    })
    return m
  }, [scoreRecords])

  const todayPlayerWinLoss = useMemo(() => {
    const todayISO = new Date().toISOString().split('T')[0]
    const m = new Map<string, { wins: number; losses: number }>()
    scoreRecords.filter(r => r.recordedAt?.startsWith(todayISO)).forEach(r => {
      const p1Won = r.p1Score > r.p2Score
      const update = (id: string | undefined, won: boolean) => {
        if (!id) return
        const cur = m.get(id) ?? { wins: 0, losses: 0 }
        m.set(id, won ? { ...cur, wins: cur.wins + 1 } : { ...cur, losses: cur.losses + 1 })
      }
      update(r.participant1Id, p1Won)
      update(r.participant2Id, !p1Won)
    })
    return m
  }, [scoreRecords])

  const todayPlayerBestWin = useMemo(() => {
    const todayISO = new Date().toISOString().split('T')[0]
    const m = new Map<string, { s1: number; s2: number }>()
    scoreRecords.filter(r => r.recordedAt?.startsWith(todayISO)).forEach(r => {
      const diff = Math.abs(r.p1Score - r.p2Score)
      if (diff < 3) return
      const p1Won = r.p1Score > r.p2Score
      const updateWinner = (id: string | undefined, myScore: number, oppScore: number) => {
        if (!id) return
        const cur = m.get(id)
        if (!cur || myScore - oppScore > cur.s1 - cur.s2) m.set(id, { s1: myScore, s2: oppScore })
      }
      if (p1Won) updateWinner(r.participant1Id, r.p1Score, r.p2Score)
      else updateWinner(r.participant2Id, r.p2Score, r.p1Score)
    })
    return m
  }, [scoreRecords])

  const playerTrend = useMemo(() => {
    const m = new Map<string, '↑' | '↓' | '—'>()
    players.forEach(p => {
      const recs = scoreRecords
        .filter(r => r.participant1Id === p.id || r.participant2Id === p.id)
        .sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? ''))
        .slice(-3)
      if (recs.length < 2) return
      let wins = 0, losses = 0
      recs.forEach(r => {
        const isP1 = r.participant1Id === p.id
        const won = isP1 ? r.p1Score > r.p2Score : r.p2Score > r.p1Score
        if (won) wins++; else losses++
      })
      m.set(p.id, wins >= 2 ? '↑' : losses >= 2 ? '↓' : '—')
    })
    return m
  }, [players, scoreRecords])

  const pairTrend = useMemo(() => {
    const m = new Map<string, '↑' | '↓' | '—'>()
    pairs.forEach(p => {
      const recs = scoreRecords
        .filter(r => r.participant1Id === p.id || r.participant2Id === p.id)
        .sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? ''))
        .slice(-3)
      if (recs.length < 2) return
      let wins = 0, losses = 0
      recs.forEach(r => {
        const isP1 = r.participant1Id === p.id
        const won = isP1 ? r.p1Score > r.p2Score : r.p2Score > r.p1Score
        if (won) wins++; else losses++
      })
      m.set(p.id, wins >= 2 ? '↑' : losses >= 2 ? '↓' : '—')
    })
    return m
  }, [pairs, scoreRecords])

  const pairLastMatchDays = useMemo(() => {
    const todayMs = new Date().setHours(0, 0, 0, 0)
    const m = new Map<string, number>()
    pairs.forEach(p => {
      const recs = scoreRecords.filter(r => r.participant1Id === p.id || r.participant2Id === p.id)
      if (recs.length === 0) return
      const latest = recs.reduce((best, r) => (r.recordedAt ?? '') > (best.recordedAt ?? '') ? r : best)
      if (!latest.recordedAt) return
      const d = Math.round((todayMs - new Date(latest.recordedAt).setHours(0, 0, 0, 0)) / 86400000)
      m.set(p.id, d)
    })
    return m
  }, [pairs, scoreRecords])

  const pairTodayMatches = useMemo(() => {
    const todayISO = new Date().toISOString().split('T')[0]
    const m = new Map<string, number>()
    pairs.forEach(p => {
      const n = scoreRecords.filter(r => (r.participant1Id === p.id || r.participant2Id === p.id) && r.recordedAt?.startsWith(todayISO)).length
      if (n > 0) m.set(p.id, n)
    })
    return m
  }, [pairs, scoreRecords])

  const pairTodayWins = useMemo(() => {
    const todayISO = new Date().toISOString().split('T')[0]
    const m = new Map<string, number>()
    pairs.forEach(p => {
      const wins = scoreRecords.filter(r => {
        if (!r.recordedAt?.startsWith(todayISO)) return false
        const isP1 = r.participant1Id === p.id || (r.participant1Id === p.player1Id || r.participant1Id === p.player2Id)
        const isP2 = r.participant2Id === p.id || (r.participant2Id === p.player1Id || r.participant2Id === p.player2Id)
        if (!isP1 && !isP2) return false
        if (isP1) return r.p1Score > r.p2Score
        return r.p2Score > r.p1Score
      }).length
      if (wins > 0) m.set(p.id, wins)
    })
    return m
  }, [pairs, scoreRecords])

  const playerWinStreak = useMemo(() => {
    const m = new Map<string, number>()
    players.forEach(p => {
      const recs = scoreRecords
        .filter(r => r.participant1Id === p.id || r.participant2Id === p.id)
        .sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? ''))
      let streak = 0
      for (let i = recs.length - 1; i >= 0; i--) {
        const r = recs[i]
        const won = r.participant1Id === p.id ? r.p1Score > r.p2Score : r.p2Score > r.p1Score
        if (won) streak++; else break
      }
      if (streak >= 3) m.set(p.id, streak)
    })
    return m
  }, [players, scoreRecords])

  const playerBestStreak = useMemo(() => {
    const m = new Map<string, number>()
    players.forEach(p => {
      const recs = scoreRecords
        .filter(r => r.participant1Id === p.id || r.participant2Id === p.id)
        .sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? ''))
      let best = 0, cur = 0
      recs.forEach(r => {
        const won = r.participant1Id === p.id ? r.p1Score > r.p2Score : r.p2Score > r.p1Score
        if (won) { cur++; if (cur > best) best = cur } else cur = 0
      })
      if (best >= 5) m.set(p.id, best)
    })
    return m
  }, [players, scoreRecords])

  const playerLoseStreak = useMemo(() => {
    const m = new Map<string, number>()
    players.forEach(p => {
      const recs = scoreRecords
        .filter(r => r.participant1Id === p.id || r.participant2Id === p.id)
        .sort((a, b) => (a.recordedAt ?? '').localeCompare(b.recordedAt ?? ''))
      let streak = 0
      for (let i = recs.length - 1; i >= 0; i--) {
        const r = recs[i]
        const won = r.participant1Id === p.id ? r.p1Score > r.p2Score : r.p2Score > r.p1Score
        if (!won) streak++; else break
      }
      if (streak >= 3) m.set(p.id, streak)
    })
    return m
  }, [players, scoreRecords])

  const lastMatchDaysAgo = useMemo(() => {
    const todayMs = new Date().setHours(0, 0, 0, 0)
    const m = new Map<string, number>()
    players.forEach(p => {
      const recs = scoreRecords.filter(r => r.participant1Id === p.id || r.participant2Id === p.id)
      if (recs.length === 0) return
      const latest = recs.reduce((best, r) => (r.recordedAt ?? '') > (best.recordedAt ?? '') ? r : best)
      const d = Math.round((todayMs - new Date(latest.recordedAt).setHours(0, 0, 0, 0)) / 86400000)
      m.set(p.id, d)
    })
    return m
  }, [players, scoreRecords])

  const playerEloDelta = useMemo(() => {
    const m = new Map<string, number>()
    players.forEach(p => {
      const recs = scoreRecords
        .filter(r => r.participant1Id === p.id || r.participant2Id === p.id)
        .sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? ''))
        .slice(0, 3)
      if (recs.length === 0) return
      let delta = 0
      recs.forEach(r => {
        const isP1 = r.participant1Id === p.id
        const won = isP1 ? r.p1Score > r.p2Score : r.p2Score > r.p1Score
        delta += won ? 10 : -10
      })
      if (delta !== 0) m.set(p.id, delta)
    })
    return m
  }, [players, scoreRecords])

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
    const header = '이름,학교,부문,성별,체크인,포인트,승,패,승률,Elo등급,등록번호,연락처,사진URL\n'
    const rows = filteredPlayers.map(p => {
      const winRate = p.wins + p.losses > 0 ? Math.round(p.wins / (p.wins + p.losses) * 100) : 0
      return `${p.name},${p.school},${p.division},${p.gender},${p.checkedIn ? 'O' : 'X'},${p.points},${p.wins},${p.losses},${winRate}%,${p.rating ?? 1000},${p.registrationNo ?? ''},${p.phone ?? ''},${p.photoUrl ?? ''}`
    }).join('\n')
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

      {/* 오늘 첫 경기 선수 칩 */}
      {tab === 'singles' && (() => {
        const todayISO = new Date().toISOString().split('T')[0]
        const todayRecs = scoreRecords.filter(r => r.recordedAt?.startsWith(todayISO))
        if (todayRecs.length < 3) return null
        const todayParticipated = new Map<string, number>()
        todayRecs.forEach(r => {
          if (r.participant1Id) todayParticipated.set(r.participant1Id, (todayParticipated.get(r.participant1Id) ?? 0) + 1)
          if (r.participant2Id) todayParticipated.set(r.participant2Id, (todayParticipated.get(r.participant2Id) ?? 0) + 1)
        })
        const firstGamers = players.filter(p => {
          const todayGames = todayParticipated.get(p.id) ?? 0
          return todayGames > 0 && (p.wins + p.losses) === todayGames
        })
        if (firstGamers.length === 0) return null
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-green-600 font-semibold flex-shrink-0">첫 경기 {firstGamers.length}명</span>
            {firstGamers.slice(0, 5).map(p => (
              <span key={p.id} className="text-[10px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">{p.name}</span>
            ))}
            {firstGamers.length > 5 && <span className="text-[10px] text-gray-400">+{firstGamers.length - 5}</span>}
          </div>
        )
      })()}

      {/* 부문 퀵 필터 — singles only */}
      {tab === 'singles' && (() => {
        const divCounts = DIVISIONS.map(d => ({ d, n: players.filter(p => p.division === d).length })).filter(x => x.n > 0)
        if (divCounts.length < 2) return null
        return (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => { setSelectedDiv(null); setPage(1) }}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${!selectedDiv ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'}`}>
              전체
            </button>
            {divCounts.map(({ d, n }) => (
              <button key={d}
                onClick={() => { setSelectedDiv(selectedDiv === d ? null : d); setPage(1) }}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${selectedDiv === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-400'}`}>
                {d} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )
      })()}

      {/* 부문별 참가자 수 파이 차트 */}
      {tab === 'singles' && (() => {
        const PIE_COLORS = ['#6366f1','#22d3ee','#f59e0b','#34d399','#f87171','#a78bfa']
        const divCounts = DIVISIONS.map((d, i) => ({ d, n: players.filter(p => p.division === d).length, color: PIE_COLORS[i % PIE_COLORS.length] })).filter(x => x.n > 0)
        const total = divCounts.reduce((s, x) => s + x.n, 0)
        if (divCounts.length < 2 || total < 10) return null
        let angle = -Math.PI / 2
        const R = 32, cx = 36, cy = 36
        const slices = divCounts.map(({ d, n, color }) => {
          const sweep = (n / total) * 2 * Math.PI
          const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle)
          angle += sweep
          const x2 = cx + R * Math.cos(angle), y2 = cy + R * Math.sin(angle)
          const large = sweep > Math.PI ? 1 : 0
          return { d, n, color, path: `M${cx},${cy} L${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} Z` }
        })
        return (
          <div className="card py-2 flex items-center gap-3">
            <svg width="72" height="72" viewBox="0 0 72 72">
              {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} opacity={0.9} />)}
            </svg>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {slices.map(s => (
                <span key={s.d} className="flex items-center gap-1 text-[11px] text-gray-600">
                  <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                  {s.d} <span className="font-semibold text-gray-800">{s.n}</span>
                </span>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Rank view selector — singles only */}
      {tab === 'singles' && (
        <div className="card space-y-3 py-3">
          <div className="flex flex-wrap gap-2 items-center">
            {/* 통합 그룹 */}
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
              {(['통합', '남자', '여자'] as const).map(v => (
                <button key={v} onClick={() => { setRankView(v); setSubGender('all'); setPage(1) }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${rankView === v ? 'bg-white shadow-sm text-blue-700 font-bold' : 'text-gray-500 hover:text-gray-700'}`}>
                  {v === '통합' ? '🏆 통합' : v === '남자' ? '👨 남자' : '👩 여자'}
                </button>
              ))}
            </div>
            {/* 부문별 */}
            {DIVISIONS.map(div => (
              <button key={div} onClick={() => { setRankView(div); setSubGender('all'); setPage(1) }}
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
      {tab === 'doubles' && (() => {
        const pairDivCounts = DIVISIONS.map(d => ({ d, n: pairs.filter(p => p.division === d).length })).filter(x => x.n > 0)
        if (pairDivCounts.length < 2) return null
        return (
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => { setFilterPairDiv('all'); setPairPage(1) }}
              className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${filterPairDiv === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-400'}`}>
              전체
            </button>
            {pairDivCounts.map(({ d, n }) => (
              <button key={d}
                onClick={() => { setFilterPairDiv(filterPairDiv === d ? 'all' : d); setPairPage(1) }}
                className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition-colors ${filterPairDiv === d ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-400'}`}>
                {d} <span className="opacity-60">{n}</span>
              </button>
            ))}
          </div>
        )
      })()}
      </div>{/* /fixed-top-bar */}

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">

      {/* 오늘의 TOP3 슬라이드쇼 */}
      {tab === 'singles' && (() => {
        const todayISO = new Date().toISOString().split('T')[0]
        const todayRecs = scoreRecords.filter(r => r.recordedAt?.startsWith(todayISO))
        if (todayRecs.length === 0) return null
        const winsMap: Record<string, number> = {}
        const lastOpp: Record<string, string> = {}
        todayRecs.forEach(r => {
          const winnerId = r.p1Score > r.p2Score ? r.participant1Id : r.participant2Id
          const loserId = r.p1Score > r.p2Score ? r.participant2Id : r.participant1Id
          if (winnerId) { winsMap[winnerId] = (winsMap[winnerId] ?? 0) + 1; lastOpp[winnerId] = loserId ?? '' }
        })
        const topIds = Object.keys(winsMap).sort((a, b) => winsMap[b] - winsMap[a]).slice(0, 3).filter(id => winsMap[id] >= 1)
        if (topIds.length === 0) return null
        const spotlightPlayers = topIds.map(id => ({ player: players.find(p => p.id === id), wins: winsMap[id], oppName: players.find(p => p.id === lastOpp[id])?.name ?? '?' })).filter(x => x.player)
        if (spotlightPlayers.length === 0) return null
        const idx = mvpSlideIdx % spotlightPlayers.length
        const { player: mvp, wins, oppName } = spotlightPlayers[idx]!
        const medals = ['🥇', '🥈', '🥉']
        return (
          <MvpSlideshow
            mvp={mvp!}
            wins={wins}
            oppName={oppName}
            medal={medals[idx]}
            rank={idx + 1}
            total={spotlightPlayers.length}
            slideIdx={idx}
            onDotClick={(i) => setMvpSlideIdx(i)}
            onStatsClick={() => setStatsModal(mvp!)}
            onAutoAdvance={() => setMvpSlideIdx(i => i + 1)}
          />
        )
      })()}

      {/* 전체 통계 요약 */}
      {tab === 'singles' && players.length >= 5 && (() => {
        const avgPts = Math.round(players.reduce((s, p) => s + p.points, 0) / players.length)
        const avgElo = Math.round(players.reduce((s, p) => s + (p.rating ?? 1000), 0) / players.length)
        const totalGames = scoreRecords.length
        return (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: '선수 수', value: players.length, color: 'bg-blue-50 text-blue-700' },
              { label: '평균 포인트', value: avgPts.toLocaleString(), color: 'bg-green-50 text-green-700' },
              { label: '평균 Elo', value: avgElo, color: 'bg-purple-50 text-purple-700' },
              { label: '총 경기', value: totalGames, color: 'bg-amber-50 text-amber-700' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl px-3 py-2 text-center ${color}`}>
                <div className="text-[10px] font-medium opacity-70">{label}</div>
                <div className="text-sm font-bold">{value}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* 검색 결과 범위 칩 */}
      {tab === 'singles' && filteredPlayers.length !== players.length && (search || filterCheckIn !== 'all' || selectedDiv !== null || hideZeroPoints) && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {filteredPlayers.length}명 검색됨 (전체 {players.length}명 중)
          </span>
        </div>
      )}

      {/* 성별 분포 칩 */}
      {tab === 'singles' && (() => {
        const male = filteredPlayers.filter(p => p.gender === '남').length
        const female = filteredPlayers.filter(p => p.gender === '여').length
        if (male < 1 || female < 1) return null
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-medium">♂ 남 {male}명</span>
            <span className="text-[11px] bg-pink-50 text-pink-600 border border-pink-200 px-2 py-0.5 rounded-full font-medium">♀ 여 {female}명</span>
          </div>
        )
      })()}

      {/* 포인트 분포 히스토그램 */}
      {tab === 'singles' && players.length >= 2 && (() => {
        const pts = players.map(p => p.points).filter(v => v > 0)
        if (pts.length < 2) return null
        const mn = Math.min(...pts), mx = Math.max(...pts)
        if (mn === mx) return null
        const step = Math.ceil((mx - mn + 1) / 5)
        const bins = Array.from({ length: 5 }, (_, i) => {
          const lo = mn + i * step, hi = lo + step - 1
          return { lo, hi, count: pts.filter(v => v >= lo && v <= hi).length }
        })
        const maxCount = Math.max(...bins.map(b => b.count), 1)
        return (
          <div className="card py-3">
            <div className="text-xs text-gray-500 font-medium mb-2">포인트 분포</div>
            <div className="flex items-end gap-1.5 h-10">
              {bins.map((b, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="w-full bg-blue-400 rounded-sm" style={{ height: `${Math.max(4, Math.round(b.count / maxCount * 36))}px` }} />
                  <span className="text-[9px] text-gray-400 truncate w-full text-center">{b.lo}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
              <span>{mn}P</span><span>{mx}P</span>
            </div>
          </div>
        )
      })()}

      {/* Singles Table */}
      {tab === 'singles' && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between gap-2 flex-wrap">
            <span className="font-semibold text-gray-700 text-sm">{rankTitle}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={hideZeroPoints} onChange={e => { setHideZeroPoints(e.target.checked); setPage(1) }} className="rounded" />
                포인트 없는 선수 숨기기
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
                <input type="checkbox" checked={groupBySchool} onChange={e => setGroupBySchool(e.target.checked)} className="rounded" />
                학교별 보기
              </label>
              <span className="text-xs text-gray-400">{filteredPlayers.length}명 · {sortBy === 'elo' ? 'Elo 순' : '포인트 순'}</span>
            </div>
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
                {groupBySchool && (() => {
                  const schools = [...new Map(filteredPlayers.map(p => [p.school || '(미입력)', p])).keys()].sort()
                  const bySchool = new Map(schools.map(s => [s, filteredPlayers.filter(p => (p.school || '(미입력)') === s)]))
                  return Array.from(bySchool.entries()).flatMap(([school, sPlayers]) => [
                    <tr key={`hdr-${school}`} className="bg-blue-50 border-b border-blue-100">
                      <td colSpan={9} className="py-1.5 px-4 text-xs font-semibold text-blue-700">{school} ({sPlayers.length}명)</td>
                    </tr>,
                    ...sPlayers.map((p, idx) => {
                      const rank = filteredPlayers.indexOf(p) + 1
                      return (
                        <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-2 px-4 text-center text-xs text-gray-400">{rank}</td>
                          <td className="py-2 px-4 font-medium text-gray-800">{highlight(p.name)}</td>
                          <td className="py-2 px-4 text-xs text-gray-500">{highlight(p.school ?? '')}</td>
                          <td colSpan={2} />
                          <td className="py-2 px-4 text-right font-bold text-blue-600">{p.points}</td>
                          <td className="py-2 px-4 text-right text-xs text-gray-400">{p.rating ?? 1000}</td>
                          <td className="py-2 px-4 text-center text-xs text-gray-400">{p.wins}/{p.losses}</td>
                          <td />
                        </tr>
                      )
                    })
                  ])
                })()}
                {!groupBySchool && pagedPlayers.map((p, i) => {
                  const globalRank = (page - 1) * PAGE_SIZE + i + 1
                  const rLabel = getRatingLabel(p.rating ?? 1000)
                  const showDiv = rankView === '통합' || rankView === '남자' || rankView === '여자'
                  const showGender = rankView === '통합' || isDivView
                  const anyChecked = players.some(pl => pl.checkedIn)
                  return (
                  <tr key={p.id}
                    tabIndex={0}
                    onFocus={() => setSelectedRow(p.id)}
                    onBlur={() => setSelectedRow(null)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setStatsModal(p); return }
                      if (e.key === 'ArrowDown') { e.preventDefault(); const next = pagedPlayers[i + 1]; if (next) { setSelectedRow(next.id); (e.currentTarget.nextElementSibling as HTMLElement)?.focus() } }
                      if (e.key === 'ArrowUp') { e.preventDefault(); const prev = pagedPlayers[i - 1]; if (prev) { setSelectedRow(prev.id); (e.currentTarget.previousElementSibling as HTMLElement)?.focus() } }
                    }}
                    className={`border-b last:border-0 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-300 ${selectedRow === p.id ? 'bg-blue-50' : globalRank === 1 ? 'bg-amber-50 ring-1 ring-amber-300 ring-inset' : globalRank <= 3 ? 'bg-yellow-50/20' : anyChecked && !p.checkedIn ? 'bg-orange-50' : ''}`}>
                    <td className="py-3 px-4 text-center"><RankIcon rank={globalRank} /></td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {p.photoUrl
                          ? <img src={p.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                          : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400 flex-shrink-0 font-bold">{p.name[0]}</div>
                        }
                        <button
                          onClick={() => setStatsModal(p)}
                          className={`font-medium text-left hover:text-blue-600 hover:underline underline-offset-2 transition-colors ${globalRank === 1 ? 'font-bold text-amber-700' : ''}`}
                        >{globalRank === 1 && <span className="mr-0.5">👑</span>}{highlight(p.name)}</button>
                        {p.checkedIn && <CheckCircle size={11} className="text-green-500 flex-shrink-0" title="체크인 완료" />}
                        {(() => {
                          const wl = todayPlayerWinLoss.get(p.id)
                          if (!wl) return null
                          const total = wl.wins + wl.losses
                          if (total === 0) return null
                          return (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium flex-shrink-0 flex items-center gap-0.5">
                              오늘
                              {wl.wins > 0 && <span className="text-green-600 font-bold">{wl.wins}승</span>}
                              {wl.losses > 0 && <span className="text-red-500 font-bold">{wl.losses}패</span>}
                            </span>
                          )
                        })()}
                        {(() => {
                          const streak = playerWinStreak.get(p.id)
                          if (!streak) return null
                          return (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold flex-shrink-0">
                              🔥{streak}연승
                            </span>
                          )
                        })()}
                        {(() => {
                          const best = playerBestStreak.get(p.id)
                          if (!best) return null
                          return (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-300 font-bold flex-shrink-0">
                              🏆{best}연승최고
                            </span>
                          )
                        })()}
                        {(() => {
                          const ls = playerLoseStreak.get(p.id)
                          if (!ls) return null
                          return (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-bold flex-shrink-0">
                              ⚠ {ls}연패 중
                            </span>
                          )
                        })()}
                        {(() => {
                          const bw = todayPlayerBestWin.get(p.id)
                          if (!bw) return null
                          return (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 font-bold flex-shrink-0">
                              압도 {bw.s1}-{bw.s2}
                            </span>
                          )
                        })()}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500 max-w-[120px] truncate" title={p.school}>{highlight(p.school)}</td>
                    {showDiv && <td className="py-3 px-4"><span className={`badge ${divColors[p.division]}`}>{p.division}</span></td>}
                    {showGender && (
                      <td className="py-3 px-4 text-center">
                        <span className={`badge ${p.gender === '남' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'}`}>{p.gender}</span>
                      </td>
                    )}
                    <td className="py-3 px-4 text-right">
                      <span className="font-bold text-blue-600 text-base">{p.points.toLocaleString()}</span>
                      <span className="text-xs text-gray-400 ml-1">P</span>
                      {(() => { const t = playerTrend.get(p.id); return t ? <span className={`ml-1 text-xs font-bold ${t === '↑' ? 'text-green-500' : t === '↓' ? 'text-red-500' : 'text-gray-300'}`}>{t}</span> : null })()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-sm font-bold ${rLabel.color}`}>{p.rating ?? '-'}</span>
                          {(() => { const d = playerEloDelta.get(p.id); if (!d) return null; return <span className={`text-[10px] font-semibold ${d > 0 ? 'text-green-500' : 'text-red-500'}`}>{d > 0 ? `+${d}` : d}</span> })()}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${rLabel.bg} ${rLabel.color}`}>{rLabel.label}</span>
                        {(() => {
                          const recs = scoreRecords.filter(r => r.participant1Id === p.id || r.participant2Id === p.id).sort((a, b) => (b.recordedAt ?? '').localeCompare(a.recordedAt ?? '')).slice(0, 5)
                          if (recs.length < 1) return null
                          return (
                            <div className="flex items-center gap-0.5 mt-0.5">
                              {recs.map((r, i) => {
                                const won = r.participant1Id === p.id ? r.p1Score > r.p2Score : r.p2Score > r.p1Score
                                return <span key={i} className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${won ? 'bg-green-400' : 'bg-red-400'}`} />
                              })}
                            </div>
                          )
                        })()}
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
                      {(() => { const d = lastMatchDaysAgo.get(p.id); if (d === undefined) return null; return <span className="ml-1 text-[10px] text-gray-400">{d === 0 ? '오늘' : `${d}일 전`}</span> })()}
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
                {!groupBySchool && pagedPlayers.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-10 text-center">
                      {search || filterCheckIn !== 'all' ? (
                        <div className="space-y-2">
                          <div className="text-gray-400 text-sm">검색 결과가 없습니다</div>
                          <button onClick={() => { setSearch(''); setFilterCheckIn('all') }}
                            className="text-xs text-blue-500 hover:text-blue-700 underline">필터 초기화</button>
                        </div>
                      ) : (
                        <span className="text-gray-400">선수가 없습니다</span>
                      )}
                    </td>
                  </tr>
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

      {tab === 'singles' && (() => {
        const divBar: Record<string, string> = {
          초등: 'bg-yellow-400', 중등: 'bg-green-400', 고등: 'bg-blue-400',
          대학: 'bg-purple-400', 일반: 'bg-gray-400', 생활체육: 'bg-orange-400',
        }
        const withPts = players.filter(p => p.points > 0)
        if (withPts.length < 3) return null
        const divAvg = DIVISIONS.map(div => {
          const pp = withPts.filter(p => p.division === div)
          return { div, avg: pp.length > 0 ? Math.round(pp.reduce((s, p) => s + p.points, 0) / pp.length) : 0, cnt: pp.length }
        }).filter(d => d.cnt > 0)
        if (divAvg.length < 2) return null
        const maxAvg = Math.max(...divAvg.map(d => d.avg))
        return (
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <BarChart2 size={13} className="text-indigo-500" /> 부서별 평균 포인트
            </h3>
            <div className="space-y-1">
              {divAvg.map(({ div, avg, cnt }) => (
                <div key={div} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-600 w-16 flex-shrink-0">{div} ({cnt})</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${divBar[div] ?? 'bg-gray-400'}`} style={{ width: `${Math.round(avg / maxAvg * 100)}%` }} />
                  </div>
                  <span className="text-[11px] text-gray-500 w-12 text-right flex-shrink-0">{avg}pt</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {tab === 'singles' && (() => {
        const schoolMap = new Map<string, number>()
        players.forEach(p => { const s = p.school || '(미입력)'; schoolMap.set(s, (schoolMap.get(s) ?? 0) + 1) })
        if (schoolMap.size < 3) return null
        const top5 = [...schoolMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).filter(([, n]) => n >= 2)
        if (top5.length < 3) return null
        const maxN = top5[0][1]
        return (
          <div className="card">
            <div className="text-xs font-semibold text-gray-600 mb-2">학교별 참가자 수 TOP{top5.length}</div>
            <div className="space-y-1.5">
              {top5.map(([school, cnt]) => (
                <div key={school} className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-600 w-24 truncate flex-shrink-0">{school}</span>
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-400 rounded-full transition-all" style={{ width: `${Math.round(cnt / maxN * 100)}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-violet-700 w-6 text-right flex-shrink-0">{cnt}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Doubles / Pairs Table */}
      {tab === 'doubles' && (() => {
        const nanBok = filteredPairs.filter(p => p.gender === '남').length
        const yeoBok = filteredPairs.filter(p => p.gender === '여').length
        const honBok = filteredPairs.filter(p => p.gender !== '남' && p.gender !== '여').length
        const typeCount = (nanBok > 0 ? 1 : 0) + (yeoBok > 0 ? 1 : 0) + (honBok > 0 ? 1 : 0)
        return (
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-700 text-sm">복식 페어 랭킹</span>
              {typeCount >= 2 && (
                <>
                  {nanBok > 0 && <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">♂ 남복 {nanBok}</span>}
                  {yeoBok > 0 && <span className="text-[10px] bg-pink-50 text-pink-600 border border-pink-200 px-1.5 py-0.5 rounded-full font-medium">♀ 여복 {yeoBok}</span>}
                  {honBok > 0 && <span className="text-[10px] bg-purple-50 text-purple-600 border border-purple-200 px-1.5 py-0.5 rounded-full font-medium">⚤ 혼복 {honBok}</span>}
                </>
              )}
              <span className="text-xs text-gray-400 ml-auto">{filteredPairs.length}페어 · 포인트 순</span>
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
                    <td className="py-3 px-4 font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{p.name}</span>
                        {(() => {
                          const pt = p.gender === '남' ? '남복' : p.gender === '여' ? '여복' : '혼복'
                          const cls = pt === '남복' ? 'bg-blue-50 text-blue-600 border-blue-200' : pt === '여복' ? 'bg-pink-50 text-pink-600 border-pink-200' : 'bg-purple-50 text-purple-600 border-purple-200'
                          const icon = pt === '남복' ? '♂' : pt === '여복' ? '♀' : '⚤'
                          return <span className={`text-[9px] px-1 py-0.5 rounded border font-bold flex-shrink-0 ${cls}`}>{icon} {pt}</span>
                        })()}
                      </div>
                      {(() => {
                        const pl1 = players.find(pl => pl.id === p.player1Id)
                        const pl2 = players.find(pl => pl.id === p.player2Id)
                        if (!pl1 && !pl2) return null
                        const both = pl1?.checkedIn && pl2?.checkedIn
                        const none = !pl1?.checkedIn && !pl2?.checkedIn
                        return (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${both ? 'bg-green-100 text-green-700' : none ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>
                            {both ? '✓ 체크인' : none ? '✗ 미체크인' : '△ 일부'}
                          </span>
                        )
                      })()}
                    </td>
                    <td className="py-3 px-4 text-gray-500 text-xs max-w-[120px] truncate" title={p.school}>{p.school}</td>
                    <td className="py-3 px-4"><span className={`badge ${divColors[p.division]}`}>{p.division}</span></td>
                    <td className="py-3 px-4 text-center">
                      <span className={`badge ${p.gender === '남' ? 'bg-blue-50 text-blue-600' : p.gender === '여' ? 'bg-pink-50 text-pink-600' : 'bg-purple-50 text-purple-600'}`}>
                        {p.gender === '남' ? '남복' : p.gender === '여' ? '여복' : '혼복'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="font-bold text-blue-600">{p.points.toLocaleString()}</span>
                      <span className="text-xs text-gray-400 ml-1">P</span>
                      {(() => { const t = pairTrend.get(p.id); return t ? <span className={`ml-1 text-xs font-bold ${t === '↑' ? 'text-green-500' : t === '↓' ? 'text-red-500' : 'text-gray-300'}`}>{t}</span> : null })()}
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
                      {pairLastMatchDays.has(p.id) && (
                        <div className="text-[9px] text-gray-400 mt-0.5">{pairLastMatchDays.get(p.id) === 0 ? '오늘' : `${pairLastMatchDays.get(p.id)}일 전`}</div>
                      )}
                      {pairTodayMatches.has(p.id) && (
                        <div className="mt-0.5"><span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium">오늘 {pairTodayMatches.get(p.id)}경기</span></div>
                      )}
                      {pairTodayWins.has(p.id) && (
                        <div className="mt-0.5"><span className="text-[9px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-full font-bold">오늘 {pairTodayWins.get(p.id)}승</span></div>
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
        )
      })()}

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
          const isSelected = selectedDiv === div
          return (
            <div key={div}
              onClick={() => { setTab('singles'); setRankView(div); setSubGender('all'); setPage(1); setSelectedDiv(isSelected ? null : div) }}
              className={`card text-center py-3 cursor-pointer transition-all hover:shadow-md border-2 ${isSelected ? divBorder[div] + ' ring-2 ring-offset-1 ring-blue-300' : isActive ? divBorder[div] : 'border-transparent'}`}>
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

      {/* Division TOP3 mini-panel */}
      {selectedDiv && (() => {
        const dp = players.filter(p => p.division === selectedDiv).sort((a, b) => b.points - a.points)
        if (dp.length === 0) return null
        const top3 = dp.slice(0, 3)
        const medals = ['🥇', '🥈', '🥉']
        return (
          <div className={`card border-2 ${divBorder[selectedDiv]} py-3`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`badge ${divColors[selectedDiv]}`}>{selectedDiv} TOP {Math.min(3, dp.length)}</span>
              <span className="text-[10px] text-gray-400">포인트 기준 · {dp.length}명 중</span>
              <button onClick={() => setSelectedDiv(null)} className="ml-auto text-gray-300 hover:text-gray-500 text-xs">✕</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {top3.map((p, i) => (
                <div key={p.id}
                  onClick={e => { e.stopPropagation(); setStatsModal(p) }}
                  className="rounded-xl bg-white border border-gray-100 p-2 text-center cursor-pointer hover:shadow-sm transition-shadow">
                  <div className="text-lg">{medals[i]}</div>
                  <div className="font-bold text-sm text-gray-800 truncate">{p.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">{p.school}</div>
                  <div className="text-xs font-black text-blue-600 mt-0.5">{p.points.toLocaleString()}P</div>
                  <div className="text-[10px] text-gray-400">{p.wins}승 {p.losses}패</div>
                </div>
              ))}
              {dp.length < 3 && Array.from({ length: 3 - dp.length }, (_, i) => (
                <div key={i} className="rounded-xl bg-gray-50 border border-dashed border-gray-200 p-2 flex items-center justify-center text-[10px] text-gray-300">비어있음</div>
              ))}
            </div>
          </div>
        )
      })()}
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
          players={players}
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

type MvpSlideshowProps = { mvp: Player; wins: number; oppName: string; medal: string; rank: number; total: number; slideIdx: number; onDotClick: (i: number) => void; onStatsClick: () => void; onAutoAdvance: () => void }
function MvpSlideshow({ mvp, wins, oppName, medal, rank, total, slideIdx, onDotClick, onStatsClick, onAutoAdvance }: MvpSlideshowProps) {
  useEffect(() => {
    if (total < 2) return
    const t = setInterval(onAutoAdvance, 2000)
    return () => clearInterval(t)
  }, [total, onAutoAdvance])
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl">
      <span className="text-2xl">{medal}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-[10px] font-bold text-yellow-600 tracking-wide">오늘의 TOP{rank}</div>
          {total > 1 && (
            <div className="flex gap-0.5 ml-1">
              {Array.from({ length: total }, (_, i) => (
                <button key={i} onClick={() => onDotClick(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === slideIdx ? 'bg-amber-500' : 'bg-amber-200 hover:bg-amber-300'}`} />
              ))}
            </div>
          )}
        </div>
        <div className="font-bold text-gray-800">{mvp.name}
          <span className="text-xs text-gray-400 font-normal ml-2">{mvp.school} · {mvp.division}</span>
        </div>
        <div className="text-xs text-gray-500">오늘 {wins}승 · 최근 vs {oppName}</div>
      </div>
      <button onClick={onStatsClick} className="text-xs bg-yellow-100 text-yellow-700 hover:bg-yellow-200 px-2 py-1 rounded-lg font-medium border border-yellow-200">
        전적 보기
      </button>
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

  function handlePrint() {
    const style = document.createElement('style')
    style.id = '__player-print-style'
    style.textContent = '@media print { body * { visibility: hidden !important; } #player-stats-modal-inner, #player-stats-modal-inner * { visibility: visible !important; } #player-stats-modal-inner { position: fixed !important; inset: 0 !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; border-radius: 0 !important; } }'
    document.head.appendChild(style)
    window.print()
    setTimeout(() => document.getElementById('__player-print-style')?.remove(), 1000)
  }

  function handleExportCSV() {
    const rows: string[] = ['﻿유형,상대,결과,점수,대회/종목,날짜']
    tourMatches.forEach(({ match, tournamentName, eventLabel }) => {
      const oppId = match.participant1Id === player.id ? match.participant2Id! : match.participant1Id!
      const oppName = pMap[oppId] ?? '?'
      const isWin = match.result?.winnerId === player.id
      const score = match.result?.sets?.map(([a, b]) => `${a}-${b}`).join(' ') ?? `${match.result?.winnerScore ?? 0}-${match.result?.loserScore ?? 0}`
      const tourDate = tournaments.find(t => t.name === tournamentName)?.date ?? ''
      rows.push(`대회,"${oppName}",${isWin ? '승' : '패'},"${score}","${tournamentName} ${eventLabel}",${tourDate}`)
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
      <div id="player-stats-modal-inner" className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><BarChart2 size={16} /> {player.name} 전적</h3>
          <div className="flex items-center gap-2">
            {onSave && !editing && (
              <button onClick={() => setEditing(true)} className="btn-secondary flex items-center gap-1 text-xs py-1 px-2">
                <Edit2 size={12} /> 편집
              </button>
            )}
            {(tourMatches.length > 0 || recentRecords.length > 0) && !editing && (
              <>
                <button onClick={handlePrint} className="btn-secondary flex items-center gap-1 text-xs py-1 px-2 no-print">
                  <Download size={12} /> PDF
                </button>
                <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1 text-xs py-1 px-2 no-print">
                  <Download size={12} /> CSV
                </button>
              </>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 no-print"><X size={18} /></button>
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
              <div className="font-bold text-lg flex items-center gap-2">
                {player.name}
                {player.checkedIn
                  ? <span className="text-[11px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5"><CheckCircle size={10} /> 체크인</span>
                  : <span className="text-[11px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-semibold">미체크인</span>
                }
              </div>
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

        {/* 오늘 경기 요약 칩 */}
        {!editing && (() => {
          const todayISO = new Date().toISOString().split('T')[0]
          const todayRecs = playerRecords.filter(r => r.recordedAt?.startsWith(todayISO))
          if (todayRecs.length === 0) return null
          const wins = todayRecs.filter(r => (r.participant1Id === player.id && r.p1Score > r.p2Score) || (r.participant2Id === player.id && r.p2Score > r.p1Score)).length
          const losses = todayRecs.length - wins
          return (
            <div className="flex items-center gap-1.5 mb-3">
              <span className="text-xs text-gray-500">오늘</span>
              {wins > 0 && <span className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-bold">{wins}승</span>}
              {losses > 0 && <span className="text-[11px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-bold">{losses}패</span>}
              <span className="text-[10px] text-gray-400">{todayRecs.length}경기</span>
            </div>
          )
        })()}

        {/* 오늘 상대 칩 */}
        {!editing && (() => {
          const todayISO = new Date().toISOString().split('T')[0]
          const todayRecs = playerRecords.filter(r => r.recordedAt?.startsWith(todayISO))
          if (todayRecs.length === 0) return null
          const oppNames = todayRecs.map(r => {
            const oppId = r.participant1Id === player.id ? r.participant2Id : r.participant1Id
            return oppId ? (pMap[oppId] ?? null) : null
          }).filter(Boolean) as string[]
          const unique = [...new Set(oppNames)].slice(0, 3)
          if (unique.length === 0) return null
          return (
            <div className="flex items-center gap-1.5 mb-3 flex-wrap">
              <span className="text-[10px] text-gray-400 flex-shrink-0">상대:</span>
              {unique.map(name => (
                <span key={name} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{name}</span>
              ))}
            </div>
          )
        })()}

        {/* 평균 세트 득점/실점 */}
        {!editing && (() => {
          const setRecs = recentRecords.filter(r => r.sets && r.sets.length > 0)
          if (setRecs.length < 3) return null
          let mySetPts = 0, oppSetPts = 0, totalSets = 0
          setRecs.forEach(r => {
            const isP1 = r.participant1Id === player.id
            r.sets!.forEach(([a, b]) => { mySetPts += isP1 ? a : b; oppSetPts += isP1 ? b : a; totalSets++ })
          })
          const avgMy = totalSets > 0 ? (mySetPts / totalSets).toFixed(1) : '-'
          const avgOpp = totalSets > 0 ? (oppSetPts / totalSets).toFixed(1) : '-'
          return (
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-gray-400">평균 세트 득점:</span>
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{avgMy}점</span>
              <span className="text-gray-300">vs</span>
              <span className="bg-red-50 text-red-500 px-2 py-0.5 rounded-full font-semibold">{avgOpp}점</span>
              <span className="text-gray-400 text-[10px]">({totalSets}세트)</span>
            </div>
          )
        })()}

        {/* 최근 5경기 상세 목록 */}
        {recentRecords.length > 0 && (() => {
          const recent5 = recentRecords.slice(0, 5)
          return (
            <div className="mb-3">
              <h4 className="text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">최근 5경기</h4>
              <div className="space-y-1">
                {recent5.map(r => {
                  const isP1 = r.participant1Id === player.id
                  const oppId = isP1 ? r.participant2Id : r.participant1Id
                  const oppName = pMap[oppId] ?? '?'
                  const myScore = isP1 ? r.p1Score : r.p2Score
                  const oppScore = isP1 ? r.p2Score : r.p1Score
                  const isWin = myScore > oppScore
                  const dateStr = new Date(r.recordedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
                  return (
                    <div key={r.id} className="flex items-center gap-2 text-xs py-1 px-2 rounded-lg bg-gray-50 border border-gray-100">
                      <span className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] text-white flex-shrink-0 ${isWin ? 'bg-green-500' : 'bg-red-400'}`}>
                        {isWin ? 'W' : 'L'}
                      </span>
                      <span className="flex-1 truncate text-gray-700">vs {oppName}</span>
                      <span className={`font-semibold flex-shrink-0 ${isWin ? 'text-green-600' : 'text-red-500'}`}>{myScore} – {oppScore}</span>
                      <span className={`text-[10px] font-bold flex-shrink-0 ${isWin ? 'text-green-600' : 'text-red-500'}`}>{isWin ? '+10' : '-10'}</span>
                      <span className="text-gray-400 flex-shrink-0 text-[10px]">{dateStr}</span>
                    </div>
                  )
                })}
              </div>
              {(() => {
                const recent5 = recentRecords.slice(0, 5)
                if (recent5.length < 2) return null
                const delta = recent5.reduce((sum, r) => {
                  const isP1 = r.participant1Id === player.id
                  const myScore = isP1 ? r.p1Score : r.p2Score
                  const oppScore = isP1 ? r.p2Score : r.p1Score
                  return sum + (myScore > oppScore ? 10 : -10)
                }, 0)
                return (
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                    <span>5경기 Elo 합산:</span>
                    <span className={`font-bold ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-500' : 'text-gray-500'}`}>{delta > 0 ? `+${delta}` : `${delta}`}</span>
                    <span className="ml-1 text-gray-300">(현재 {player.rating ?? 1000} · K=20)</span>
                  </div>
                )
              })()}
            </div>
          )
        })()}

        {/* 최근 5경기 W/L 미니 스트릭 */}
        {(() => {
          const combined = [
            ...tourMatches.map(({ match }) => ({ win: match.result?.winnerId === player.id })),
            ...recentRecords.map(r => { const isP1 = r.participant1Id === player.id; return { win: isP1 ? r.p1Score > r.p2Score : r.p2Score > r.p1Score } }),
          ].slice(0, 5)
          if (combined.length === 0) return null
          let streakCount = 0
          for (const g of combined) { if (g.win === combined[0].win) streakCount++; else break }
          const streak = streakCount >= 2 ? `${streakCount}${combined[0].win ? '연승' : '연패'}` : ''
          return (
            <div className="flex items-center gap-2 mb-3 -mt-1">
              <span className="text-[11px] text-gray-400">최근</span>
              {combined.map((g, i) => (
                <span key={i} className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold text-white ${g.win ? 'bg-green-500' : 'bg-red-400'}`}>
                  {g.win ? 'W' : 'L'}
                </span>
              ))}
              {streak && <span className="text-xs font-semibold text-indigo-600 ml-1">{streak}</span>}
            </div>
          )
        })()}

        {/* 상대별 전적 요약 (최다 상대 amber 강조) */}
        {recentRecords.length >= 2 && (() => {
          const oppMap = new Map<string, { name: string; wins: number; losses: number }>()
          recentRecords.forEach(r => {
            const isP1 = r.participant1Id === player.id
            const oppId = isP1 ? r.participant2Id : r.participant1Id
            if (!oppId) return
            const oppName = pMap[oppId] ?? '?'
            const won = isP1 ? r.p1Score > r.p2Score : r.p2Score > r.p1Score
            const cur = oppMap.get(oppId) ?? { name: oppName, wins: 0, losses: 0 }
            oppMap.set(oppId, { ...cur, wins: cur.wins + (won ? 1 : 0), losses: cur.losses + (won ? 0 : 1) })
          })
          const rows = [...oppMap.values()].sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)).slice(0, 3)
          if (rows.length < 2) return null
          const maxTotal = rows[0].wins + rows[0].losses
          return (
            <div className="mb-3">
              <h4 className="text-[11px] font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">상대별 전적</h4>
              <div className="space-y-1">
                {rows.map((row, i) => {
                  const total = row.wins + row.losses
                  const isTop = total === maxTotal && i === 0
                  const isFrequent = total >= 3
                  return (
                    <div key={row.name} className={`flex items-center gap-2 text-xs py-1 px-2 rounded-lg border ${isFrequent ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-100'}`}>
                      <span className="flex-1 truncate font-medium text-gray-700">{row.name}</span>
                      {isTop && <span className="text-[9px] bg-amber-200 text-amber-800 px-1 py-0.5 rounded font-bold flex-shrink-0">최다 대결</span>}
                      <span className="text-green-600 font-bold">{row.wins}승</span>
                      <span className="text-gray-300">/</span>
                      <span className="text-red-500">{row.losses}패</span>
                      <span className="text-gray-400 text-[10px]">({total}경기)</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* 역대 최고 연승 */}
        {recentRecords.length >= 2 && (() => {
          const wins = recentRecords.map(r => r.participant1Id === player.id ? r.p1Score > r.p2Score : r.p2Score > r.p1Score)
          let maxStreak = 0, cur = 0
          wins.forEach(w => { if (w) { cur++; if (cur > maxStreak) maxStreak = cur } else cur = 0 })
          if (maxStreak < 2) return null
          return (
            <div className="flex items-center gap-2 mb-3 text-xs">
              <span className="text-gray-400">역대 최고 연승:</span>
              <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">🔥 {maxStreak}연승</span>
            </div>
          )
        })()}

        {/* 승률 추이 미니 SVG 선 그래프 (최근 10경기) */}
        {(() => {
          const allGames = [
            ...tourMatches.map(({ match }) => ({ win: match.result?.winnerId === player.id })),
            ...recentRecords.map(r => { const isP1 = r.participant1Id === player.id; return { win: isP1 ? r.p1Score > r.p2Score : r.p2Score > r.p1Score } }),
          ].slice(0, 10).reverse()
          if (allGames.length < 2) return null
          const pts = allGames.map((g, i) => {
            const wins = allGames.slice(0, i + 1).filter(x => x.win).length
            return Math.round(wins / (i + 1) * 100)
          })
          const W = 260, H = 50, pad = 8
          const xStep = (W - pad * 2) / (pts.length - 1)
          const yOf = (v: number) => pad + (H - pad * 2) * (1 - v / 100)
          const pathD = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${pad + i * xStep},${yOf(v)}`).join(' ')
          return (
            <div className="mb-3">
              <div className="text-[11px] text-gray-400 mb-1">승률 추이 (최근 {allGames.length}경기)</div>
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="overflow-visible">
                <line x1={pad} y1={yOf(50)} x2={W - pad} y2={yOf(50)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
                <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="1.5" />
                {pts.map((v, i) => (
                  <circle key={i} cx={pad + i * xStep} cy={yOf(v)} r={3}
                    fill={allGames[i].win ? '#22c55e' : '#f87171'} />
                ))}
                <text x={W - pad + 2} y={yOf(pts[pts.length - 1]) + 3} fontSize="9" fill="#6366f1">{pts[pts.length - 1]}%</text>
              </svg>
            </div>
          )
        })()}

        {/* 종목별 승률 레이더 차트 */}
        {(() => {
          const evMap = new Map<string, { wins: number; total: number }>()
          tourMatches.forEach(({ match, eventLabel }) => {
            if (!evMap.has(eventLabel)) evMap.set(eventLabel, { wins: 0, total: 0 })
            const e = evMap.get(eventLabel)!
            e.total++
            if (match.result?.winnerId === player.id) e.wins++
          })
          const events = Array.from(evMap.entries()).map(([label, { wins, total }]) => ({
            label, pct: total > 0 ? Math.round(wins / total * 100) : 0
          }))
          if (events.length < 3) return null
          const cx = 130, cy = 100, r = 65
          const N = events.length
          const ang = (i: number) => (2 * Math.PI * i / N) - Math.PI / 2
          const pt = (i: number, s: number) => ({ x: cx + r * s * Math.cos(ang(i)), y: cy + r * s * Math.sin(ang(i)) })
          const gridPts = (s: number) => events.map((_, i) => { const p = pt(i, s); return `${p.x},${p.y}` }).join(' ')
          const dataPts = events.map((ev, i) => { const p = pt(i, ev.pct / 100); return `${p.x},${p.y}` }).join(' ')
          return (
            <div className="mb-3">
              <div className="text-[11px] text-gray-400 mb-1">종목별 승률 레이더</div>
              <svg viewBox="0 0 260 200" width="100%" height={200}>
                {[0.25, 0.5, 0.75, 1].map(s => (
                  <polygon key={s} points={gridPts(s)} fill="none" stroke="#e5e7eb" strokeWidth="0.5" />
                ))}
                {events.map((_, i) => { const p = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#d1d5db" strokeWidth="0.5" /> })}
                <polygon points={dataPts} fill="rgba(99,102,241,0.15)" stroke="#6366f1" strokeWidth="1.5" />
                {events.map((ev, i) => { const p = pt(i, ev.pct / 100); return <circle key={i} cx={p.x} cy={p.y} r={3} fill="#6366f1" /> })}
                {events.map((ev, i) => {
                  const p = pt(i, 1.35)
                  const anchor = p.x < cx - 5 ? 'end' : p.x > cx + 5 ? 'start' : 'middle'
                  return (
                    <g key={i}>
                      <text x={p.x} y={p.y - 3} fontSize="8" textAnchor={anchor} fill="#6b7280">{ev.label}</text>
                      <text x={p.x} y={p.y + 9} fontSize="8" textAnchor={anchor} fill="#4f46e5" fontWeight="bold">{ev.pct}%</text>
                    </g>
                  )
                })}
                <text x={cx + 2} y={cy - r * 0.5 - 2} fontSize="7" fill="#9ca3af">50%</text>
              </svg>
            </div>
          )
        })()}

        {/* 대회별 종목 순위 */}
        {tourMatches.length > 0 && (() => {
          const groups = new Map<string, { tourName: string; evLabel: string }>()
          tourMatches.forEach(({ tournamentName, eventLabel }) => {
            const k = `${tournamentName}||${eventLabel}`
            if (!groups.has(k)) groups.set(k, { tourName: tournamentName, evLabel: eventLabel })
          })
          const rankings: { tourName: string; evLabel: string; rank: number; total: number; wins: number }[] = []
          groups.forEach(({ tourName, evLabel }) => {
            const t = tournaments.find(t => t.name === tourName)
            if (!t) return
            const ev = t.events.find(ev => ev.label === evLabel)
            if (!ev) return
            const real = ev.matches.filter(m => m.result && !m.isBye && m.participant1Id && m.participant2Id)
            if (real.length === 0) return
            const winMap = new Map<string, number>()
            real.forEach(m => { if (m.result?.winnerId) winMap.set(m.result.winnerId, (winMap.get(m.result.winnerId) ?? 0) + 1) })
            const participants = new Set([...real.map(m => m.participant1Id!), ...real.map(m => m.participant2Id!)])
            const myWins = winMap.get(player.id) ?? 0
            const rank = [...participants].filter(pid => (winMap.get(pid) ?? 0) > myWins).length + 1
            rankings.push({ tourName, evLabel, rank, total: participants.size, wins: myWins })
          })
          if (rankings.length === 0) return null
          return (
            <div className="mb-4">
              <h4 className="font-semibold text-sm text-gray-700 mb-2">대회별 종목 순위</h4>
              <div className="space-y-1.5">
                {rankings.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                    <span className={`font-bold px-2 py-0.5 rounded flex-shrink-0 ${r.rank === 1 ? 'bg-yellow-400 text-white' : r.rank <= 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{r.rank}위</span>
                    <span className="flex-1 truncate text-gray-700">{r.tourName} · {r.evLabel}</span>
                    <span className="text-gray-400 flex-shrink-0">{r.wins}승 · {r.total}명</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Tournament match history — grouped by event */}
        {tourMatches.length > 0 && (() => {
          const grouped: { key: string; tourName: string; evLabel: string; items: typeof tourMatches }[] = []
          tourMatches.forEach(m => {
            const key = `${m.tournamentName}||${m.eventLabel}`
            const g = grouped.find(g => g.key === key)
            if (g) g.items.push(m)
            else grouped.push({ key, tourName: m.tournamentName, evLabel: m.eventLabel, items: [m] })
          })
          return (
            <div className="mb-4">
              <h4 className="font-semibold text-sm text-gray-700 mb-2">대회 경기 기록</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {grouped.map(g => (
                  <div key={g.key}>
                    <div className="text-[10px] font-semibold text-gray-400 mt-1 mb-1 px-1">{g.tourName} · {g.evLabel}</div>
                    {g.items.map(({ match }, idx) => {
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
                          <span className="text-xs text-gray-500 flex-shrink-0">{setStr}</span>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

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

function PairStatsModal({ pair, tournaments, scoreRecords, players, pMap, onClose }: {
  pair: Pair
  tournaments: Tournament[]
  scoreRecords: ScoreRecord[]
  players: Player[]
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

  function handlePrint() {
    const style = document.createElement('style')
    style.id = '__pair-print-style'
    style.textContent = '@media print { body * { visibility: hidden !important; } #pair-stats-modal-inner, #pair-stats-modal-inner * { visibility: visible !important; } #pair-stats-modal-inner { position: fixed !important; inset: 0 !important; max-height: none !important; overflow: visible !important; box-shadow: none !important; border-radius: 0 !important; } }'
    document.head.appendChild(style)
    window.print()
    setTimeout(() => document.getElementById('__pair-print-style')?.remove(), 1000)
  }

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
      <div id="pair-stats-modal-inner" className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2"><BarChart2 size={16} /> {pair.name} 전적</h3>
          <div className="flex items-center gap-2">
            {(tourMatches.length > 0 || recentRecords.length > 0) && (
              <>
                <button onClick={handlePrint} className="btn-secondary flex items-center gap-1 text-xs py-1 px-2 no-print">
                  <Download size={12} /> PDF
                </button>
                <button onClick={handleExportCSV} className="btn-secondary flex items-center gap-1 text-xs py-1 px-2 no-print">
                  <Download size={12} /> CSV
                </button>
              </>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 no-print"><X size={18} /></button>
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

        {(() => {
          const p1 = players.find(p => p.id === pair.player1Id)
          const p2 = players.find(p => p.id === pair.player2Id)
          if (!p1 || !p2) return null
          return (
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs text-gray-400">개인 레이팅:</span>
              <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">{p1.name} {p1.rating}</span>
              <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-medium">{p2.name} {p2.rating}</span>
            </div>
          )
        })()}
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
