// Match replays. A match is fully described by its setup (decks, shuffle seed, names) and the list of
// choices made, so a replay is just those two things played back. They are kept in this browser for the
// last few matches, and can be shared as a link that holds the whole match, squeezed small.
import { type Setup, type Side } from '../sim/engine'
import { store } from '../game'

export type Replay = { setup: Setup; answers: number[]; when: number; winner: Side | null; vs: string }
const KEY = 'hb.replays'
const KEEP = 10

export function recentReplays(): Replay[] {
  const list = store.get<Replay[]>(KEY, [])
  return Array.isArray(list) ? list.filter((r) => r && r.setup && Array.isArray(r.answers)) : []
}

/** Keep a finished match. The same match saved twice (a reload on the result screen) is kept once. */
export function keepReplay(r: Replay) {
  const same = (a: Replay) => a.setup.seed === r.setup.seed && a.answers.length === r.answers.length && a.setup.names.join() === r.setup.names.join()
  const list = [r, ...recentReplays().filter((a) => !same(a))].slice(0, KEEP)
  store.set(KEY, list)
}

const b64url = (bytes: Uint8Array) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}
async function squeeze(text: string, how: 'compress' | 'decompress', bytes?: Uint8Array) {
  const stream = how === 'compress'
    ? new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    : new Blob([bytes!.slice().buffer as ArrayBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** A link that opens this match as a replay on any device. */
export async function replayLink(r: Pick<Replay, 'setup' | 'answers'>) {
  const body = JSON.stringify({ v: 1, s: r.setup, a: r.answers })
  const packed = typeof CompressionStream === 'function' ? 'z' + b64url(await squeeze(body, 'compress')) : 'j' + b64url(new TextEncoder().encode(body))
  return `${location.origin}/play#replay=${packed}`
}

/** Read a replay from a link. Null when the link is broken or not a replay. */
export async function readReplayLink(hash: string): Promise<Pick<Replay, 'setup' | 'answers'> | null> {
  const raw = new URLSearchParams(hash.replace(/^#/, '')).get('replay')
  if (!raw) return null
  try {
    const bytes = unb64url(raw.slice(1))
    const text = raw[0] === 'z' ? new TextDecoder().decode(await squeeze('', 'decompress', bytes)) : new TextDecoder().decode(bytes)
    const data = JSON.parse(text) as { v: number; s: Setup; a: number[] }
    if (!data || !data.s || !Array.isArray(data.s.decks) || !Array.isArray(data.a)) return null
    return { setup: data.s, answers: data.a.filter((n) => Number.isInteger(n)) }
  } catch {
    return null
  }
}
