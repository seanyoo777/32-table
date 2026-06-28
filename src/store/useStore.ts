import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Player, Pair, Team, Tournament, TournamentEvent,
  SchedulePlan, SchedulePreset, ScoreRecord, BracketMatch, MatchResult, LiveMatch, MatchCall
} from '../types'
import { generatePlayers, generatePairs, generateTournaments, generateSchedules } from '../data/mockData'
import { wireSeededQualWinners, wireGroupAdvancers, propagateAndCascade, wireThirdPlace, propagateDoubleElim } from '../utils/bracketUtils'
import { applyEventSettlement } from '../utils/tournamentScoring'
import { uploadTournament, subscribeTournament, SYNC_ENABLED } from '../lib/sync'

// 최초 1회만 생성 (모듈 로드 시점)
const INIT_PLAYERS  = generatePlayers()
const INIT_PAIRS    = generatePairs(INIT_PLAYERS)
const INIT_TOURS    = generateTournaments(INIT_PLAYERS, INIT_PAIRS)
const INIT_SCHEDS   = generateSchedules()

export interface AppSettings {
  venueName: string
  organizerName: string
  season: string
  contactPhone: string
  contactEmail: string
  theme: 'light' | 'dark'
}

const DEFAULT_SETTINGS: AppSettings = {
  venueName: '',
  organizerName: '',
  season: new Date().getFullYear().toString(),
  contactPhone: '',
  contactEmail: '',
  theme: 'light',
}

interface StoreState {
  players: Player[]
  pairs: Pair[]
  teams: Team[]
  tournaments: Tournament[]
  schedules: SchedulePlan[]
  schedulePresets: SchedulePreset[]
  scoreRecords: ScoreRecord[]
  liveMatches: LiveMatch[]
  matchCalls: MatchCall[]
  appSettings: AppSettings
  syncStatus: 'idle' | 'syncing' | 'error'

  // Players
  addPlayer: (p: Player) => void
  updatePlayer: (id: string, data: Partial<Player>) => void
  deletePlayer: (id: string) => void
  addPlayerPoints: (id: string, pts: number, win: boolean) => void
  importPlayers: (ps: Player[]) => { added: number; skipped: number }

  // Pairs
  addPair: (p: Pair) => void
  updatePair: (id: string, data: Partial<Pair>) => void
  deletePair: (id: string) => void

  // Teams
  addTeam: (t: Team) => void
  deleteTeam: (id: string) => void

  // Tournaments
  addTournament: (t: Tournament) => void
  updateTournament: (id: string, data: Partial<Tournament>) => void
  deleteTournament: (id: string) => void
  recordMatchResult: (
    tournamentId: string,
    eventId: string,
    matchId: string,
    result: MatchResult
  ) => void
  clearMatchResult: (tournamentId: string, eventId: string, matchId: string) => void

  // Schedules
  addSchedule: (s: SchedulePlan) => void
  updateSchedule: (id: string, data: Partial<SchedulePlan>) => void
  deleteSchedule: (id: string) => void
  addSchedulePreset: (p: SchedulePreset) => void
  deleteSchedulePreset: (id: string) => void

  // Score Records
  addScoreRecord: (r: ScoreRecord) => void
  verifyScoreRecord: (id: string) => void

  // Live Matches
  setLiveMatch: (m: LiveMatch) => void
  removeLiveMatch: (matchId: string) => void

  // Match Calls (콜링)
  addMatchCall: (c: MatchCall) => void
  acknowledgeMatchCall: (id: string) => void
  removeMatchCall: (id: string) => void

  // Rating & Check-in & Fee
  updatePlayerRating: (id: string, newRating: number, gamesPlayed: number) => void
  toggleFeePaid: (id: string) => void
  resetFeePaid: () => void

  // App settings
  updateAppSettings: (s: Partial<AppSettings>) => void

  // Sync
  syncTournament: (tournamentId: string) => Promise<void>

