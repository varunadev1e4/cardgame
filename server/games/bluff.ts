import { GameEngine, Card, newDeck, sortHand, RANKS } from '../engine';
export interface BL { ids: string[]; hands: Record<string, Card[]>; pile: Card[]; last?: { by: string; n: number; rank: string; cards: Card[] }; rankIdx: number; turn: number; pendingWin?: string; winner?: string; reveal?: any; log: string[] }
export const bluff: GameEngine<BL, any, any, any> = {
  id: 'bluff', minPlayers: 2, maxPlayers: 6,
  initialize(ids) {
    const deck = newDeck(), hands: Record<string, Card[]> = Object.fromEntries(ids.map(i => [i, [] as Card[]]));
    deck.forEach((c, k) => hands[ids[k % ids.length]].push(c)); ids.forEach(i => sortHand(hands[i]));
    return { ids, hands, pile: [], rankIdx: 0, turn: 0, log: ['Game started'] };
  },
  getPlayerView(s, me) {
    return { game: 'bluff', you: me, turn: s.winner ? null : s.ids[s.turn], hand: s.hands[me], counts: Object.fromEntries(s.ids.map(i => [i, s.hands[i].length])), pile: s.pile.length,
      claim: s.last ? { by: s.last.by, n: s.last.n, rank: s.last.rank } : null, nextRank: RANKS[s.rankIdx], canCall: !!s.last && !s.winner && s.ids[s.turn] === me,
      pendingWin: s.pendingWin ?? null, reveal: s.reveal ?? null, winner: s.winner ?? null, log: s.log.slice(-6) };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.winner) throw new Error('Game over');
    if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    const h = s.hands[pid];
    if (a.type === 'play') {
      if (s.pendingWin) throw new Error('Call bluff or accept first');
      const idx: number[] = [...new Set<number>(a.cards)];
      if (idx.length < 1 || idx.length > 4 || idx.some(i => !Number.isInteger(i) || i < 0 || i >= h.length)) throw new Error('Play 1 to 4 cards');
      const cards = idx.map(i => h[i]); s.hands[pid] = h.filter((_, i) => !idx.includes(i)); s.pile.push(...cards);
      const rank = RANKS[s.rankIdx]; s.last = { by: pid, n: cards.length, rank, cards }; s.rankIdx = (s.rankIdx + 1) % 13; s.reveal = undefined;
      s.log.push(`${pid} plays ${cards.length} card${cards.length > 1 ? 's' : ''} as ${rank}`);
      if (!s.hands[pid].length) s.pendingWin = pid; s.turn = (s.turn + 1) % s.ids.length;
    } else if (a.type === 'call') {
      if (!s.last) throw new Error('Nothing to call');
      const L = s.last, honest = L.cards.every(c => c.r === L.rank), loser = honest ? pid : L.by;
      s.hands[loser].push(...s.pile); sortHand(s.hands[loser]);
      s.reveal = { by: L.by, n: L.n, rank: L.rank, cards: L.cards, honest, loser }; s.log.push(`${pid} calls bluff: ${honest ? 'it was honest' : 'caught bluffing'}, ${loser} takes the pile`);
      s.pile = []; s.last = undefined;
      if (s.pendingWin) { if (honest) s.winner = s.pendingWin; else s.pendingWin = undefined; }
    } else if (a.type === 'accept') {
      if (!s.pendingWin) throw new Error('Nothing to accept'); s.winner = s.pendingWin;
    } else throw new Error('Unknown action');
    return s;
  },
  isGameOver: s => !!s.winner,
  getResults: s => ({ winner: s.winner }),
};
