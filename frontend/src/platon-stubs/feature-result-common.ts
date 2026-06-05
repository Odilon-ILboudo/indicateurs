// Stub: @platon/feature/result/common

export interface CourseLeaderboardEntry {
  readonly userId: string
  readonly username: string
  readonly progression: number
  readonly timeSpent: number
}

export interface ActivityLeaderboardEntry {
  readonly userId: string
  readonly username: string
  readonly progression: number
  readonly timeSpent: number
}

export interface ResourceDashboardModel {
  readonly session?: {
    readonly averageScore?: number
    readonly averageDuration?: number
    readonly successRate?: number
    readonly answerDistribution?: unknown[]
    readonly scoreDistribution?: unknown[]
    readonly durationDistribution?: unknown[]
  }
  readonly exercise?: {
    readonly totalAttempts?: number
    readonly averageAttempts?: number
    readonly averageTimeToAttempt?: number
    readonly successRateOnFirstAttempt?: number
    readonly averageAttemptsToSuccess?: number
    readonly answerRate?: number
    readonly dropoutRate?: number
    readonly exerciseResults?: unknown[]
  }
  readonly activity?: {
    readonly totalAttempts?: number
    readonly answerRate?: number
    readonly dropoutRate?: number
    readonly usedInCoursesCount?: number
  }
}

export type AnswerStates = 'ANSWERED' | 'SUCCEEDED' | 'PART_SUCC' | 'FAILED' | 'STARTED' | 'NOT_STARTED' | 'ERROR'

export interface ValueAverage {
  sum: number
  avg: number
  count: number
  isRate?: boolean
}

export interface UserExerciseResults {
  id: string
  state: AnswerStates
  title: string
  grade: number
  attempts: number
  duration: number
  sessionId?: string
}

export interface UserResults {
  id: string
  username: string
  firstName: string
  lastName: string
  email: string
  correcting?: boolean
  exercises: Record<string, UserExerciseResults>
}

export interface UserActivityResultsDistribution {
  id: string
  username: string
  firstName: string
  lastName: string
  nbSuccess: Record<string, number>
}

export interface ExerciseResults {
  id: string
  title: string
  states: Record<AnswerStates, number>
  grades: ValueAverage
  attempts: ValueAverage
  durations: ValueAverage
  answerRate: ValueAverage
  successRate: ValueAverage
  dropoutRate: ValueAverage
  averageTimeToAttempt: ValueAverage
  averageAttemptsToSuccess: ValueAverage
  successRateOnFirstAttempt: ValueAverage
  details: number[]
}

export interface ActivityResults {
  successRate: number
  averageScore: number
  averageDuration: number
  answerRate: number
  dropoutRate: number
  users: UserResults[]
  exercises: ExerciseResults[]
}
