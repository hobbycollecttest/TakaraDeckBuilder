// What each Haikyu card's text does, keyed by card number. Cards with no text are not listed.
// Built from the clause library in kit.ts. Where a skill had to be simplified, a comment says how.
import type { HQScript } from './engine.js'
import {
  ALIAS, ANY, CHAR, E, EV, EV1, EVENT, EVIF, HAND, HAND1, N, NOSKILL, POS, T, Y, aPass, add, all, allTeam, and, asSide, at, attackIs, backAttack, blockOut, both, choose, coin,
  deflection, difTeams, discard, discardN, draw, drawTo, drawUpTo, dropNames, dump, either, enterSelf, enteredBy, eventGE, eventLE, eventToDrop, feint, fewerScore, fixSelf, fixThat, free,
  fromHand, guts, gutsEach, handGE, handLE, handToBottom, ifDid, inArea, inBlock, look, may, mill, mine, next, nextEnter, nextFix, nextNoPlay, not, now, oneParam, onCourt, onEnter, onEvent, onTop, onTopOf,
  one, oppAt, oppCourt, oppDiscard, oppEventGE, oppEventToDrop, oppGutsToDrop, oppHandGE, oppHandLE, oppOff, oppOffGE, oppOffLE, orig, paidAll, paidAny, phaseIs, play, playableAs,
  receiveIs, reveal, scoreTotalLE, seenAll, seenCount, seenToBottom, seenToHand, selfGE, self, selfParam, selfToDrop, seq, serveIs, setIs, stuffed, target, targetGE, targetIs, that, thatParam,
  thisEnter, toBottom, toDrawPhase, toEvent, when, type Eff, type CP,
} from './kit.js'
import { AREA_NAME, type Area, type HQ, type Side } from './engine.js'

const opp = (p: Side) => (1 - p) as Side
const KAR = T('Karasuno'), NEK = T('Nekoma'), SEI = T('Aoba Johsai'), FUK = T('Fukurodani'), DAT = T('Date Tech'), SHI = T('Shiratorizawa')
const INA = T('Inarizaki'), KAK = T('Kakugawa'), JOH = T('Johzenji'), WAK = T('Wakutani Minami'), NOH = T('Nohebi'), YOU = T('Youth'), PSY = T('Pseudo-Youth')
const ASSOC = T('Neighborhood Association')
const twin = (a: string, b: string) => ALIAS(a, b)
/** Hand skill that gives one of your characters +2 Receive Point. */
const libero = (test: CP) => HAND(['receive'], 'discard', one(test, 'rc', 2))
/** "Draw 1 card. One of your X characters gets +1 Y Point." The most common Event. */
const drawPump = (test: CP, k: 'bl' | 'rc' | 'at' | 'st' | 'sv'): Eff => seq(draw(1), one(test, k, 1))
/** Your opponent's Event Area holds N cards that can be played as the given timings. */
const oppEv = (n: number, ...ph: Parameters<typeof playableAs>) => oppEventGE(n, playableAs(...ph))
const dropDif = (team: CP, n: number) => dropNames(n, and(team, CHAR))

const selfToBottom = {
  text: 'Put this character on the bottom of your deck.',
  can: () => true,
  *pay(g: HQ, c: { p: Side; uid: number }) { g.lift(c.uid); g.P(c.p).deck.unshift(c.uid); g.say(`${g.def(c.uid).name} goes to the bottom of the deck.`); return true },
}
const evSelfToBottom = {
  text: 'Put this card on the bottom of your deck.',
  can: () => true,
  *pay(g: HQ, c: { p: Side; uid: number }) { g.lift(c.uid); g.P(c.p).deck.unshift(c.uid); return true },
}
/** "You may put 1 Head Coach, Former Head Coach or Coach card from your opponent's Event Area on the bottom of their deck." */
const oppCoachToBottom = {
  text: "Put a coach card from your opponent's Event Area on the bottom of their deck.",
  can: (g: HQ, c: { p: Side }) => g.P(opp(c.p)).event.some((u) => g.def(u).pos.some((x) => /Coach/.test(x))),
  *pay(g: HQ, c: { p: Side }) {
    const list = g.P(opp(c.p)).event.filter((u) => g.def(u).pos.some((x) => /Coach/.test(x)))
    const uid = yield* g.pickCard(c.p, "Choose a coach card in your opponent's Event Area.", list, false, () => 1, list)
    if (uid == null) return false
    g.lift(uid)
    g.P(opp(c.p)).deck.unshift(uid)
    return true
  },
}

