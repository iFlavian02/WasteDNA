/**
 * Persistent demo-session controller shared by the shell and feature pages.
 * `startPath` creates the session (the shell adds `?marketplace=true` for the
 * Iași customer map); `key` is where its ID is kept in `storage`.
 */
export const SESSION_KEY = 'wastedna-demo-session-id'
export const DEMO_PATH = '/api/redistribution/demo'

export function createSessionController({ client, storage = localStorage, onReset = () => {}, startPath = DEMO_PATH, key = SESSION_KEY }) {
  let sessionId = storage.getItem(key)
  let starting = null
  const getSessionId = () => sessionId
  // Concurrent callers (StrictMode effects, parallel requests) share one POST.
  const start = () => {
    starting ||= client.request(startPath, { method: 'POST' })
      .then(created => {
        sessionId = created.session_id
        storage.setItem(key, sessionId)
        return sessionId
      })
      .finally(() => { starting = null })
    return starting
  }
  const ensure = async () => sessionId || start()
  const request = async (path, options) => {
    if (path.startsWith('/api/redistribution/') && path.split('?')[0] !== DEMO_PATH) await ensure()
    try {
      return await client.request(path, options)
    } catch (error) {
      if (path.startsWith('/api/redistribution/') && error.status === 404 && error.code === 'NOT_FOUND') {
        try {
          await client.request('/api/redistribution/donors')
        } catch (probeError) {
          if (probeError.status === 404 && probeError.code === 'NOT_FOUND') {
            storage.removeItem(key)
            sessionId = null
            await start()
            onReset()
          }
        }
      }
      throw error
    }
  }
  return { getSessionId, ensure, request }
}
