import type { TournamentGrade } from '../types'

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

export function getGradeLabel(grade: TournamentGrade): string {
  return grade
}

export const TOURNAMENT_GRADES: TournamentGrade[] = ['S급', 'A급', 'B급', 'C급', '생활체육S', '생활체육A', '생활체육B']