export const HQ_SCRIPTS: Record<string, HQScript> = {
  // ---------------- Booster Pack: The Battle at the Garbage Dump (HV-P01) ----------------
  'HV-P01-002': E(['attack'], may(guts(3), self('at', 4), nextNoPlay(['receive'], (d) => (d.rc ?? 0) >= 6))),
  'HV-P01-003': E(['attack'], when(all(fromHand, handLE(3), setIs('Tobio Kageyama')), self('at', 2), next('blockMax', { n: 2 }))),
  'HV-P01-006': E(['set'], may(guts(2), reveal, seenToHand(N('Shoyo Hinata', 'FOUR SET')), seenToBottom, thisEnter(N('Shoyo Hinata'), 'at', 2))),
  'HV-P01-008': E(['block'], may(guts(2), when(onCourt(N('Tadashi Yamaguchi')), self('bl', 2)), stuffed(6))),
  'HV-P01-010': E(['serve'], reveal, when((g, c) => c.seen.length > 0 && g.has(c.seen[0], 'Karasuno'), nextEnter(['set'], 'st', -2)), seenToBottom),
  'HV-P01-013': libero(KAR),
  'HV-P01-015': E(['set'], may(guts(2), draw(1), self('st', 1))),
  'HV-P03-069': E(['set'], may(guts(2), draw(1), self('st', 1))),
  'HV-P01-016': E(['attack'], when(at('set', and(POS('S'), KAR)), may(guts(4), self('at', 2)))),
  'HV-P01-018': E(['set'], may(guts(3), self('st', 1), when(allTeam('Nekoma'), add('event', ANY, 1)))),
  'HV-P01-019': { watch: onEnter({ areas: ['attack'], selfIn: ['set'], test: (g, u) => g.def(u).at === 3, cost: guts(2) }, play('guts', NEK, 'attack', { areas: ['attack'] }), that('at', 2)) },
  'HV-P01-021': E(['attack'], may(guts(3), self('at', 3), add('guts', NEK, 2, { difNames: true, exact: true, oneArea: true }))),
  'HV-P01-023': { watch: onTop(and(NEK, not(N('Morisuke Yaku'))), selfToDrop, that('rc', 2)) },
  'HV-P01-025': E(['attack'], may(guts(2), when(enteredBy('Kenma Kozume'), self('at', 2)), nextEnter(['center'], 'bl', -3))),
  'HV-P01-028': { watch: onTop(N('Lev Haiba'), discard(1, NEK), that('at', 1)) },
  'HV-P01-031': libero(NEK),
  'HV-P01-032': E(['serve'], next('silence', { areas: ['receive', 'set'] })),
  'HV-P01-033': E(['serve', 'set'], may(discard(1, SEI), selfParam(1), oppDiscard(1, 4))),
  'HV-P01-034': E(['serve'], may(guts(1), when(paidAny(SEI), function* (g, c) {
    const P = g.P(opp(c.p))
    P.deck.push(...P.hand.splice(0))
    g.shuffle(P.deck)
    g.say(`${g.nm(opp(c.p))} shuffles their hand into their deck and draws 6.`)
    g.draw(opp(c.p), 6)
  }))),
  'HV-P01-035': E(['attack'], may(discard(1, SEI), self('at', 2), when(oppHandLE(4), next('noAdd')))),
  'HV-P01-037': E(['block'], when(oppOffGE(8), may(guts(1), thisEnter(SEI, 'rc', 3, ['receive']), toDrawPhase))),
  'HV-P01-039': E(['receive'], when(oppOffGE(6), may(discard(1, SEI), self('rc', 1), when(allTeam('Aoba Johsai'), draw(1))))),
  'HV-P01-041': E(['attack'], when(all(allTeam('Aoba Johsai'), oppHandLE(3)), may(guts(1), feint(4)))),
  'HV-P01-043': E(['attack'], when(all(fromHand, allTeam('Fukurodani'), (g, c) => g.guts(c.p, 'attack').length % 2 === 1), self('at', 5))),
  'HV-P01-045': E(['set'], may(guts(4, ['set', 'attack']), self('st', 2), add('drop', N('Kotaro Bokuto'), 1))),
  'HV-P01-047': { watch: onTop(FUK, discard(1), that('at', 1)) },
  'HV-P01-051': E(['block'], when(oppOffGE(4), may(mill(1), when(seenAll(FUK), deflection(3))))),
  'HV-P01-054': E(['block'], may(guts(3), self('bl', 5))),
  'HV-P01-056': E(['serve', 'attack'], may(toEvent(EVENT), draw(1), selfParam(2))),
  'HV-P01-057': E(['block'], function* (g, c) { g.addRule(opp(c.p), 1, 'drawOnAdd', 'Satori Tendo', { owner: c.p }); g.say(`Satori Tendo: next turn, whenever ${g.nm(opp(c.p))} adds a card by a skill, ${g.nm(c.p)} draws 1.`) }),
  'HV-P01-060': E(['block'], when(oppOffGE(4), deflection(2))),
  'HV-P02-049': E(['block'], when(oppOffGE(4), deflection(2))),
  'HV-P03-006': E(['block'], when(oppOffGE(4), deflection(2))),
  'HV-P03-036': E(['block'], when(oppOffGE(4), deflection(2))),
  'HV-P04-041': E(['block'], when(oppOffGE(4), deflection(2))),
  'HV-P01-065': E(['receive'], when(oppEv(5, 'set', 'attack'), self('rc', 6))),
  'HV-P01-066': E(['attack'], when(either(allTeam('Kamomedai'), difTeams(4)), may(guts(3), self('at', 3), oppEventToDrop(2), when((g, c) => g.P(opp(c.p)).event.length <= 2, self('at', 1))))),
  'HV-P01-068': E(['attack'], when(all(handLE(3), difTeams(4)), self('at', 2), blockOut(2))),
  'HV-P01-072': twin('Shoyo Hinata', 'Kenma Kozume'),
  'HV-P01-073': twin('Kei Tsukishima', 'Tetsuro Kuroo'),
  'HV-P01-074': EV(['attack'], draw(1), one(ANY, 'at', 1), when(oppEv(5, 'draw', 'receive'), that('at', 2))),
  'HV-P01-075': EV(['receive', 'attack'], oneParam(KAR, 1), when(phaseIs('receive'), draw(1))),
  'HV-P01-076': EVIF(['draw'], handLE(4), sameTeamGuts(2)),
  'HV-P01-077': EV1(['receive'], inArea('receive', KAR, 'rc', 2), when(targetIs(N('Yu Nishinoya')), draw(1))),
  'HV-P01-078': EV(['attack'], draw(2), discardN(1), when(eventLE(2, N('FOUR SET')), play('drop', N('Shoyo Hinata'), 'attack', { must: true }), that('at', 1))),
  'HV-P01-079': EV(['block'], draw(1), one(KAR, 'bl', 1, ['center', 'sides']), when(targetIs(N('Kei Tsukishima')), add('court', N('Tadashi Yamaguchi'), 1, { areas: ['serve'] })), nextEnter(['receive'], 'rc', -2)),
  'HV-P01-080': EV(['receive'], draw(1), one(ANY, 'rc', 1), when(oppEv(5, 'set', 'attack'), that('rc', 2))),
  'HV-P01-081': EV(['attack'], draw(1), one(NEK, 'at', 1), when(allTeam('Nekoma'), may(guts(3, ['receive']), that('at', 1)))),
  'HV-P01-082': EV(['receive'], draw(1), choose(['One of your Nekoma characters gets +1 Receive Point.', one(NEK, 'rc', 1)], ['Set the Receive Point of a Nekoma character with 5 or more to 7.', seq(one(and(NEK, (g, u) => (g.param(u, 'rc') ?? 0) >= 5), 'rc', 0), fixThat('rc', 7)), (g, c) => g.chars(c.p).some((x) => g.has(x.uid, 'Nekoma') && (g.param(x.uid, 'rc') ?? 0) >= 5), 2])),
  'HV-P01-083': EV(['attack'], draw(1), when(allTeam('Nekoma'), may(guts(6), one(ANY, 'at', 3)))),
  'HV-P01-084': EVIF(['set'], setIs('Kenma Kozume'), draw(1), inArea('set', ANY, 'st', 1), nextNoPlay(['attack'], (d) => d.pos.includes('MB'), true)),
  'HV-P01-085': EV(['draw'], draw(1), may(guts(8), now('enterChoose', { n: 1, pred: (g: HQ, u: number) => g.has(u, 'Aoba Johsai') }))),
  'HV-P01-086': EV(['draw', 'receive'], add('drop', and(SEI, CHAR), 1, { exact: true })),
  'HV-P01-087': EVIF(['serve', 'set'], either(serveIs('Toru Oikawa'), setIs('Toru Oikawa')), draw(1), one(N('Toru Oikawa'), 'st', 1), next('discardOnAdd')),
  'HV-P01-088': EV(['receive'], drawUpTo(1), one(SEI, 'rc', 1), when(handLE(3), that('rc', 1))),
  'HV-P01-089': EV(['draw', 'receive'], look(3, FUK)),
  'HV-P01-090': EV(['attack'], draw(1), one(FUK, 'at', 1), when(allTeam('Fukurodani'), next('onOppLost', { run: (g: HQ, p: Side) => drawToFor(g, p, 7) }), ownerFix)),
  'HV-P01-091': EV(['receive'], draw(1), one(FUK, 'rc', 1), when(at('center', FUK), may(selfBlockerToDrop(FUK), oppOff(-1)))),
  'HV-P01-092': EV1(['receive'], draw(1), one(ANY, 'rc', 1), reveal, when(noTeamMatch, that('rc', 1)), seenToBottom),
  'HV-P01-093': EV1(['serve', 'block', 'attack'], draw(1), reveal, when(noTeamMatch, oneParam(ANY, 1)), next('noEvent', { phases: ['set', 'attack'] }), seenToBottom),

  // ---------------- Booster Pack: Talent and Sense (HV-P02) ----------------
  'HV-P02-001': E(['receive'], when(scoreTotalLE(1), may(guts(3), self('rc', 6), add('drop', and(KAR, CHAR), 1)))),
  'HV-P02-002': E(['set'], may(both(discard(1), guts(2)), self('st', 2), add('drop', N('Ryunosuke Tanaka'), 1, { exact: true }))),
  'HV-P02-003': E(['block'], when(oppEventGE(2), may(toEvent(EVENT), draw(1), self('bl', 6)))),
  'HV-P02-004': E(['serve'], when(onTopOf(KAR), function* (g, c) {
    const o = opp(c.p)
    const ev = g.P(o).hand.filter((u) => g.def(u).type === 'Event')
    const uid = yield* g.pickCard(o, 'Send an Event card from your hand to your Event Area? If you do not, your opponent draws whenever you add cards next turn.', ev, true, (u) => 5 - g.worth(u))
    if (uid != null) { g.lift(uid); g.P(o).event.push(uid); g.say(`${g.nm(o)} sends ${g.def(uid).name} to the Event Area.`) }
    else { g.addRule(o, 1, 'drawOnAdd', g.def(c.uid).name, { owner: c.p, all: true }); g.say(`${g.def(c.uid).name}: next turn, whenever ${g.nm(o)} adds a card to their hand, ${g.nm(c.p)} draws 1.`) }
  })),
  'HV-P02-005': E(['receive'], when(enteredBy('HELP ME OUT!!!'), may(guts(2), self('rc', 2), add('drop', N('Hisashi Kinoshita'), 1)))),
  'HV-P02-006': E(['receive'], when(oppEv(3, 'serve'), draw(1)), self('rc', 3)),
  'HV-P02-007': { watch: onEvent(N('SUPER INNER CROSS!!!'), ['attack'], guts(3), null, self('at', 4), nextEnter(['receive'], 'rc', -2)) },
  'HV-P02-010': { watch: onEnter({ areas: ['receive'], selfIn: ['serve'], test: N('Yu Nishinoya'), cost: selfToDrop }, that('rc', 1)) },
  'HV-P02-011': HAND(['block', 'receive'], 'discard', oneParam(KAR, 1)),
  'HV-P02-012': E(['receive'], when(scoreTotalLE(1), may(guts(3), self('rc', 3)))),
  'HV-P02-014': E(['serve'], when(eventGE(4, and(KAR, EVENT)), self('sv', 2)), when(eventGE(6, and(KAR, EVENT)), self('sv', 1))),
  'HV-P02-016': E(['set'], may(guts(3), draw(1), self('st', 2), when(enteredBy('SPOT ON'), next('noDeflection'), next('noHandSkill')))),
  'HV-P02-017': E(['set'], may(guts(3), when(dropDif(INA, 6), self('st', 2)), add('drop', and(INA, CHAR, POS('WS', 'MB')), 1))),
  'HV-P02-020': E(['attack'], may(guts(3), self('at', 3), when(enteredBy('SPOT ON'), self('at', 1)), next('blockMax', { n: 2 }))),
  'HV-P02-021': E(['attack'], when(handLE(2), self('at', 2))),
  'HV-P02-024': E(['receive'], may(both(discard(1), guts(3)), self('rc', 1), add('event', INA, 1))),
  'HV-P02-025': E(['receive'], may(guts(2), draw(1), discardN(1))),
  'HV-P02-027': E(['attack'], when(dropDif(INA, 6), may(free('Tilt this card.'), self('at', 2), next('centerNoBlock')))),
  'HV-P02-029': E(['attack'], may(guts(3), when(dropDif(INA, 6), self('at', 3)), next('silence', { areas: ['receive'] }))),
  'HV-P02-031': E(['serve'], may(guts(1), when(paidAny(N('Heisuke Riseki')), self('sv', 6), nextNoPlay(['set'], (d) => d.pos.includes('S'))))),
  'HV-P02-035': libero(INA),
  'HV-P02-036': E(['block'], when(inBlock(DAT, 3), may(guts(2), stuffed(7)))),
  'HV-P02-037': E(['block'], when(all(fromHand, asSide), may(selfToBottom, play('drop', N('Takanobu Aone'), 'sides'), fixThat('bl', 3)))),
  'HV-P02-038': E(['block'], stuffed(4), when(asSide, nextEnter(['receive'], 'rc', -1))),
  'HV-P02-039': E(['attack'], when(at('set', and(POS('S'), DAT)), next('blockFailIf', { n: 6 }))),
  'HV-P02-041': HAND(['block'], 'discard', mill(3).pay as unknown as Eff, when(seenAll(DAT), play('drop', and(DAT, CHAR, NOSKILL), 'sides'))),
  'HV-P02-042': E(['block'], when(oppEv(4, 'set', 'attack'), self('bl', 5))),
  'HV-P02-046': E(['attack'], when(at('set', and(POS('S'), SHI)), may(guts(3), self('at', 3), oppGutsToDrop(2, ['receive'])))),
  'HV-P02-048': E(['block'], may(free('Flip a coin.'), coin([self('bl', 4)], [mill(3).pay as unknown as Eff]))),
  'HV-P02-050': E(['set'], when(allTeam('Shiratorizawa'), may(guts(2), self('st', 2), when(paidAll(POS('S')), moveGutsToAttack(SHI))))),
  'HV-P02-051': E(['attack'], when(all(fromHand, onTopOf(N('Wakatoshi Ushijima')), handLE(3)), self('at', 2))),
  'HV-P02-052': E(['receive'], may(guts(3), self('rc', 2))),
  'HV-P04-049': E(['receive'], may(guts(3), self('rc', 2))),
  'HV-P02-056': E(['set'], may(guts(3), self('st', 2), add('drop', N('Hajime Iwaizumi'), 1))),
  'HV-P02-057': E(['receive'], when(oppHandLE(3), may(guts(3), self('rc', 7)))),
  'HV-P02-058': E(['receive'], may(guts(2), drawTo(3))),
  'HV-P02-060': { watch: onEnter({ areas: ['attack'], selfIn: ['set'], fromHand: true, test: (g, u) => g.def(u).at === 3, cost: mill(1) }, function* (g, c) { const t = c.target; g.pump(c.uid, 'st', 1); c.target = t }, play('guts', ANY, 'attack', { areas: ['attack'], must: true })) },
  'HV-P02-061': E(['receive'], may(guts(2), self('rc', 3), when(oppAt('attack', orig('at', (n) => n === 0)), self('rc', 3)))),
  'HV-P02-062': E(['receive'], may(guts(2), look(2, and(NEK, CHAR)))),
  'HV-P02-064': E(['court'], function* (g, c) {
    const ok = g.P(c.p).hand.length >= 2 && (yield* g.yesNo(c.p, `Discard 2 cards to keep ${g.def(c.uid).name}'s parameters? If you do not, they all become 0.`, g.P(c.p).hand.length >= 4 ? 1 : -1))
    if (ok) yield* g.chooseDiscard(c.p, 2)
    else for (const k of ['sv', 'bl', 'rc', 'st', 'at'] as const) if (g.def(c.uid)[k] != null) g.fix(c.uid, k, 0)
  }),
  'HV-P02-066': E(['set'], may(both(mill(3), guts(2)), self('st', 2), now('silence', { names: ['Kotaro Bokuto'] }))),
  'HV-P02-067': E(['set'], function* (g, c) { yield* mill(1, true).pay(g, c) }, when(seenAll(and(FUK, CHAR)), may(discard(1), dump(3)))),
  'HV-P02-070': E(['receive'], may(guts(4), draw(2), handOneBack('either'), self('rc', 3))),
  'HV-P02-071': E(['receive'], may(guts(2), draw(1), self('rc', 2))),
  'HV-P02-073': E(['attack'], may(guts(3), self('at', 4), ifDid(add('event', NOH, 1), discardN(1)))),
  'HV-P02-074': E(['serve'], may(guts(1), when(paidAny(NOH), self('sv', 2)), nextEnter(['set'], 'st', -1, POS('S')))),
  'HV-P02-076': E(['attack'], when(onTopOf(N('Ryunosuke Tanaka')), may(guts(4), self('at', 2)))),
  'HV-P02-077': twin('Atsumu Miya', 'Osamu Miya'),
  'HV-P02-078': twin('Daichi Sawamura', 'Tetsuro Kuroo'),
  'HV-P02-079': EV(['attack'], one(KAR, 'at', 1), next('onOppLost', { run: function* (g: HQ, p: Side) {
    const list = g.P(p).hand.filter((u) => g.has(u, 'Karasuno') && g.def(u).type === 'Character')
    const uid = yield* g.pickCard(p, 'Put a Karasuno character card from your hand into the Guts of one of your Areas?', list, true)
    if (uid == null) return
    const areas = (['serve', 'center', 'receive', 'set', 'attack'] as const).filter((a) => g.top(p, a) != null)
    const o = areas.length > 1 ? yield* g.ask(p, 'choose', 'Put it into the Guts of which Area?', areas.map((a) => ({ t: 'opt', label: AREA_NAME[a], area: a, w: a === 'attack' ? 2 : 1 }))) : null
    const area = (o?.area as typeof areas[number] | undefined) ?? areas[0] ?? 'receive'
    g.lift(uid); g.P(p)[area].unshift(uid)
    g.say(`${g.nm(p)} puts ${g.def(uid).name} into their Guts.`)
  } }), ownerFix),
  'HV-P02-080': EV(['draw'], draw(1), may(oppCoachToBottom, look(3, and(KAR, CHAR)))),
  'HV-P02-081': EV(['receive'], draw(1), function* (g, c) {
    const t = g.top(c.p, 'receive')
    if (t != null && g.has(t, 'Karasuno') && (g.param(t, 'rc') ?? 0) < (g.def(t).rc ?? 0) && (yield* g.yesNo(c.p, 'Set your Receive character back to its original Receive Point?', 1))) g.fix(t, 'rc', g.def(t).rc!)
  }, one(KAR, 'rc', 1)),
  'HV-P02-082': EV(['attack'], draw(1), one(N('Ryunosuke Tanaka'), 'at', 1), when(attackIs('Ryunosuke Tanaka'), next('sideToDrop'))),
  'HV-P02-083': EV(['receive'], draw(1), play('guts', POS('Li'), 'receive', { areas: ['receive'] })),
  'HV-P02-084': EV(['receive'], draw(1), one(INA, 'rc', 1), when(eventGE(2, and(INA, playableAs('serve', 'set', 'attack'))), that('rc', 1))),
  'HV-P02-085': EV(['receive'], one(INA, 'rc', 1), may(discard(1, INA), draw(2))),
  'HV-P02-086': EVIF(['serve', 'draw'], allTeam('Inarizaki'), draw(1), when(phaseIs('serve'), (g, c) => nextEnter(['receive'], 'rc', serveIs('Atsumu Miya')(g, c) ? -2 : -1, NOSKILL)(g, c))),
  'HV-P02-087': EV(['attack'], draw(1), when(all(setIs('Atsumu Miya'), attackIs('Osamu Miya')), play('guts', N('Atsumu Miya'), 'set'), play('guts', N('Osamu Miya'), 'attack'), oneParam(INA, 1))),
  'HV-P02-088': EV(['attack'], draw(1), one(INA, 'at', 1), when(all(setIs('Osamu Miya'), attackIs('Atsumu Miya')), next('noEvent', { phases: ['block'] }))),
  'HV-P02-089': EV(['draw'], function* (g, c) {
    let k = 0
    for (const n of ['Atsumu Miya', 'Osamu Miya', 'Miya Twins']) {
      const list = g.P(c.p).drop.filter((u) => g.def(u).name === n)
      const uid = yield* g.pickCard(c.p, `Add "${n}" from your Drop Area to your hand?`, list, true, () => 2)
      if (uid != null && (yield* g.addByAbility(c.p, uid))) k++
    }
    if (k === 3) yield* g.chooseDiscard(c.p, 1)
  }),
  'HV-P02-090': EV(['block', 'receive'], draw(1), choose(['A Date Tech character with 3 Block Point gets +1 Block Point.', one(and(DAT, (g, u) => g.param(u, 'bl') === 3), 'bl', 1), (g, c) => g.chars(c.p).some((x) => g.has(x.uid, 'Date Tech') && g.param(x.uid, 'bl') === 3), 2], ['One of your Date Tech characters gets +1 Receive Point.', one(DAT, 'rc', 1)])),
  'HV-P02-091': EV(['block'], draw(1), one(DAT, 'bl', 1), when(oppEv(4, 'set', 'attack'), that('bl', 6), stuffed(7))),
  'HV-P02-092': EV(['block', 'draw'], draw(1), when(at('center', and(DAT, Y('3rd Year'))), ifDid(add('court', and(DAT, Y('1st Year', '2nd Year')), 1), discardN(1)))),
  'HV-P02-093': EV(['block'], draw(1), one(DAT, 'bl', 1), when(inBlock(DAT, 2), stuffed(5)), when(inBlock(DAT, 3), nextEnter(['receive'], 'rc', -1))),
  'HV-P02-094': EV(['receive'], draw(1), one(SHI, 'rc', 1), may(discard(1, and(SHI, CHAR, NOSKILL)), that('rc', 2))),
  'HV-P02-095': EV(['draw'], ifDid(add('drop', and(SHI, CHAR, NOSKILL), 2), when((g, c) => c.seen.length === 2, discardN(1)))),
  'HV-P02-096': EV1(['attack'], draw(1), one(SHI, 'at', 1), when(all(setIs('Kenjiro Shirabu'), at('attack', orig('at', (n) => n === 3))), play('guts', N('Wakatoshi Ushijima'), 'attack', { areas: ['attack'] }), that('at', 1))),
  'HV-P02-097': EV(['attack'], draw(1), one(SHI, 'at', 1), when(attackIs('Wakatoshi Ushijima'), nextNoPlay(['block'], (d) => d.pos.includes('MB'), true))),
  'HV-P02-098': EV1(['attack'], draw(1), one(SHI, 'at', 1), when(attackIs('Tsutomu Goshiki'), may(discard(1, N('Wakatoshi Ushijima')), that('at', 1)))),
  'HV-P02-099': EVIF(['draw'], handLE(4), ifDid(add('drop', N('Suguru Daisho'), 1, { exact: true }), add('guts', NOH, 1))),
  'HV-P02-100': EV1(['block', 'receive', 'attack'], draw(1), oneParam(N('Lev Haiba'), 1)),

  // ---------------- Booster Pack: Youth & Rookie Selection Training Camp (HV-P03) ----------------
  'HV-P03-001': HAND1(['attack'], 'event', when(allTeam('Pseudo-Youth'), function* (g, c) {
    if (g.P(c.p).event.length >= 6 && g.P(c.p).drop.some((u) => g.isChar(u)) && (yield* g.yesNo(c.p, 'Add a character card from your Drop Area instead of drawing?', 1))) yield* add('drop', CHAR, 1)(g, c)
    else yield* g.drawFx(c.p, 1)
  })),
  'HV-P03-003': E(['attack'], may(guts(2), when(all(either(allTeam('Karasuno'), allTeam('Pseudo-Youth')), eventGE(6)), self('at', 3)), nextEnter(['center'], 'bl', -3))),
  'HV-P03-005': E(['attack'], may(guts(2), when(eventGE(4), self('at', 2)), nextEnter(['any'], 'at', -2))),
  'HV-P03-007': E(['receive'], may(guts(3), when(all(either(allTeam('Aoba Johsai'), allTeam('Pseudo-Youth')), eventGE(4)), draw(1), when(eventGE(6), self('rc', 3))))),
  'HV-P03-009': E(['set'], may(guts(2), when(eventGE(4), self('st', 2)), when(eventGE(6), next('noDeflection')))),
  'HV-P03-011': HAND(['receive'], 'discard', when(all(either(allTeam('Shiratorizawa'), allTeam('Pseudo-Youth')), eventGE(4)), function* (g, c) {
    // The card was discarded as the cost; it comes back out of the Drop Area into the Receive Area.
    yield* g.enter(c.p, c.uid, 'receive', g.def(c.uid).name)
    g.pump(c.uid, 'rc', 4)
  })),
  'HV-P03-013': HAND1(['attack'], 'event', when(allTeam('Pseudo-Youth'), look(2, CHAR))),
  'HV-P03-014': HAND1(['attack'], 'event', when(allTeam('Pseudo-Youth'), look(3, EVENT, 3))),
  'HV-P03-016': { watch: onEnter({ areas: ['set'], selfIn: ['receive'], cond: either(allTeam('Kakugawa'), allTeam('Pseudo-Youth')), cost: guts(1) }, function* (g, c) { g.toHand(c.uid) }, thisEnter(N('Yudai Hyakuzawa'), 'at', 2)) },
  'HV-P03-020': { watch: onEnter({ areas: ['attack'], selfIn: ['receive'], test: (g, u) => g.def(u).at === 3, cost: eventToDrop(1, YOU) }, backAttack(4), mine('offNoReduce')) },
  'HV-P03-021': E(['set'], may(guts(3), self('st', 2), ifDid(add('drop', and(YOU, EVENT), 1), discardN(1)))),
  'HV-P03-023': E(['block', 'receive', 'attack'], when(allTeam('Youth'), may(eventToDrop(1, YOU), selfParam(3)))),
  'HV-P03-026': E(['block'], may(eventToDrop(1, YOU), self('bl', 2))),
  'HV-P03-028': { watch: onEnter({ areas: ['set'], selfIn: ['receive'], test: YOU }, function* (g, c) {
    const list = g.guts(c.p, 'receive').filter((u) => g.def(u).name === 'Tobio Kageyama')
    if (!list.length || !(yield* g.yesNo(c.p, `Put "Tobio Kageyama" from your Receive Area Guts on top of ${g.def(c.uid).name}?`, 1))) return
    // "Put" is not "enter": the card moves on top without triggering anything.
    const P = g.P(c.p)
    P.receive.splice(P.receive.indexOf(list[0]), 1)
    P.receive.push(list[0])
    delete g.s.mods[c.uid]
    g.say(`${g.nm(c.p)} puts Tobio Kageyama on top of ${g.def(c.uid).name}.`)
    g.addRule(c.p, 0, 'baBonus', g.def(c.uid).name, { n: 1 })
  }) },
  'HV-P03-030': E(['block'], when(all(allTeam('Youth'), oppOffGE(8)), thisEnter(ANY, 'rc', 2, ['receive']), toDrawPhase)),
  'HV-P03-031': E(['set'], may(guts(2), when(paidAll(and(NEK, POS('S'))), self('st', 2)), look(3, and(T('Nekoma', 'Nekoma Junior High'), EVENT)))),
  'HV-P03-033': { watch: onEnter({ areas: ['attack'], selfIn: ['serve'], test: NEK, cost: guts(1) }, backAttack(4)) },
  'HV-P03-035': E(['receive'], may(guts(3), draw(1), self('rc', 2))),
  'HV-D01-005': E(['receive'], may(guts(3), draw(1), self('rc', 2))),
  'HV-P03-038': E(['block'], may(discard(1, NEK), self('bl', 3), when(oppHandLE(2), self('bl', 2)))),
  'HV-P03-039': { watch: onEvent(INA, ['serve'], eventToDrop(2, and(INA, playableAs('serve'))), phaseIs('serve'), self('sv', 1)) },
  'HV-P03-041': E(['attack'], when(all(enteredBy(), handLE(3)), self('at', 2)), function* (g, c) { g.noReduce(c.uid) }),
  'HV-P03-044': { watch: onEnter({ areas: ['block'], selfIn: ['attack'], test: INA, cost: discard(1) }, enterSelf('sides')) },
  'HV-P03-045': E(['receive', 'attack'], may(discard(1, INA), selfParam(2))),
  'HV-P03-046': E(['receive'], when(oppOffLE(2, 'Serve'), draw(1)), when(oppOffGE(6, 'Serve'), self('rc', 2))),
  'HV-P03-047': { watch: (g, c, e) => {
    if (e.t !== 'event' || e.p !== c.p || !e.fromHand || g.s.phase !== 'attack' || c.area !== 'set') return null
    return (function* () { if ((g.param(c.uid, 'st') ?? 0) < 3) g.pump(c.uid, 'st', 1); return true })()
  } },
  'HV-P03-051': E(['receive'], may(guts(2), when(paidAll(KAR), self('rc', 2)), when(oppAt('attack', orig('at', (n) => n === 0)), oppOff(-3)))),
  'HV-P03-052': E(['serve'], may(handToBottom(1), draw(1), self('sv', 5))),
  'HV-P03-053': E(['attack'], when(setIs('Tobio Kageyama'), may(guts(3), self('at', 3), next('noStuffed'), nextEnter(['center'], 'bl', -4)))),
  'HV-P03-054': E(['serve'], nextFix(['set'], 'st', 1, POS('S'), true)),
  'HV-P03-056': HAND1(['attack'], 'discard', add('drop', and(KAR, Y('3rd Year'), CHAR), 1, { exact: true })),
  'HV-P03-057': HAND(['draw'], 'discard', thisEnter(and(KAR, Y('2nd Year', '3rd Year')), 'rc', 2, ['any'], { noReduce: true })),
  'HV-P03-061': E(['serve', 'attack'], may(discard(1, N('Kotaro Bokuto')), draw(1), selfParam(3))),
  'HV-P03-063': E(['serve'], function* (g, c) { yield* mill(1).pay(g, c) }, when(seenAll(and(DAT, CHAR)), self('sv', 3)), next('eventNoSkill', { phases: ['attack'] })),
  'HV-P03-064': E(['block'], may(discard(2, DAT), draw(1), self('bl', 4), function* (g, c) { g.noReduce(c.uid) })),
  'HV-P03-067': E(['receive'], may(guts(2), self('rc', 4), when(oppAt('attack', orig('at', (n) => n <= 1)), may(selfBlockerToDrop(SHI), oppOff(-2))))),
  'HV-P03-071': E(['receive'], when(scoreTotalLE(1), may(guts(3), self('rc', 2), add('drop', and(SHI, Y('3rd Year'), CHAR, not(N('Hayato Yamagata'))), 1)))),
  'HV-P03-072': E(['serve'], when(onTopOf(SHI), self('sv', 3)), nextEnter(['receive'], 'rc', -1, POS('Li'))),
  'HV-P03-073': E(['attack'], may(gutsEach(2, ['receive', 'set', 'attack']), self('at', 5), next('silence', { areas: ['block'] }))),
  'HV-P03-075': E(['receive', 'attack'], when(setIs('Sakae Echigo'), may(guts(3), selfParam(3)))),
  'HV-P03-077': twin('Shoyo Hinata', 'Yudai Hyakuzawa'),
  'HV-P03-078': EV(['draw'], look(3, and(T('Johzenji', 'Pseudo-Youth'), CHAR), 1, 'either')),
  'HV-P03-079': EV(['draw'], function* (g, c) {
    const P = g.P(c.p)
    const seen = P.deck.slice(-5).reverse()
    if (!seen.length) return
    const first = yield* g.pickCard(c.p, 'Top 5 cards. Add a Pseudo-Youth WS, MB, S or Li character card to your hand?', seen.filter((u) => g.has(u, 'Pseudo-Youth') && g.isChar(u) && ['WS', 'MB', 'S', 'Li'].some((x) => g.isPos(u, x))), true, (u) => g.worth(u), seen)
    const second = first == null ? null : yield* g.pickCard(c.p, 'Add a Ball Boy character card from the rest?', seen.filter((u) => u !== first && g.isChar(u) && g.isPos(u, 'Ball Boy')), true, (u) => g.worth(u), seen.filter((u) => u !== first))
    const got = [first, second].filter((u): u is number => u != null)
    P.deck.splice(P.deck.length - seen.length)
    P.deck.unshift(...seen.filter((u) => !got.includes(u)).reverse())
    for (const u of got) { P.deck.push(u); g.say(`${g.nm(c.p)} reveals ${g.def(u).name}.`, { t: 'reveal', p: c.p, uid: u }); yield* g.addByAbility(c.p, u) }
  }),
  'HV-P03-080': EV(['draw'], may(gutsEach(2, ['receive', 'set', 'attack']), add('event', not(N('SEARCH')), 2))),
  'HV-P03-081': EV1(['block', 'receive', 'attack'], draw(1), when(allTeam('Pseudo-Youth'), oneParam(ANY, 1)), when(eventGE(8), draw(1))),
  'HV-P03-082': EV(['receive'], when(allTeam('Pseudo-Youth'), draw(1)), one(ANY, 'rc', 1), when(eventGE(4), thisEnter(and(PSY, N('Yudai Hyakuzawa')), 'at', 1))),
  'HV-P03-083': EV(['receive'], when(allTeam('Youth'), draw(1)), one(ANY, 'rc', 1), swapGuts(YOU, 'receive', 'attack')),
  'HV-P03-084': EV1(['receive'], when(allTeam('Youth'), draw(1)), one(ANY, 'rc', 1), when(eventLE(2), that('rc', 1))),
  'HV-P03-085': EV1(['attack'], draw(1), one(YOU, 'at', 1), when(targetIs(N('Korai Hoshiumi')), may(guts(3, ['attack']), that('at', 2)))),
  'HV-P03-086': EV(['set'], function* (g, c) { const t = g.top(c.p, 'set'); if (t != null && g.isPos(t, 'S')) g.fix(t, 'st', 2) }, may(evSelfToBottom, add('event', (g, u) => g.def(u).type === 'Event' && g.timings(u).length === 1 && g.timings(u)[0] === 'attack', 1))),
  'HV-P03-087': EV1(['receive', 'attack'], when(either(allTeam('Karasuno'), allTeam('Youth')), draw(1)), one(ANY, 'at', 1), when(targetIs(N('Tobio Kageyama')), may(guts(6), thatParam(2)))),
  'HV-P03-088': EVIF(['draw'], handLE(4), ifDid(add('guts', NEK, 2, { exact: true, difNames: true, oneArea: true }), toBottom('drop', and(NEK, CHAR), 1))),
  'HV-P03-089': EV(['draw', 'receive'], add('drop', and(NEK, CHAR), 1, { exact: true })),
  'HV-P03-090': EV1(['draw'], add('event', and(EVENT, not(N('THANK YOU FOR TEACHING ME VOLLEYBALL'))), 1, { exact: true })),
  'HV-P03-091': EV(['serve', 'draw'], draw(1), when(all(phaseIs('serve'), serveIs('Atsumu Miya')), function* (g, c) { g.fix(g.top(c.p, 'serve')!, 'sv', 6) }), function* (g, c) { g.addRule(c.p, 0, 'drawOnLeaveEvent', g.def(c.uid).name, { uid: c.uid }) }),
  'HV-P03-092': EV(['attack'], draw(1), next('noStuffed'), next('noDeflection'), when(attackIs('Rintaro Suna'), may(guts(2, ['attack']), inArea('attack', ANY, 'at', 2)))),
  'HV-P03-093': EV(['receive'], draw(1), choose(['One of your Inarizaki characters gets +1 Receive Point.', one(INA, 'rc', 1)], ['Play "Shinsuke Kita" from your Receive Area Guts into your Receive Area.', play('guts', N('Shinsuke Kita'), 'receive', { areas: ['receive'] }), (g, c) => g.guts(c.p, 'receive').some((u) => g.def(u).name === 'Shinsuke Kita')])),
  'HV-P03-094': EV1(['draw'], function* (g, c) {
    const P = g.P(c.p)
    const seen = P.deck.slice(-3).reverse()
    const list = seen.filter((u) => g.has(u, 'Karasuno') && g.def(u).type === 'Event')
    const uid = yield* g.pickCard(c.p, 'Top 3 cards. Add a Karasuno Event card to your hand?', list, true, (u) => g.worth(u), seen)
    P.deck.splice(P.deck.length - seen.length)
    P.deck.unshift(...seen.filter((u) => u !== uid).reverse())
    if (uid != null) {
      P.deck.push(uid)
      yield* g.addByAbility(c.p, uid)
      if (P.event.includes(c.uid)) yield* g.addByAbility(c.p, c.uid)
    }
  }),
  'HV-P03-095': EV(['attack'], one(KAR, 'at', 1), when(allTeam('Karasuno'), may(guts(6), draw(2)))),
  'HV-P03-096': EV1(['block', 'receive', 'attack'], draw(1), oneParam(N('Shoyo Hinata'), 1)),
  'HV-P03-097': EV(['block'], add('drop', and(DAT, CHAR), 2, { exact: true, difNames: true }), discardN(1)),
  'HV-P03-098': EV(['serve', 'block'], when(allTeam('Date Tech'), draw(1)), choose(['One of your characters gets +1 Block Point.', one(ANY, 'bl', 1), (g, c) => g.blockers(c.p).length > 0, 2], ['Next turn, "S" characters entering their Set Area from hand get −1 Set Point.', nextEnter(['set'], 'st', -1, POS('S'), true), phaseIs('serve')])),
  'HV-P03-099': EV(['attack'], draw(1), one(SHI, 'at', 1, ['attack']), when(targetIs(N('Wakatoshi Ushijima')), function* (g, c) {
    const o = g.P(opp(c.p))
    const ch = o.event.filter((u) => g.isChar(u))
    for (const u of ch) g.toDrop(u, true)
    if (ch.length) g.say(`${ch.length} character cards go from ${g.nm(opp(c.p))}'s Event Area to their Drop Area.`)
    if (ch.length >= 2 && c.target != null) g.pump(c.target, 'at', 1)
  })),

  // ---------------- Booster Pack: The Strongest Challengers (HV-P04) ----------------
  'HV-P04-001': E(['attack'], when(allTeam('Karasuno'), may(discard(2, KAR), when(enteredBy('Tobio Kageyama'), self('at', 3)), nextEnter(['center'], 'bl', -3)))),
  'HV-P04-002': { watch: onEnter({ areas: ['attack'], selfIn: ['set'], fromHand: true, test: N('Shoyo Hinata'), cost: gutsEach(2, ['set', 'attack']) }, draw(1), play('drop', N('Shoyo Hinata'), 'attack'), that('at', 2)) },
  'HV-P04-004': E(['serve'], nextEnter(['receive'], 'rc', -1, POS('Li'), true)),
  'HV-P04-005': E(['set'], when(onTopOf(and(KAR, POS('S'))), may(guts(2), self('st', 3)))),
  'HV-P04-006': E(['attack'], when(oppCourt(Y('2nd Year')), may(guts(2), self('at', 3)))),
  'HV-P04-007': E(['receive'], may(guts(3), when(all(paidAll(KAR), (g, c) => new Set(c.paid.map((u) => g.def(u).name)).size === c.paid.length), function* (g, c) { g.pump(c.uid, 'rc', c.paid.reduce((a, u) => a + (g.def(u).bl ?? 0), 0)) }))),
  'HV-P04-009': E(['receive'], may(discard(2, KAR), draw(1), self('rc', 2), when(dropDif(KAR, 8), self('rc', 1), aPass(1)))),
  'HV-P04-011': { watch: onEnter({ areas: ['attack'], selfIn: ['set'], fromHand: true, test: and(KAR, not(POS('Li'))), cond: eventLE(5) }, syncAttack('Karasuno', 3)) },
  'HV-P04-013': E(['attack'], may(discard(1, KAR), self('at', 2), when(dropDif(KAR, 8), next('silence', { areas: ['center'] })))),
  'HV-P04-014': E(['receive'], may(discard(1, KAR), play('guts', N('Daichi Sawamura'), 'receive', { areas: ['receive'] }), that('rc', 1))),
  'HV-P04-016': { watch: onEnter({ areas: ['attack'], selfIn: ['set'], fromHand: true, test: (g, u) => g.def(u).at === 3, cost: guts(2) }, when(allTeam('Aoba Johsai'), play('guts', N('Hajime Iwaizumi'), 'attack'), fixThat('at', 4))) },
  'HV-P04-018': E(['serve'], may(guts(2), self('sv', 1), oppDiscard(1, 4))),
  'HV-P04-020': E(['attack'], may(guts(3), self('at', 4), when(selfGE('at', 8), next('blockMax', { n: 1 }), next('noHandSkill')))),
  'HV-P04-021': { watch: onTop(SEI, null, function* (g, c) { if (c.target != null) g.noReduce(c.target) }) },
  'HV-P04-022': { watch: onEnter({ areas: ['attack'], selfIn: ['center', 'sides'], fromHand: true, test: (g, u) => g.def(u).at === 3, cost: discard(1, SEI) }, enterSelf('attack'), self('at', 3)) },
  'HV-P04-023': E(['block'], may(toEvent(and(SEI, EVENT)), draw(1), self('bl', 3))),
  'HV-P04-025': E(['receive'], when(allTeam('Aoba Johsai'), may(guts(3), self('rc', 3), aPass(1)))),
  'HV-P04-028': { watch: onEnter({ areas: ['attack'], selfIn: ['set'], test: N('Kentaro Kyotani'), cost: guts(2) }, draw(1), self('st', 2)) },
  'HV-P04-030': E(['attack'], when(setIs('Shigeru Yahaba'), may(both(discard(1, SEI), guts(2)), self('at', 4)))),
  'HV-P04-031': HAND1(['draw'], 'discard', when(oppEv(5, 'block', 'draw', 'receive'), add('event', SEI, 1))),
  'HV-P04-032': E(['attack'], when(allTeam('Kakugawa'), may(guts(3, ['center', 'attack']), self('at', 5), when(paidAll(and(N('Yudai Hyakuzawa'), NOSKILL)), self('at', 2))))),
  'HV-P04-034': { watch: onEnter({ areas: ['block', 'attack'], selfIn: ['set'], test: N('Yudai Hyakuzawa'), cond: allTeam('Kakugawa'), cost: guts(2) }, thatParam(2)) },
  'HV-P04-037': E(['block'], may(discard(1, KAK), add('drop', N('Yudai Hyakuzawa'), 1), now('noPlay', { areas: ['receive'], pred: (d: { name: string }) => d.name === 'Yudai Hyakuzawa' }), deflection(2))),
  'HV-P04-038': { watch: onEnter({ areas: ['block'], selfIn: ['receive'], test: N('Yudai Hyakuzawa'), cost: guts(2) }, enterSelf('sides'), one(N('Yudai Hyakuzawa'), 'bl', 2)) },
  'HV-P04-039': E(['attack'], may(mill(3, true), when(seenCount(EVENT, 1), self('at', 2)), when(seenCount(EVENT, 2), self('at', 2)), when(seenCount(EVENT, 3), self('at', 4)))),
  'HV-P04-043': E(['attack'], may(mill(3, true), function* (g, c) {
    const k = c.seen.filter((u) => g.def(u).type === 'Event').length
    if (k >= 2) yield* feint(7)(g, c)
    else if (k === 1) yield* feint(4)(g, c)
  })),
  'HV-P04-044': E(['receive'], may(gutsEach(2, ['receive', 'set', 'attack']), self('rc', 2), ifDid(function* (g, c) { const a = yield* add('event', and(JOH, EVENT), 1)(g, c); return a !== false ? a : yield* add('drop', and(JOH, EVENT), 1)(g, c) }, discardN(1)))),
  'HV-P04-045': E(['receive'], may(mill(3, true), when(seenCount(EVENT, 1), self('rc', 2)), when(seenCount(EVENT, 2), draw(1)))),
  'HV-P04-046': E(['attack'], may(guts(3), self('at', 1), blockOut(2), when(allTeam('Wakutani Minami'), draw(1), add('event', N('TO THE FORMER "LITTLE GIANT"'), 1)))),
  'HV-P04-048': { watch: onTop(and(WAK, not(N('Shunki Kawawari'))), null, function* (g, c) { g.addRule(opp(c.p), 1, 'drawOnBlocker', 'Shunki Kawawari', { n: 3, owner: c.p }) }) },
  'HV-P04-050': E(['set'], may(guts(3), self('st', 1), add('drop', and(WAK, CHAR), 1))),
  'HV-P04-051': E(['block'], when(oppOffGE(4), may(mill(1), when(seenAll(WAK), deflection(3))))),
  'HV-P04-053': E(['attack'], may(guts(2), when(all(receiveIs('Morisuke Yaku'), setIs('Nobuyuki Kai')), self('at', 3)))),
  'HV-P04-054': E(['receive'], when(either(oppOffLE(3, 'Serve'), oppOffLE(3, 'Attack')), aPass(1))),
  'HV-P04-055': E(['receive'], may(guts(2), self('rc', 1), look(3, N('Tetsuro Kuroo', 'Nobuyuki Kai')))),
  'HV-P04-056': { watch: onEnter({ areas: ['attack'], selfIn: ['set'], test: N('Tetsuro Kuroo'), cost: guts(2) }, draw(2), handOneBack('bottom'), self('st', 1)) },
  'HV-P04-057': E(['block'], when(enteredBy('Kaname Moniwa'), may(guts(3), when(all(paidAll(DAT), inBlock(N('Kaname Moniwa')), inBlock(N('Takehito Sasaya'))), stuffed(8))))),
  'HV-P04-058': E(['block'], when((g, c) => g.P(c.p).sides.length === 0 && g.areaOf(c.p, c.uid) === 'center', may(discard(2, DAT), play('drop', N('Yasushi Kamasaki'), 'sides'), play('drop', N('Takehito Sasaya'), 'sides')))),
  'HV-P04-060': E(['attack'], may(both(discard(1, SHI), guts(2)), self('at', 2), when(all(receiveIs('Reon Ohira'), setIs('Satori Tendo')), self('at', 2)))),
  'HV-P04-061': E(['set'], may(both(discard(1, SHI), guts(2)), add('drop', and(SHI, Y('3rd Year')), 1), self('st', 1))),
  'HV-P04-062': E(['receive'], may(both(discard(1, SHI), guts(2)), self('rc', 2), function* (g, c) { yield* mill(2).pay(g, c) }, function* (g, c) {
    const list = c.seen.filter((u) => g.has(u, 'Shiratorizawa') && g.def(u).years.includes('3rd Year'))
    const uid = yield* g.pickCard(c.p, 'Add a Shiratorizawa 3rd Year card from among them to your hand?', list, true, (u) => g.worth(u), c.seen)
    if (uid != null) yield* g.addByAbility(c.p, uid)
  })),
  'HV-P04-063': E(['attack'], may(guts(3), when(all(paidAll(and(FUK, not(N('Kotaro Bokuto')))), (g, c) => new Set(c.paid.map((u) => g.def(u).name)).size === c.paid.length), self('at', 7)))),
  'HV-P04-064': E(['set'], may(guts(2), self('st', 1), swapHandGuts(FUK, 'attack'))),
  'HV-P04-065': E(['attack'], when(setIs('Akinori Konoha'), may(discard(1, and(FUK, Y('3rd Year'))), self('at', 4)))),
  'HV-P04-066': E(['receive'], may(both(discard(1, and(FUK, Y('3rd Year'))), guts(2)), self('rc', 1), add('drop', and(FUK, Y('3rd Year')), 1))),
  'HV-P04-067': E(['serve'], may(both(discard(1, and(FUK, Y('3rd Year'))), guts(1)), draw(2), self('sv', 3))),
  'HV-P04-068': E(['serve'], when(all(allTeam('Inarizaki'), onTopOf(N('Atsumu Miya'))), draw(1)), nextEnter(['set'], 'st', -1, POS('S'), true)),
  'HV-P04-070': E(['receive'], when(eventGE(3, INA), may(discard(1, INA), self('rc', 2), function* (g, c) {
    for (const x of g.chars(c.p)) if (g.has(x.uid, 'Inarizaki')) g.noReduce(x.uid)
    g.addRule(c.p, 0, 'enterMod', g.def(c.uid).name, { areas: ['any'], param: 'rc', n: 0, pred: (gg: HQ, u: number) => gg.has(u, 'Inarizaki'), noReduce: true })
  }))),
  'HV-P04-072': HAND(['receive'], 'discard', one(PSY, 'rc', 2), toBottom('drop', and(PSY, CHAR, not(N('Shoyo Hinata'))), 1)),
  'HV-P04-073': E(['block'], when(eventGE(4), may(guts(1), self('bl', 2), oppGutsToDrop(3, undefined, N('Akira Kunimi'))))),
  'HV-P04-074': E(['serve', 'attack'], may(toEvent(and(CHAR, POS('Ball Boy'))), draw(1), selfParam(2))),
  'HV-P04-076': E(['set'], may(guts(2), when(paidAll(and(YOU, POS('S'))), draw(1)), self('st', 1), function* (g, c) {
    const list = g.P(c.p).drop.filter((u) => g.has(u, 'Youth') && g.def(u).type === 'Event')
    const uid = yield* g.pickCard(c.p, 'Send a Youth Event card from your Drop Area to your Event Area?', list, true)
    if (uid != null) { g.lift(uid); g.P(c.p).event.push(uid) }
  })),
  'HV-P04-077': E(['receive', 'attack'], may(toEvent(and(YOU, EVENT)), draw(1), selfParam(3))),
  'HV-P04-078': E(['serve'], when(eventGE(4, N('EVEN THE OLD MAN WILL GET SERIOUS')), draw(1)), nextNoPlay(['receive'], (d) => (d.rc ?? 0) >= 4)),
  'HV-P04-079': E(['receive', 'attack'], may(guts(3), selfParam(3), when(eventGE(4, N('EVEN THE OLD MAN WILL GET SERIOUS')), selfParam(1)))),
  'HV-P04-080': E(['set'], may(guts(2), self('st', 2), look(3, N('EVEN THE OLD MAN WILL GET SERIOUS')))),
  'HV-P04-082': EV1(['attack'], when(all(setIs('Tobio Kageyama'), attackIs('Shoyo Hinata')), one(ANY, 'at', 1)), next('onOppLost', { run: function* (g: HQ, p: Side) {
    const k = g.P(p).drop.find((u) => g.def(u).name === 'Tobio Kageyama')
    if (k != null) { g.lift(k); g.P(p).set.unshift(k) }
    const h = g.P(p).drop.find((u) => g.def(u).name === 'Shoyo Hinata')
    if (h != null) g.toHand(h)
  } }), ownerFix),
  'HV-P04-083': EVIF(['set'], setIs('Tobio Kageyama'), function* (g, c) { const t = g.top(c.p, 'set'); if (t != null) g.toHand(t) }, play('hand', N('Koshi Sugawara'), 'set'), fixThat('st', 3)),
  'HV-P04-084': { event: { phases: ['receive', 'set', 'attack'], turn1: true, can: (g, p) => g.P(p).event.length <= 5, run: seq(draw(1), one(and(KAR, Y('3rd Year')), 'rc', 1), when(dropDif(KAR, 8), draw(1), thatParam(2))) as never } },
  'HV-P04-085': EV(['draw', 'receive'], look(3, SEI)),
  'HV-P04-086': EV(['draw'], drawUpTo(1), when(handLE(4), add('drop', N('Kentaro Kyotani'), 1))),
  'HV-P04-087': EV(['serve', 'draw'], choose(['Play "Toru Oikawa" from your Drop Area into your Serve Area.', seq(play('drop', N('Toru Oikawa'), 'serve', { must: true }), next('noDrawPhaseAdd')), phaseIs('serve')], ['Draw 1 card.', draw(1), phaseIs('draw')])),
  'HV-P04-088': EV1(['attack'], draw(1), one(SEI, 'at', 1, ['attack']), when(targetGE('at', 8), nextEnter(['receive'], 'rc', -1))),
  'HV-P04-089': EV1(['receive'], draw(1), one(and(SEI, Y('3rd Year')), 'rc', 1), may(discard(1, and(SEI, Y('3rd Year'), CHAR)), that('rc', 2))),
  'HV-P04-090': EV(['attack'], draw(1), when(attackIs('Yudai Hyakuzawa'), nextEnter(['block'], 'bl', -1), nextEnter(['receive'], 'rc', -1))),
  'HV-P04-091': EV1(['receive'], one(and(KAK, Y('2nd Year')), 'rc', 1), when(attackIs('Yudai Hyakuzawa'), draw(1), that('rc', 1))),
  'HV-P04-092': EV(['block', 'attack'], draw(1), oneParam(N('Yudai Hyakuzawa'), 1)),
  'HV-P04-093': EV1(['serve', 'block', 'receive', 'set', 'attack'], draw(1), when((g, c) => g.allTeam(c.p, 'Johzenji') && g.P(c.p).drop.every((u) => g.has(u, 'Johzenji')), function* (g, c) {
    if (!(yield* g.yesNo(c.p, 'Shuffle all Johzenji cards from your Event Area and Drop Area into your deck?', 1))) return
    const P = g.P(c.p)
    for (const key of ['event', 'drop'] as const) for (const u of [...P[key]]) if (g.has(u, 'Johzenji')) { g.lift(u); P.deck.push(u) }
    g.shuffle(P.deck)
  })),
  'HV-P04-094': EV1(['draw', 'receive'], draw(1), one(JOH, 'rc', 1), function* (g, c) { if (yield* g.yesNo(c.p, 'Shuffle your deck?', 0)) g.shuffle(g.P(c.p).deck) }),
  'HV-P04-095': EV(['receive', 'attack'], oneParam(JOH, 1), may(mill(3, true), when(seenCount(EVENT, 1), draw(1), that('rc', 1)))),
  'HV-P04-096': EV(['draw'], draw(1), look(3, N('Takeru Nakashima', 'TO THE FORMER "LITTLE GIANT"'))),
  'HV-P04-097': EV1(['attack'], when(allTeam('Wakutani Minami'), (g, c) => nextEnter(['receive'], 'rc', attackIs('Takeru Nakashima')(g, c) ? -3 : -2, orig('rc', (n) => n >= 5))(g, c))),
  'HV-P04-098': EV(['receive'], draw(1), choose(['One of your Wakutani Minami characters gets +1 Receive Point.', one(WAK, 'rc', 1)], ['Set the Receive Point of one of your Wakutani Minami characters to 6.', seq(one(WAK, 'rc', 0), fixThat('rc', 6)), (g, c) => g.chars(c.p).some((x) => g.has(x.uid, 'Wakutani Minami') && (g.param(x.uid, 'rc') ?? 99) < 6), 2])),
  'HV-P04-099': EVIF(['set'], setIs('Atsumu Miya'), draw(1), inArea('set', ANY, 'st', 1), look(3, N('SPOT ON', 'Spot On'))),
  'HV-P04-100': EV(['draw'], function* (g, c) {
    for (const q of [c.p, opp(c.p)] as Side[]) if (yield* g.yesNo(q, 'Draw 2 cards?', 1)) yield* g.drawFx(q, 2)
    g.addRule(c.p, 0, 'noDrawPhaseAdd', g.def(c.uid).name)
  }),
  'HV-P04-101': EV(['receive', 'attack'], when(allTeam('Neighborhood Association'), draw(1)), one(ANY, 'rc', 1), when(eventGE(4, N('EVEN THE OLD MAN WILL GET SERIOUS')), that('at', 1))),

  // ---------------- Starter Decks ----------------
  'HV-D01-001': E(['attack'], may(guts(2), self('at', 2))),
  'HV-D01-002': E(['set'], may(guts(2), self('st', 2))),
  'HV-D01-003': E(['block'], when(oppOffLE(4), may(guts(1), draw(1)))),
  'HV-D01-007': E(['receive'], may(discard(1), self('rc', 3))),
  'HV-D01-011': EV(['receive'], draw(1), one(ANY, 'rc', 1), when((g, c) => c.target != null && (g.param(c.target, 'rc') ?? 99) <= 4, that('rc', 1))),
  'HV-D01-012': EV(['attack'], draw(1), one(KAR, 'at', 1), when(all(setIs('Tobio Kageyama'), attackIs('Shoyo Hinata')), next('blockMax', { n: 1 }))),
  'HV-D02-001': E(['set'], may(guts(2), self('st', 1), nextEnter(['attack'], 'at', -2))),
  'HV-D02-002': E(['block'], may(guts(1), stuffed(5))),
  'HV-D02-003': E(['receive'], may(discard(1), self('rc', 2))),
  'HV-D02-004': { watch: onEnter({ areas: ['block'], selfIn: ['attack'], cost: guts(2) }, enterSelf('sides')) },
  'HV-D02-009': E(['receive'], may(guts(2), draw(1))),
  'HV-D02-011': EV(['block', 'receive'], draw(1), choose(['One of your "Tetsuro Kuroo" in your Block Area gets +1 Block Point.', one(N('Tetsuro Kuroo'), 'bl', 1, ['center', 'sides']), inBlock(N('Tetsuro Kuroo')), 2], ['One of your characters gets +1 Receive Point.', one(ANY, 'rc', 1)])),
  'HV-D02-012': EV(['draw'], draw(1), look(3, N('Lev Haiba', 'So Inuoka'))),
  'HV-D03-001': E(['set'], may(guts(2), self('st', 1), ifDid(add('event', N('WHAT ARE WE DOING TODAY?'), 1), handOneBack('bottom')))),
  'HV-D03-002': E(['attack'], when(setIs('Atsumu Miya'), may(handToBottom(1), self('at', 2)))),
  'HV-D03-003': E(['serve'], may(toEvent(EVENT), draw(1), choose(['This character gets +1 Serve Point.', self('sv', 1), undefined, 2], ['Next turn, characters entering their Set Area get −2 Set Point.', nextEnter(['set'], 'st', -2)]))),
  'HV-D03-008': E(['attack'], may(guts(5), self('at', 2))),
  'HV-D03-011': E(['receive'], may(guts(2), self('rc', 2))),
  'HV-D03-012': EV(['receive'], drawPump(INA, 'rc'), may(guts(4, ['receive']), draw(1))),
  'HV-D03-013': EVIF(['set', 'attack'], setIs('Atsumu Miya', 'Osamu Miya'), draw(1), inArea('set', ANY, 'st', 1)),
  'HV-D04-001': E(['serve', 'set'], may(guts(2), when(paidAll(SEI), selfParam(2)))),
  'HV-D04-002': E(['attack'], when(setIs('Toru Oikawa'), may(guts(2), self('at', 3), when(fewerScore, self('at', 1))))),
  'HV-D04-005': E(['block'], when(oppOffLE(2), stuffed(6))),
  'HV-D04-008': E(['receive'], may(guts(4), draw(1), self('rc', 2))),
  'HV-D04-012': EV1(['serve', 'attack'], oneParam(SEI, 1), when(phaseIs('attack'), draw(1))),
  'HV-D04-013': EV(['receive'], one(SEI, 'rc', 1), function* (g, c) {
    const P = g.P(c.p)
    if (!P.deck.length) return
    const u = P.deck[P.deck.length - 1]
    g.say(`${g.nm(c.p)} reveals ${g.def(u).name}.`, { t: 'reveal', p: c.p, uid: u })
    if (g.has(u, 'Aoba Johsai')) yield* g.addByAbility(c.p, u)
    else { P.deck.pop(); P.deck.unshift(u) }
    if (g.def(u).type === 'Event') yield* g.drawFx(c.p, 1)
  }),

  // ---------------- Donpisha Deck and promotional cards ----------------
  'HVBP-001': E(['attack'], may(discard(1), self('at', 2))),
  'HVBP-002': E(['attack'], may(discard(1), self('at', 2))),
  'HV-PR-003': E(['attack'], may(discard(1), self('at', 2))),
  'HVBP-003': E(['set'], may(guts(2), draw(1))),
  'HVBP-004': E(['set'], may(guts(2), draw(1))),
  'HV-PR-004': E(['set'], may(guts(2), draw(1))),
  'HVBP-009': E(['receive', 'attack'], may(guts(2), choose(['This character gets +1 Receive Point.', self('rc', 1)], ['This character gets +1 Attack Point.', self('at', 1)]))),
  'HVBP-013': EV(['attack'], one(ANY, 'at', 1), when(all(setIs('Tobio Kageyama'), attackIs('Shoyo Hinata')), next('blockMax', { n: 2 }))),
  'HVBP-014': EV(['receive'], one(ANY, 'rc', 1), when(handLE(3), draw(1))),
  'HV-PR-001': { enter: { areas: ['court'], run: seq(when(onTopOf(N('Shoyo Hinata')), selfParam(1))) as never } },
  'HV-PR-002': { enter: { areas: ['court'], run: seq(when(onTopOf(N('Tobio Kageyama')), selfParam(1))) as never } },
  'HV-PR-009': twin('Toru Oikawa', 'Hajime Iwaizumi'),
  'HV-PR-015': twin('Toru Oikawa', 'Hajime Iwaizumi'),
  'HV-PR-012': twin('Shoyo Hinata', 'Tobio Kageyama'),
  'HV-PR-013': twin('Kotaro Bokuto', 'Keiji Akaashi'),
  'HV-PR-014': twin('Kenma Kozume', 'Tetsuro Kuroo'),
  'HV-PR-016': twin('Kei Tsukishima', 'Tadashi Yamaguchi'),
  'HV-PR-017': twin('Yutaro Kindaichi', 'Akira Kunimi'),
  'HV-PR-018': twin('Wakatoshi Ushijima', 'Tsutomu Goshiki'),
  'HV-PR-022': E(['receive'], when(either(oppOffLE(2, 'Serve'), oppOffLE(2, 'Attack')), aPass(1), may(guts(1), draw(1)))),
  'HV-PR-023': { watch: onEnter({ areas: ['attack'], selfIn: ['receive'], test: N('Lev Haiba'), cost: guts(2) }, that('at', 1)) },
  'HV-PR-024': E(['set'], may(guts(3), self('st', 2), function* (g, c) {
    const P = g.P(opp(c.p))
    P.deck.push(...P.hand.splice(0))
    g.shuffle(P.deck)
    g.say(`${g.nm(opp(c.p))} shuffles their hand into their deck and draws 4.`)
    g.draw(opp(c.p), 4)
  })),
  'HV-PR-025': E(['attack'], when(setIs('Toru Oikawa'), may(guts(3), self('at', 2), oppDiscard(1, 3)))),
  'HV-PR-026': E(['receive'], may(guts(4), self('rc', 4))),
  'HV-PR-027': E(['serve', 'block', 'attack'], next('millOnAdd')),
  'HV-PR-028': E(['set'], may(guts(2), oppEventToDrop(1), nextEnter(['receive'], 'rc', -2))),
  'HV-PR-029': EV(['draw'], add('drop', N('Shoyo Hinata'), 1), add('drop', N('Tobio Kageyama'), 1)),
  'HV-PR-030': EV1(['receive'], inArea('receive', NEK, 'rc', 2), when(targetIs(N('Yuki Shibayama')), draw(1))),
  'HV-PR-031': EV(['attack'], draw(1), one(FUK, 'at', 1), when(all(setIs('Keiji Akaashi'), attackIs('Kotaro Bokuto')), nextEnter(['center'], 'bl', -2))),
  'HV-PR-036': twin('Atsumu Miya', 'Osamu Miya'),
  'HV-PR-040': twin('Atsumu Miya', 'Osamu Miya'),
  'HV-PR-037': E(['attack'], may(discard(1), self('at', 3))),
  'HV-PR-038': twin('Yu Nishinoya', 'Asahi Azumane'),
  'HV-PR-039': twin('Takanobu Aone', 'Kenji Futakuchi'),
  'HV-PR-070': twin('Takanobu Aone', 'Kenji Futakuchi'),
  'HV-PR-041': twin('Tobio Kageyama', 'Koshi Sugawara'),
  'HV-PR-042': twin('Kenjiro Shirabu', 'Eita Semi'),
  'HV-PR-044': E(['block', 'receive'], may(toEvent(and(NEK, EVENT)), draw(1), selfParam(3))),
  'HV-PR-045': HAND(['block'], 'discard', function* (g, c) { yield* mill(2).pay(g, c) }, when(seenAll(DAT), one(DAT, 'bl', 2))),
  'HV-PR-046': E(['block'], may(discard(1, SHI), self('bl', 3), when(oppHandLE(2), self('bl', 2)))),
  'HV-PR-047': E(['receive'], may(discard(1), self('rc', 2))),
  'HV-PR-048': E(['attack'], may(guts(2), when(dropDif(INA, 6), self('at', 3)))),
  'HV-PR-049': E(['receive'], may(guts(2), self('rc', 3), when(oppOffLE(2, 'Serve'), add('drop', and(INA, CHAR), 1)))),
  'HV-PR-050': EV1(['serve', 'draw'], draw(1), when(all(phaseIs('serve'), serveIs('Tadashi Yamaguchi')), draw(1), function* (g, c) { g.fix(g.top(c.p, 'serve')!, 'sv', 6) })),
  'HV-PR-051': EV(['attack'], draw(1), mine('offNoReduce'), when(attackIs('Hajime Iwaizumi'), may(guts(2, ['attack']), inArea('attack', ANY, 'at', 2)))),
  'HV-PR-052': EV(['block'], when(allTeam('Shiratorizawa'), draw(1)), one(N('Satori Tendo'), 'bl', 1), when(all(inBlock(N('Satori Tendo')), oppHandLE(2)), stuffed(8))),
  'HV-PR-057': twin('Shoyo Hinata', 'Yu Nishinoya'),
  'HV-PR-058': twin('Tetsuro Kuroo', 'Taketora Yamamoto'),
  'HV-PR-059': twin('Atsumu Miya', 'Motoya Komori'),
  'HV-PR-060': twin('Shoyo Hinata', 'Kanji Koganegawa'),
  'HV-PR-061': twin('Akira Kunimi', 'Tsutomu Goshiki'),
  'HV-PR-062': twin('Lev Haiba', 'Kotaro Bokuto'),
  'HV-PR-063': EV1(['draw'], function* (g, c) { for (const q of [c.p, opp(c.p)] as Side[]) if (yield* g.yesNo(q, 'Draw 2 cards?', 1)) yield* g.drawFx(q, 2) }),
  'HV-PR-067': twin('Ryunosuke Tanaka', 'Daichi Sawamura'),
  'HV-PR-068': twin('Osamu Miya', 'Rintaro Suna'),
  'HV-PR-069': twin('Toru Oikawa', 'Yutaro Kindaichi'),
  'HV-PR-078': EVIF(['draw'], (g, c) => g.P(c.p).hand.length === 4, add('guts', Y('1st Year'), 1)),
  'HV-PR-080': E(['attack'], when(setIs('Tobio Kageyama'), function* (g, c) {
    const avail = g.payable(c.p).length
    if (avail < 2) return
    const opts = [2, 3].filter((n) => n <= avail).map((n) => ({ t: 'n', n, label: `Pay ${n} Guts`, w: n }))
    const o = yield* g.ask(c.p, 'choose', `Use the skill of ${g.def(c.uid).name}? Pay 2 or 3 Guts.`, [...opts, { t: 'no', label: "Don't", w: 0 }], [c.uid])
    if (o.t === 'no') return
    c.paid = yield* g.payGuts(c.p, o.n!)
    if (c.paid.length && c.paid.every((u) => g.def(u).name === 'Shoyo Hinata')) g.pump(c.uid, 'at', 3 + c.paid.length)
  })),
  'HV-PR-081': E(['serve', 'attack'], when(allTeam('Youth'), function* (g, c) {
    const list = () => g.P(c.p).event.filter((u) => g.has(u, 'Youth') && g.def(u).type === 'Event')
    if (!list().length || !(yield* g.yesNo(c.p, `Use the skill of ${g.def(c.uid).name}? Send 1 or 2 Youth Event cards from your Event Area to the Drop Area.`, 1))) return
    let k = 0
    for (let i = 0; i < 2; i++) {
      const uid = yield* g.pickCard(c.p, 'Choose a Youth Event card to send to the Drop Area.', list(), i > 0, () => 1)
      if (uid == null) break
      g.toDrop(uid)
      k++
    }
    yield* selfParam(2)(g, c)
    if (k === 2) { g.pump(c.uid, 'at', 1); yield* blockOut(2)(g, c) }
  })),
  'HV-PR-082': { hand: { phases: ['attack'], cost: 'none', can: (g, p) => g.guts(p, 'attack').length >= 3 && (() => { const t = g.top(p, 'attack'); return t != null && g.has(t, 'Nekoma') && g.def(t).at === 3 })(), run: function* (g, c) {
    // Its cost is 3 Guts from the Attack Area; the card stays in hand until Back Attack plays it.
    yield* g.payGuts(c.p, 3, ['attack'])
    yield* backAttack(5)(g, c)
  } } },
  'HV-PR-083': E(['block'], may(toEvent(and(DAT, EVENT)), self('bl', 3), stuffed(6))),
  'HV-PR-084': EV1(['attack'], draw(1), one(N('Taketora Yamamoto'), 'at', 1), when((g, c) => c.target != null && !!g.s.entry[c.target]?.by && g.s.entry[c.target]?.turn === g.s.turnNo, that('at', 1))),
}

