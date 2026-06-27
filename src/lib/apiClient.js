/**
 * Match District — Secure API Client
 *
 * Provides a fetch-based HTTP client with:
 *  - Automatic Bearer token attachment (from cookie / Supabase)
 *  - 401 response interception → secure logout + redirect
 *  - HTTPS enforcement in production
 *  - Optional retry with exponential backoff
 */

import { getAuthToken } from '../utils/getAuthToken.js'

const SESSION_EXPIRED_KEY = 'md_session_expired'
const LOGIN_PATH = '/login'
const MAX_RETRIES = 3
const BASE_DELAY_MS = 500

function isProduction() {
  try {
    return (
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
    )
  } catch {
    return false
  }
}

function enforceHttps(url) {
  if (!isProduction()) return url
  if (typeof url === 'string' && url.startsWith('http://')) {
    url = url.replace('http://', 'https://')
  }
  return url
}

function secureLogout() {
  try {
    sessionStorage.removeItem('md_persistent_session')
    localStorage.removeItem('md_persistent_session')
    document.cookie.split(';').forEach((c) => {
      document.cookie = c
        .replace(/^ +/, '')
        .replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`)
    })
    sessionStorage.setItem(SESSION_EXPIRED_KEY, 'true')
    window.location.href = `${LOGIN_PATH}?session_expired=true`
  } catch {
    window.location.href = LOGIN_PATH
  }
}

function shouldRetry(status) {
  return (
    status === 408 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504
  )
}

async function request(url, options = {}) {
  url = enforceHttps(url)

  const token = await getAuthToken()
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const config = { ...options, headers }

  let lastError = null
  let lastData = null
  let lastStatus = 0

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, config)
      lastStatus = res.status
      const text = await res.text()
      lastData = text ? JSON.parse(text) : {}

      if (res.ok) {
        return { ok: true, data: lastData, status: res.status }
      }

      if (res.status === 401) {
        secureLogout()
        return { ok: false, data: lastData, error: new Error('Unauthorized'), status: 401 }
      }

      lastError = new Error(
        lastData?.message || lastData?.error || `Request failed (${res.status})`
      )

      if (res.status >= 400 && res.status < 500 && !shouldRetry(res.status)) {
        break
      }
    } catch (err) {
      lastError = err
    }

    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * (attempt + 1)))
    }
  }

  return { ok: false, data: lastData, error: lastError, status: lastStatus }
}

export const apiClient = {
  get(url, options = {}) {
    return request(url, { ...options, method: 'GET' })
  },

  post(url, body, options = {}) {
    return request(url, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  },

  put(url, body, options = {}) {
    return request(url, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  },

  delete(url, options = {}) {
    return request(url, { ...options, method: 'DELETE' })
  },
}

export { request as secureFetch }
