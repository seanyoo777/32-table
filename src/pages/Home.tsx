import { useStore } from '../store/useStore'
import { useNavigate } from 'react-router-dom'
import { Trophy, Users, Calendar, ClipboardList, TableProperties, Award, Star, Zap, QrCode, Monitor } from 'lucide-react'

export default function Home() {
  const { players, pairs, tournaments, schedules, appSettings } = useStore()
  const navigate = useNavigate()

  const activeTournaments = tournaments.filter(t => t.status === 'ongoing')
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  const divisionCounts = players.reduce((acc, p) => {
    acc[p.division] = (acc[p.division] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const topPlayers = [...players].sort((a, b) => b.points - a.points).slice(0, 8)

  const quickLinks = [
    { label: '랭킹 관리', desc: '선수·페어 포인트', icon: Trophy, color: 'border-yellow-200 bg-yellow-50 text-yellow-700', to: '/rankings' },
    { label: '대회·대진표', desc: '토너먼트·리그', icon: TableProperties, color: 'border-blue-200 bg-blue-50 text-blue-700', to: '/tournament' },
    { label: '경기일정표', desc: '코트별 자동배치', icon: Calendar, color: 'border-purple-200 bg-purple-50 text-purple-700', to: '/schedule' },
    { label: '점수 입력', desc: '결과→포인트 반영', icon: ClipboardList, color: 'border-red-200 bg-red-50 text-red-700', to: '/score' },
  ]

  const divColors: Record<string, string> = {
    초등: 'bg-yellow-400', 중등: 'bg-green-400', 고등: 'bg-blue-400',
    대학: 'bg-purple-400', 일반: 'bg-gray-400', 생활체육: 'bg-orange-400'
  }

  return (
    <div className="page-shell p-4 gap-3">
      {/* ── Compact hero ── */}
      <div className="flex-shrink-0 bg-gradient-to-r from-blue-700 to-blue-500 rounded-xl px-5 py-3 text-white flex items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-bold">🏓 탁구 대회 관리 시스템</h1>
          <p className="text-blue-100 text-xs mt-0.5">
            {appSettings.organizerName ? `${appSettings.organizerName} · ` : ''}{today}
          </p>
        </div>
        <div className="flex gap-6 flex-shrink-0">
          <Stat label="등록 선수" value={players.length} />
          <Stat label="복식 페어" value={pairs.length} />
          <Stat label="진행 대회" value={activeTournaments.length} />
          <Stat label="일정표" value={schedules.length} />
        </div>
      </div>

      {/* ── 3-column main grid ── */}
      <div className="flex-1 min-h-0 grid gap-4" style={{ gridTemplateColumns: '260px 1fr 260px' }}>

        {/* ── Col 1: Quick Actions + Active Tournaments ── */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Quick links 2×2 */}
          <div className="grid grid-cols-2 gap-2 flex-shrink-0">
            {quickLinks.map(({ label, desc, icon: Icon, color, to }) => (
              <button key={to} onClick={() => navigate(to)}
                className={`border-2 rounded-xl p-3 text-left hover:shadow-md transition-shadow cursor-pointer bg-white ${color}`}>
                <Icon size={17} className="mb-1.5" />
                <div className="font-semibold text-xs leading-tight">{label}</div>
                <div className="text-xs opacity-60 mt-0.5 leading-tight">{desc}</div>
              </button>
            ))}
          </div>

          {/* Day-of 3 buttons */}
          <div className="grid grid-cols-3 gap-2 flex-shrink-0">
            <button onClick={() => navigate('/checkin')}
              className="border-2 border-indigo-200 bg-indigo-50 text-indigo-700 rounded-xl p-3 text-center hover:shadow-md transition-shadow">
              <QrCode size={17} className="mx-auto mb-1" />
              <div className="font-semibold text-xs">체크인</div>
            </button>
            <button onClick={() => navigate('/score')}
              className="border-2 border-red-200 bg-red-50 text-red-700 rounded-xl p-3 text-center hover:shadow-md transition-shadow">
              <Zap size={17} className="mx-auto mb-1" />
              <div className="font-semibold text-xs">점수입력</div>
            </button>
            <button onClick={() => navigate('/liveboard')}
              className="border-2 border-gray-200 bg-gray-50 text-gray-700 rounded-xl p-3 text-center hover:shadow-md transition-shadow">
              <Monitor size={17} className="mx-auto mb-1" />
              <div className="font-semibold text-xs">라이브</div>
            </button>
          </div>

          {/* Active tournaments (scrollable) */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {activeTournaments.length > 0 ? (
              activeTournaments.map(t => {
                const totalM = t.events.reduce((s, e) => s + e.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length, 0)
                const doneM = t.events.reduce((s, e) => s + e.matches.filter(m => m.result).length, 0)
                const pct = totalM > 0 ? Math.round(doneM / totalM * 100) : 0
                return (
                  <div key={t.id}
                    className="bg-green-50 border border-green-200 rounded-xl p-3 cursor-pointer hover:bg-green-100 transition-colors"
                    onClick={() => navigate('/tournament')}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                      <div className="font-semibold text-green-800 text-sm truncate flex-1">{t.name}</div>
                    </div>
                    <div className="text-xs text-green-600 mb-1.5">{t.events.length}종목 · {doneM}/{totalM}경기 ({pct}%)</div>
                    <div className="h-1 bg-green-200 rounded-full">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={e => { e.stopPropagation(); navigate('/score') }}
                        className="px-2 py-1 bg-green-600 text-white text-xs font-medium rounded-lg flex items-center gap-1 hover:bg-green-700">
                        <Zap size={10} /> 점수입력
                      </button>
                      <button onClick={e => { e.stopPropagation(); navigate('/liveboard') }}
                        className="px-2 py-1 bg-gray-700 text-white text-xs font-medium rounded-lg flex items-center gap-1 hover:bg-gray-800">
                        <Monitor size={10} /> 라이브
                      </button>
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="card text-center py-6">
                <Trophy size={28} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-400 mb-2">진행중인 대회 없음</p>
                <button onClick={() => navigate('/tournament')} className="btn-primary text-xs">대회 만들기</button>
              </div>
            )}
          </div>
        </div>

        {/* ── Col 2: Division stats + Recent tournaments ── */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Division stats */}
          <div className="card flex-shrink-0">
            <h2 className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2">
              <Users size={14} /> 부문별 선수 현황
            </h2>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2">
              {(['초등', '중등', '고등', '대학', '일반', '생활체육'] as const).map(div => {
                const count = divisionCounts[div] || 0
                const pct = players.length > 0 ? (count / players.length) * 100 : 0
                return (
                  <div key={div}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="font-medium text-gray-700">{div}</span>
                      <span className="text-gray-400">{count}명</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${divColors[div]} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 pt-2 border-t flex justify-between text-xs text-gray-400">
              <span>복식 {pairs.length}쌍</span>
              <span>남 {players.filter(p => p.gender === '남').length} / 여 {players.filter(p => p.gender === '여').length}</span>
            </div>
          </div>

          {/* Recent tournaments (scrollable) */}
          <div className="card flex-1 min-h-0 flex flex-col overflow-hidden">
            <h2 className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2 flex-shrink-0">
              <Trophy size={14} /> 최근 대회
            </h2>
            {tournaments.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                <Trophy size={28} className="mb-2 opacity-30" />
                <p className="text-sm">대회가 없습니다</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                {[...tournaments]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 10)
                  .map(t => {
                    const totalM = t.events.reduce((s, e) => s + e.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length, 0)
                    const doneM = t.events.reduce((s, e) => s + e.matches.filter(m => m.result).length, 0)
                    return (
                      <div key={t.id}
                        className="border border-gray-100 rounded-lg p-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => navigate('/tournament')}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="font-medium text-sm truncate flex-1">{t.name}</div>
                          <StatusBadge status={t.status} />
                        </div>
                        <div className="flex gap-1 mb-1.5 flex-wrap">
                          {t.events.slice(0, 4).map(ev => (
                            <span key={ev.id} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{ev.label}</span>
                          ))}
                          {t.events.length > 4 && <span className="text-xs text-gray-400">+{t.events.length - 4}</span>}
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>{t.date}</span>
                          <span>{totalM > 0 ? Math.round(doneM / totalM * 100) : 0}%</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${totalM > 0 ? doneM / totalM * 100 : 0}%` }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        </div>

        {/* ── Col 3: Top players ── */}
        <div className="card flex flex-col overflow-hidden">
          <h2 className="font-semibold text-gray-700 text-sm mb-3 flex items-center gap-2 flex-shrink-0">
            <Award size={14} /> 단식 TOP 랭킹
          </h2>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {topPlayers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <Trophy size={28} className="mb-2" />
                <p className="text-sm">선수가 없습니다</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {topPlayers.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
                    <RankBadge rank={i + 1} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm flex items-center gap-1.5 truncate">
                        {p.name}
                        <span className={`badge text-xs ${p.gender === '남' ? 'bg-blue-50 text-blue-500' : 'bg-pink-50 text-pink-500'}`}>
                          {p.gender}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 truncate">{p.school} · {p.division}</div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-blue-600 text-sm">{p.points.toLocaleString()}P</div>
                      <div className="text-xs text-gray-400">{p.wins}승 {p.losses}패</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => navigate('/rankings')}
            className="flex-shrink-0 mt-2 pt-2 border-t text-sm text-blue-600 hover:underline text-center">
            전체 랭킹 보기 →
          </button>
        </div>

      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-blue-200 text-xs">{label}</div>
    </div>
  )
}

function RankBadge({ rank }: { rank: number }) {
  const c: Record<number, string> = {
    1: 'bg-yellow-400 text-yellow-900',
    2: 'bg-gray-300 text-gray-700',
    3: 'bg-orange-300 text-orange-800',
  }
  return (
    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c[rank] || 'bg-gray-100 text-gray-500'}`}>
      {rank <= 3 ? <Star size={10} /> : rank}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const m: Record<string, { label: string; cls: string }> = {
    draft:     { label: '준비중', cls: 'bg-gray-100 text-gray-600' },
    ongoing:   { label: '진행중', cls: 'bg-green-100 text-green-700' },
    completed: { label: '완료',   cls: 'bg-blue-100 text-blue-700' },
  }
  const { label, cls } = m[status] || m.draft
  return <span className={`badge ${cls}`}>{label}</span>
}