  // Backup & Restore
  resetAllData: () => void
  restoreBackup: (data: Partial<StoreState>) => void
  resetSeasonStats: () => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      players: INIT_PLAYERS,
      pairs: INIT_PAIRS,
      teams: [],
      tournaments: INIT_TOURS,
      schedules: INIT_SCHEDS,
      schedulePresets: [],
      scoreRecords: [],
      liveMatches: [],
      matchCalls: [],
      appSettings: DEFAULT_SETTINGS,
      syncStatus: 'idle' as const,

      // Players
      addPlayer: (p) => set((s) => ({ players: [...s.players, p] })),
      updatePlayer: (id, data) => set((s) => ({
        players: s.players.map(p => p.id === id ? { ...p, ...data } : p)
      })),
      deletePlayer: (id) => set((s) => ({ players: s.players.filter(p => p.id !== id) })),
      addPlayerPoints: (id, pts, win) => set((s) => ({
        players: s.players.map(p => p.id === id
          ? { ...p, points: p.points + pts, wins: win ? p.wins + 1 : p.wins, losses: win ? p.losses : p.losses + 1 }
          : p)
      })),
      importPlayers: (newPlayers) => {
        let added = 0; let skipped = 0
        set((s) => {
          const existing = new Set(s.players.map(p => `${p.name}|${p.school}`))
          const toAdd = newPlayers.filter(p => {
            if (existing.has(`${p.name}|${p.school}`)) { skipped++; return false }
            added++; return true
          })
          return { players: [...s.players, ...toAdd] }
        })
        return { added, skipped }
      },

      // Pairs
      addPair: (p) => set((s) => ({ pairs: [...s.pairs, p] })),
      updatePair: (id, data) => set((s) => ({
        pairs: s.pairs.map(p => p.id === id ? { ...p, ...data } : p)
      })),
      deletePair: (id) => set((s) => ({ pairs: s.pairs.filter(p => p.id !== id) })),

      // Teams
      addTeam: (t) => set((s) => ({ teams: [...s.teams, t] })),
      deleteTeam: (id) => set((s) => ({ teams: s.teams.filter(t => t.id !== id) })),

      // Tournaments
      addTournament: (t) => {
        set((s) => ({ tournaments: [...s.tournaments, t] }))
        uploadTournament(t).catch(() => {})
      },
      updateTournament: (id, data) => {
        set((s) => ({ tournaments: s.tournaments.map(t => t.id === id ? { ...t, ...data } : t) }))
        const updated = get().tournaments.find(t => t.id === id)
        if (updated) uploadTournament(updated).catch(() => {})
      },
      deleteTournament: (id) => set((s) => ({
        tournaments: s.tournaments.filter(t => t.id !== id),
        scoreRecords: s.scoreRecords.filter(r => r.tournamentId !== id),
        liveMatches: s.liveMatches.filter(m => m.tournamentId !== id),
        matchCalls: s.matchCalls.filter(c => c.tournamentId !== id),
      })),

