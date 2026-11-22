// The known-mistakes test. Loads each saved position and asks the computer players what they would do.
// A forbidden mistake fails the check for Hard (and Expert with --expert). Habits are counted only.
//   npx tsx tools/bot-lab/check.ts            (both games)
//   npx tsx tools/bot-lab/check.ts haikyu
// Positions go stale when the rules engine or the cards change; refresh them with
//   npx tsx tools/bot-lab/audit.ts <game> normal 80 --save
import fs from 'node:fs'
import path from 'node:path'
import { GAMES, HERE, loadDeck, rng, seat } from './lab'
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
// --seats=easy,beginner tests other players (they are allowed these mistakes, so expect failures: a way to see the test bite).
const asked = process.argv.find((x) => x.startsWith('--seats='))
const seats = (asked ? asked.slice(8).split(',') : ['normal', 'hard', ...(process.argv.includes('--expert') ? ['expert'] : [])]).map(seat)
let failed = 0
for (const [key, g] of Object.entries(GAMES)) {
  if (only.length && !only.includes(key)) continue
  const file = path.join(HERE, 'mistakes', `${key}.json`)
  if (!fs.existsSync(file)) { console.log(`${g.label}: no saved positions yet`); continue }
  const cases = JSON.parse(fs.readFileSync(file, 'utf8')) as { mistake: string; seed: number; decks: [string, string]; answers: number[] }[]
  const rows: Record<string, { ok: number; bad: number; stale: number; habit: number }> = {}
  for (const c of cases) {
    const k = g.mistakes.find((x) => x.id === c.mistake)
    const row = (rows[c.mistake] ||= { ok: 0, bad: 0, stale: 0, habit: 0 })
    if (!k) { row.stale++; continue }
    const ids = c.decks.map((f) => loadDeck(path.join(HERE, 'decks', key, f)).ids) as [string[], string[]]
    for (const s of seats) {
      for (let t = 0; t < 3; t++) {
        let m
        try { m = g.replay({ seed: c.seed, decks: ids, names: ['A', 'B'] }, c.answers) } catch { m = null }
        const flags = m && m.req ? m.req.opts.map((o: unknown) => k.is(m, o)) : []
        if (!flags.some(Boolean) || flags.every(Boolean)) { row.stale++; continue }
        const choice = g.choose(m, s.level, rng(c.seed * 31 + t), s.effort)
        if (!flags[choice]) row.ok++
        else if (k.forbid && s.level !== 'normal') { row.bad++; failed++; console.log(`  FAILED ${key} ${c.mistake}: ${s.label} chose "${m.req.opts[choice].label}" (seed ${c.seed}, ${c.answers.length} answers in)`) }
        else row.habit++
      }
    }
  }
  console.log(g.label)
  for (const k of g.mistakes) {
    const r = rows[k.id] || { ok: 0, bad: 0, stale: 0, habit: 0 }
    console.log(`  ${r.bad ? 'FAIL' : r.ok ? 'pass' : 'none'}  ${k.id}: ${r.ok} right, ${r.bad} wrong${r.habit ? `, ${r.habit} against the habit` : ''}${r.stale ? `, ${r.stale} stale` : ''}`)
  }
}
if (failed) { console.log(`\n${failed} known mistakes came back.`); process.exit(1) }
console.log('\nNo known mistake came back.')
