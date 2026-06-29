import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  BarChart3, Trophy, Users, Activity, TrendingUp, Medal, Layers, Grid3x3, Printer,
} from 'lucide-react'
import { getMedalists } from '../utils/tournamentScoring'
import { getRatingLabel, RATING_LABELS } from '../utils/ratingUtils'
import type { Division, TournamentEvent } from '../types'

const DIVISIONS: Division[] = ['초등', '중등', '고등', '대학', '일반', '생활체육']
const DIV_COLORS: Record<Division, string> = {
  '초등': 'bg-pink-400', '중등': 'bg-orange-400', '고등': 'bg-yellow-400',
  '대학': 'bg-green-400', '일반': 'bg-blue-400', '생활체육': 'bg-purple-400',
}

// 수평 막대 한 줄
function Bar({ label, value, max, color, suffix }: {
  label: string; value: number; max: number; color: string; suffix?: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-20 text-xs text-gray-600 text-right flex-shrink-0 truncate">{label}</div>
      <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-16 text-xs font-semibold text-gray-700 flex-shrink-0">{value}{suffix ?? ''}</div>
    </div>
  )
}

function Kpi({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-gray-800 leading-none">{value}</div>
        <div className="text-xs text-gray-500 mt-1">{label}{sub && <span className="text-gray-400"> · {sub}</span>}</div>
      </div>
    </div>
  )
}

