import { GameEngine, Card, newDeck } from '../engine';
export const rv = (c: Card, ah: boolean) => c.r === 'A' ? (ah ? 14 : 1) : c.r === 'J' ? 11 : c.r === 'Q' ? 12 : c.r === 'K' ? 13 : +c.r;
type Last = { pid: string; pair: Card[]; third: Card | null; result: string; delta: number };
export interface IB { deck: Card[]; ids: string[]; scores: Record<string, number>; turn: number; round: number; rounds: number; pair: Card[]; aceHigh: boolean; post: number; phase: 'play' | 'over'; last?: Last }
function deal(s: IB) { if (s.deck.length < 10) s.deck = newDeck(); const a = s.deck.pop()!, b = s.deck.pop()!; s.pair = rv(a, s.aceHigh) <= rv(b, s.aceHigh) ? [a, b] : [b, a]; }
function next(s: IB) { s.turn++; if (s.turn >= s.ids.length) { s.turn = 0; s.round++; } if (s.round > s.rounds) { s.phase = 'over'; return; } deal(s); skipDead(s); }
// Pairs with no card strictly between them (equal or consecutive) cannot be won: auto-pass.
function skipDead(s: IB) { while (s.phase === 'play' && rv(s.pair[1], s.aceHigh) - rv(s.pair[0], s.aceHigh) < 2) { s.last = { pid: s.ids[s.turn], pair: s.pair, third: null, result: 'no gap - auto pass', delta: 0 }; next(s); } }
export const inbetween: GameEngine<IB, { type: 'in' | 'pass' }, any, any> = {
  id: 'inbetween', minPlayers: 2, maxPlayers: 8,
  initialize(ids, st) {
    const s: IB = { deck: newDeck(), ids, scores: Object.fromEntries(ids.map(i => [i, 0])), turn: 0, round: 1, rounds: Math.min(30, Math.max(1, Number(st.rounds) || 5)), pair: [], aceHigh: st.aceHigh !== false, post: Math.max(1, Number(st.postPenalty) || 2), phase: 'play' };
    deal(s); skipDead(s); return s;
  },
  getPlayerView(s, me) {
    const cur = s.phase === 'play' ? s.ids[s.turn] : null;
    return { game: 'inbetween', phase: s.phase, round: s.round, rounds: s.rounds, turn: cur, scores: s.scores, pair: cur === me ? s.pair : null, last: s.last,
      rules: `Ace ${s.aceHigh ? 'high' : 'low'}. Strictly between: +1. Outside: -1. Hitting a post (equal to a card): -${s.post}. Equal/consecutive pairs auto-pass.` };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.phase !== 'play') throw new Error('Game over');
    if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    if (a.type === 'pass') s.last = { pid, pair: s.pair, third: null, result: 'pass', delta: 0 };
    else if (a.type === 'in') {
      const t = s.deck.pop()!, v = rv(t, s.aceHigh), lo = rv(s.pair[0], s.aceHigh), hi = rv(s.pair[1], s.aceHigh);
      const [result, delta] = v > lo && v < hi ? ['in between', 1] : v === lo || v === hi ? ['hit the post', -s.post] : ['outside', -1];
      s.scores[pid] += delta as number; s.last = { pid, pair: s.pair, third: t, result: result as string, delta: delta as number };
    } else throw new Error('Unknown action');
    next(s); return s;
  },
  isGameOver: s => s.phase === 'over',
  getResults: s => ({ ranking: s.ids.map(id => ({ id, score: s.scores[id] })).sort((a, b) => b.score - a.score) }),
};
