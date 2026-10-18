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

function invalidResponseError(status, kind) {
  const description = kind === 'empty' ? 'an empty response' : 'a non-JSON response'
  return new ApiError(status, {
    code: 'INVALID_RESPONSE',
    message: `The API returned ${description} (${status}). Check that the backend is running and the API URL is configured correctly.`,
  })
}

async function readPayload(response) {
  if (response.status === 204) return null

  // Fetch responses expose text(). Keeping the json() fallback makes injected
  // fixture transports backwards-compatible while production errors remain
  // diagnosable when a proxy returns an empty or HTML response.
  if (typeof response.text !== 'function') return response.json()
  const text = await response.text()
  if (!text.trim()) throw invalidResponseError(response.status, 'empty')
  try {
    return JSON.parse(text)
  } catch {
    throw invalidResponseError(response.status, 'non-json')
  }
}

export function createClient({ baseUrl = '', transport = fetch, getSessionId = () => null } = {}) {
  async function request(path, { method = 'GET', body, headers = {}, ...options } = {}) {
    const requestHeaders = { ...headers }
    const isForm = body instanceof FormData
    if (body !== undefined && !isForm) requestHeaders['Content-Type'] = 'application/json'
    if (path.startsWith('/api/redistribution/') && !(path === '/api/redistribution/demo' && method === 'POST')) {
      const sessionId = getSessionId()
      if (sessionId) requestHeaders['X-Demo-Session-Id'] = sessionId
    }
    let response
    try {
      response = await transport(`${baseUrl}${path}`, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        ...options,
      })
    } catch (cause) {
      const error = new ApiError(0, {
        code: 'NETWORK_ERROR',
        message: 'Unable to reach the API. Check that the backend is running and the API URL is configured correctly.',
      })
      error.cause = cause
      throw error
    }
    const payload = await readPayload(response)
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
      text: async () => value.body === undefined ? '' : JSON.stringify(value.body),
    }
  }
}
