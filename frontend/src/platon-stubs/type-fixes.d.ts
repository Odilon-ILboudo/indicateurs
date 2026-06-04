// This file must be treated as a module for augmentation to work
export {}

// ExercisePlayer is missing 'id' and 'state' compared to PlayerExercise.
// Augment the type to make the assertion in player-manager.model.ts valid.
declare module '@platon/feature/player/common' {
  interface ExercisePlayer {
    id?: string
    answerId?: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    state?: any
  }
}
