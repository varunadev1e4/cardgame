import { GameEngine, Card, newDeck, shuffle, sortHand, SUITS } from '../engine';
const SYM: any = { S: '♠', H: '♥', D: '♦', C: '♣' };
const pts = (c: Card) => c.r === '8' ? 50 : ['J', 'Q', 'K'].includes(c.r) ? 10 : c.r === 'A' ? 1 : +c.r;
export interface C8 { deck: Card[]; discard: Card[]; hands: Record<string, Card[]>; ids: string[]; turn: number; suit: string; drew: boolean; winner?: string; log: string[] }
const top = (s: C8) => s.discard[s.discard.length - 1];
const ok = (s: C8, c: Card) => c.r === '8' || c.s === s.suit || c.r === top(s).r;
const adv = (s: C8, n = 1) => { s.turn = (s.turn + n) % s.ids.length; s.drew = false; };
function draw(s: C8): Card | undefined { if (!s.deck.length && s.discard.length > 1) { const t = s.discard.pop()!; s.deck = shuffle(s.discard); s.discard = [t]; } return s.deck.pop(); }
export const crazy8: GameEngine<C8, any, any, any> = {
  id: 'crazy8', minPlayers: 2, maxPlayers: 6,
  initialize(ids) {
    let deck = newDeck(); while (deck[deck.length - 1].r === '8') deck = shuffle(deck);
    const n = ids.length > 4 ? 5 : 7, hands: Record<string, Card[]> = {};
    for (const i of ids) hands[i] = [];
    for (let k = 0; k < n; k++) for (const i of ids) hands[i].push(deck.pop()!);
    ids.forEach(i => sortHand(hands[i]));
    const d = deck.pop()!; return { deck, discard: [d], hands, ids, turn: 0, suit: d.s, drew: false, log: ['Game started'] };
  },
  getPlayerView(s, me) {
    return { game: 'crazy8', you: me, turn: s.winner ? null : s.ids[s.turn], hand: s.hands[me], counts: Object.fromEntries(s.ids.map(i => [i, s.hands[i].length])), top: top(s), suit: s.suit, deckCount: s.deck.length, drew: s.drew, winner: s.winner ?? null,
      points: s.winner ? Object.fromEntries(s.ids.map(i => [i, s.hands[i].reduce((a, c) => a + pts(c), 0)])) : null, log: s.log.slice(-6) };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.winner) throw new Error('Game over');
    if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    const h = s.hands[pid];
    if (a.type === 'draw') {
      if (s.drew) throw new Error('Already drew'); const c = draw(s);
      if (!c) { s.log.push(`${pid} cannot draw`); adv(s); return s; }
      h.push(c); sortHand(h); s.log.push(`${pid} draws a card`); if (!h.some(x => ok(s, x))) adv(s); else s.drew = true; return s;
    }
    if (a.type === 'pass') { if (!s.drew) throw new Error('Draw first'); adv(s); return s; }
    if (a.type === 'play') {
      const c = h[a.i]; if (!c || !ok(s, c)) throw new Error("That card can't be played");
      if (c.r === '8' && !SUITS.includes(a.suit)) throw new Error('Choose a suit');
      h.splice(a.i, 1); s.discard.push(c); s.suit = c.r === '8' ? a.suit : c.s;
      s.log.push(`${pid} plays ${c.r}${SYM[c.s]}${c.r === '8' ? ` and picks ${SYM[a.suit]}` : ''}`);
      if (!h.length) { s.winner = pid; s.log.push(`${pid} is out of cards!`); return s; }
      const nxt = s.ids[(s.turn + 1) % s.ids.length];
      if (c.r === '2') { for (let k = 0; k < 2; k++) { const d = draw(s); if (d) s.hands[nxt].push(d); } sortHand(s.hands[nxt]); s.log.push(`${nxt} draws 2 and loses a turn`); adv(s, 2); }
      else if (c.r === 'J') { s.log.push(`${nxt} is skipped`); adv(s, 2); } else adv(s);
      return s;
    }
    throw new Error('Unknown action');
  },
  isGameOver: s => !!s.winner,
  getResults: s => ({ winner: s.winner }),
};