      recordMatchResult: (tournamentId, eventId, matchId, result) => {
        set((s) => {
          // 1) 브래킷 업데이트 (결과 기록 → 승자 전파 → 3·4위전 → 조별/예선 본선 배정 → 상태)
          const tournaments1 = s.tournaments.map(t => {
            if (t.id !== tournamentId) return t

            const newEvents = t.events.map(ev => {
              if (ev.id !== eventId) return ev

              // 결과 기록
              let matches = ev.matches.map((m): BracketMatch =>
                m.id === matchId ? { ...m, result } : m
              )

              // 더블 엘리미네이션: 승자·패자 동시 전파 (조별/3·4위전 로직 미적용)
              if (ev.bracketFormat === '더블엘리미네이션') {
                matches = propagateDoubleElim(matches)
                const realMatchesDE = matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
                const allCompletedDE = realMatchesDE.length > 0 && realMatchesDE.every(m => m.result)
                const newStatusDE = allCompletedDE ? 'completed' : ev.status === 'draft' ? 'ongoing' : ev.status
                return { ...ev, matches, status: newStatusDE as TournamentEvent['status'] }
              }

              // 승자 다음 라운드 진출 + 연쇄 정리
              matches = propagateAndCascade(matches)

              // 시드예선/조별 → 본선 슬롯 채우기 (그룹 완료 시)
              if (ev.bracketFormat === '시드예선' && ev.groups.length > 0) {
                matches = wireSeededQualWinners(ev, matches)
                matches = propagateAndCascade(matches)
              }
              if (ev.bracketFormat === '조별+토너먼트' && ev.groups.length > 0) {
                // 완료된 조의 진출자를 본선 슬롯에 idempotent 배선 (재순위·부전승 안전)
                matches = wireGroupAdvancers(ev, matches)
                matches = propagateAndCascade(matches)
              }

              // 3·4위전 준결승 패자 배정
              matches = wireThirdPlace(matches)

              // 종목 상태 전환
              const realMatches = matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
              const allCompleted = realMatches.length > 0 && realMatches.every(m => m.result)
              const newStatus = allCompleted ? 'completed' : ev.status === 'draft' ? 'ongoing' : ev.status

              return { ...ev, matches, status: newStatus as TournamentEvent['status'] }
            })

            const allEventsCompleted = newEvents.every(ev => ev.status === 'completed')
            const newTournamentStatus = allEventsCompleted ? 'completed'
              : t.status === 'draft' ? 'ongoing'
              : t.status
            return { ...t, events: newEvents, status: newTournamentStatus as Tournament['status'] }
          })

          // 2) 포인트·승패·Elo 일괄 정산 (종목 완료 시점에만 실제 반영, idempotent)
          const settled = applyEventSettlement(tournaments1, s.players, s.pairs, s.teams, tournamentId, eventId)
          return { tournaments: settled.tournaments, players: settled.players }
        })

        const updated = get().tournaments.find(t => t.id === tournamentId)
        if (updated) uploadTournament(updated).catch(() => {})
      },

      clearMatchResult: (tournamentId, eventId, matchId) => {
        set((s) => {
          const tournaments1 = s.tournaments.map(t => {
            if (t.id !== tournamentId) return t
            const newEvents = t.events.map(ev => {
              if (ev.id !== eventId) return ev
              const target = ev.matches.find(m => m.id === matchId)
              if (!target?.result) return ev

              // 결과 제거 → 승자 전파 연쇄 정리 → 3·4위전 재배정
              let matches = ev.matches.map((m): BracketMatch =>
                m.id === matchId ? { ...m, result: null } : m
              )
              if (ev.bracketFormat === '더블엘리미네이션') {
                matches = propagateDoubleElim(matches)
                const realDE = matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
                const doneDE = realDE.length > 0 && realDE.every(m => m.result)
                return { ...ev, matches, status: (doneDE ? 'completed' : 'ongoing') as TournamentEvent['status'] }
              }
              matches = propagateAndCascade(matches)
              if (ev.bracketFormat === '시드예선' && ev.groups.length > 0) {
                matches = wireSeededQualWinners(ev, matches)
                matches = propagateAndCascade(matches)
              }
              if (ev.bracketFormat === '조별+토너먼트' && ev.groups.length > 0) {
                matches = wireGroupAdvancers(ev, matches)
                matches = propagateAndCascade(matches)
              }
              matches = wireThirdPlace(matches)

              const realMatches = matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
              const allCompleted = realMatches.length > 0 && realMatches.every(m => m.result)
              const newStatus: TournamentEvent['status'] = allCompleted ? 'completed' : 'ongoing'
              return { ...ev, matches, status: newStatus }
            })
            const allDone = newEvents.every(ev => ev.status === 'completed')
            return { ...t, events: newEvents, status: (allDone ? 'completed' : 'ongoing') as Tournament['status'] }
          })

          // 정산 재실행 → 미완료 전환 시 직전 지급분 자동 롤백
          const settled = applyEventSettlement(tournaments1, s.players, s.pairs, s.teams, tournamentId, eventId)
          return { tournaments: settled.tournaments, players: settled.players }
        })
        const updated = get().tournaments.find(t => t.id === tournamentId)
        if (updated) uploadTournament(updated).catch(() => {})
      },

