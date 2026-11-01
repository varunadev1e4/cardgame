import { GameEngine, Card, newDeck } from '../engine';
type Status = 'playing' | 'stand' | 'bust' | 'blackjack';
interface P { id: string; hand: Card[]; status: Status; doubled: boolean; score: number; last?: string }
export interface BJ {
  deck: Card[]; dealer: Card[]; players: P[]; turn: number; round: number; rounds: number;
  phase: 'player' | 'roundOver' | 'over'; hitSoft17: boolean; allowDouble: boolean;
  history: { round: number; outcomes: Record<string, string> }[];
}
export type BJAction = { type: 'hit' | 'stand' | 'double' | 'next' };
export const value = (h: Card[]): { total: number; soft: boolean } => {
  let t = 0, aces = 0;
  for (const c of h) { if (c.r === 'A') { aces++; t += 11; } else t += ['J','Q','K'].includes(c.r) ? 10 : +c.r; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { total: t, soft: aces > 0 };
};
const isBJ = (h: Card[]) => h.length === 2 && value(h).total === 21;
function deal(s: BJ) {
  if (s.deck.length < 20 + s.players.length * 6) s.deck = newDeck();
  s.dealer = [s.deck.pop()!, s.deck.pop()!];
  for (const p of s.players) {
    p.hand = [s.deck.pop()!, s.deck.pop()!]; p.doubled = false; p.last = undefined;
    p.status = isBJ(p.hand) ? 'blackjack' : 'playing';
  }
  s.phase = 'player'; s.turn = -1; advance(s);
}
function advance(s: BJ) {
  s.turn = s.players.findIndex((p, i) => i > s.turn && p.status === 'playing');
  if (s.turn === -1) finish(s);
}
function finish(s: BJ) {
  if (s.players.some(p => p.status !== 'bust')) {
    for (;;) {
      const { total, soft } = value(s.dealer);
      if (total < 17 || (total === 17 && soft && s.hitSoft17)) s.dealer.push(s.deck.pop()!); else break;
    }
  }
  const d = value(s.dealer).total, dBJ = isBJ(s.dealer), out: Record<string, string> = {};
  for (const p of s.players) {
    const t = value(p.hand).total, m = p.doubled ? 2 : 1; let r: string, pts: number;
    if (p.status === 'bust') [r, pts] = ['loss', -m];
    else if (p.status === 'blackjack') [r, pts] = dBJ ? ['push', 0] : ['blackjack', 1.5];
    else if (dBJ) [r, pts] = ['loss', -m];
    else if (d > 21 || t > d) [r, pts] = ['win', m];
    else if (t === d) [r, pts] = ['push', 0];
    else [r, pts] = ['loss', -m];
    p.score += pts; p.last = r; out[p.id] = r;
  }
  s.history.push({ round: s.round, outcomes: out });
  s.phase = s.round >= s.rounds ? 'over' : 'roundOver';
}
export const blackjack: GameEngine<BJ, BJAction, any, any> = {
  id: 'blackjack', minPlayers: 1, maxPlayers: 7,
  initialize(ids, st) {
    const s: BJ = {
      deck: newDeck(), dealer: [], turn: -1, round: 1,
      rounds: Math.min(50, Math.max(1, Number(st.rounds) || 5)),
      hitSoft17: !!st.hitSoft17, allowDouble: st.allowDouble !== false, phase: 'player', history: [],
      players: ids.map(id => ({ id, hand: [], status: 'playing', doubled: false, score: 0 })),
    };
    deal(s); return s;
  },
  getPlayerView(s, me) { // player hands are public in blackjack; hide dealer hole card and the deck
    const hide = s.phase === 'player';
    return {
      game: 'blackjack', phase: s.phase, round: s.round, rounds: s.rounds, you: me,
      turn: s.turn >= 0 ? s.players[s.turn].id : null,
      dealer: hide ? [s.dealer[0], null] : s.dealer, dealerTotal: hide ? null : value(s.dealer).total,
      players: s.players.map(p => ({ id: p.id, hand: p.hand, total: value(p.hand).total, status: p.status, score: p.score, last: p.last })),
      history: s.history,
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (a.type === 'next') {
      if (s.phase !== 'roundOver') throw new Error('Round not finished');
      s.round++; deal(s); return s;
    }
    if (s.phase !== 'player') throw new Error('No round in progress');
    const p = s.players[s.turn];
    if (!p || p.id !== pid) throw new Error('Not your turn');
    if (a.type === 'hit') {
      p.hand.push(s.deck.pop()!);
      const t = value(p.hand).total;
      if (t > 21) { p.status = 'bust'; advance(s); } else if (t === 21) { p.status = 'stand'; advance(s); }
    } else if (a.type === 'stand') { p.status = 'stand'; advance(s); }
    else if (a.type === 'double') {
      if (!s.allowDouble || p.hand.length !== 2) throw new Error('Cannot double');
      p.hand.push(s.deck.pop()!); p.doubled = true;
      p.status = value(p.hand).total > 21 ? 'bust' : 'stand'; advance(s);
    } else throw new Error('Unknown action');
    return s;
  },
  isGameOver: s => s.phase === 'over',
  getResults: s => ({ ranking: [...s.players].sort((x, y) => y.score - x.score).map(p => ({ id: p.id, score: p.score })), history: s.history }),
};