export default function Stats() {
  const { tournaments, players, pairs, teams, scoreRecords, appSettings } = useStore()
  const [tourFilter, setTourFilter] = useState('all')
  const selectedTour = tourFilter === 'all' ? null : tournaments.find(t => t.id === tourFilter)

  // 엔티티 ID → 이름 (선수/페어/팀)
  const nameMap = useMemo(() => {
    const m: Record<string, string> = {}
    players.forEach(p => { m[p.id] = p.name })
    pairs.forEach(p => { m[p.id] = p.name })
    teams.forEach(t => { m[t.id] = t.name })
    return m
  }, [players, pairs, teams])

  const visibleTours = useMemo(
    () => tourFilter === 'all' ? tournaments : tournaments.filter(t => t.id === tourFilter),
    [tournaments, tourFilter]
  )

  // 경기 진행 집계 (실경기 기준)
  const matchStats = useMemo(() => {
    let total = 0, done = 0
    const allEvents: TournamentEvent[] = visibleTours.flatMap(t => t.events)
    for (const ev of allEvents) {
      const real = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
      total += real.length
      done += real.filter(m => m.result).length
    }
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0, events: allEvents.length }
  }, [visibleTours])

  // 종목별 메달 (시작된 종목만)
  const medalRows = useMemo(() => {
    const rows: Array<{ tour: string; label: string; division: string; gender: string; gold?: string; silver?: string; bronze: string[] }> = []
    for (const t of visibleTours) {
      for (const ev of t.events) {
        const hasResult = ev.matches.some(m => m.result)
        if (!hasResult) continue
        const { gold, silver, bronze } = getMedalists(ev)
        rows.push({
          tour: t.name, label: ev.label,
          division: ev.division, gender: ev.gender,
          gold: gold ? nameMap[gold] : undefined,
          silver: silver ? nameMap[silver] : undefined,
          bronze: bronze.map(b => nameMap[b] ?? '').filter(Boolean),
        })
      }
    }
    return rows
  }, [visibleTours, nameMap])

  // 부문별 참가 선수 분포
  const divDist = useMemo(() => {
    const c: Record<string, number> = {}
    DIVISIONS.forEach(d => { c[d] = 0 })
    players.forEach(p => { if (p.division in c) c[p.division]++ })
    return c
  }, [players])
  const divMax = Math.max(1, ...Object.values(divDist))

  // 포인트 TOP 10
  const topPoints = useMemo(
    () => [...players].filter(p => p.points > 0).sort((a, b) => b.points - a.points).slice(0, 10),
    [players]
  )
  const ptMax = Math.max(1, ...topPoints.map(p => p.points))

  // 레이팅 등급 분포
  const ratingDist = useMemo(() => {
    const c: Record<string, number> = {}
    RATING_LABELS.forEach(r => { c[r.label] = 0 })
    players.forEach(p => { c[getRatingLabel(p.rating).label]++ })
    return RATING_LABELS.map(r => ({ label: r.label, value: c[r.label], color: r.color }))
  }, [players])
  const rtMax = Math.max(1, ...ratingDist.map(r => r.value))

  // 대진 형식 분포
  const formatDist = useMemo(() => {
    const c: Record<string, number> = {}
    visibleTours.flatMap(t => t.events).forEach(ev => { c[ev.bracketFormat] = (c[ev.bracketFormat] ?? 0) + 1 })
    return c
  }, [visibleTours])

  const completedTours = tournaments.filter(t => t.status === 'completed').length
  const totalMedalEvents = medalRows.filter(r => r.gold).length

  return (
    <div className="page-shell">
      <div className="page-header justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 size={17} className="text-gray-500" />
          <h1 className="text-base font-bold text-gray-800">통계 · 리포트</h1>
        </div>
        <div className="flex items-center gap-2 no-print">
          <select className="select w-auto text-sm" value={tourFilter} onChange={e => setTourFilter(e.target.value)}>
            <option value="all">전체 대회</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={() => window.print()} className="btn-secondary flex items-center gap-1.5">
            <Printer size={14} /> 인쇄
          </button>
        </div>
      </div>

      <div className="page-body overflow-y-auto">
        <div className="max-w-5xl space-y-4">

          {/* 인쇄 전용 리포트 표지 */}
          <div className="hidden print:block border-b-2 border-gray-800 pb-2 mb-2">
            <div className="flex items-end justify-between">
              <div>
                {appSettings.organizerName && <div className="text-xs text-gray-500">{appSettings.organizerName}</div>}
                <h1 className="text-xl font-bold text-gray-900">{selectedTour ? selectedTour.name : '전체 대회'} — 결과 리포트</h1>
                <div className="text-xs text-gray-600 mt-0.5">
                  {selectedTour ? `${selectedTour.date}${selectedTour.venue ? ` · ${selectedTour.venue}` : ''}` : `${appSettings.season} 시즌`}
                </div>
              </div>
              <div className="text-xs text-gray-500 text-right">
                출력일 {new Date().toLocaleDateString('ko-KR')}<br />🏓 탁구대회 관리 시스템
              </div>
            </div>
          </div>

          {/* KPI 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi icon={<Trophy size={18} className="text-white" />} color="bg-amber-500"
              label="대회" sub={`완료 ${completedTours}`} value={tourFilter === 'all' ? tournaments.length : 1} />
            <Kpi icon={<Users size={18} className="text-white" />} color="bg-blue-500"
              label="등록 선수" value={players.length} sub={`${pairs.length}페어`} />
            <Kpi icon={<Activity size={18} className="text-white" />} color="bg-green-500"
              label="경기 진행" sub={`${matchStats.done}/${matchStats.total}`} value={`${matchStats.pct}%`} />
            <Kpi icon={<Medal size={18} className="text-white" />} color="bg-purple-500"
              label="메달 확정 종목" value={totalMedalEvents} sub={`${matchStats.events}종목`} />
          </div>

          {/* 경기 진행률 바 */}
          <section className="card">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                <Activity size={14} className="text-green-500" /> 전체 경기 진행률
              </h2>
              <span className="text-xs text-gray-500">{matchStats.done} / {matchStats.total} 경기 완료</span>
            </div>
            <div className="h-6 bg-gray-100 rounded-full overflow-hidden relative">
              <div className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full flex items-center justify-end pr-2 transition-all"
                style={{ width: `${Math.max(matchStats.pct, 6)}%` }}>
                <span className="text-[10px] font-bold text-white">{matchStats.pct}%</span>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 부문별 참가 분포 */}
            <section className="card">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                <Users size={14} className="text-blue-500" /> 부문별 선수 분포
              </h2>
              <div className="space-y-2">
                {DIVISIONS.map(d => (
                  <Bar key={d} label={d} value={divDist[d]} max={divMax} color={DIV_COLORS[d]} suffix="명" />
                ))}
              </div>
            </section>

            {/* 레이팅 등급 분포 */}
            <section className="card">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                <Layers size={14} className="text-indigo-500" /> 레이팅 등급 분포
              </h2>
              <div className="space-y-2">
                {ratingDist.map(r => (
                  <Bar key={r.label} label={r.label} value={r.value} max={rtMax} color="bg-indigo-400" suffix="명" />
                ))}
              </div>
            </section>
          </div>

          {/* 포인트 TOP 10 */}
          <section className="card">
            <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-amber-500" /> 포인트 상위 선수 TOP 10
            </h2>
            {topPoints.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">아직 적립된 포인트가 없습니다. 경기 결과를 입력하면 집계됩니다.</p>
            ) : (
              <div className="space-y-2">
                {topPoints.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2.5">
                    <div className={`w-6 text-center text-xs font-bold flex-shrink-0 ${i < 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                      {i + 1}
                    </div>
                    <div className="w-24 text-xs text-gray-700 truncate flex-shrink-0">{p.name}</div>
                    <div className="w-12 text-[10px] text-gray-400 truncate flex-shrink-0">{p.school}</div>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-300 to-amber-500 rounded-full"
                        style={{ width: `${Math.round((p.points / ptMax) * 100)}%` }} />
                    </div>
                    <div className="w-14 text-xs font-bold text-amber-600 text-right flex-shrink-0">{p.points.toLocaleString()}P</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 종목별 메달표 */}
          <section className="card">
            <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
              <Medal size={14} className="text-yellow-500" /> 종목별 메달 집계
            </h2>
            {medalRows.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">아직 결과가 확정된 종목이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left font-medium py-1.5 px-2">종목</th>
                      <th className="text-left font-medium py-1.5 px-2">부문</th>
                      <th className="text-left font-medium py-1.5 px-2">🥇 우승</th>
                      <th className="text-left font-medium py-1.5 px-2">🥈 준우승</th>
                      <th className="text-left font-medium py-1.5 px-2">🥉 3위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Group by tournament name, insert tour header rows
                      const groups: Array<{ tourName: string; rows: typeof medalRows }> = []
                      for (const r of medalRows) {
                        const last = groups[groups.length - 1]
                        if (last && last.tourName === r.tour) { last.rows.push(r) }
                        else { groups.push({ tourName: r.tour, rows: [r] }) }
                      }
                      return groups.map((g, gi) => (
                        <>
                          <tr key={`tour-${gi}`} className="bg-gray-50">
                            <td colSpan={5} className="py-1 px-2 text-[11px] font-semibold text-gray-500">
                              {g.tourName} <span className="font-normal text-gray-400">({g.rows.length}종목 · 🥇{g.rows.filter(r=>r.gold).length}확정)</span>
                            </td>
                          </tr>
                          {g.rows.map((r, i) => {
                            const genderCls = r.gender === '남' ? 'bg-blue-50 text-blue-600' : r.gender === '여' ? 'bg-pink-50 text-pink-600' : 'bg-purple-50 text-purple-600'
                            return (
                              <tr key={`${gi}-${i}`} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="py-1.5 px-2 font-medium text-gray-700">{r.label}</td>
                                <td className="py-1.5 px-2">
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded">{r.division}</span>
                                    <span className={`text-[10px] px-1 rounded ${genderCls}`}>{r.gender}</span>
                                  </div>
                                </td>
                                <td className="py-1.5 px-2 font-semibold text-amber-600">{r.gold ?? '—'}</td>
                                <td className="py-1.5 px-2 text-gray-600">{r.silver ?? '—'}</td>
                                <td className="py-1.5 px-2 text-gray-500 text-xs">{r.bronze.join(', ') || '—'}</td>
                              </tr>
                            )
                          })}
                        </>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 대진 형식 분포 + 기록 요약 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="card">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                <Grid3x3 size={14} className="text-teal-500" /> 대진 형식 구성
              </h2>
              {Object.keys(formatDist).length === 0 ? (
                <p className="text-xs text-gray-400 py-2 text-center">종목 데이터가 없습니다.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(formatDist).map(([fmt, n]) => (
                    <div key={fmt} className="px-3 py-2 bg-teal-50 rounded-lg text-center">
                      <div className="text-lg font-bold text-teal-600">{n}</div>
                      <div className="text-[11px] text-teal-700">{fmt}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                <BarChart3 size={14} className="text-gray-500" /> 기록 요약
              </h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between p-2 bg-gray-50 rounded-lg"><span className="text-gray-500 text-xs">점수 기록</span><span className="font-bold text-gray-700">{scoreRecords.length}</span></div>
                <div className="flex justify-between p-2 bg-gray-50 rounded-lg"><span className="text-gray-500 text-xs">미확인 기록</span><span className="font-bold text-orange-500">{scoreRecords.filter(r => !r.verified).length}</span></div>
                <div className="flex justify-between p-2 bg-gray-50 rounded-lg"><span className="text-gray-500 text-xs">단체팀</span><span className="font-bold text-gray-700">{teams.length}</span></div>
                <div className="flex justify-between p-2 bg-gray-50 rounded-lg"><span className="text-gray-500 text-xs">평균 레이팅</span><span className="font-bold text-gray-700">{players.length ? Math.round(players.reduce((s, p) => s + p.rating, 0) / players.length) : 0}</span></div>
              </div>
            </section>
          </div>

        </div>
      </div>
    </div>
  )
}
