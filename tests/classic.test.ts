import { describe, it, expect } from 'vitest';
import { ttt, c4, dab, nim, rps } from '../server/games/abstract';
import { sl, ludo, bs, wg } from '../server/games/party';
const ids = ['a', 'b'];
describe('abstract games', () => {
  it('ttt win + invalid', () => {
    let s = ttt.initialize(ids, {}); for (const [p, i] of [['a', 0], ['b', 3], ['a', 1], ['b', 4], ['a', 2]] as any) s = ttt.handleAction(s, p, { i });
    expect(s.winner).toBe('a'); expect(() => ttt.handleAction(s, 'b', { i: 8 })).toThrow();
    const t = ttt.initialize(ids, {}); expect(() => ttt.handleAction(t, 'b', { i: 0 })).toThrow('turn');
  });
  it('c4 vertical win and full column', () => {
    let s = c4.initialize(ids, {}); for (let k = 0; k < 3; k++) { s = c4.handleAction(s, 'a', { col: 0 }); s = c4.handleAction(s, 'b', { col: 1 }); }
    s = c4.handleAction(s, 'a', { col: 0 }); expect(s.winner).toBe('a');
    let f = c4.initialize(ids, {}); for (let k = 0; k < 6; k++) f = c4.handleAction(f, k % 2 ? 'b' : 'a', { col: 2 }); expect(() => c4.handleAction(f, 'a', { col: 2 })).toThrow('full');
  });
  it('dab box gives extra turn', () => {
    const s = dab.initialize(ids, { size: 2 }); s.h[0][0] = 0; s.h[1][0] = 0; s.v[0][0] = 0;
    const t = dab.handleAction(s, 'a', { k: 'v', r: 0, c: 1 }); expect(t.score[0]).toBe(1); expect(t.turn).toBe(0);
    expect(dab.handleAction(t, 'a', { k: 'h', r: 0, c: 1 }).turn).toBe(1);
  });
  it('nim misere + max take', () => {
    const s = nim.initialize(ids, { misere: true, maxTake: 2 }); s.piles = [1];
    expect(nim.handleAction(s, 'a', { pile: 0, n: 1 }).winner).toBe('b'); s.piles = [5]; expect(() => nim.handleAction(s, 'a', { pile: 0, n: 3 })).toThrow();
  });
  it('rps hides picks until both chosen', () => {
    let s = rps.initialize(ids, { bestOf: 3 }); s = rps.handleAction(s, 'a', { pick: 'rock' });
    expect(JSON.stringify(rps.getPlayerView(s, 'b'))).not.toContain('rock'); expect(() => rps.handleAction(s, 'a', { pick: 'paper' })).toThrow();
    s = rps.handleAction(s, 'b', { pick: 'scissors' }); expect(s.wins.a).toBe(1); s = rps.handleAction(s, 'a', { pick: 'rock' }); s = rps.handleAction(s, 'b', { pick: 'scissors' }); expect(s.winner).toBe('a');
  });
});
describe('party games', () => {
  it('snakes and ladders exact finish', () => {
    let s = sl.initialize(ids, { exact: true }); s.pos.a = 99; for (let k = 0; k < 30 && !s.winner; k++) { s = sl.handleAction(s, s.ids[s.turn], { type: 'roll' }); }
    expect(s.pos.a === 99 || s.pos.a === 100).toBe(true); if (s.winner) expect(s.pos[s.winner]).toBe(100);
  });
  it('ludo entry and capture', () => {
    let s = ludo.initialize(ids, {}); s.phase = 'move'; s.dice = 6; s.legal = [0]; s = ludo.handleAction(s, 'a', { type: 'move', t: 0 }); expect(s.tok.a[0]).toBe(0);
    s.turn = 0; s.phase = 'move'; s.dice = 1; s.legal = [0]; s.tok.a[0] = 4; s.tok.b[0] = 44 - 0; // b seat 2: abs (26+44)%52 = 18? place explicitly
    s.tok.b[0] = (5 - 26 + 52) % 52; s = ludo.handleAction(s, 'a', { type: 'move', t: 0 }); expect(s.tok.a[0]).toBe(5); expect(s.tok.b[0]).toBe(-1);
  });
  it('battleship privacy and win', () => {
    let s = bs.initialize(ids, {}); s = bs.handleAction(s, 'a', { type: 'place', random: true }); s = bs.handleAction(s, 'b', { type: 'place', random: true });
    const v: any = bs.getPlayerView(s, 'a'); expect(v.ships).toBeUndefined(); expect(v.enemySunk).toEqual([]); expect(s.phase).toBe('battle');
    const all = s.ships.b.flatMap((h: any) => Array.from({ length: h.len }, (_: any, k: number) => h.dir === 'h' ? h.r * 10 + h.c + k : (h.r + k) * 10 + h.c));
    for (const c of all) { s.turn = 0; s = bs.handleAction(s, 'a', { type: 'fire', i: c }); } expect(s.winner).toBe('a');
    expect(() => bs.initialize(ids, {}) && bs.handleAction(bs.initialize(ids, {}), 'a', { type: 'place', ships: [] })).toThrow();
  });
  it('word guessing', () => {
    let s = wg.initialize(ids, {}); s.word = 'dog'; s.turn = 0;
    s = wg.handleAction(s, 'a', { type: 'letter', ch: 'd' }); expect(s.turn).toBe(0); s = wg.handleAction(s, 'a', { type: 'letter', ch: 'z' }); expect(s.turn).toBe(1); expect(s.lives.a).toBeLessThan(8 > 0 ? 99 : 0);
    const v: any = wg.getPlayerView(s, 'b'); expect(v.mask).toEqual(['d', null, null]); expect(JSON.stringify(v)).not.toContain('dog');
    s = wg.handleAction(s, 'b', { type: 'word', word: 'dog' }); expect(s.winnerSide).toBe('b'); expect(s.over).toBe(true);
  });
});