      // Schedules
      addSchedule: (s) => set((st) => ({ schedules: [...st.schedules, s] })),
      updateSchedule: (id, data) => set((st) => ({ schedules: st.schedules.map(sc => sc.id === id ? { ...sc, ...data } : sc) })),
      deleteSchedule: (id) => set((s) => ({ schedules: s.schedules.filter(sc => sc.id !== id) })),
      addSchedulePreset: (p) => set((s) => ({ schedulePresets: [...s.schedulePresets, p] })),
      deleteSchedulePreset: (id) => set((s) => ({ schedulePresets: s.schedulePresets.filter(p => p.id !== id) })),

      // Score Records
      addScoreRecord: (r) => set((s) => ({ scoreRecords: [...s.scoreRecords, r] })),
      verifyScoreRecord: (id) => set((s) => ({
        scoreRecords: s.scoreRecords.map(r => r.id === id ? { ...r, verified: true } : r)
      })),

      // Live Matches
      setLiveMatch: (m) => set((s) => ({
        liveMatches: [...s.liveMatches.filter(x => x.matchId !== m.matchId), m]
      })),
      removeLiveMatch: (matchId) => set((s) => ({
        liveMatches: s.liveMatches.filter(x => x.matchId !== matchId)
      })),

      // Match Calls (콜링)
      addMatchCall: (c) => set((s) => ({ matchCalls: [...s.matchCalls, c] })),
      acknowledgeMatchCall: (id) => set((s) => ({
        matchCalls: s.matchCalls.map(c => c.id === id ? { ...c, acknowledged: true } : c)
      })),
      removeMatchCall: (id) => set((s) => ({
        matchCalls: s.matchCalls.filter(c => c.id !== id)
      })),

      // Rating & Check-in & Fee
      updatePlayerRating: (id, newRating, gamesPlayed) => set((s) => ({
        players: s.players.map(p => p.id === id ? { ...p, rating: newRating, gamesPlayed } : p)
      })),
      toggleFeePaid: (id) => set((s) => ({
        players: s.players.map(p => p.id === id ? { ...p, feePaid: !p.feePaid } : p)
      })),
      resetFeePaid: () => set((s) => ({
        players: s.players.map(p => ({ ...p, feePaid: false }))
      })),

      // App settings
      updateAppSettings: (s) => set((st) => ({ appSettings: { ...st.appSettings, ...s } })),

      // Sync
      syncTournament: async (tournamentId) => {
        const t = get().tournaments.find(x => x.id === tournamentId)
        if (!t || !SYNC_ENABLED) return
        set({ syncStatus: 'syncing' })
        try {
          await uploadTournament(t)
          set({ syncStatus: 'idle' })
        } catch {
          set({ syncStatus: 'error' })
        }
      },

      // Backup & Restore
      resetAllData: () => set({
        players: [], pairs: [], teams: [], tournaments: [],
        schedules: [], scoreRecords: [], liveMatches: [], matchCalls: [],
      }),
      restoreBackup: (data) => set((s) => ({
        players: data.players ?? s.players,
        pairs: data.pairs ?? s.pairs,
        teams: data.teams ?? s.teams,
        tournaments: data.tournaments ?? s.tournaments,
        schedules: data.schedules ?? s.schedules,
        scoreRecords: data.scoreRecords ?? s.scoreRecords,
        liveMatches: data.liveMatches ?? s.liveMatches,
        matchCalls: data.matchCalls ?? s.matchCalls,
        appSettings: data.appSettings ?? s.appSettings,
      })),
      resetSeasonStats: () => set((s) => ({
        players: s.players.map(p => ({ ...p, points: 0, wins: 0, losses: 0, rating: 1000, gamesPlayed: 0, feePaid: false, checkedIn: false })),
        pairs: s.pairs.map(p => ({ ...p, points: 0, wins: 0, losses: 0 })),
        teams: s.teams.map(t => ({ ...t, points: 0, wins: 0, losses: 0 })),
        scoreRecords: [],
        liveMatches: [],
        matchCalls: [],
      })),
    }),
    { name: 'pingpong-v3' }
  )
)
