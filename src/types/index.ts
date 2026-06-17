export type Division = '초등' | '중등' | '고등' | '대학' | '일반' | '생활체육'
export type EventType = '단식' | '복식' | '혼합복식' | '단체전'
export type Gender = '남' | '여' | '혼합'
export type BracketFormat = '토너먼트' | '리그' | '조별+토너먼트'
export type SmartBracketFormat = 'single' | 'group' | 'league'

export interface SmartEventInput {
  id: string
  division: Division
  eventType: EventType
  gender: Gender
  participantCount: number
  bracketFormat: SmartBracketFormat
  label: string
}

export interface Player {
  id: string
  name: string
  school: string
  division: Division
  gender: '남' | '여'
  points: number
  wins: number
  losses: number
  createdAt: string
  birthYear?: number
  registrationNo?: string
  phone?: string
  // USATT-style Elo rating
  rating: number
  gamesPlayed: number
  checkedIn?: boolean  // 대회 당일 체크인 여부
}

export interface MatchCall {
  id: string
  matchId: string
  tournamentId: string
  eventId: string
  tableNo: number
  participant1Name: string
  participant2Name: string
  eventLabel: string
  calledAt: string
  acknowledged: boolean
}

export interface Pair {
  id: string
  player1Id: string
  player2Id: string
  name: string
  school: string
  division: Division
  gender: Gender
  points: number
  wins: number
  losses: number
}

export interface Team {
  id: string
  name: string
  school: string
  division: Division
  gender: Gender
  playerIds: string[]
  points: number
  wins: number
  losses: number
}

export interface MatchResult {
  winnerId: string
  loserId: string
  winnerScore: number
  loserScore: number
  sets?: Array<[number, number]>
  walkedOver?: boolean
}

export interface BracketMatch {
  id: string
  round: number
  position: number
  groupId?: string
  participant1Id: string | null
  participant2Id: string | null
  result: MatchResult | null
  nextMatchId: string | null
  courtNo?: number
  scheduledTime?: string
  isBye?: boolean
  isThirdPlace?: boolean
  setScores?: Array<[number, number]>
  tableNo?: number
}

export interface Group {
  id: string
  name: string
  participantIds: string[]
  advanceCount: number
}

export interface TournamentEvent {
  id: string
  label: string
  eventType: EventType
  gender: Gender
  division: Division
  bracketFormat: BracketFormat
  participantIds: string[]
  groups: Group[]
  matches: BracketMatch[]
  pointsForWin: number
  status: 'draft' | 'ongoing' | 'completed'
  matchFormat?: MatchFormat
  hasThirdPlace?: boolean
}

export interface Tournament {
  id: string
  name: string
  date: string
  venue: string
  events: TournamentEvent[]
  status: 'draft' | 'ongoing' | 'completed'
  createdAt: string
  grade?: TournamentGrade
  defaultMatchFormat?: MatchFormat
}

export interface ScheduleEvent {
  id: string
  label: string
  division: Division
  eventType: EventType
  gender: Gender
  matchCount: number
  minutesPerMatch: number
  courtCount: number
  bufferMinutes: number
  type?: 'match' | 'break' | 'ceremony' | 'opening'
  day?: number
}

export interface ScheduleSlot {
  id: string
  eventId: string
  label: string
  division: Division
  eventType: EventType
  gender: Gender
  courtNo: number
  startTime: string
  endTime: string
  matchNo: number
  participant1?: string
  participant2?: string
  round?: string
  day?: number
  type?: 'match' | 'break' | 'ceremony' | 'opening'
}

export interface SchedulePlan {
  id: string
  name: string
  date: string
  startTime: string
  events: ScheduleEvent[]
  slots: ScheduleSlot[]
  createdAt: string
}

export interface ScoreRecord {
  id: string
  tournamentId: string
  eventId: string
  matchId: string
  participant1Id: string
  participant2Id: string
  p1Score: number
  p2Score: number
  sets: Array<[number, number]>
  recordedBy: string
  recordedAt: string
  verified: boolean
}

export type TournamentGrade = 'S급' | 'A급' | 'B급' | 'C급' | '생활체육S' | '생활체육A' | '생활체육B'
export type MatchFormat = { sets: 3 | 5 | 7; pointsPerGame: 11 | 21 }

export interface LiveMatch {
  tournamentId: string
  eventId: string
  matchId: string
  participant1Id: string
  participant2Id: string
  matchFormat: MatchFormat
  currentSet: number
  currentSetScore: [number, number]
  completedSets: Array<[number, number]>
  tableNo: number
}
