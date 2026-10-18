/** Shared API transport. Inject `transport` for fixtures or tests. */
export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message || `Request failed (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.code = error?.code || 'HTTP_ERROR'
    this.details = error?.details || []
    this.requestId = error?.request_id || null
  }
}

export function createClient({ baseUrl = '', transport = fetch, getSessionId = () => null } = {}) {
  async function request(path, { method = 'GET', body, headers = {}, ...options } = {}) {
    const requestHeaders = { ...headers }
    const isForm = body instanceof FormData
    if (body !== undefined && !isForm) requestHeaders['Content-Type'] = 'application/json'
    if (path.startsWith('/api/redistribution/') && !(path.split('?')[0] === '/api/redistribution/demo' && method === 'POST')) {
      const sessionId = getSessionId()
      if (sessionId) requestHeaders['X-Demo-Session-Id'] = sessionId
    }
    const response = await transport(`${baseUrl}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      ...options,
    })
    const payload = response.status === 204 ? null : await response.json()
    if (!response.ok) throw new ApiError(response.status, payload?.error)
    return payload
  }
  return { request }
}

export function createFixtureTransport(fixtures) {
  return async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${new URL(url, 'http://fixture.local').pathname}`
    const fixture = fixtures[key]
    if (!fixture) throw new Error(`Missing fixture: ${key}`)
    const value = typeof fixture === 'function' ? await fixture(url, options) : fixture
    return {
      ok: (value.status || 200) < 400,
      status: value.status || 200,
      json: async () => value.body,
    }
  }
}
