// Stub: @platon/feature/compiler

export interface ActivityExerciseGroup {
  readonly name: string
  readonly exercises: Array<{
    readonly id: string
    readonly resource: string
  }>
}

export type ActivitySettings = Record<string, unknown>

export type Variables = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any
}
