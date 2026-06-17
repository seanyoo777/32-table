import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Player, Pair, Team, Tournament, TournamentEvent,
  SchedulePlan, ScoreRecord, BracketMatch, MatchResult, LiveMatch, MatchCall
} from '../types'
import { generatePlayers, generatePairs, generateTournaments, generateSchedules } from '../data/mockData'
import { getGroupRankedIds } from '../utils/bracketUtils'
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
}

const DEFAULT_SETTINGS: AppSettings = {
  venueName: '',
  organizerName: '',
  season: new Date().getFullYear().toString(),
  contactPhone: '',
  contactEmail: '',
}

interface StoreState {
  players: Player[]
  pairs: Pair[]
  teams: Team[]
  tournaments: Tournament[]
  schedules: SchedulePlan[]
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
  deleteSchedule: (id: string) => void

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

  // Rating & Check-in
  updatePlayerRating: (id: string, newRating: number, gamesPlayed: number) => void

  // App settings
  updateAppSettings: (s: Partial<AppSettings>) => void

  // Sync
  syncTournament: (tournamentId: string) => Promise<void>

  // Backup & Restore
  resetAllData: () => void
  restoreBackup: (data: Partial<StoreState>) => void
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      players: INIT_PLAYERS,
      pairs: INIT_PAIRS,
      teams: [],
      tournaments: INIT_TOURS,
      schedules: INIT_SCHEDS,
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
       set((s) => ({
        tournaments: s.tournaments.map(t => {
          if (t.id !== tournamentId) return t

          const newEvents = t.events.map(ev => {
            if (ev.id !== eventId) return ev

            // 1) Record the match result
            let matches = ev.matches.map((m): BracketMatch =>
              m.id === matchId ? { ...m, result } : m
            )

            // 2) Advance winner to next knockout round via nextMatchId
            matches = matches.map((m): BracketMatch => {
              const feeders = matches.filter(f => f.nextMatchId === m.id && f.result)
              if (feeders.length === 0) return m
              const updated = { ...m }
              feeders.forEach(f => {
                const allFeeders = matches.filter(x => x.nextMatchId === m.id)
                const isFirst = allFeeders.indexOf(f) === 0
                if (isFirst) updated.participant1Id = f.result!.winnerId
                else updated.participant2Id = f.result!.winnerId
              })
              return updated
            })

            // 2.5) 3·4위전: 준결승 패자를 자동 배정
            const thirdPlaceIdx = matches.findIndex(m => m.isThirdPlace)
            if (thirdPlaceIdx >= 0) {
              const knockout = matches.filter(m => !m.isThirdPlace && !m.groupId)
              const maxKnockRound = Math.max(...knockout.map(m => m.round), 1)
              const finalM = knockout.find(m => m.round === maxKnockRound && !m.nextMatchId)
              if (finalM) {
                const semis = knockout
                  .filter(m => m.nextMatchId === finalM.id)
                  .sort((a, b) => a.position - b.position)
                const tp = matches[thirdPlaceIdx]
                const p1 = semis[0]?.result?.loserId || tp.participant1Id
                const p2 = semis[1]?.result?.loserId || tp.participant2Id
                if (p1 !== tp.participant1Id || p2 !== tp.participant2Id) {
                  matches = matches.map((m, i) =>
                    i === thirdPlaceIdx ? { ...m, participant1Id: p1, participant2Id: p2 } : m
                  )
                }
              }
            }

            // 3) Group stage → Knockout wiring
            // When all matches of a group are done, fill the knockout placeholder slots
            if (ev.bracketFormat === '조별+토너먼트' && ev.groups.length > 0) {
              for (const group of ev.groups) {
                const groupMatches = matches.filter(m => m.groupId === group.id)
                const allDone = groupMatches.length > 0 && groupMatches.every(m => m.result)
                if (!allDone) continue

                // Get ranked participant IDs for this group
                const rankedIds = getGroupRankedIds(groupMatches, group)

                // Fill knockout slots for this group's advancers
                for (let rank = 1; rank <= group.advanceCount; rank++) {
                  const advancerId = rankedIds[rank - 1]
                  if (!advancerId) continue
                  const slotId = `ko-slot-${group.id}-r${rank}`
                  // Replace placeholder id in knockout matches
                  matches = matches.map((m): BracketMatch => {
                    if (m.groupId) return m // skip group-stage matches
                    const p1Updated = m.participant1Id === slotId ? advancerId : m.participant1Id
                    const p2Updated = m.participant2Id === slotId ? advancerId : m.participant2Id
                    return p1Updated !== m.participant1Id || p2Updated !== m.participant2Id
                      ? { ...m, participant1Id: p1Updated, participant2Id: p2Updated }
                      : m
                  })
                }
              }
            }

            // 4) Auto-transition event status
            const realMatches = matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
            const allCompleted = realMatches.length > 0 && realMatches.every(m => m.result)
            const newStatus = allCompleted ? 'completed' : ev.status === 'draft' ? 'ongoing' : ev.status

            return { ...ev, matches, status: newStatus as TournamentEvent['status'] }
          })

          // 5) Auto-transition tournament status
          const allEventsCompleted = newEvents.every(ev => ev.status === 'completed')
          const newTournamentStatus = allEventsCompleted ? 'completed'
            : t.status === 'draft' ? 'ongoing'
            : t.status

          return { ...t, events: newEvents, status: newTournamentStatus as Tournament['status'] }
        })
      }))
       const updated2 = get().tournaments.find(t => t.id === tournamentId)
       if (updated2) uploadTournament(updated2).catch(() => {})
      },

      clearMatchResult: (tournamentId, eventId, matchId) => {
        set((s) => ({
          tournaments: s.tournaments.map(t => {
            if (t.id !== tournamentId) return t
            const newEvents = t.events.map(ev => {
              if (ev.id !== eventId) return ev
              const target = ev.matches.find(m => m.id === matchId)
              if (!target?.result) return ev
              const formerWinnerId = target.result.winnerId
              const formerLoserId = target.result.loserId
              const matches = ev.matches.map((m): BracketMatch => {
                if (m.id === matchId) return { ...m, result: null }
                // Remove winner from the next knockout match
                if (target.nextMatchId && m.id === target.nextMatchId) {
                  const p1 = m.participant1Id === formerWinnerId ? null : m.participant1Id
                  const p2 = m.participant2Id === formerWinnerId ? null : m.participant2Id
                  return { ...m, participant1Id: p1, participant2Id: p2 }
                }
                // Remove loser from 3rd place match
                if (m.isThirdPlace) {
                  const p1 = m.participant1Id === formerLoserId ? null : m.participant1Id
                  const p2 = m.participant2Id === formerLoserId ? null : m.participant2Id
                  return { ...m, participant1Id: p1, participant2Id: p2 }
                }
                return m
              })
              const realMatches = matches.filter(m => m.participant1Id && m.participant2Id && !m.isBye)
              const allCompleted = realMatches.length > 0 && realMatches.every(m => m.result)
              const newStatus: TournamentEvent['status'] = allCompleted ? 'completed' : 'ongoing'
              return { ...ev, matches, status: newStatus }
            })
            const allDone = newEvents.every(ev => ev.status === 'completed')
            return { ...t, events: newEvents, status: (allDone ? 'completed' : 'ongoing') as Tournament['status'] }
          })
        }))
        const updated = get().tournaments.find(t => t.id === tournamentId)
        if (updated) uploadTournament(updated).catch(() => {})
      },

      // Schedules
      addSchedule: (s) => set((st) => ({ schedules: [...st.schedules, s] })),
      deleteSchedule: (id) => set((s) => ({ schedules: s.schedules.filter(sc => sc.id !== id) })),

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

      // Rating & Check-in
      updatePlayerRating: (id, newRating, gamesPlayed) => set((s) => ({
        players: s.players.map(p => p.id === id ? { ...p, rating: newRating, gamesPlayed } : p)
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
        appSettings: data.appSettings ?? s.appSettings,
      })),
    }),
    { name: 'pingpong-v3' }
  )
)
