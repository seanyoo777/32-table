import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import {
  BarChart3, Trophy, Users, Activity, TrendingUp, Medal, Layers, Grid3x3, Printer, Download, CheckCircle,
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
  const [winRateDetailId, setWinRateDetailId] = useState<string | null>(null)
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

  // 체크인 분석
  const checkInStats = useMemo(() => {
    const byDiv: Record<Division, { total: number; checked: number }> = Object.fromEntries(
      DIVISIONS.map(d => [d, { total: 0, checked: 0 }])
    ) as Record<Division, { total: number; checked: number }>
    players.forEach(p => {
      if (!(p.division in byDiv)) return
      byDiv[p.division].total++
      if (p.checkedIn) byDiv[p.division].checked++
    })
    const total = players.length
    const checked = players.filter(p => p.checkedIn).length
    const unchecked = players.filter(p => !p.checkedIn)
    return { total, checked, unchecked, byDiv }
  }, [players])

  function exportUncheckedCSV() {
    const rows = ['이름,소속,부문,성별,레이팅']
    checkInStats.unchecked.sort((a, b) => a.division.localeCompare(b.division) || a.name.localeCompare(b.name))
      .forEach(p => rows.push([p.name, p.school, p.division, p.gender, p.rating].join(',')))
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `미체크인_${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // 대진 형식 분포
  const formatDist = useMemo(() => {
    const c: Record<string, number> = {}
    visibleTours.flatMap(t => t.events).forEach(ev => { c[ev.bracketFormat] = (c[ev.bracketFormat] ?? 0) + 1 })
    return c
  }, [visibleTours])

  // scoreRecords 기반 선수별 승률 TOP 5
  const winRateTop5 = useMemo(() => {
    const map: Record<string, { wins: number; losses: number }> = {}
    for (const r of scoreRecords) {
      if (!map[r.participant1Id]) map[r.participant1Id] = { wins: 0, losses: 0 }
      if (!map[r.participant2Id]) map[r.participant2Id] = { wins: 0, losses: 0 }
      if (r.p1Score > r.p2Score) { map[r.participant1Id].wins++; map[r.participant2Id].losses++ }
      else if (r.p2Score > r.p1Score) { map[r.participant2Id].wins++; map[r.participant1Id].losses++ }
    }
    return Object.entries(map)
      .filter(([, s]) => s.wins + s.losses >= 1)
      .map(([id, s]) => ({
        id, name: players.find(p => p.id === id)?.name ?? id,
        wins: s.wins, losses: s.losses,
        rate: Math.round(s.wins / (s.wins + s.losses) * 100),
      }))
      .sort((a, b) => b.rate - a.rate || b.wins - a.wins)
      .slice(0, 5)
  }, [scoreRecords, players])

  // 종목별 평균 세트 수
  const eventSetStats = useMemo(() => {
    const rows: Array<{ label: string; avg: number; count: number }> = []
    for (const t of visibleTours) {
      for (const ev of t.events) {
        const recs = scoreRecords.filter(r => r.tournamentId === t.id && r.eventId === ev.id && r.sets && r.sets.length > 0)
        if (recs.length === 0) continue
        const totalSets = recs.reduce((s, r) => s + r.sets.length, 0)
        rows.push({ label: ev.label, avg: Math.round((totalSets / recs.length) * 10) / 10, count: recs.length })
      }
    }
    return rows.sort((a, b) => b.avg - a.avg)
  }, [visibleTours, scoreRecords])

  // 최근 7일 일자별 경기 수
  const dailyMatchCounts = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (6 - i))
      const key = d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
      const count = scoreRecords.filter(r => {
        const rd = new Date(r.createdAt); rd.setHours(0, 0, 0, 0)
        return rd.getTime() === d.getTime()
      }).length
      return { key, count, isToday: i === 6 }
    })
  }, [scoreRecords])

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

          {/* 대회 상태 분포 파이 */}
          {tournaments.length >= 2 && (() => {
            const ongoingN = tournaments.filter(t => t.status === 'ongoing').length
            const upcomingN = tournaments.filter(t => t.status === 'draft' || t.status === 'upcoming').length
            const completedN = tournaments.filter(t => t.status === 'completed').length
            const total = tournaments.length
            const data = [
              { label: '진행중', count: ongoingN, color: '#22c55e' },
              { label: '예정/준비', count: upcomingN, color: '#6366f1' },
              { label: '완료', count: completedN, color: '#9ca3af' },
            ].filter(d => d.count > 0)
            if (data.length < 2) return null
            const cx = 40, cy = 40, r = 32
            let cumAngle = -Math.PI / 2
            const slices = data.map(d => {
              const angle = (d.count / total) * 2 * Math.PI
              const startAngle = cumAngle
              cumAngle += angle
              const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle)
              const x2 = cx + r * Math.cos(cumAngle), y2 = cy + r * Math.sin(cumAngle)
              const large = angle > Math.PI ? 1 : 0
              return { ...d, path: `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z` }
            })
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <Trophy size={14} className="text-amber-500" /> 대회 상태 분포
                </h2>
                <div className="flex items-center gap-6">
                  <svg width={80} height={80} viewBox="0 0 80 80" className="flex-shrink-0">
                    {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} />)}
                  </svg>
                  <div className="space-y-1.5 flex-1">
                    {data.map(d => (
                      <div key={d.label} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-xs text-gray-600 flex-1">{d.label}</span>
                        <span className="text-xs font-bold text-gray-800">{d.count}개</span>
                        <span className="text-[10px] text-gray-400 w-8 text-right">{Math.round(d.count / total * 100)}%</span>
                      </div>
                    ))}
                    <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">전체 {total}개 대회</div>
                  </div>
                </div>
              </section>
            )
          })()}

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
              ) : (() => {
                const total = Object.values(formatDist).reduce((s, n) => s + n, 0)
                const sorted = Object.entries(formatDist).sort(([, a], [, b]) => b - a)
                return (
                  <div className="space-y-2">
                    {sorted.map(([fmt, n]) => {
                      const pct = Math.round(n / total * 100)
                      return (
                        <div key={fmt} className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-600 w-16 flex-shrink-0">{fmt}</span>
                          <div className="flex-1 h-3 bg-teal-100 rounded-full overflow-hidden">
                            <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] font-bold text-teal-700 w-8 text-right flex-shrink-0">{n}종목</span>
                          <span className="text-[10px] text-gray-400 w-8 text-right flex-shrink-0">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
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

          {/* 오늘 경기 시간대 분포 */}
          {(() => {
            const todayStr = new Date().toISOString().slice(0, 10)
            const todayRecs = scoreRecords.filter(r => r.recordedAt?.startsWith(todayStr))
            if (todayRecs.length === 0) return null
            const morning = todayRecs.filter(r => { const h = new Date(r.recordedAt).getHours(); return h < 12 }).length
            const afternoon = todayRecs.filter(r => { const h = new Date(r.recordedAt).getHours(); return h >= 12 && h < 18 }).length
            const evening = todayRecs.filter(r => { const h = new Date(r.recordedAt).getHours(); return h >= 18 }).length
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-2">
                  오늘 경기 시간대 분포
                  <span className="text-[10px] text-gray-400 font-normal">총 {todayRecs.length}건</span>
                </h2>
                <div className="flex gap-2 flex-wrap">
                  {morning > 0 && <span className="text-xs bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full font-medium">오전 {morning}건</span>}
                  {afternoon > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">오후 {afternoon}건</span>}
                  {evening > 0 && <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full font-medium">저녁 {evening}건</span>}
                </div>
              </section>
            )
          })()}

          {/* 체크인 현황 분석 */}
          {checkInStats.total > 0 && (
            <section className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                  <CheckCircle size={14} className="text-green-500" /> 체크인 현황 분석
                </h2>
                {checkInStats.unchecked.length > 0 && (
                  <button onClick={exportUncheckedCSV} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2 py-1 rounded-lg bg-white no-print">
                    <Download size={11} /> 미체크인 CSV
                  </button>
                )}
              </div>
              {/* 도넛 차트 */}
              {(() => {
                const pct = checkInStats.total > 0 ? checkInStats.checked / checkInStats.total : 0
                const r = 36, cx = 48, cy = 48, circ = 2 * Math.PI * r
                const filled = circ * pct
                return (
                  <div className="flex items-center gap-5 mb-4">
                    <svg width={96} height={96} viewBox="0 0 96 96">
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth={10} />
                      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#14b8a6" strokeWidth={10}
                        strokeDasharray={`${filled} ${circ}`} strokeDashoffset={circ * 0.25}
                        strokeLinecap="round" />
                      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#14b8a6">{Math.round(pct * 100)}%</text>
                      <text x={cx} y={cy + 11} textAnchor="middle" fontSize={8} fill="#9ca3af">체크인율</text>
                    </svg>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-teal-500 flex-shrink-0" /><span className="text-gray-600">체크인 <strong>{checkInStats.checked}명</strong></span></div>
                      <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-gray-200 flex-shrink-0" /><span className="text-gray-500">미체크인 <strong>{checkInStats.unchecked.length}명</strong></span></div>
                      <div className="text-gray-400 pt-1">전체 {checkInStats.total}명</div>
                    </div>
                  </div>
                )
              })()}
              {/* 전체 진행률 */}
              <div className="mb-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>전체 체크인</span>
                  <span className="font-medium text-gray-700">{checkInStats.checked}/{checkInStats.total}명 ({checkInStats.total > 0 ? Math.round(checkInStats.checked / checkInStats.total * 100) : 0}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${checkInStats.total > 0 ? Math.round(checkInStats.checked / checkInStats.total * 100) : 0}%` }} />
                </div>
              </div>
              {/* 부문별 */}
              <div className="space-y-1.5">
                {DIVISIONS.filter(d => checkInStats.byDiv[d].total > 0).map(d => {
                  const { total, checked } = checkInStats.byDiv[d]
                  const pct = Math.round(checked / total * 100)
                  return (
                    <div key={d} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-14 flex-shrink-0">{d}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${DIV_COLORS[d]}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-20 text-right flex-shrink-0">{checked}/{total} ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
              {checkInStats.unchecked.length > 0 && (
                <p className="text-xs text-orange-500 mt-2">미체크인 {checkInStats.unchecked.length}명</p>
              )}
            </section>
          )}

          {/* 부문×성별 체크인 히트맵 */}
          {checkInStats.total >= 4 && (() => {
            const GENDERS = ['남', '여'] as const
            const cells = DIVISIONS.map(div =>
              GENDERS.map(g => {
                const total = players.filter(p => p.division === div && p.gender === g).length
                const checked = players.filter(p => p.division === div && p.gender === g && p.checkedIn).length
                return { div, g, total, checked, pct: total > 0 ? Math.round(checked / total * 100) : -1 }
              })
            )
            const hasData = cells.flat().some(c => c.total > 0)
            if (!hasData) return null
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <CheckCircle size={14} className="text-teal-500" /> 부문·성별 체크인 현황
                </h2>
                <div className="overflow-x-auto">
                  <table className="text-xs border-collapse w-full">
                    <thead>
                      <tr>
                        <th className="w-16 text-left text-gray-400 font-normal py-1 pr-2" />
                        {GENDERS.map(g => (
                          <th key={g} className={`text-center text-[11px] font-semibold py-1 px-2 ${g === '남' ? 'text-blue-600' : 'text-pink-600'}`}>{g}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DIVISIONS.map((div, di) => (
                        <tr key={div}>
                          <td className="text-[11px] text-gray-500 pr-2 py-1">{div}</td>
                          {cells[di].map(c => (
                            <td key={c.g} className="px-1 py-0.5">
                              {c.total === 0 ? (
                                <div className="w-16 h-7 rounded bg-gray-50 flex items-center justify-center text-[9px] text-gray-300">-</div>
                              ) : (
                                <div
                                  className="w-16 h-7 rounded flex items-center justify-center text-[10px] font-bold text-white"
                                  style={{ backgroundColor: `rgba(20,184,166,${Math.max(0.12, c.pct / 100)})` }}
                                  title={`${div} ${c.g}: ${c.checked}/${c.total} (${c.pct}%)`}
                                >
                                  <span className={c.pct >= 50 ? 'text-white' : 'text-teal-800'}>{c.pct}%</span>
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })()}

          {/* 종목별 평균 세트 수 */}
          {eventSetStats.length > 0 && (
            <section className="card">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                <Layers size={14} className="text-indigo-500" /> 종목별 평균 세트 수
              </h2>
              <div className="space-y-2">
                {eventSetStats.map(({ label, avg, count }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-gray-600 text-right flex-shrink-0 truncate">{label}</div>
                    <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden relative">
                      <div
                        className="h-full bg-indigo-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (avg / 7) * 100)}%` }}
                      />
                    </div>
                    <div className="w-20 text-xs font-semibold text-indigo-700 flex-shrink-0">
                      평균 {avg}세트 <span className="text-gray-400 font-normal">({count}경기)</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 점수 기록 기반 승률 TOP 5 */}
          {winRateTop5.length > 0 && (
            <section className="card">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                <TrendingUp size={14} className="text-rose-500" /> 승률 TOP {winRateTop5.length} (점수 기록 기준)
              </h2>
              <div className="space-y-1.5">
                {winRateTop5.map((p, i) => {
                  const full = players.find(pl => pl.id === p.id)
                  const isOpen = winRateDetailId === p.id
                  return (
                    <div key={p.id}>
                      <div className={`flex items-center gap-3 cursor-pointer rounded-lg px-1 py-0.5 hover:bg-gray-50 ${isOpen ? 'bg-rose-50' : ''}`}
                        onClick={() => setWinRateDetailId(isOpen ? null : p.id)}>
                        <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0 ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-300 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                        <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
                        <span className="text-xs text-gray-400">{p.wins}승 {p.losses}패</span>
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-rose-400 rounded-full" style={{ width: `${p.rate}%` }} />
                        </div>
                        <span className="text-sm font-bold text-rose-600 w-10 text-right">{p.rate}%</span>
                        <span className="text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                      </div>
                      {isOpen && full && (
                        <div className="mt-1 ml-8 px-3 py-2 bg-rose-50 rounded-lg border border-rose-100 text-xs flex flex-wrap gap-x-4 gap-y-1">
                          <span className="text-gray-600">학교: <strong>{full.school || '-'}</strong></span>
                          <span className="text-gray-600">부서: <strong>{full.division}</strong></span>
                          <span className="text-gray-600">포인트: <strong className="text-blue-600">{full.points}</strong></span>
                          <span className="text-gray-600">Elo: <strong className="text-purple-600">{full.rating ?? 1000}</strong></span>
                          <span className="text-gray-600">성별: <strong>{full.gender}</strong></span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 대회별 참가자 수 차트 */}
          {tournaments.length > 0 && (() => {
            const rows = [...tournaments]
              .map(t => {
                const ids = new Set(t.events.flatMap(ev => ev.matches.flatMap(m => [m.participant1Id, m.participant2Id].filter(Boolean) as string[])))
                return { name: t.name.length > 8 ? t.name.slice(0, 8) + '…' : t.name, count: ids.size, status: t.status }
              })
              .sort((a, b) => b.count - a.count)
              .slice(0, 5)
            const maxVal = Math.max(...rows.map(r => r.count), 1)
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <Users size={14} className="text-blue-500" /> 대회별 참가자 수
                </h2>
                <div className="space-y-2">
                  {rows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-20 flex-shrink-0 truncate">{r.name}</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${r.status === 'completed' ? 'bg-gray-400' : r.status === 'ongoing' ? 'bg-blue-500' : 'bg-blue-200'}`}
                          style={{ width: `${Math.max(r.count / maxVal * 100, r.count > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-gray-600 w-6 text-right flex-shrink-0">{r.count}</span>
                    </div>
                  ))}
                </div>
              </section>
            )
          })()}

          {/* 최근 7일 경기 수 차트 */}
          {scoreRecords.length > 0 && (
            <section className="card">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                <BarChart3 size={14} className="text-indigo-500" /> 최근 7일 경기 수
              </h2>
              <div className="flex items-end gap-1.5 h-20">
                {(() => {
                  const maxVal = Math.max(...dailyMatchCounts.map(d => d.count), 1)
                  return dailyMatchCounts.map(d => (
                    <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-500 leading-none">{d.count > 0 ? d.count : ''}</span>
                      <div className="w-full flex items-end" style={{ height: 52 }}>
                        <div
                          className={`w-full rounded-t-sm transition-all ${d.isToday ? 'bg-indigo-500' : 'bg-indigo-200'}`}
                          style={{ height: `${Math.max(d.count / maxVal * 100, d.count > 0 ? 8 : 2)}%` }}
                        />
                      </div>
                      <span className={`text-[9px] leading-none ${d.isToday ? 'font-bold text-indigo-600' : 'text-gray-400'}`}>{d.key}</span>
                    </div>
                  ))
                })()}
              </div>
            </section>
          )}

          {/* 최근 30일 경기 히트맵 */}
          {scoreRecords.length > 0 && (() => {
            const today = new Date(); today.setHours(0,0,0,0)
            const days = Array.from({ length: 30 }, (_, i) => {
              const d = new Date(today); d.setDate(today.getDate() - 29 + i)
              const key = d.toISOString().split('T')[0]
              const count = scoreRecords.filter(r => r.recordedAt?.startsWith(key)).length
              const dayOfWeek = d.getDay()
              return { key, count, dayOfWeek, isToday: i === 29, label: `${d.getMonth()+1}/${d.getDate()}` }
            })
            const maxCount = Math.max(...days.map(d => d.count), 1)
            // Group into weeks (columns)
            const firstDow = days[0].dayOfWeek
            const padded = [...Array(firstDow).fill(null), ...days]
            const weeks: (typeof days[0] | null)[][] = []
            for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7))
            if (weeks[weeks.length-1].length < 7) { while (weeks[weeks.length-1].length < 7) weeks[weeks.length-1].push(null) }
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <BarChart3 size={14} className="text-indigo-500" /> 최근 30일 경기 현황
                </h2>
                <div className="flex gap-0.5">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-0.5 flex-1">
                      {week.map((day, di) => (
                        <div key={di}
                          className={`rounded-sm h-5 flex items-center justify-center ${day === null ? 'bg-transparent' : day.count === 0 ? 'bg-gray-100' : day.isToday ? 'bg-indigo-500' : `bg-indigo-${Math.max(1, Math.round(day.count / maxCount * 4)) * 100 + 100}`}`}
                          title={day ? `${day.label}: ${day.count}경기` : ''}>
                          {day?.isToday && <span className="text-[8px] text-white font-bold">{day.count}</span>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-end gap-1.5 mt-2">
                  <span className="text-[10px] text-gray-400">적음</span>
                  {[100,200,300,400,500].map(shade => (
                    <div key={shade} className={`w-3 h-3 rounded-sm bg-indigo-${shade}`} />
                  ))}
                  <span className="text-[10px] text-gray-400">많음</span>
                </div>
              </section>
            )
          })()}

          {/* 포인트 TOP 3 선수 */}
          {players.length >= 3 && (() => {
            const medals = ['🥇', '🥈', '🥉']
            const top3 = [...players].sort((a, b) => b.points - a.points).slice(0, 3)
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <Trophy size={14} className="text-yellow-500" /> 포인트 TOP 3
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  {top3.map((p, i) => {
                    const total = p.wins + p.losses
                    const wr = total > 0 ? Math.round(p.wins / total * 100) : 0
                    return (
                      <div key={p.id} className={`rounded-xl border p-3 text-center ${i === 0 ? 'border-yellow-300 bg-yellow-50' : i === 1 ? 'border-gray-300 bg-gray-50' : 'border-orange-200 bg-orange-50'}`}>
                        <div className="text-2xl mb-1">{medals[i]}</div>
                        <div className="font-bold text-sm text-gray-800 truncate">{p.name}</div>
                        <div className="text-xs text-gray-500 truncate mb-1.5">{p.school}</div>
                        <div className="font-black text-blue-600 text-base">{p.points.toLocaleString()}P</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{p.wins}승 {p.losses}패 · {wr}%</div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })()}

          {/* 최다 참가 선수 TOP 3 */}
          {scoreRecords.length > 0 && (() => {
            const countMap = new Map<string, number>()
            scoreRecords.forEach(r => {
              if (r.participant1Id) countMap.set(r.participant1Id, (countMap.get(r.participant1Id) ?? 0) + 1)
              if (r.participant2Id) countMap.set(r.participant2Id, (countMap.get(r.participant2Id) ?? 0) + 1)
            })
            const top3 = [...countMap.entries()]
              .map(([id, cnt]) => {
                const p = players.find(pl => pl.id === id)
                if (!p || cnt < 3) return null
                const total = p.wins + p.losses
                const wr = total > 0 ? Math.round(p.wins / total * 100) : 0
                return { p, cnt, wr }
              })
              .filter(Boolean)
              .sort((a, b) => b!.cnt - a!.cnt)
              .slice(0, 3) as { p: typeof players[0]; cnt: number; wr: number }[]
            if (top3.length === 0) return null
            const medals = ['🥇', '🥈', '🥉']
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <Users size={14} className="text-teal-500" /> 최다 참가 선수 TOP 3
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  {top3.map(({ p, cnt, wr }, i) => (
                    <div key={p.id} className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-center">
                      <div className="text-2xl mb-1">{medals[i]}</div>
                      <div className="font-bold text-sm text-gray-800 truncate">{p.name}</div>
                      <div className="text-xs text-gray-500 truncate mb-1.5">{p.school}</div>
                      <div className="font-black text-teal-600 text-base">{cnt}경기</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">승률 {wr}%</div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })()}

          {/* 대회별 완료 경기 수 비교 */}
          {tournaments.length >= 2 && (() => {
            const items = tournaments.map(t => {
              const done = t.events.reduce((s, ev) => s + ev.matches.filter(m => m.result).length, 0)
              const total = t.events.reduce((s, ev) => s + ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length, 0)
              return { name: t.name.length > 16 ? t.name.slice(0, 14) + '…' : t.name, done, total }
            }).filter(x => x.total > 0)
            if (items.length < 2) return null
            const maxDone = Math.max(...items.map(x => x.done), 1)
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <Trophy size={14} className="text-amber-500" /> 대회별 완료 경기
                </h2>
                <div className="space-y-1.5">
                  {items.map((item, i) => {
                    const pct = item.total > 0 ? item.done / item.total : 0
                    const R = 8, circ = 2 * Math.PI * R, dash = pct * circ
                    const color = pct === 1 ? '#22c55e' : pct >= 0.5 ? '#f59e0b' : '#d1d5db'
                    return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-600 w-28 flex-shrink-0 truncate">{item.name}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.round(item.done / maxDone * 100)}%` }} />
                      </div>
                      <span className="text-[11px] text-gray-500 w-12 text-right flex-shrink-0">{item.done}/{item.total}</span>
                      <svg width={20} height={20} viewBox="0 0 20 20" className="flex-shrink-0">
                        <circle cx={10} cy={10} r={R} fill="none" stroke="#e5e7eb" strokeWidth={3} />
                        <circle cx={10} cy={10} r={R} fill="none" stroke={color} strokeWidth={3}
                          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 10 10)" />
                      </svg>
                    </div>
                  )})}

                </div>
              </section>
            )
          })()}

          {/* 선수 포인트 분포 히스토그램 */}
          {(() => {
            const pts = players.filter(p => p.points > 0).map(p => p.points)
            if (pts.length < 3) return null
            const maxPt = Math.max(...pts)
            const bucketSize = Math.ceil(maxPt / 5 / 100) * 100 || 100
            const buckets: { label: string; count: number }[] = []
            for (let i = 0; i < 5; i++) {
              const lo = i * bucketSize, hi = (i + 1) * bucketSize
              const count = pts.filter(p => p >= lo && p < hi).length
              if (count > 0 || i === 0) buckets.push({ label: `${lo}-${hi - 1}`, count })
            }
            const maxCount = Math.max(...buckets.map(b => b.count), 1)
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <BarChart3 size={14} className="text-blue-500" /> 선수 포인트 분포
                </h2>
                <div className="space-y-1.5">
                  {buckets.map((b, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-20 flex-shrink-0 text-right">{b.label}P</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                        <div className="h-full bg-blue-400 rounded transition-all" style={{ width: `${Math.round(b.count / maxCount * 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-600 font-medium w-8 flex-shrink-0">{b.count}명</span>
                    </div>
                  ))}
                </div>
              </section>
            )
          })()}

          {/* 종목별 완료율 도넛 그리드 */}
          {(() => {
            const activeTours = tournaments.filter(t => t.status === 'ongoing')
            if (activeTours.length === 0) return null
            const evItems = activeTours.flatMap(t =>
              t.events.map(ev => {
                const total = ev.matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye).length
                const done = ev.matches.filter(m => m.result).length
                return { label: ev.label, total, done }
              }).filter(x => x.total > 0)
            )
            if (evItems.length < 3) return null
            const R = 14, stroke = 4, circ = 2 * Math.PI * R
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <Grid3x3 size={14} className="text-indigo-500" /> 종목별 완료율
                </h2>
                <div className="flex flex-wrap gap-4 justify-start">
                  {evItems.map((ev, i) => {
                    const pct = Math.round(ev.done / ev.total * 100)
                    const dash = circ * pct / 100
                    const color = pct === 100 ? '#22c55e' : pct >= 50 ? '#6366f1' : '#f59e0b'
                    return (
                      <div key={i} className="flex flex-col items-center gap-1 min-w-[52px]">
                        <svg width={36} height={36} viewBox="0 0 36 36">
                          <circle cx={18} cy={18} r={R} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
                          <circle cx={18} cy={18} r={R} fill="none" stroke={color} strokeWidth={stroke}
                            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                            transform="rotate(-90 18 18)" />
                          <text x={18} y={22} textAnchor="middle" fontSize={8} fontWeight="bold" fill={color}>{pct}%</text>
                        </svg>
                        <span className="text-[10px] text-gray-600 text-center leading-tight max-w-[52px] truncate">{ev.label}</span>
                        <span className="text-[9px] text-gray-400">{ev.done}/{ev.total}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })()}

          {/* 시간대별 경기 완료 히트맵 */}
          {scoreRecords.length >= 5 && (() => {
            const HOURS = Array.from({ length: 24 }, (_, i) => i)
            const DAYS = ['일', '월', '화', '수', '목', '금', '토']
            const grid = Array.from({ length: 7 }, () => new Array(24).fill(0))
            scoreRecords.forEach(r => {
              const d = new Date(r.recordedAt)
              grid[d.getDay()][d.getHours()]++
            })
            const maxVal = Math.max(...grid.flat(), 1)
            const peakHours = HOURS.filter(h => grid.flat().slice(h).some((_, idx) => idx % 24 === 0 && grid[Math.floor(idx/24)][h] > 0))
            const activeHours = HOURS.filter(h => DAYS.some((_, d) => grid[d][h] > 0))
            if (activeHours.length === 0) return null
            const hMin = Math.min(...activeHours), hMax = Math.max(...activeHours)
            const visHours = HOURS.slice(hMin, hMax + 1)
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <Grid3x3 size={14} className="text-violet-500" /> 시간대별 경기 기록
                </h2>
                <div className="overflow-x-auto">
                  <table className="text-[10px] border-collapse">
                    <thead>
                      <tr>
                        <th className="w-5 pr-1" />
                        {visHours.map(h => (
                          <th key={h} className="w-5 text-center text-gray-400 font-normal pb-1">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {DAYS.map((day, d) => (
                        <tr key={d}>
                          <td className="pr-1 text-gray-400 font-medium text-right">{day}</td>
                          {visHours.map(h => {
                            const n = grid[d][h]
                            const opacity = n === 0 ? 0 : Math.max(0.15, n / maxVal)
                            return (
                              <td key={h} className="p-0.5">
                                <div
                                  className="w-4 h-4 rounded-sm"
                                  style={{ backgroundColor: n === 0 ? '#f3f4f6' : `rgba(99,102,241,${opacity})` }}
                                  title={`${day}요일 ${h}시: ${n}경기`}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })()}

          {/* 세트 수 분포 히스토그램 */}
          {(() => {
            const withSets = scoreRecords.filter(r => r.sets && r.sets.length > 0)
            if (withSets.length < 5) return null
            const bins = [1, 2, 3, 4, 5].map(n => ({ n, count: withSets.filter(r => r.sets!.length === n).length }))
            const maxN = Math.max(...bins.map(b => b.count), 1)
            const total = withSets.length
            return (
              <section className="card">
                <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                  <BarChart3 size={14} className="text-rose-500" /> 세트 수 분포
                </h2>
                <div className="space-y-1.5">
                  {bins.filter(b => b.count > 0).map(({ n, count }) => (
                    <div key={n} className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-500 w-10 flex-shrink-0">{n}세트</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${Math.round(count / maxN * 100)}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-rose-700 w-6 text-right flex-shrink-0">{count}</span>
                      <span className="text-[10px] text-gray-400 w-8 text-right flex-shrink-0">{Math.round(count / total * 100)}%</span>
                    </div>
                  ))}
                </div>
              </section>
            )
          })()}

        </div>
      </div>
    </div>
  )
}
