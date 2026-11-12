# TakaraDecks

Deck builder for Takara Tomy card games, starting with HORO-BEAT. Built by Hobby Collect.

- `src/` the app (Vite + React + TypeScript)
- `src/horobeat.json` card data, copied from the Hobby Collect singles list
- `public/cards/horobeat/` card pictures: `en` and `jp` for the grid, `en-lg` and `jp-lg` for the detail view

## Run it

```
npm install
npm run dev
```

## Deck rules (HORO-BEAT)

From the official general rules, section 5.1: a deck is exactly 50 cards, with at most 4 copies of the same card name.
