import { GameEngine, shuffle } from '../engine';
export type C = { k: 'n'; v: number } | { k: 'shield' } | { k: 'x2' } | { k: 'p5' };
interface P { id: string; nums: number[]; shield: boolean; x2: boolean; p5: number; status: 'active' | 'stopped' | 'bust'; total: number }
export interface F7 { deck: C[]; players: P[]; turn: number; round: number; rounds: number; target: number; phase: 'play' | 'roundOver' | 'over'; log: string[] }
// Original "Lucky Seven" deck: number n appears n times (1-9); Shield saves from one duplicate, Double x2 numbers, Plus5 adds 5.
const mk = (): C[] => { const d: C[] = []; for (let n = 1; n <= 9; n++) for (let i = 0; i < n; i++) d.push({ k: 'n', v: n }); for (let i = 0; i < 4; i++) d.push({ k: 'shield' }); for (let i = 0; i < 3; i++) { d.push({ k: 'x2' }); d.push({ k: 'p5' }); } return shuffle(d); };
export const roundScore = (p: P) => p.status === 'bust' ? 0 : p.nums.reduce((a, b) => a + b, 0) * (p.x2 ? 2 : 1) + p.p5 * 5 + (p.nums.length >= 7 ? 15 : 0);
function start(s: F7) { s.deck = mk(); s.turn = 0; s.phase = 'play'; for (const p of s.players) Object.assign(p, { nums: [], shield: false, x2: false, p5: 0, status: 'active' }); s.log = [`Round ${s.round} begins`]; }
function finish(s: F7) {
  for (const p of s.players) { const r = roundScore(p); p.total += r; s.log.push(`${p.id}: ${p.status} +${r}`); }
  s.phase = Math.max(...s.players.map(p => p.total)) >= s.target || s.round >= s.rounds ? 'over' : 'roundOver';
}
export function advance(s: F7) {
  for (let i = 1; i <= s.players.length; i++) { const k = (s.turn + i) % s.players.length; if (s.players[k].status === 'active') { s.turn = k; return; } }
  finish(s);
}
export const flip7: GameEngine<F7, { type: 'draw' | 'stop' | 'next' }, any, any> = {
  id: 'flip7', minPlayers: 2, maxPlayers: 8,
  initialize(ids, st) {
    const s: F7 = { deck: [], turn: 0, round: 1, rounds: Math.min(30, Math.max(1, Number(st.rounds) || 10)), target: Math.max(20, Number(st.target) || 100), phase: 'play', log: [],
      players: ids.map(id => ({ id, nums: [], shield: false, x2: false, p5: 0, status: 'active', total: 0 })) };
    start(s); return s;
  },
  getPlayerView(s, me) { return { game: 'flip7', you: me, phase: s.phase, round: s.round, rounds: s.rounds, target: s.target, turn: s.phase === 'play' ? s.players[s.turn].id : null, deckCount: s.deck.length,
    players: s.players.map(p => ({ ...p, roundScore: roundScore(p) })), log: s.log }; },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (a.type === 'next') { if (s.phase !== 'roundOver') throw new Error('Round not finished'); s.round++; start(s); return s; }
    if (s.phase !== 'play') throw new Error('No round in progress');
    const p = s.players[s.turn];
    if (p.id !== pid || p.status !== 'active') throw new Error('Not your turn');
    if (a.type === 'stop') { p.status = 'stopped'; s.log.push(`${pid} stops`); advance(s); return s; }
    if (a.type !== 'draw') throw new Error('Unknown action');
    if (!s.deck.length) s.deck = mk();
    const c = s.deck.pop()!;
    if (c.k === 'shield') p.shield = true; else if (c.k === 'x2') p.x2 = true; else if (c.k === 'p5') p.p5++;
    else if (p.nums.includes(c.v)) {
      if (p.shield) { p.shield = false; s.log.push(`${pid} drew duplicate ${c.v}, Shield absorbed it`); }
      else { p.status = 'bust'; s.log.push(`${pid} busts on ${c.v}`); advance(s); }
    } else { p.nums.push(c.v); if (p.nums.length >= 7) { s.log.push(`${pid} flips 7!`); for (const q of s.players) if (q.status === 'active') q.status = 'stopped'; finish(s); } }
    return s;
  },
  isGameOver: s => s.phase === 'over',
  getResults: s => ({ ranking: s.players.map(p => ({ id: p.id, score: p.total })).sort((a, b) => b.score - a.score) }),
};
