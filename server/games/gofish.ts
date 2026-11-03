import { GameEngine, Card, newDeck, sortHand, RANKS } from '../engine';
export interface GF { deck: Card[]; hands: Record<string, Card[]>; books: Record<string, string[]>; ids: string[]; turn: number; log: string[]; phase: 'play' | 'over' }
function bookUp(s: GF, id: string) {
  for (const r of RANKS) if (s.hands[id].filter(c => c.r === r).length === 4) { s.hands[id] = s.hands[id].filter(c => c.r !== r); s.books[id].push(r); s.log.push(`${id} completes a book of ${r}s`); }
}
function settle(s: GF) {
  for (let k = 0; k <= s.ids.length; k++) {
    if (s.ids.reduce((a, i) => a + s.books[i].length, 0) >= 13) { s.phase = 'over'; return; }
    const id = s.ids[s.turn];
    if (!s.hands[id].length) for (let n = 0; n < 5 && s.deck.length; n++) s.hands[id].push(s.deck.pop()!);
    sortHand(s.hands[id]); bookUp(s, id);
    if (s.hands[id].length) return;
    s.turn = (s.turn + 1) % s.ids.length;
  }
  s.phase = 'over';
}
export const gofish: GameEngine<GF, any, any, any> = {
  id: 'gofish', minPlayers: 2, maxPlayers: 6,
  initialize(ids) {
    const deck = newDeck(), n = ids.length > 3 ? 5 : 7, hands: Record<string, Card[]> = Object.fromEntries(ids.map(i => [i, [] as Card[]]));
    for (let k = 0; k < n; k++) for (const i of ids) hands[i].push(deck.pop()!);
    const s: GF = { deck, hands, books: Object.fromEntries(ids.map(i => [i, [] as string[]])), ids, turn: 0, log: ['Game started'], phase: 'play' };
    ids.forEach(i => { sortHand(s.hands[i]); bookUp(s, i); }); settle(s); return s;
  },
  getPlayerView(s, me) {
    return { game: 'gofish', you: me, phase: s.phase, turn: s.phase === 'play' ? s.ids[s.turn] : null, hand: s.hands[me], counts: Object.fromEntries(s.ids.map(i => [i, s.hands[i].length])), books: s.books, deckCount: s.deck.length, log: s.log.slice(-6) };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.phase !== 'play') throw new Error('Game over');
    if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    if (a.type !== 'ask') throw new Error('Unknown action');
    const h = s.hands[pid], t = s.hands[a.target];
    if (!s.ids.includes(a.target) || a.target === pid || !t?.length) throw new Error('Pick another player who has cards');
    if (!h.some(c => c.r === a.rank)) throw new Error('You must hold a card of that rank');
    const got = t.filter(c => c.r === a.rank);
    if (got.length) { s.hands[a.target] = t.filter(c => c.r !== a.rank); h.push(...got); s.log.push(`${pid} takes ${got.length} ${a.rank}${got.length > 1 ? 's' : ''} from ${a.target}`); }
    else {
      s.log.push(`${a.target} says Go Fish to ${pid}`); const c = s.deck.pop();
      if (c) { h.push(c); if (c.r === a.rank) s.log.push(`${pid} fishes the ${a.rank} they wanted and goes again`); else s.turn = (s.turn + 1) % s.ids.length; } else s.turn = (s.turn + 1) % s.ids.length;
    }
    sortHand(h); bookUp(s, pid); settle(s); return s;
  },
  isGameOver: s => s.phase === 'over',
  getResults: s => ({ books: s.books }),
};
