import type { TournamentGrade } from '../types'

// ─── USATT-style Elo Rating System ───────────────────────────
// Reference: USA Table Tennis Rating system
// All players (초등~생활체육) share a single unified rating pool

export const RATING_LABELS = [
  { min: 2400, label: '전국 정상급', color: 'text-red-600', bg: 'bg-red-50' },
  { min: 2000, label: '엘리트', color: 'text-orange-600', bg: 'bg-orange-50' },
  { min: 1700, label: '상급', color: 'text-yellow-600', bg: 'bg-yellow-50' },
  { min: 1400, label: '중상급', color: 'text-green-600', bg: 'bg-green-50' },
  { min: 1100, label: '중급', color: 'text-blue-600', bg: 'bg-blue-50' },
  { min: 800,  label: '초중급', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { min: 0,    label: '초급', color: 'text-gray-500', bg: 'bg-gray-50' },
]

export function getRatingLabel(rating: number) {
  return RATING_LABELS.find(r => rating >= r.min) ?? RATING_LABELS[RATING_LABELS.length - 1]
}

// Expected score probability (Elo formula)
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
}

// K-factor: higher for new/low-rated players, lower for established players
// Follows USATT K-factor logic
export function getKFactor(gamesPlayed: number, rating: number): number {
  if (gamesPlayed < 20) return 64    // provisional
  if (gamesPlayed < 50) return 32    // developing
  if (rating < 1200) return 28
  if (rating < 1600) return 24
  if (rating < 2000) return 20
  return 16                           // elite
}

// Calculate new ratings after a match
export function calcNewRatings(
  ratingA: number, gamesA: number,
  ratingB: number, gamesB: number,
  aWon: boolean
): { newA: number; newB: number; changeA: number; changeB: number } {
  const eA = expectedScore(ratingA, ratingB)
  const eB = 1 - eA
  const kA = getKFactor(gamesA, ratingA)
  const kB = getKFactor(gamesB, ratingB)
  const sA = aWon ? 1 : 0
  const sB = aWon ? 0 : 1
  const changeA = Math.round(kA * (sA - eA))
  const changeB = Math.round(kB * (sB - eB))
  return {
    newA: Math.max(100, ratingA + changeA),
    newB: Math.max(100, ratingB + changeB),
    changeA,
    changeB,
  }
}

// Convert legacy points to initial Elo rating
export function pointsToRating(points: number): number {
  // points range ~50-900 → rating range 800-2100
  return Math.round(800 + (points / 900) * 1300)
}

// ─── 대한탁구협회 + USATT 통합 포인트 시스템 ─────────────────
export const GRADE_POINTS: Record<TournamentGrade, Record<string, number>> = {
  'S급': { '우승': 1000, '준우승': 700, '3위': 500, '4위': 350, '8강': 200, '16강': 100, '32강': 50, '64강': 25, '참가': 10 },
  'A급': { '우승': 600, '준우승': 420, '3위': 300, '4위': 210, '8강': 120, '16강': 60, '32강': 30, '64강': 15, '참가': 5 },
  'B급': { '우승': 300, '준우승': 210, '3위': 150, '4위': 105, '8강': 60, '16강': 30, '32강': 15, '참가': 3 },
  'C급': { '우승': 150, '준우승': 105, '3위': 75, '4위': 53, '8강': 30, '16강': 15, '참가': 2 },
  '생활체육S': { '우승': 200, '준우승': 140, '3위': 100, '4위': 70, '8강': 40, '16강': 20, '참가': 5 },
  '생활체육A': { '우승': 100, '준우승': 70, '3위': 50, '4위': 35, '8강': 20, '16강': 10, '참가': 3 },
  '생활체육B': { '우승': 50, '준우승': 35, '3위': 25, '4위': 18, '8강': 10, '참가': 2 },
}

export function calcAchievement(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round
  if (fromEnd === 0) return '우승'
  if (fromEnd === 1) return '준우승'
  if (fromEnd === 2) return '3위'
  if (fromEnd === 3) return '4위'
  if (fromEnd === 4) return '8강'
  if (fromEnd === 5) return '16강'
  if (fromEnd === 6) return '32강'
  if (fromEnd === 7) return '64강'
  return '참가'
}

export function getPointsForResult(grade: TournamentGrade, achievement: string): number {
  const table = GRADE_POINTS[grade]
  if (!table) return 0
  return table[achievement] ?? table['참가'] ?? 0
}

export function getGradeLabel(grade: TournamentGrade): string { return grade }

export const TOURNAMENT_GRADES: TournamentGrade[] = ['S급', 'A급', 'B급', 'C급', '생활체육S', '생활체육A', '생활체육B']

// 종목별 포인트 배율
export function getEventMultiplier(eventType: string): number {
  if (eventType === '복식') return 0.7
  if (eventType === '혼합복식') return 0.6
  if (eventType === '단체전') return 0.8
  return 1.0  // 단식
}

// Elo 기반 포인트 배율: 이변(upset) 승리 시 더 많은 포인트
export function eloPointsMultiplier(winnerRating: number, loserRating: number): number {
  const diff = loserRating - winnerRating // 양수 = 이변
  if (diff >= 400) return 1.8
  if (diff >= 200) return 1.4
  if (diff >= 100) return 1.2
  if (diff >= -100) return 1.0
  if (diff >= -200) return 0.8
  return 0.6
}
