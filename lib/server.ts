import { neon } from '@neondatabase/serverless'
import { createRemoteJWKSet, jwtVerify } from 'jose'

export const MAX_DECKS = 50
export const DECK_SIZE = 50
const MAX_ENTRIES = 120

const authBase = process.env.NEON_AUTH_BASE_URL || ''
const jwks = authBase ? createRemoteJWKSet(new URL(`${authBase}/.well-known/jwks.json`)) : null
const origin = authBase ? new URL(authBase).origin : ''
export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null
export const configured = Boolean(sql && jwks)

// Creates the table, or adds the columns newer versions need. Only runs when a query finds something missing.
async function setup() {
  await sql!`
    CREATE TABLE IF NOT EXISTS takaradecks_decks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      game text NOT NULL,
      name text NOT NULL,
      cards jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`
  await sql!`ALTER TABLE takaradecks_decks ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false`
  await sql!`ALTER TABLE takaradecks_decks ADD COLUMN IF NOT EXISTS author text NOT NULL DEFAULT ''`
  await sql!`CREATE INDEX IF NOT EXISTS takaradecks_decks_user ON takaradecks_decks (user_id, updated_at DESC)`
  await sql!`CREATE INDEX IF NOT EXISTS takaradecks_decks_public ON takaradecks_decks (game, updated_at DESC) WHERE is_public`
}

const missing = (err: unknown) => {
  const e = err as { code?: string; message?: string }
  return e?.code === '42P01' || e?.code === '42703' || /does not exist/i.test(e?.message || '')
}
export async function withTable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!missing(err)) throw err
    await setup()
    return run()
  }
}

// Signed-in players send the token Neon Auth issued them; it is checked against Neon's public keys.
export async function signedIn(authorization: string | undefined) {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token || !jwks) return null
  try {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ['EdDSA'], issuer: origin, audience: origin })
    if (typeof payload.sub !== 'string' || !payload.sub) return null
    return { id: payload.sub, name: typeof payload.name === 'string' ? payload.name : '' }
  } catch {
    return null
  }
}

export function cleanCards(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value as Record<string, unknown>)
  if (!entries.length || entries.length > MAX_ENTRIES) return null
  const cards: Record<string, number> = {}
  for (const [id, n] of entries) {
    if (!/^[a-z0-9-]{3,24}$/.test(id) || !Number.isInteger(n) || (n as number) < 1 || (n as number) > 4) return null
    cards[id] = n as number
  }
  return cards
}

// eslint-disable-next-line no-control-regex
export const cleanLabel = (value: unknown, max: number) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '')
export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
