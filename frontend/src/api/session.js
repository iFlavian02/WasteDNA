/** Persistent demo-session controller shared by the shell and feature pages. */
export const SESSION_KEY = 'wastedna-demo-session-id'

export function createSessionController({ client, storage = localStorage, onReset = () => {} }) {
  let sessionId = storage.getItem(SESSION_KEY)
  const getSessionId = () => sessionId
  const start = async () => {
    const created = await client.request('/api/redistribution/demo', { method: 'POST' })
    sessionId = created.session_id
    storage.setItem(SESSION_KEY, sessionId)
    return sessionId
  }
  const ensure = async () => sessionId || start()
  const request = async (path, options) => {
    if (path.startsWith('/api/redistribution/') && path !== '/api/redistribution/demo') await ensure()
    try {
      return await client.request(path, options)
    } catch (error) {
      if (path.startsWith('/api/redistribution/') && error.status === 404 && error.code === 'NOT_FOUND') {
        try {
          await client.request('/api/redistribution/donors')
        } catch (probeError) {
          if (probeError.status === 404 && probeError.code === 'NOT_FOUND') {
            storage.removeItem(SESSION_KEY)
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
