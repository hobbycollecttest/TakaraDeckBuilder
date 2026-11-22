// The scoreboard: how often does a computer player make each mistake it has been taught about?
//   npx tsx tools/bot-lab/audit.ts horobeat hard 60
// "Chances" are decisions where the mistake was possible and avoidable. Add `--save` to write the
// first few positions of each kind to mistakes/<game>.json for check.ts to test against.
import fs from 'node:fs'
import path from 'node:path'
import { decksFor, game, gameKey, HERE, playMatch, seat } from './lab'
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const save = process.argv.includes('--save')
const [gameName, who = 'hard', gamesS = '40'] = args
const g = game(gameName)
const decks = decksFor(gameName)
const S = seat(who)
const tally = Object.fromEntries(g.mistakes.map((k) => [k.id, { chances: 0, made: 0 }]))
type Case = { mistake: string; seed: number; decks: [string, string]; answers: number[]; asked: string }
const cases: Case[] = []
const PER = 6
for (let i = 0; i < +gamesS; i++) {
  const d1 = decks[i % decks.length]
  const d2 = decks[(i * 3 + 1) % decks.length]
  const seed = 6100 + i * 71
  const taken = new Set<string>()
  playMatch(g, { seed, decks: [d1.ids, d2.ids], names: ['A', 'B'] }, [S, S], (m, choice) => {
    for (const k of g.mistakes) {
      const flags = m.req.opts.map((o: unknown) => k.is(m, o))
      if (!flags.some(Boolean) || flags.every(Boolean)) continue
      tally[k.id].chances++
      if (flags[choice]) tally[k.id].made++
      if (save && !taken.has(k.id) && cases.filter((c) => c.mistake === k.id).length < PER) {
        taken.add(k.id)
        cases.push({ mistake: k.id, seed, decks: [path.basename(d1.file), path.basename(d2.file)], answers: [...m.answers], asked: m.req.text })
      }
    }
  })
}
console.log(`${g.label}, ${S.label}, ${gamesS} games (both seats)`)
for (const k of g.mistakes) {
  const t = tally[k.id]
  console.log(`  ${String(t.made).padStart(4)} of ${String(t.chances).padStart(4)} chances  ${k.forbid ? '' : '(habit) '}${k.what}`)
}
if (save) {
  const file = path.join(HERE, 'mistakes', `${gameKey(gameName)}.json`)
  fs.writeFileSync(file, JSON.stringify(cases, null, 0).replace(/\},\{/g, '},\n{') + '\n')
  console.log(`saved ${cases.length} positions to ${path.relative(process.cwd(), file)}`)
}
