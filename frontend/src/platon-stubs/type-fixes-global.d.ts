// Global ambient declarations (no imports/exports allowed in this file)

// Shepherd.js namespace declaration
// shepherd.js default export = ShepherdBase instance which has Tour: typeof Tour
// Using 'any' to avoid incompatible type assignments across versions.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace Shepherd {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Tour = any
}
