import { useStore } from '../store/useStore'
import { useNavigate } from 'react-router-dom'
import { Trophy, Calendar, ClipboardList, TableProperties, Zap, QrCode, Monitor, Bell, LayoutDashboard, Users, Award, Star } from 'lucide-react'

export default function Home() {
  const { players, pairs, tournaments, schedules, appSettings, matchCalls, liveMatches, scoreRecords } = useStore()
  const navigate = useNavigate()

  const activeTournaments = tournaments.filter(t => t.status === 'ongoing')
  const allActiveMatches = activeTournaments.flatMap(t => t.events.flatMap(ev => ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)))
  const pendingTotal = allActiveMatches.filter(m => !m.result).length
  const doneTotal = allActiveMatches.filter(m => !!m.result).length
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })

  const todayISO = new Date().toISOString().split('T')[0]
  const todaySchedules = schedules.filter(s => s.date === todayISO)
  const todaySlotCount = todaySchedules.reduce((n, s) => n + s.slots.length, 0)
  const todayFirstStart = todaySchedules.length > 0
    ? todaySchedules.flatMap(s => s.slots.map(sl => sl.startTime)).sort()[0]
    : null

  const divisionCounts = players.reduce((acc, p) => {
    acc[p.division] = (acc[p.division] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const topPlayers = [...players].sort((a, b) => b.points - a.points).slice(0, 8)

  const pMap = Object.fromEntries([
    ...players.map(p => [p.id, p.name]),
    ...pairs.map(p => [p.id, p.name]),
  ])
  const nextPending = activeTournaments
    .flatMap(t => t.events.flatMap(ev =>
      ev.matches
        .filter(m => m.participant1Id && m.participant2Id && !m.result && !m.isBye)
        .map(m => ({ ...m, tournamentName: t.name, eventLabel: ev.label }))
    ))
    .slice(0, 3)
  const completedTournaments = [...tournaments]
    .filter(t => t.status === 'completed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)

  const quickLinks = [
    { label: '랭킹 관리', desc: '선수·페어 포인트', icon: Trophy, color: 'border-yellow-200 bg-yellow-50 text-yellow-700', to: '/rankings' },
    { label: '대회·대진표', desc: '토너먼트·리그', icon: TableProperties, color: 'border-blue-200 bg-blue-50 text-blue-700', to: '/tournament' },
    { label: '경기일정표', desc: '코트별 자동배치', icon: Calendar, color: 'border-purple-200 bg-purple-50 text-purple-700', to: '/schedule' },
    { label: '점수 입력', desc: '결과→포인트 반영', icon: ClipboardList, color: 'border-red-200 bg-red-50 text-red-700', to: '/score' },
    { label: '운영 대시보드', desc: 'LIVE·경기 호출', icon: LayoutDashboard, color: 'border-orange-200 bg-orange-50 text-orange-700', to: '/dashboard' },
    { label: 'QR 체크인', desc: '선수 출석 확인', icon: QrCode, color: 'border-indigo-200 bg-indigo-50 text-indigo-700', to: '/checkin' },
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

      {/* ── 경기 현황 요약 ── */}
      {activeTournaments.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-white rounded-xl border border-gray-100 text-sm">
          <span className="text-gray-400 text-xs font-medium flex-shrink-0">경기 현황</span>
          <div className="flex gap-3 flex-1 min-w-0">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" /><span className="text-gray-600">대기 <strong className="text-gray-800">{pendingTotal}</strong></span></span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" /><span className="text-gray-600">LIVE <strong className="text-red-600">{liveMatches.length}</strong></span></span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" /><span className="text-gray-600">완료 <strong className="text-gray-800">{doneTotal}</strong></span></span>
          </div>
          {matchCalls.filter(c => !c.acknowledged).length > 0 && (
            <span className="flex-shrink-0 text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
              미확인 호출 {matchCalls.filter(c => !c.acknowledged).length}
            </span>
          )}
          {scoreRecords.filter(r => !r.verified).length > 0 && (
            <span className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
              미확인 기록 {scoreRecords.filter(r => !r.verified).length}
            </span>
          )}
        </div>
      )}

      {/* ── 체크인 현황 미니 바 ── */}
      {players.length > 0 && players.some(p => p.checkedIn) && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-teal-50 rounded-xl border border-teal-100 text-sm">
          <span className="text-teal-500 text-xs font-medium flex-shrink-0">체크인</span>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="flex-1 h-2 bg-teal-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all"
                style={{ width: `${Math.round(players.filter(p => p.checkedIn).length / players.length * 100)}%` }}
              />
            </div>
            <span className="text-teal-700 font-semibold flex-shrink-0 text-xs">
              {players.filter(p => p.checkedIn).length}/{players.length}명
            </span>
          </div>
          {players.filter(p => !p.checkedIn).length > 0 && (
            <span className="flex-shrink-0 text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
              미체크인 {players.filter(p => !p.checkedIn).length}
            </span>
          )}
        </div>
      )}

      {/* ── 오늘 일정 요약 ── */}
      {todaySlotCount > 0 && (
        <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-purple-50 rounded-xl border border-purple-100 text-sm">
          <span className="text-purple-400 text-xs font-medium flex-shrink-0">📅 오늘 일정</span>
          <span className="text-purple-700 font-semibold">{todaySlotCount}경기 슬롯</span>
          {todayFirstStart && <span className="text-purple-500 text-xs">· 첫 경기 {todayFirstStart}</span>}
          <span className="text-purple-400 text-xs ml-auto">{todaySchedules.map(s => s.name).join(', ')}</span>
        </div>
      )}

      {/* ── 온보딩 가이드 (선수 0명) ── */}
      {players.length === 0 && (
        <div className="flex-shrink-0 bg-white rounded-xl border-2 border-dashed border-blue-200 p-5">
          <h2 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
            <span className="text-xl">🏓</span> 처음 시작하기 — 3단계 가이드
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { step: '①', title: '선수 등록', desc: 'CSV 업로드 또는 개별 등록으로 선수를 추가하세요.', color: 'bg-blue-50 border-blue-200', btn: '랭킹 관리로 이동', to: '/rankings', btnColor: 'bg-blue-600 text-white hover:bg-blue-700' },
              { step: '②', title: '대회 생성', desc: '토너먼트·리그 등 원하는 형식으로 대회를 만드세요.', color: 'bg-green-50 border-green-200', btn: '대회 만들기', to: '/tournament', btnColor: 'bg-green-600 text-white hover:bg-green-700' },
              { step: '③', title: '당일 체크인', desc: 'QR코드 또는 이름 검색으로 참가자를 체크인하세요.', color: 'bg-purple-50 border-purple-200', btn: '체크인 열기', to: '/checkin', btnColor: 'bg-purple-600 text-white hover:bg-purple-700' },
            ].map(({ step, title, desc, color, btn, to, btnColor }) => (
              <div key={step} className={`rounded-xl border p-4 flex flex-col gap-2 ${color}`}>
                <div className="text-2xl font-black text-gray-300">{step}</div>
                <div className="font-bold text-gray-700 text-sm">{title}</div>
                <div className="text-xs text-gray-500 flex-1">{desc}</div>
                <button onClick={() => navigate(to)} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${btnColor}`}>{btn}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3-column main grid ── */}
      <div className="flex-1 min-h-0 grid gap-4" style={{ gridTemplateColumns: '260px 1fr 260px' }}>

        {/* ── Col 1: Quick Actions + Active Tournaments ── */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          {/* Quick links 3×2 */}
          {(() => {
            const pendingCalls = matchCalls.filter(c => !c.acknowledged).length
            return (
              <div className="grid grid-cols-3 gap-2 flex-shrink-0">
                {quickLinks.map(({ label, desc, icon: Icon, color, to }) => {
                  const badge = to === '/dashboard' && pendingCalls > 0 ? pendingCalls : null
                  return (
                    <button key={to} onClick={() => navigate(to)} className={`relative border-2 rounded-xl p-2.5 text-left hover:shadow-md transition-shadow cursor-pointer bg-white ${color}`}>
                      {badge && <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{badge}</span>}
                      <Icon size={16} className="mb-1" />
                      <div className="font-semibold text-[11px] leading-tight">{label}</div>
                      <div className="text-[10px] opacity-60 mt-0.5 leading-tight">{desc}</div>
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* Active tournaments (scrollable) */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
            {activeTournaments.length > 0 ? (
              activeTournaments.map(t => {
                const totalM = t.events.reduce((s, e) => s + e.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length, 0)
                const doneM = t.events.reduce((s, e) => s + e.matches.filter(m => m.result).length, 0)
                const pendingM = totalM - doneM
                const pct = totalM > 0 ? Math.round(doneM / totalM * 100) : 0
                const tourCalls = matchCalls.filter(c => c.tournamentId === t.id && !c.acknowledged).length
                return (
                  <div key={t.id}
                    className="bg-green-50 border border-green-200 rounded-xl p-3 cursor-pointer hover:bg-green-100 transition-colors"
                    onClick={() => navigate(`/tournament?open=${t.id}`)}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                      <div className="font-semibold text-green-800 text-sm truncate flex-1">{t.name}</div>
                      {tourCalls > 0 && (
                        <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse flex-shrink-0">
                          <Bell size={9} className="inline mr-0.5" />{tourCalls}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-green-600 mb-1.5">
                      {t.events.length}종목 · {doneM}/{totalM}경기 ({pct}%)
                      {pendingM > 0 && <span className="ml-2 text-yellow-600 font-medium">대기 {pendingM}</span>}
                    </div>
                    <div className="h-1 bg-green-200 rounded-full">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    {/* 종목별 진행률 */}
                    <div className="mt-2 space-y-1">
                      {t.events.slice(0, 6).map(ev => {
                        const evTotal = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length
                        const evDone = ev.matches.filter(m => m.result).length
                        const evPct = evTotal > 0 ? Math.round(evDone / evTotal * 100) : 0
                        return (
                          <div key={ev.id}>
                            <div className="flex justify-between text-[10px] mb-0.5">
                              <span className="text-green-700 truncate flex-1 pr-1">{ev.label}</span>
                              <span className={`flex-shrink-0 font-medium ${evPct === 100 ? 'text-green-600' : 'text-gray-400'}`}>{evPct}%</span>
                            </div>
                            <div className="h-0.5 bg-green-200 rounded-full">
                              <div className={`h-full rounded-full transition-all ${evPct === 100 ? 'bg-green-600' : 'bg-green-400'}`} style={{ width: `${evPct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                      {t.events.length > 6 && (
                        <div className="text-[10px] text-green-500">+{t.events.length - 6}개 종목 더</div>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      <button onClick={e => { e.stopPropagation(); navigate('/score') }}
                        className="px-2 py-1 bg-green-600 text-white text-xs font-medium rounded-lg flex items-center gap-1 hover:bg-green-700">
                        <Zap size={10} /> 점수입력
                      </button>
                      <button onClick={e => { e.stopPropagation(); navigate('/dashboard') }}
                        className="px-2 py-1 bg-orange-500 text-white text-xs font-medium rounded-lg flex items-center gap-1 hover:bg-orange-600">
                        <Bell size={10} /> 경기호출
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
                        onClick={() => navigate(`/tournament?open=${t.id}`)}>
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

        {/* ── Col 3: Top players + Hall of Fame ── */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          <div className="card flex-1 flex flex-col overflow-hidden min-h-0">
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
                      {p.photoUrl
                        ? <img src={p.photoUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        : <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400 flex-shrink-0 font-bold">{p.name[0]}</div>
                      }
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
                        <div className="text-xs text-gray-500 font-mono">Elo {p.rating}</div>
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

          {nextPending.length > 0 && (
            <div className="card flex-shrink-0">
              <h2 className="font-semibold text-gray-700 text-sm mb-2 flex items-center gap-2">
                <Bell size={13} className="text-orange-400" /> 다음 호출 예정
                <span className="text-xs text-gray-400 font-normal ml-auto">대기 {pendingTotal}경기</span>
              </h2>
              <div className="space-y-1.5">
                {nextPending.map(m => (
                  <div key={`${m.tournamentId}-${m.eventId}-${m.id}`}
                    className="flex items-center gap-2 text-xs bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5">
                    <span className="text-orange-400 font-medium w-12 truncate flex-shrink-0">{m.eventLabel}</span>
                    <span className="flex-1 font-medium truncate">
                      {pMap[m.participant1Id!] ?? '?'} vs {pMap[m.participant2Id!] ?? '?'}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                className="mt-2 w-full text-xs text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-100 rounded-lg py-1 font-medium"
              >
                대시보드에서 호출 →
              </button>
            </div>
          )}

          {scoreRecords.length > 0 && (
            <div className="card flex-shrink-0">
              <h2 className="font-semibold text-gray-700 text-sm mb-2 flex items-center gap-2">
                <ClipboardList size={13} className="text-green-500" /> 최근 완료 경기
                <span className="text-xs text-gray-400 font-normal ml-auto">{scoreRecords.length}건 누적</span>
              </h2>
              <div className="space-y-1">
                {[...scoreRecords].reverse().slice(0, 5).map(r => {
                  const n1 = pMap[r.participant1Id] ?? '?'
                  const n2 = pMap[r.participant2Id] ?? '?'
                  const isP1Win = r.p1Score > r.p2Score
                  return (
                    <div key={r.id} className="flex items-center gap-1.5 text-xs bg-gray-50 rounded px-2 py-1">
                      <span className={`truncate flex-1 text-right ${isP1Win ? 'font-semibold text-blue-600' : 'text-gray-400'}`}>{n1}</span>
                      <span className="font-bold text-gray-600 flex-shrink-0 tabular-nums">{r.p1Score}:{r.p2Score}</span>
                      <span className={`truncate flex-1 ${!isP1Win ? 'font-semibold text-blue-600' : 'text-gray-400'}`}>{n2}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {completedTournaments.length > 0 && (
            <div className="card flex-shrink-0">
              <h2 className="font-semibold text-gray-700 text-sm mb-2 flex items-center gap-2">
                <Star size={14} className="text-yellow-500" /> 명예의 전당
              </h2>
              <div className="space-y-2">
                {completedTournaments.map(t => {
                  const completedEvents = t.events.filter(ev => ev.status === 'completed' && ev.awards)
                  if (completedEvents.length === 0) return null
                  return (
                    <div key={t.id} className="bg-yellow-50 border border-yellow-100 rounded-lg p-2">
                      <div className="font-medium text-xs text-gray-600 truncate mb-1">{t.name}</div>
                      <div className="space-y-0.5">
                        {completedEvents.slice(0, 3).map(ev => {
                          const sorted = Object.entries(ev.awards!.points).sort(([, a], [, b]) => b - a)
                          const gold = sorted[0] ? pMap[sorted[0][0]] : null
                          const silver = sorted[1] ? pMap[sorted[1][0]] : null
                          return gold ? (
                            <div key={ev.id} className="flex items-center gap-1.5 text-[11px]">
                              <span className="text-gray-400 truncate flex-shrink-0 w-16">{ev.label}</span>
                              <span className="text-yellow-600">🥇</span>
                              <span className="font-semibold truncate">{gold}</span>
                              {silver && <span className="text-gray-400 truncate">· 🥈{silver}</span>}
                            </div>
                          ) : null
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
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
