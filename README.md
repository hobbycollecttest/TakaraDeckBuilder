# TakaraDecks

Deck builder for Takara Tomy card games, starting with HORO-BEAT. Built by Hobby Collect.

- `src/` the app (Vite + React + TypeScript)
- `src/horobeat.json` card data, copied from the Hobby Collect singles list
- `public/cards/horobeat/` card pictures: `en` and `jp` for the grid, `en-lg` and `jp-lg` for the detail view

## The simulator (/play)

- `src/sim/engine.ts` the HORO-BEAT rules, written from the Comprehensive Rules
- `src/sim/scripts.ts` what each card's text does
- `src/sim/ai.ts` the CPU opponent
- `src/play/` the play screen

Everything runs in the player's browser. A match is saved on their device as a seed plus the list of choices made, so it uses no server, database or storage.

Friend matches (`api/match.ts`, `src/play/online.ts`) are the exception. Two players join with a room code and the server keeps the match in the `takaradecks_matches` table, sending each player only what they may see. A waiting player checks in every few seconds with one small read; rooms older than two days are deleted when a new one is made.

Check the rules after any change with `npx tsx scripts/sim-rules.ts` and `npx tsx scripts/sim-test.ts 1000`.

## Run it

```
npm install
npm run dev
```

## Deck rules (HORO-BEAT)

From the official general rules, section 5.1: a deck is exactly 50 cards, with at most 4 copies of the same card name.
