// What each HORO-BEAT card's text does, keyed by card name. Cards with no text are not listed.
// Keywords: `dd` is Double Damage, `barrier` is X Barrier. "Ena Reading" and "Resonance"
// are written as plain checks inside the effect they switch on.
import type { Color, Gen, Match, Script, Side } from './engine'

const opp = (p: Side) => (1 - p) as Side
const ena = (g: Match, p: Side, color: Color, n = 3) => g.enaCount(p, color) >= n
const upright = (g: Match, p: Side, line: number) => !g.isDown(p, line)
const underLines12 = (g: Match, p: Side) => g.under(p, 0) + g.under(p, 1)
const drawOnWin = (n: number): Script['onWin'] => function* (g, p) { g.draw(p, n) }
const recoverSelf: Script['onBattleEnd'] = function* (g, p, line) { g.recover(p, line) }
const drawIfDownedBase: Script['onOverbeaten'] = function* (g, p, _line, wasDown) { if (wasDown) g.draw(p, 1) }
const myLines = (g: Match, p: Side) => [0, 1, 2, 3, 4].filter((l) => g.top(p, l) != null)

export const SCRIPTS: Record<string, Script> = {
  // ---------------- Red ----------------
  'Leomaru': { onPlay: function* (g, p) { g.draw(p, 1) } },
  'Numbing Lantern': { noOverbeatOnto: true },
  'Kamaitachi Kamaji': { power: (_g, _p, line) => (line >= 1 ? 2000 : 0) },
  'Strange Machine Sempujin': { onWin: function* (g, p, line) { if (line >= 1) g.draw(p, 1) } },
  'Danda Dunk and Bakezouri': { onDestroyed: function* (g, p) { g.draw(p, 1) } },
  'Fateful Meeting: Leo and Jin': { onBoostUsed: function* (g, p) { g.draw(p, 1) } },
  'Okuri-Inu Kuroshiba': { oppNoBoost: true },
  'Raiju Dad': { power: (g, p) => (ena(g, p, 'Red') ? 2000 : 0) },
  'Illusion Healer Nanao': {
    onPlay: function* (g, p) {
      const line = yield* g.pickLine(p, p, 'Choose 1 of your Horobeat to recover.', myLines(g, p), false, (l) => (g.isDown(p, l) ? 2 : 1))
      if (line != null) g.recover(p, line)
    },
  },
  'Himeko and Mighty-Armed Hihi': { power: (g, p, line) => (upright(g, p, line) ? 2000 : 0) },
  'Nanao Guiding Hinata': { onBattleEnd: recoverSelf },
  'Yosuzume': {
    canPlay: (g, p, line) => [line - 1, line + 1].some((l) => l >= 0 && l < 5 && g.top(p, l) != null && g.power(p, l) >= 4000),
  },
  'Gather, Brethren! Leo & Jin': {
    noOverbeatOnto: true,
    onPlay: function* (g, p) {
      const picks = g.P(p).hand.filter((u) => { const d = g.def(u); return d.type === 'Horobeat' && d.color === 'Red' && d.cost <= 2 })
      yield* g.offerFreePlay(p, 'Play 1 red Horobeat with cost 2 or less from your hand for free?', picks)
    },
  },
  'Gale Kamaichi': { power: (_g, _p, line) => (line >= 1 ? 2500 : 0) },
  'Lively Student Akana': { onPlay: function* (g, p, uid) { const l = g.where(p, uid); if (l >= 0 && g.under(p, l) === 0) g.draw(p, 1) } },
  'Welcome Home: Nanao and Hinata': { noDamageOnLose: true },
  'Faceless Rider': { dd: true, noOverbeatFromHand: true },
  'Jin and Leo Thundering Together': { power: (g, p, line) => (ena(g, p, 'Red') && upright(g, p, line) ? 3000 : 0) },
  'Mystic Fox Nanao': { onBattleEnd: function* (g, p, line) { g.freeEna(p, 1, 'Red'); g.recover(p, line) } },
  'Jr. Red Ray': { indestructible: true },
  'Hinata and Nanao': {
    onBattleEnd: function* (g, p) {
      const line = yield* g.pickLine(p, p, 'Choose 1 of your Horobeat to recover.', myLines(g, p), false, (l) => (g.isDown(p, l) ? 2 : 1))
      if (line != null) g.recover(p, line)
    },
  },
  'Betobeto-kun': { onWin: drawOnWin(1) },
  'Soybean Azukichi': { dd: true },
  'Horobeast Leo': { indestructible: true, power: (g, p, line) => (upright(g, p, line) ? 3000 : 0), dd: (g, p, line) => upright(g, p, line) },
  "Enra & Enra's Wedded Waltz": {
    dd: true,
    onPlay: function* (g, p, uid) {
      const here = g.where(p, uid)
      if (here < 0) return
      const line = yield* g.pickLine(p, p, 'Swap places with one of your Horobeat?', myLines(g, p).filter((l) => l !== here), true, () => 0)
      if (line != null) { g.swap(p, here, line); g.say(`${g.name(uid)} swaps to Line ${line + 1}.`) }
    },
  },
  'Welcome! Kamabuki Trading Co.': {
    dd: (_g, _p, line) => line >= 1,
    onBattleEnd: function* (g, p, line) {
      if (line < 2) return
      g.recover(opp(p), line)
      g.draw(p, 1)
    },
  },
  'Nezu Beat Kyujiro': { power: (g, p, line) => (g.boosted(p, line) ? 3000 : 0) },
  'Ready for Battle! Leo': { power: (g, p) => (g.countH(p) >= 4 ? 4000 : 0) },
  'Rapid Strikes! Thunder Kid': { dd: true },
  'Horobeast Nanao': { dd: true, onBattleEnd: recoverSelf },
  'Oni Beat Yuki': {
    onPlay: function* (g, p) {
      const P = g.P(p)
      if (!P.ena.length) return
      // Give up a used Ena first if there is one.
      const uid = yield* g.pickCard(p, 'Choose 1 of your Ena to put into the Graveyard.', P.ena.map((e) => e.uid), false, (u) => (P.ena.find((e) => e.uid === u)!.used ? 2 : 1))
      if (uid == null) return
      P.ena.splice(P.ena.findIndex((e) => e.uid === uid), 1)
      P.grave.push(uid)
      g.say(`${g.nm(p)} puts ${g.name(uid)} from Ena into the Graveyard.`)
    },
  },
  'Raijin Overbeat Leojin': { dd: true, power: (g, p) => (g.countH(p, (d) => d.color === 'Red') >= 4 ? 5000 : 0) },
  'Dunk Beat Danzo': { noOverbeatOnto: true, onPlay: function* (g, p) { g.draw(p, 2) } },
  'Beast Beat Hihihime': { dd: true },
  'Rai Beat Leojin': { dd: true, indestructible: true },
  'Overbeat Leojin': { dd: true, power: (g, p) => (g.countH(p) >= 4 ? 3000 : 0) },
  'Raiju Mom': { dd: true },
  'Telepathy': {
    wazaPower: (g, p, line) => (g.hasTribe(p, line, 'Raiga') ? 1000 : 0),
    wazaOnUse: function* (g, p, line) { if (g.hasTribe(p, line, 'Raiga')) g.draw(p, 1) },
  },
  'Second Battle Line': { wazaCanUse: (_g, _p, line) => line >= 1 },
  'Harmony and Cheer': { wazaCanUse: (g, p, line) => g.under(p, line) >= 1 },
  'Prayer for Recovery': { wazaOnUse: function* (g, p, line) { g.recover(p, line) } },
  'Beat Burst: Thunder Cherry Blossom Lightning': { wazaCanUse: (g, p) => g.countH(p) >= 4, wazaExtraDamage: 1 },
  'Change of Heart': { wazaOnUse: function* (g, p) { yield* g.damagePlayer(opp(p), 1, true) } },
  'Thunder and Wind Raging Surge': { wazaExtraDamage: 1 },

  // ---------------- Green ----------------
  'Shinazui-sama': { costMod: 1 },
  'Balloon Jump': {
    onPlay: function* (g, p) {
      const P = g.P(p)
      if (!P.deck.length) return
      const uid = P.deck[P.deck.length - 1]
      // The CPU keeps Horobeat on top and sends Waza to the bottom.
      const yes = yield* g.yesNo(p, `The top card of your deck is ${g.name(uid)}. Put it on the bottom?`, g.def(uid).type === 'Waza' ? 1 : -1, [uid])
      if (yes) { P.deck.pop(); P.deck.unshift(uid); g.say(`${g.nm(p)} puts the top card of the deck on the bottom.`) }
    },
  },
  'Keukegen': { barrier: 1 },
  'Snoozing Jumbo': { onOverbeaten: drawIfDownedBase },
  'Shinazui of the Flame': { onOverbeaten: drawIfDownedBase },
  'Destined Meeting: Shinazui and Sho': { onOverbeaten: drawIfDownedBase },
  'Solo Camp Shinazui-sama': { power: (g, p, line) => (g.boosted(p, line) ? 2000 : 0) },
  'Clunker Car': { onBattleEnd: function* (g, p, line) { yield* g.damageHorobeat(p, line) } },
  'Taverna and Futakuchi Girl': {
    onPlay: function* (g, p) {
      const P = g.P(p)
      const picks = P.hand.filter((u) => { const d = g.def(u); return d.type === 'Horobeat' && d.cost <= 5 })
      const lines = myLines(g, p)
      if (!picks.length || !lines.length) return
      // The CPU tucks its most expensive spare card, which it is least likely to play soon.
      const uid = yield* g.pickCard(p, 'Put a Horobeat with cost 5 or less from your hand under one of your Horobeat, then draw 1?', picks, true, (u) => 1 + g.def(u).cost / 10)
      if (uid == null) return
      const line = yield* g.pickLine(p, p, 'Choose which of your Horobeat it goes under.', lines, false, (l) => (l < 2 ? 2 : 1))
      if (line == null) return
      P.hand.splice(P.hand.indexOf(uid), 1)
      P.lines[line]!.cards.unshift(uid)
      g.say(`${g.nm(p)} puts ${g.name(uid)} under ${g.name(g.top(p, line)!)}.`)
      g.draw(p, 1)
    },
  },
  'Rare Kegen': { barrier: 2 },
  'Kesaran-Pasaran': { barrier: 1 },
  'Moss Boy': { barrier: 1 },
  'Winged Kegen': {
    barrier: 1,
    onPlay: function* (g, p, uid) {
      const here = g.where(p, uid)
      if (here < 0) return
      const open = [0, 1, 2, 3, 4].filter((l) => g.top(opp(p), l) != null && g.top(p, l) == null)
      const opts = open.map((line) => ({ t: 'stack', side: opp(p), line, label: `Move to Line ${line + 1}`, w: 0 }))
      if (!opts.length) return
      const o = yield* g.ask(p, 'pick', 'Move to a line where only your opponent has a Horobeat?', [...opts, { t: 'no', label: "Don't", w: 0.5 }])
      if (o.t !== 'stack') return
      g.swap(p, here, o.line!)
      g.say(`${g.name(uid)} moves to Line ${o.line! + 1}.`)
    },
  },
  'Forest Spirit Kegen': { barrier: 1 },
  'Strange Bird Hizama': { power: (g, p, line) => (g.boosted(p, line) ? 2000 : 0) },
  'Zoom Drone': { costMod: -1, onOverbeaten: function* (g, p, _line, _wasDown, by) { if (g.name(by) !== 'Zoom Drone') g.draw(p, 1) } },
  'Strange Bird Shibiro': { cantUseWaza: true, power: (g, p, line) => (g.usingWaza(opp(p), line) ? 4000 : 0) },
  'Hitodama Morun': { barrier: 1 },
  'Phantom Carriage': {
    onPlay: function* (g, p, uid) {
      const here = g.where(p, uid)
      const o = opp(p)
      if (here < 0 || g.top(o, here) == null) return
      const mine = g.def(uid).power
      // The CPU swaps only when it brings a weaker enemy in front of this card.
      const line = yield* g.pickLine(p, o, "Swap the Horobeat across from this one with another of your opponent's Horobeat?", myLines(g, o).filter((l) => l !== here), true,
        (l) => (g.power(o, here) >= mine && g.power(o, l) < mine ? 2 : 0))
      if (line == null) return
      g.swap(o, here, line)
      g.say(`${g.nm(p)} swaps ${g.nm(o)}'s Horobeat on Lines ${here + 1} and ${line + 1}.`)
    },
  },
  'Sho and Shinazui Soaring Through the Night': {
    onPlay: function* (g, p) {
      if (!ena(g, p, 'Green')) return
      const big = g.P(p).hand.filter((u) => { const d = g.def(u); return d.type === 'Horobeat' && d.cost >= 7 })
      const uid = yield* g.pickCard(p, 'Reveal a Horobeat with cost 7 or more from your hand to draw 1?', big, true)
      if (uid == null) return
      g.say(`${g.nm(p)} reveals ${g.name(uid)}.`)
      g.draw(p, 1)
    },
  },
  "Lonesome Old Man's House": { noPumpSelf: true },
  'Fluffy Iroha and Floaty Jumbo': { power: (g, p) => (underLines12(g, p) >= 3 ? 3000 : 0), dd: (g, p) => underLines12(g, p) >= 3 },
  'Horobeast Shinazui': { costMod: 1 },
  'Strike First! Shinazui & Sho': {
    onWin: function* (g, p, line) {
      if (!ena(g, p, 'Green') || line > 1) return
      yield* chooseDiscard(g, opp(p))
    },
  },
  'Mana Beat Furarinte': { power: (g, p, line) => (g.boosted(p, line) ? 2000 : 0), onWin: drawOnWin(1) },
  'Phantom Taxi': { power: (g, p) => (ena(g, p, 'Green') ? 3000 : 0) },
  'Kui Beat Tavelle': { dd: true },
  'Iroha and Cruising Jumbo': { dd: true, power: (g, p) => (underLines12(g, p) >= 5 ? 5000 : 0) },
  'Yoohoo! Iroha and Jumbo': { onWin: drawOnWin(1) },
  'Mori Beat Furutsuki': { noPumpBoth: true },
  'Hammer Ranbo': { dd: true },
  'Iroha and Jumbo': { onWin: drawOnWin(1) },
  'Strange Bird Kamigiri': { dd: true },
  'Full Throttle Helicon': { dd: true, onWin: drawOnWin(1) },
  'Horobeast Jumbo': { dd: true, onWin: function* (g, p) { if (ena(g, p, 'Green')) g.draw(p, 3) } },
  'Never Give Up! Shinazui': { dd: true, onDowned: function* (g, p) { g.draw(p, 2) } },
  'Blaze Overbeat Shinazuisho': {
    dd: true,
    onWin: function* (g, p, line) {
      const o = opp(p)
      if (g.top(o, line) == null || g.power(p, line) < g.power(o, line) * 2) return
      yield* g.destroy(o, line)
    },
  },
  'Don Dekakegen': { barrier: 2, reflectBarrier: true },
  'Raise Beat Shinazuisho': { dd: true, power: (g, p, line) => (g.under(p, line) >= 2 ? 3000 : 0) },
  'Overbeat Shinazuisho': { dd: true, power: (g, p, line) => (g.under(p, line) >= 2 ? 2000 : 0) },
  'Cut Down with Personal Grudge!': { wazaPower: (g, p, line) => (g.under(p, line) > g.under(opp(p), line) ? 2000 : 0) },
  'Is It 1?! Is It 2?! Which Is It?!': { wazaCanUse: (_g, _p, line) => line <= 1 },
  "We're Going for the Win...!": {
    wazaOnUse: function* (g, p, line) { if (g.hasTribe(p, line, 'Suzaku')) yield* chooseDiscard(g, opp(p)) },
    wazaOnWin: function* (g, p, line) { if (g.hasTribe(p, line, 'Suzaku')) g.draw(p, 1) },
  },
  'Zoom, Here We Go, Jan!': { wazaPower: (g, p) => (g.s.first === p ? 2000 : 0) },
  'Beat Burst: Undying Eternal Flame!': { wazaCanUse: (g, p, line) => g.under(p, line) >= 2, wazaExtraDamage: 1 },
  'Long Distance, Buried!': { wazaExtraDamage: 1 },

  // ---------------- Blue ----------------
  'Kurobo-chan': { power: (g, p, line) => (g.usingWaza(p, line) ? 3000 : 0) },
  'Enforcer Tada and Sanbon-Datara': { onDowned: function* (g, p) { g.freeEna(p, 1) } },
  'Gashanosuke': { power: (g, p) => (g.enaCount(p) >= 8 ? 4000 : 0) },
  'Yamanba Yamahime': {
    onBattleEnd: function* (g, p, line) {
      const next = line + 1
      if (next > 4 || g.top(p, next) == null) return
      const zone = g.P(p).waza[line]
      const picks = zone.filter((z) => !z.boost && g.def(z.uid).cost === 1 && g.canUseWaza(p, z.uid, next)).map((z) => z.uid)
      const uid = yield* g.pickCard(p, `Use a cost-1 Waza from this battle again on Line ${next + 1}?`, picks, true)
      if (uid == null) return
      zone.splice(zone.findIndex((z) => z.uid === uid), 1)
      yield* g.useWaza(p, uid, next)
    },
  },
  'Nagure and Bodyguard Headbull': {
    onPlay: function* (g, p) {
      const P = g.P(p)
      const picks = P.hand.filter((u) => { const d = g.def(u); return d.type === 'Waza' && d.cost >= 2 })
      const uid = yield* g.pickCard(p, 'Discard a Waza with cost 2 or more to return 1 Ena to unused?', picks, true, () => (P.ena.some((e) => e.used) ? 0.4 : 0))
      if (uid == null) return
      g.discard(p, uid)
      g.freeEna(p, 1)
    },
  },
  'Tofu Nice Guy': {
    onPlay: function* (g, p) {
      if (!ena(g, p, 'Blue')) return
      const P = g.P(p)
      const seen = P.deck.slice(-5).reverse()
      if (!seen.length) return
      const waza = seen.filter((u) => g.def(u).type === 'Waza')
      const uid = waza.length
        ? yield* g.pickCard(p, 'Top 5 cards of your deck. Take 1 Waza into your hand?', waza, true, (u) => 1 + g.def(u).power / 10000, seen)
        : (yield* g.ask(p, 'pick', 'Top 5 cards of your deck. There is no Waza to take.', [{ t: 'no', label: 'Continue' }], seen), null)
      P.deck.splice(P.deck.length - seen.length)
      const rest = seen.filter((u) => u !== uid)
      if (uid != null) { P.hand.push(uid); g.say(`${g.nm(p)} reveals ${g.name(uid)} and adds it to hand.`) }
      P.deck.unshift(...rest.reverse())
      g.say(`${g.nm(p)} puts ${rest.length} card${rest.length === 1 ? '' : 's'} on the bottom of the deck.`)
    },
  },
  'It Comes! The Dreaded Spider': { toEnaOnDestroy: true },
  'Valiant Beniten': { dd: true },
  'Yoshihiko and Righteous Kurobou': {
    power: (g, p, line) => (ena(g, p, 'Blue') && g.usingWaza(p, line) ? 3000 : 0),
    dd: (g, p, line) => ena(g, p, 'Blue') && g.usingWaza(p, line),
  },
  'Kawaero': { power: (g, p, line) => (g.isDown(p, line) ? 3000 : 0) },
  'Giri Mukuro': { power: (g, p) => (g.P(p).hand.length >= 6 ? 6000 : 0) },
  'Ippon-Datara': {
    onPlay: function* (g) {
      for (const p of [0, 1] as Side[]) for (const h of g.P(p).hearts) h.down = false
      g.say('Each player recovers their Hearts.')
    },
  },
  'Captain Ikuchi': { onPlay: function* (g, p) { g.deckToEna(p); g.deckToEna(opp(p)) } },
  'Guardian of Order: Kurobou & Yoshihiko': {
    onSummonEnd: function* (g, p) {
      const P = g.P(p)
      const picks = P.grave.filter((u) => { const d = g.def(u); return d.type === 'Waza' && d.cost === 1 })
      const uid = yield* g.pickCard(p, 'Return a cost-1 Waza from your Graveyard to your hand?', picks, true, (u) => 1 + g.def(u).power / 10000)
      if (uid == null) return
      P.grave.splice(P.grave.indexOf(uid), 1)
      P.hand.push(uid)
      g.say(`${g.nm(p)} returns ${g.name(uid)} from the Graveyard to hand.`)
    },
  },
  'Kappa Diver': { dd: true },
  'Bull Beat Headnaguru': {
    onBattleEnd: function* (g, p) {
      for (const q of [p, opp(p)]) {
        const P = g.P(q)
        const uid = yield* g.pickCard(q, 'Put a Waza from your Graveyard into your Ena, used?', P.grave.filter((u) => g.def(u).type === 'Waza'), true)
        if (uid == null) continue
        P.grave.splice(P.grave.indexOf(uid), 1)
        P.ena.push({ uid, used: true })
        g.say(`${g.nm(q)} puts ${g.name(uid)} from the Graveyard into Ena, used.`)
      }
    },
  },
  'Horobeast Kurobou': {
    dd: true,
    onPlay: function* (g, p, uid) {
      const here = g.where(p, uid)
      if (here < 0) return
      const near = [here - 1, here + 1].filter((l) => l >= 0 && l < 5 && g.top(p, l) != null)
      const line = yield* g.pickLine(p, p, 'Swap places with your Horobeat in the next line?', near, true, () => 0)
      if (line != null) { g.swap(p, here, line); g.say(`${g.name(uid)} swaps to Line ${line + 1}.`) }
    },
  },
  'Odosu Beat Sanbon-Tadatara': { onDowned: function* (g, p, line) { g.bounceTop(p, line) } },
  'Seigi Overbeat Girobou': {
    dd: true,
    onWazaUsed: function* (g, p, line) {
      const o = opp(p)
      const t = g.top(o, line)
      if (g.wazaCount(p, line) !== 2 || t == null || g.costInLine(t) > 8) return
      g.bounceTop(o, line)
    },
  },
  'Shamisen Hozuki and MC Gasha': { dd: true },
  'Great Kappa Gatara': {
    power: (g, p) => (g.P(p).hearts.some((h) => h.down) ? 4000 : 0),
    onWin: function* (g, p) {
      const P = g.P(p)
      const hurt = P.hearts.find((h) => h.down)
      if (hurt) { hurt.down = false; g.say(`${g.nm(p)} recovers a Heart.`) }
      else if (P.deck.length) { P.hearts.push({ uid: P.deck.pop()!, down: true }); g.say(`${g.nm(p)} adds the top card of the deck to Hearts, downed.`) }
    },
  },
  '8 Mile: Hozuki & Gasha': {
    dd: true,
    onBattleStart: function* (g, p, line) {
      const P = g.P(p)
      const picks = P.ena.map((e) => e.uid).filter((u) => { const d = g.def(u); return d.type === 'Waza' && d.color === 'Blue' && d.cost <= 3 && g.canUseWaza(p, u, line) })
      // The CPU only gives up an Ena for this when it is not already ahead.
      const behind = g.top(opp(p), line) != null && g.power(p, line) <= g.power(opp(p), line)
      const uid = yield* g.pickCard(p, 'Use a Blue Waza with cost 3 or less from your Ena for free?', picks, true, (u) => (behind ? 1 + g.def(u).power / 10000 : 0))
      if (uid == null) return
      P.ena.splice(P.ena.findIndex((e) => e.uid === uid), 1)
      yield* g.useWaza(p, uid, line)
    },
  },
  'Horobeast Gashadokuro': {
    onBattleEnd: function* (g, p) {
      const P = g.P(p)
      for (const e of P.ena) e.used = false
      P.ena.slice(0, 4).forEach((e) => (e.used = true))
      g.say(`${g.nm(p)} turns all Ena unused, then turns 4 used.`)
    },
  },
  'Keep Away from Danger, Kid': {
    wazaOnWin: function* (g, p, line) {
      const t = g.top(opp(p), line)
      if (t == null) return
      g.silence(t)
      g.say(`${g.name(t)} loses its effects for the rest of the round.`)
    },
  },
  'Three Years of Patience': { wazaOnBattleEnd: function* (g, p) { if (ena(g, p, 'Blue')) g.freeEna(p, 1) } },
  'Ignorant Gaze': { wazaCanUse: (g, p, line) => g.under(p, line) <= 1 },
  'Rule the Heavens with Justice': { wazaPower: (g, p, line) => (g.hasTribe(p, line, 'Justice') ? 3000 : 0) },
  "At the Soul's Mercy": { wazaOnUse: function* (g, p) { g.deckToEna(p); g.deckToEna(opp(p)) } },
  'Beat Burst: Strike of the Living Body': { wazaCanUse: (g, p, line) => g.wazaCount(p, line) >= 1, wazaExtraDamage: 1 },
  'The Going Loop': {
    wazaOnBattleEnd: function* (g, p, line, uid) {
      const zone = g.P(p).waza[line]
      zone.splice(zone.findIndex((z) => z.uid === uid), 1)
      g.P(p).hand.push(uid)
      g.say(`${g.name(uid)} returns to ${g.nm(p)}'s hand.`)
    },
  },
}

/** A player chooses 1 card from their own hand and discards it. */
function* chooseDiscard(g: Match, p: Side): Gen {
  const hand = g.P(p).hand
  if (!hand.length) return
  const uid = yield* g.pickCard(p, 'Choose 1 card from your hand to discard.', [...hand], false, (u) => 10 - g.def(u).cost / 2 - (g.def(u).type === 'Waza' ? 1 : 0))
  if (uid != null) g.discard(p, uid)
}
