# Bot lab

The workshop for the TakaraDecks computer players and for deck testing. It is not part of the website:
nothing here is shipped to visitors, and running it costs nothing on Vercel or Neon.

It exists so that the bots are a standing project that keeps getting taught, measured and upgraded,
for every game on the site, instead of being rebuilt from scratch each time.

Run everything from the repo root.

## The tools

| Command | What it answers |
|---|---|
| `npm run bot:check` | Did any mistake the bot was already taught come back? Run before every bot change is published. |
| `npm run bot:audit -- horobeat hard 60` | The scoreboard: how often does a player make each known mistake? |
| `npm run bot:ladder -- haikyu hard normal 200` | Does player A beat player B, and by how much? |
| `npm run bot:league -- horobeat hard 8 --out=results/hb.json` | Every test deck against every other. |
| `npm run bot:report -- results/hb.json > results/hb.md` | Ranking, first/second split and matchup table from league results. |
| `npm run bot:swaps -- horobeat hard:sims=12 400 base.json idea.json` | Is this deck change better than the original? |
| `npx tsx tools/bot-lab/card-stats.ts ...` | HORO-BEAT only: win rate per card when it is in the opening hand. |
| `npx tsx tools/bot-lab/timing.ts horobeat hard 6` | How long one decision takes. |

A player is written as a level with optional settings: `normal`, `hard`, `expert`, `hard:sims=150`,
`hard:plain` (the first, simpler thinking method, kept for comparisons). In the lab, thinking is never
cut off by the clock, so a run gives the same result every time.

Game names: `horobeat` (or `hb`), `haikyu` (or `hq`).

## How the bots are built

- `src/sim/ai.ts` and `src/sim/hq/ai.ts`: the habits (rules of thumb) for Beginner, Easy and Normal.
- `src/sim/search.ts`: thinking ahead for Hard and Expert. It imagines the hidden cards, plays sample
  games with the Normal habits for each choice, and picks the choice that wins most.
- `MISTAKES` in each `ai.ts`: what the bot has been taught. Normal avoids these by habit. There are two kinds:
  - `forbid: true`: a move that can never be right (adding power to a line already won). Hard and Expert never consider it.
  - `forbid: false`: usually wrong, sometimes right (passing with an empty board to save Ena for the Ena Draw).
    Hard and Expert weigh it like any other move. If it comes out on top it is played off against the best
    ordinary move for longer, and chosen only when clearly ahead. A close call goes to the ordinary move.
  Prefer `forbid: false` unless the move is strictly dominated. The goal is to win the match, not one battle.
- The tutorials use `tutorChoice`, a frozen copy of the original Normal habits, so lessons never change.

## Teaching the bot something new

When someone reports "the bot does X and it is a waste":

1. **Write X as a test on one choice** and add it to `MISTAKES` (id, date, plain description).
   If it is only usually wrong, mark it as a habit (`forbid: false`) so Hard and Expert may still do it.
2. **Measure it.** `npm run bot:audit -- <game> hard 60` shows how often it happens. If it almost never
   happens, the report was about something else: ask for the cards involved.
3. **Fix the habit** in `ai.ts` if Normal does it too.
4. **Prove it did not make the bot weaker.** `npm run bot:ladder -- <game> hard normal 200` before and
   after, or new against old. A habit change needs about 1,500 Normal games to trust a 3 point difference.
5. **Save positions.** `npm run bot:audit -- <game> normal 80 --save` rewrites `mistakes/<game>.json`.
6. `npm run bot:check` must pass, and the tutorial check must still play the same.
7. Add the lesson to the list below.

## What the bots have been taught

