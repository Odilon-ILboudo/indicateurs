// src/modules/shared/constants/indicator.constants.ts
export const INDICATOR_IDS = {
  ATTEMPTS_BEFORE_SUCCESS_ACTIVITY: '11111111-1111-1111-1111-111111111111',
  AVERAGE_SCORE: '22222222-2222-2222-2222-222222222222',
  COMPLETION_RATE: '33333333-3333-3333-3333-333333333333',
} as const;

export const INDICATOR_TYPES = {
  ATTEMPTS_BEFORE_SUCCESS: 'attempts_before_first_success_activity',
  AVERAGE_SCORE: 'average_score',
  COMPLETION_RATE: 'completion_rate',
} as const;

export const INDICATOR_THRESHOLDS = {
  GOOD: 1,
  WARNING: 3,
  DANGER: 5,
} as const;