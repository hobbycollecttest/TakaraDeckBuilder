import { accessToken } from './auth'

export type CloudDeck = { id: string; name: string; cards: Record<string, number>; updatedAt: string }

async function call<T>(method: string, body?: unknown, query = ''): Promise<T> {
  const token = await accessToken()
  if (!token) throw new Error('Please sign in again')
  const res = await fetch(`/api/decks${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data as T
}

export const listDecks = () => call<{ decks: CloudDeck[] }>('GET').then((r) => r.decks)
export const saveDeck = (deck: { id?: string; name: string; cards: Record<string, number> }) =>
  call<{ deck: CloudDeck }>('PUT', { game: 'horobeat', ...deck }).then((r) => r.deck)
export const deleteDeck = (id: string) => call<{ ok: true }>('DELETE', undefined, `?id=${encodeURIComponent(id)}`)
