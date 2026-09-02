import type { AdminSuggestion, BotChallenge, Entry, Version } from './types'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Algo deu errado. Tente novamente.')
  }
  return body as T
}

export async function getEntry(slug: string, signal: AbortSignal) {
  const result = await request<{ entry: Entry }>(`/api/entries/${encodeURIComponent(slug)}`, { signal })
  return result.entry
}

export async function getHistory(slug: string, signal?: AbortSignal) {
  const result = await request<{ versions: Version[] }>(
    `/api/entries/${encodeURIComponent(slug)}/history`,
    { signal },
  )
  return result.versions
}

export function getBotChallenge() {
  return request<BotChallenge>('/api/anti-bot')
}

export function sendSuggestion(
  slug: string,
  definition: string,
  author: string,
  antiBotToken: string,
  website: string,
) {
  return request<{ suggestion: { id: number; status: string; createdAt: string } }>(
    `/api/entries/${encodeURIComponent(slug)}/suggestions`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ definition, author, antiBotToken, website }),
    },
  )
}

export function getAdminSession() {
  return request<{ authenticated: boolean; username: string | null }>('/api/admin/session')
}

export function loginAdmin(username: string, password: string) {
  return request<{ username: string }>('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export function logoutAdmin() {
  return request<{ ok: boolean }>('/api/admin/logout', { method: 'POST' })
}

export async function getAdminSuggestions() {
  const result = await request<{ suggestions: AdminSuggestion[] }>('/api/admin/suggestions')
  return result.suggestions
}

export function reviewAdminSuggestion(id: number, decision: 'approve' | 'reject') {
  return request<{ suggestion: AdminSuggestion }>(`/api/admin/suggestions/${id}/${decision}`, {
    method: 'POST',
  })
}