| Date | Game | Lesson | Measured |
|---|---|---|---|
| 2026-11-22 | HORO-BEAT | Do not play a Horobeat and cover it the same turn unless a card gains from the stack; play the bigger one alone | 1,630 to 36 in 3,000 games; win rate unchanged |
| 2026-11-22 | HORO-BEAT | On a free play, prefer the empty line unless covering wins the line (a default, not a ban) | 2 of 22 to 0 of 22 |
| 2026-11-22 | HORO-BEAT | No Boost or power-only Waza on a line already being won | 50 to 7 uses in 60 games (the 7 are effect Waza) |
| 2026-11-22 | HORO-BEAT | Passing with an empty board is a last resort, chosen only when clearly better (saving Ena for the Ena Draw can be right) | Hard passed 28 times in 60 games, mostly wrongly; now about 5 in 123 chances, 3 of them confirmed better |
| 2026-11-22 | HORO-BEAT | No Boost or power-only Waza on a line that stays lost even with everything affordable | Hard: 0 of 161 chances after the fix |
| 2026-11-22 | Haikyu | Block when the block is certain and the hand cannot finish a rally | +3.4 points |
| 2026-11-22 | Haikyu | Block when one blocker is enough | +3.4 points; new beats old 58% over 1,600 Normal games |

## What we know about thinking budgets (2026-11-22)

- The current way of sharing out sample games (drop choices that are clearly behind, spend on close calls,
  stop early) beats the first method about 58% of the time at the same budget, in both games.
- Hard: 48 to 150 sample games per choice was worth 63% (HORO-BEAT) and 57% (Haikyu). 300 beat 150 57% of the time.
- Expert: going from 320 to 1,000 samples did not help in HORO-BEAT (45% over 40 games). More samples has run out;
  the next gains need better judgement in the sample games (whole-turn planning, tuned habits, a position judge).
- Expert beats Hard 57.5% in HORO-BEAT but only about 54% in Haikyu (not proven). Haikyu Expert needs work.
- One decision on the build machine: Hard about 45 to 80 ms, Expert about 200 to 300 ms. Phones are several
  times slower; the time caps (0.3 s Hard, 0.9 s Expert) are what protect them. `timing.ts` measures this.

## Lessons about testing (learned the hard way)

- A first batch flatters changes. Confirm on a second batch with a different seed before believing it.
- At 300 games the margin of error is about 3 points; at 1,000 about 1.6.
- Opening-hand card statistics are ideas, not verdicts. They said to cut Telepathy from Raiga Swarm;
  cutting it cost 11 to 13 points.
- Deck scores are only as good as the pilot. Combo decks (blue Waza chains) are probably underrated.
- Greedy "biggest card first" planning made the HORO-BEAT bot worse. More bodies beat one big body.
- Decks tuned with the Normal bot did not hold up under the Hard bot. Tune with at least `hard:sims=12`.

## Adding a game

A new game needs four things, then every tool here works for it:

1. **A rules engine** in `src/sim/<game>/engine.ts` with the same shape as the others: a class with
   `req` (the question waiting, with `p`, `kind`, `text`, `opts`), `answer(i)`, `answers`,
   `s.winner`, and `static replay(setup, answers)`. Everything random comes from the setup's seed.
2. **Habits** in `src/sim/<game>/ai.ts`: `cpuChoice(match, level, rnd, effort)` and a `MISTAKES` list.
   Start with Easy and Normal habits only. Hard and Expert come free from `searchChoice` once you write
   the small `searchGame` adapter (copy the match, hide what the player cannot see, score the result).
3. **One line in `GAMES`** in `tools/bot-lab/lab.ts`.
4. **Test decks** in `tools/bot-lab/decks/<game>/` as `{ "name": "...", "deck": { "<card id>": copies } }`.

Then: check the ladder climbs (Easy beats Beginner, Normal beats Easy, Hard beats Normal, Expert beats
Hard), and start collecting mistakes.

## Test decks

`decks/<game>/` is a snapshot of the public decks plus lab candidates. Refresh it from
`/api/public-decks?game=horobeat` or `?game=haikyu` (through a browser: the cloud container cannot
reach the site directly). Names ending in `[player]` belong to other players and `[lab]` are candidates
that have not been published.
