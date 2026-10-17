const terminal = new Set(['ready', 'insufficient_data', 'error'])

/** Analysis polling ends when every reported component is terminal. */
export function allSettled(components) {
  return Object.values(components || {}).every(value => terminal.has(value))
}