// ---------- helpers used above ----------
function* drawToFor(g: HQ, p: Side, n: number) {
  const k = n - g.P(p).hand.length
  if (k > 0) g.draw(p, k)
}
/** Rules that run "when your opponent declares Lost" are stored on the opponent; this records who benefits. */
function* ownerFix(g: HQ, c: { p: Side }) {
  for (const r of g.s.rules) if (r.kind === 'onOppLost' && !('owner' in r)) {
    r.owner = c.p
    const run = r.run as (gg: HQ, p: Side) => Generator
    r.run = (gg: HQ) => run(gg, c.p)
  }
}
/** "If you have no characters in your court with the same affiliation as the revealed card." */
function noTeamMatch(g: HQ, c: { p: Side; seen: number[] }) {
  if (!c.seen.length) return false
  const teams = g.def(c.seen[0]).schools
  if (!teams.length) return true
  return !g.chars(c.p).some((x) => g.def(x.uid).schools.some((t) => teams.includes(t)))
}
/** "Send one of your [team] characters from your Block Area to the Drop Area." */
function selfBlockerToDrop(test: CP) {
  return {
    text: 'Send one of your characters from your Block Area to the Drop Area.',
    can: (g: HQ, c: { p: Side }) => g.blockers(c.p).some((x) => test(g, x.uid)),
    *pay(g: HQ, c: { p: Side; paid: number[] }) {
      const uid = yield* g.pickChar(c.p, c.p, 'Choose a character in your Block Area to send to the Drop Area.', (u, a) => (a === 'center' || a === 'sides') && test(g, u))
      if (uid == null) return false
      g.toDrop(uid)
      c.paid = [uid]
      return true
    },
  }
}
/** "Add 2 Guts with the same affiliation from one of your Areas to your hand." */
function sameTeamGuts(n: number): Eff {
  return function* (g, c) {
    const choices: { area: Area; team: string; uids: number[] }[] = []
    for (const area of ['serve', 'center', 'receive', 'set', 'attack'] as Area[]) {
      const gs = g.guts(c.p, area)
      const teams = new Set(gs.flatMap((u) => g.def(u).schools))
      for (const team of teams) { const uids = gs.filter((u) => g.has(u, team)); if (uids.length >= n) choices.push({ area, team, uids }) }
    }
    if (!choices.length) return false
    const o = choices.length === 1 ? { n: 0 } : yield* g.ask(c.p, 'choose', 'Take Guts of which team, from which Area?', choices.map((x, i) => ({ t: 'opt', n: i, label: `${x.team}, ${AREA_NAME[x.area]}`, w: x.uids.length })))
    const pick = choices[o.n ?? 0]
    const got: number[] = []
    for (let i = 0; i < n; i++) {
      const uid = yield* g.pickCard(c.p, `Choose ${pick.team} Guts to add to your hand.`, pick.uids.filter((u) => !got.includes(u)), false, (u) => g.worth(u), pick.uids)
      if (uid == null) break
      got.push(uid)
      yield* g.addByAbility(c.p, uid)
    }
    return got.length === n
  }
}
/** "Put 1 card from your hand on the top or bottom of your deck." */
function handOneBack(where: 'bottom' | 'either'): Eff {
  return function* (g, c) {
    const uid = yield* g.pickCard(c.p, 'Choose a card from your hand to put back on your deck.', g.P(c.p).hand, false, (u) => 10 - g.worth(u))
    if (uid == null) return
    const top = where === 'either' && (yield* g.yesNo(c.p, 'Put it on top of your deck?', 0))
    g.lift(uid)
    if (top) g.P(c.p).deck.push(uid)
    else g.P(c.p).deck.unshift(uid)
  }
}
/** "Put up to 1 of your Shiratorizawa Guts into the Guts in your Attack Area." */
function moveGutsToAttack(test: CP): Eff {
  return function* (g, c) {
    const list = g.allGuts(c.p).filter((x) => x.area !== 'attack' && test(g, x.uid)).map((x) => x.uid)
    const uid = yield* g.pickCard(c.p, 'Move one of your Guts into your Attack Area Guts?', list, true, () => 1, list)
    if (uid == null) return
    g.lift(uid)
    g.P(c.p).attack.unshift(uid)
  }
}
/** Swap a Guts card in one Area with a Guts card in another Area. */
function swapGuts(test: CP, a: 'receive' | 'attack', b: 'receive' | 'attack'): Eff {
  return function* (g, c) {
    const la = g.guts(c.p, a).filter((u) => test(g, u))
    const lb = g.guts(c.p, b).filter((u) => test(g, u))
    if (!la.length || !lb.length || !(yield* g.yesNo(c.p, `Swap a Guts card in your ${a} Area with one in your ${b} Area?`, 0))) return
    const x = yield* g.pickCard(c.p, `Choose Guts in your ${a} Area.`, la, false)
    const y = yield* g.pickCard(c.p, `Choose Guts in your ${b} Area.`, lb, false)
    if (x == null || y == null) return
    const A = g.P(c.p)[a], B = g.P(c.p)[b]
    A[A.indexOf(x)] = y
    B[B.indexOf(y)] = x
  }
}
/** Swap a card in hand with a Guts card in an Area. */
function swapHandGuts(test: CP, area: 'attack'): Eff {
  return function* (g, c) {
    const hand = g.P(c.p).hand.filter((u) => test(g, u) && g.isChar(u))
    const gl = g.guts(c.p, area).filter((u) => test(g, u))
    if (!hand.length || !gl.length || !(yield* g.yesNo(c.p, 'Swap a card in your hand with a Guts card in your Attack Area?', 0))) return
    const x = yield* g.pickCard(c.p, 'Choose a card from your hand.', hand, false)
    const y = yield* g.pickCard(c.p, 'Choose a Guts card in your Attack Area.', gl, false, () => 1, gl)
    if (x == null || y == null) return
    const H = g.P(c.p).hand, A = g.P(c.p)[area]
    H[H.indexOf(x)] = y
    A[A.indexOf(y)] = x
  }
}
/** "[Synchronized Attack 〈team〉 (N)]" */
function syncAttack(team: string, n: number): Eff {
  return function* (g, c) {
    if (!g.allTeam(c.p, team)) return
    const att = g.top(c.p, 'attack')
    if (att == null) return
    const pool = () => g.allGuts(c.p).filter((x) => g.has(x.uid, team) && g.def(x.uid).name !== g.def(c.uid).name).map((x) => x.uid)
    if (!pool().length || !(yield* g.yesNo(c.p, `Synchronized Attack: pay up to ${n} ${team} Guts to raise your Attack character?`, 1))) return
    const paid: number[] = []
    for (let i = 0; i < n; i++) {
      const list = pool()
      const uid = yield* g.pickCard(c.p, 'Choose Guts to pay.', list, i > 0, (u) => (paid.some((x) => g.def(x).name === g.def(u).name) ? 0 : 2))
      if (uid == null) break
      g.toDrop(uid, true)
      paid.push(uid)
    }
    const x = new Set(paid.map((u) => g.def(u).name)).size
    if (x) g.pump(att, 'at', x)
  }
}
