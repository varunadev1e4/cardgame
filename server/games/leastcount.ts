import { GameEngine, newDeck, shuffle } from '../engine';
export type LC = { r: string; s: string };
export const cv = (c: LC) => c.r === 'JK' ? 0 : c.r === 'A' ? 1 : ['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r;
export const total = (h: LC[]) => h.reduce((a, c) => a + cv(c), 0);
export interface L { deck: LC[]; discard: LC[]; hands: Record<string, LC[]>; ids: string[]; scores: Record<string, number>; turn: number; tp: 'start' | 'discard'; round: number;
  dealt: number; declareMax: number; penalty: number; target: number; jokers: boolean; phase: 'play' | 'roundOver' | 'over'; revealed?: Record<string, LC[]>; summary?: string }
function deal(s: L) {
  s.deck = shuffle([...newDeck() as LC[], ...(s.jokers ? [{ r: 'JK', s: '*' }, { r: 'JK', s: '*' }] : [])]);
  s.hands = Object.fromEntries(s.ids.map(i => [i, [] as LC[]]));
  for (let k = 0; k < s.dealt; k++) for (const i of s.ids) s.hands[i].push(s.deck.pop()!);
  s.discard = [s.deck.pop()!]; s.turn = (s.round - 1) % s.ids.length; s.tp = 'start'; s.phase = 'play'; s.revealed = undefined; s.summary = undefined;
}
export const leastcount: GameEngine<L, any, any, any> = {
  id: 'leastcount', minPlayers: 2, maxPlayers: 6,
  initialize(ids, st) {
    const s = { ids, scores: Object.fromEntries(ids.map(i => [i, 0])), round: 1, dealt: Math.min(10, Math.max(3, Number(st.dealt) || 7)), declareMax: Number(st.declareMax) || 10,
      penalty: Number(st.penalty) || 40, target: Math.max(20, Number(st.target) || 100), jokers: st.jokers !== false } as L;
    deal(s); return s;
  },
  getPlayerView(s, me) {
    const ended = s.phase !== 'play';
    return { game: 'leastcount', you: me, phase: s.phase, round: s.round, turn: ended ? null : s.ids[s.turn], turnPhase: s.tp, hand: s.hands[me], counts: Object.fromEntries(s.ids.map(i => [i, s.hands[i].length])),
      discardTop: s.discard[s.discard.length - 1], stock: s.deck.length, scores: s.scores, revealed: s.revealed, summary: s.summary,
      rules: `Deal ${s.dealt}. Show when hand ≤ ${s.declareMax}; if anyone has equal or lower you take +${s.penalty}. Ace 1, J/Q/K 10, Joker ${s.jokers ? 0 : 'off'}. Out at ${s.target}.` };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (a.type === 'next') { if (s.phase !== 'roundOver') throw new Error('Round not finished'); s.round++; deal(s); return s; }
    if (s.phase !== 'play') throw new Error('No round in progress');
    if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    const hand = s.hands[pid];
    if (a.type === 'draw') {
      if (s.tp !== 'start') throw new Error('Already drew');
      if (a.from === 'discard') { if (s.discard.length < 1) throw new Error('Empty'); hand.push(s.discard.pop()!); }
      else { if (!s.deck.length) { const top = s.discard.pop()!; s.deck = shuffle(s.discard); s.discard = [top]; } if (!s.deck.length) throw new Error('No cards'); hand.push(s.deck.pop()!); }
      s.tp = 'discard';
    } else if (a.type === 'discard') {
      if (s.tp !== 'discard') throw new Error('Draw first');
      const idx: number[] = [...new Set<number>(a.cards)];
      if (!idx.length || idx.some(i => !Number.isInteger(i) || i < 0 || i >= hand.length)) throw new Error('Bad cards');
      if (new Set(idx.map(i => hand[i].r)).size !== 1) throw new Error('Discard must share a rank');
      s.discard.push(...idx.map(i => hand[i])); s.hands[pid] = hand.filter((_, i) => !idx.includes(i));
      s.turn = (s.turn + 1) % s.ids.length; s.tp = 'start';
    } else if (a.type === 'show') {
      if (s.tp !== 'start') throw new Error('Show before drawing');
      const mine = total(hand); if (mine > s.declareMax) throw new Error(`Hand must be ≤ ${s.declareMax}`);
      const t = Object.fromEntries(s.ids.map(i => [i, total(s.hands[i])])), min = Math.min(...s.ids.map(i => t[i]));
      const won = mine <= Math.min(...s.ids.filter(i => i !== pid).map(i => t[i])) && mine < Math.min(...s.ids.filter(i => i !== pid).map(i => t[i]));
      for (const i of s.ids) s.scores[i] += i === pid ? (won ? 0 : s.penalty) : (!won && t[i] === min ? 0 : t[i]);
      s.revealed = structuredClone(s.hands); s.summary = `${pid} showed ${mine}: ${won ? 'valid' : 'penalty'}`;
      s.phase = Math.max(...Object.values(s.scores)) >= s.target ? 'over' : 'roundOver';
    } else throw new Error('Unknown action');
    return s;
  },
  isGameOver: s => s.phase === 'over',
  getResults: s => ({ ranking: s.ids.map(id => ({ id, score: s.scores[id] })).sort((a, b) => a.score - b.score) }),
};
