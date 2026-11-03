import { describe, it, expect } from 'vitest';
import { inbetween } from '../server/games/inbetween';
import { flip7 } from '../server/games/flip7';
import { leastcount } from '../server/games/leastcount';
import { elimination } from '../server/games/elimination';
import { engines } from '../server/games';
const c = (r: any) => ({ r, s: 'S' } as any);
describe('all engines', () => {
  it('registry has all games', () => expect(Object.keys(engines).length).toBe(17));
  it('inbetween scoring, post penalty, privacy', () => {
    let s = inbetween.initialize(['a', 'b'], { rounds: 3 }); const me = s.ids[s.turn], other = s.ids.find(i => i !== me)!;
    s.pair = [c('3'), c('9')]; s.deck = [...s.deck, c('5')];
    expect(inbetween.getPlayerView(s, other).pair).toBeNull();
    expect(() => inbetween.handleAction(s, other, { type: 'in' })).toThrow();
    expect(inbetween.handleAction(s, me, { type: 'in' }).scores[me]).toBe(1);
    s.deck = [...s.deck, c('9')]; expect(inbetween.handleAction(s, me, { type: 'in' }).scores[me]).toBe(-2);
  });
  it('flip7 bust and shield', () => {
    const s = flip7.initialize(['a', 'b'], {}); s.players[0].nums = [5]; s.deck.push({ k: 'n', v: 5 });
    expect(flip7.handleAction(s, 'a', { type: 'draw' }).players[0].status).toBe('bust');
    s.players[0].shield = true; const t = flip7.handleAction(s, 'a', { type: 'draw' }); expect(t.players[0].status).toBe('active'); expect(t.players[0].shield).toBe(false);
  });
  it('leastcount show scoring and hand privacy', () => {
    const s = leastcount.initialize(['a', 'b', 'c'], {}); const me = s.ids[s.turn];
    s.hands = { a: [c('A'), c('2')], b: [c('K'), c('K')], c: [c('Q'), c('5')] }; s.turn = 0;
    expect(leastcount.getPlayerView(s, 'b').hand).toEqual(s.hands.b); expect(JSON.stringify(leastcount.getPlayerView(s, 'b'))).not.toContain('"r":"2"');
    const t = leastcount.handleAction(s, 'a', { type: 'show' }); expect(t.scores).toEqual({ a: 0, b: 20, c: 15 });
    s.hands.b = [c('A')]; expect(leastcount.handleAction(s, 'a', { type: 'show' }).scores.a).toBe(40);
  });
  it('elimination: bomb kills without defuse, last player wins', () => {
    const s = elimination.initialize(['a', 'b'], {}); s.hands.a = []; s.deck.push('bomb');
    const t = elimination.handleAction(s, 'a', { type: 'draw' }); expect(t.alive).toEqual(['b']); expect(elimination.isGameOver(t)).toBe(true);
    expect(elimination.getResults(t).ranking[0].id).toBe('b');
    const v: any = elimination.getPlayerView(s, 'b'); expect(v.hand).toEqual(s.hands.b); expect(v.hands).toBeUndefined(); expect(v.deck).toBeUndefined();
  });
});
