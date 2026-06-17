import { useStore } from '../store/useStore'
import { useNavigate } from 'react-router-dom'
import { Trophy, Users, Calendar, ClipboardList, TableProperties, Award, Star } from 'lucide-react'

export default function Home() {
  const { players, pairs, tournaments, schedules } = useStore()
  const navigate = useNavigate()

  const activeTournaments = tournaments.filter(t => t.status === 'ongoing').length
  const totalParticipants = players.length + pairs.length
  const topPlayer = [...players].sort((a, b) => b.points - a.points)[0]

  const divisionCounts = players.reduce((acc, p) => {
    acc[p.division] = (acc[p.division] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const quickLinks = [
    { label: '랭킹 관리', desc: '선수·페어 포인트 관리', icon: Trophy, color: 'bg-yellow-50 border-yellow-200 text-yellow-700', to: '/rankings' },
    { label: '대회·대진표', desc: '토너먼트·리그 생성', icon: TableProperties, color: 'bg-blue-50 border-blue-200 text-blue-700', to: '/tournament' },
    { label: '경기일정표', desc: '시간·코트별 자동 배치', icon: Calendar, color: 'bg-purple-50 border-purple-200 text-purple-700', to: '/schedule' },
    { label: '점수 입력', desc: '결과 기록 → 포인트 반영', icon: ClipboardList, color: 'bg-red-50 border-red-200 text-red-700', to: '/score' },
  ]

  const topPlayers = [...players].sort((a, b) => b.points - a.points).slice(0, 5)

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">🏓 탁구 대회 관리 시스템</h1>
            <p className="text-blue-100 text-sm">초등~대학 · 단식·복식·혼합복식·단체전 · 토너먼트·리그·조별전</p>
          </div>
          <div className="flex gap-6">
            <Stat label="등록 선수" value={players.length} />
            <Stat label="복식 페어" value={pairs.length} />
            <Stat label="진행 대회" value={activeTournaments} />
            <Stat label="일정표" value={schedules.length} />
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {quickLinks.map(({ label, desc, icon: Icon, color, to }) => (
          <button key={to} onClick={() => navigate(to)}
            className={`card border-2 ${color} text-left hover:shadow-md transition-shadow cursor-pointer`}>
            <Icon size={22} className="mb-2" />
            <div className="font-semibold text-sm">{label}</div>
            <div className="text-xs opacity-70 mt-0.5">{desc}</div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Division bar */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Users size={16} /> 부문별 선수 현황</h2>
          <div className="space-y-3">
            {(['초등', '중등', '고등', '대학', '일반', '생활체육'] as const).map(div => {
              const count = divisionCounts[div] || 0
              const pct = players.length > 0 ? (count / players.length) * 100 : 0
              const colors: Record<string, string> = { 초등: 'bg-yellow-400', 중등: 'bg-green-400', 고등: 'bg-blue-400', 대학: 'bg-purple-400', 일반: 'bg-gray-400', 생활체육: 'bg-orange-400' }
              return (
                <div key={div}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{div}</span>
                    <span className="text-gray-400">{count}명</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full ${colors[div]} rounded-full`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-gray-400">
            <span>복식 페어: {pairs.length}쌍</span>
            <span>남: {players.filter(p => p.gender === '남').length} / 여: {players.filter(p => p.gender === '여').length}</span>
          </div>
        </div>

        {/* Top 5 */}
        <div className="card">
          <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Award size={16} /> 전체 단식 TOP 5</h2>
          <div className="space-y-2">
            {topPlayers.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <RankBadge rank={i + 1} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm flex items-center gap-1.5">
                    {p.name}
                    <span className={`badge text-xs ${p.gender === '남' ? 'bg-blue-50 text-blue-500' : 'bg-pink-50 text-pink-500'}`}>{p.gender}</span>
                  </div>
                  <div className="text-xs text-gray-400">{p.school} · {p.division}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-blue-600">{p.points.toLocaleString()}P</div>
                  <div className="text-xs text-gray-400">{p.wins}승 {p.losses}패</div>
                </div>
              </div>
            ))}
            {topPlayers.length === 0 && <p className="text-sm text-gray-400 text-center py-4">선수가 없습니다</p>}
          </div>
          <button onClick={() => navigate('/rankings')} className="mt-3 text-sm text-blue-600 hover:underline w-full text-center">
            전체 랭킹 보기 →
          </button>
        </div>
      </div>

      {/* Recent tournaments */}
      <div className="card">
        <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2"><Trophy size={16} /> 최근 대회</h2>
        {tournaments.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Trophy size={36} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm mb-3">등록된 대회가 없습니다</p>
            <button onClick={() => navigate('/tournament')} className="btn-primary text-sm">대회 만들기</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[...tournaments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map(t => {
              const totalM = t.events.reduce((s, e) => s + e.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length, 0)
              const doneM = t.events.reduce((s, e) => s + e.matches.filter(m => m.result && !m.result.walkedOver).length, 0)
              return (
                <div key={t.id} className="border rounded-lg p-3 hover:shadow-sm transition-shadow cursor-pointer" onClick={() => navigate('/tournament')}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div><div className="font-medium text-sm">{t.name}</div><div className="text-xs text-gray-400">{t.date}</div></div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {t.events.slice(0, 3).map(ev => (
                      <span key={ev.id} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{ev.label}</span>
                    ))}
                    {t.events.length > 3 && <span className="text-xs text-gray-400">+{t.events.length - 3}</span>}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1"><span>{doneM}/{totalM}경기</span><span>{totalM > 0 ? Math.round(doneM / totalM * 100) : 0}%</span></div>
                  <div className="h-1 bg-gray-100 rounded-full"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${totalM > 0 ? doneM / totalM * 100 : 0}%` }} /></div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="text-center"><div className="text-2xl font-bold">{value}</div><div className="text-blue-200 text-xs">{label}</div></div>
}

function RankBadge({ rank }: { rank: number }) {
  const c: Record<number, string> = { 1: 'bg-yellow-400 text-yellow-900', 2: 'bg-gray-300 text-gray-700', 3: 'bg-orange-300 text-orange-800' }
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c[rank] || 'bg-gray-100 text-gray-500'}`}>
      {rank <= 3 ? <Star size={11} /> : rank}
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
