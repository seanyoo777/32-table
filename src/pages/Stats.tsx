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
              <div className="space-y-2">
                {winRateTop5.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0 ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-300 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                    <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
                    <span className="text-xs text-gray-400">{p.wins}승 {p.losses}패</span>
                    <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-rose-400 rounded-full" style={{ width: `${p.rate}%` }} />
                    </div>
                    <span className="text-sm font-bold text-rose-600 w-10 text-right">{p.rate}%</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 대회별 참가자 수 차트 */}
          {tournaments.length > 0 && (
            <section className="card">
              <h2 className="font-semibold text-gray-700 text-sm flex items-center gap-2 mb-3">
                <Users size={14} className="text-blue-500" /> 대회별 참가자 수
              </h2>
              {(() => {
                const rows = [...tournaments]
                  .sort((a, b) => b.participants.length - a.participants.length)
                  .slice(0, 5)
                  .map(t => ({ name: t.name.length > 8 ? t.name.slice(0, 8) + '…' : t.name, count: t.participants.length, status: t.status }))
                const maxVal = Math.max(...rows.map(r => r.count), 1)
                return (
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
                )
              })()}
            </section>
          )}

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

        </div>
      </div>
    </div>
  )
}
