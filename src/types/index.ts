export type Division = '초등' | '중등' | '고등' | '대학' | '일반' | '생활체육'
export type EventType = '단식' | '복식' | '혼합복식' | '단체전'
export type Gender = '남' | '여' | '혼합'
export type BracketFormat = '토너먼트' | '리그' | '조별+토너먼트' | '시드예선' | '더블엘리미네이션'
export type SmartBracketFormat = 'single' | 'group' | 'league' | 'seeded'

export interface SmartEventInput {
  id: string
  division: Division
  eventType: EventType
  gender: Gender
  participantCount: number
  bracketFormat: SmartBracketFormat
  label: string
  preferredDayStart?: number
  preferredDayEnd?: number
  preferredCourtStart?: number
  preferredCourtEnd?: number
  seedCount?: number
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
  feePaid?: boolean    // 참가비 납부 여부
  photoUrl?: string    // 선수 사진 URL
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
  teamSubMatches?: TeamSubMatch[]
}

export interface TeamSubMatch {
  player1Id: string | null
  player2Id: string | null
  winnerId: 'team1' | 'team2' | null
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
  phase?: 'qual' | 'main' | 'wb' | 'lb' | 'gf'
  // 더블 엘리미네이션: 패자 진출 경로 + 명시적 슬롯 배정
  loserNextMatchId?: string | null
  nextSlot?: 1 | 2       // 승자가 nextMatch의 1·2번 슬롯 중 어디로
  loserSlot?: 1 | 2      // 패자가 loserNextMatch의 1·2번 슬롯 중 어디로
  // 조별→본선 배선: 이 경기 참가자 슬롯의 출처 ko-slot id (영구 보존 → 조 재순위 시 재해석 가능)
  slotRef?: { p1?: string; p2?: string }
  setScores?: Array<[number, number]>
  tableNo?: number
  teamSubMatches?: TeamSubMatch[]
}

export interface Group {
  id: string
  name: string
  participantIds: string[]
  advanceCount: number
}

// 종목 단위로 마지막에 적용된 포인트·승패·레이팅 델타 (idempotent 정산용)
// 결과 입력/수정/취소 시 이 값과의 차이만 선수에게 반영 → 누적 오염 방지
export interface EventAwards {
  points: Record<string, number>      // playerId → 가산 포인트
  wins: Record<string, number>        // playerId → 승 수
  losses: Record<string, number>      // playerId → 패 수
  ratingDelta: Record<string, number> // playerId → Elo 레이팅 변화량 (단식만)
  gamesDelta: Record<string, number>  // playerId → 경기 수 변화량 (단식만)
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
  seedCount?: number
  participationAwarded?: boolean  // (deprecated) v3.4 incremental 방식 잔재 — 현재 미사용
  awards?: EventAwards            // 마지막 정산 스냅샷
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
  linkedTournamentId?: string
  // 다일차 운영 설정(시간 재배치 시 day별 운영창으로 사용). 구버전 plan은 없음 → 단일 타임라인.
  days?: { day: number; date?: string; label?: string; startTime: string; endTime: string; courtCount: number }[]
}

export interface SchedulePreset {
  id: string
  name: string
  config: {
    totalDays: number
    dayConfigs: { day: number; date?: string; label?: string; startTime: string; endTime: string; courtCount: number }[]
    globalMinutesPerMatch: number
    globalTeamMinutes: number
    globalBuffer: number
    teamCourtCount: number
  }
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
