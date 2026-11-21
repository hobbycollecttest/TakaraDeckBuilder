# Deck lab

Tools for testing and improving HORO-BEAT (and Haikyu) decks with the game's own bots. Not part of the website.
Run from the repo root with `npx tsx tools/deck-lab/<tool>.ts`. The scripts import the engine from
`/home/claude/takaradeckbuilder/src/sim/...`; change those paths if the repo lives elsewhere.
Deck files are JSON: `{ "deck": { "<card id>": copies } }`. Get the current public decks from
`/api/public-decks?game=horobeat` (through a browser; the site is not reachable from the cloud container).

- `league.ts <hb|hq> <out.json> <rounds> <sims> <deck files...>`: round robin, Hard bot on both sides. `K0=100` env gives a second process different seeds. Used 8 rounds x 2 processes at 24 sims.
- `stats.ts <deck> <out.json> <games> <sims> <field decks...>`: per-card win rate when the card is in the opening hand, plus first/second player win rates. Noisy (about 5 points per card at 320 games). It wrongly suggested cutting Telepathy from Raiga Swarm; treat it as a source of ideas only.
- `ab.ts <out.json> <games> <sims> <seed> <field,comma,separated> <candidate decks...>`: every candidate plays the same field on the same seeds. This is the card swap tester. Always include the unchanged deck as a baseline, and confirm winners with a second run on a different seed: most first-run gains of 3 to 6 points disappear.
- `tune.ts --pool Red --init deck.json --out out.json --minutes 17 --field a.json,b.json`: random swap search with the Hard bot. Slow and rarely finds anything on an already tuned list.
- `opt.ts`: older optimiser using the Normal bot. Its results did not carry over to Hard-bot play.

Timing on 2 cores: about 0.28 s per game at 12 sims, 0.7 s at 24. Margin of error is about 3 points at 300 games.
