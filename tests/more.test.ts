import { describe, it, expect } from 'vitest';
import { crazy8 } from '../server/games/crazy8';
import { bluff } from '../server/games/bluff';
import { gofish } from '../server/games/gofish';
const c = (r: any, s: any = 'S') => ({ r, s } as any);
describe('crazy8', () => {
  it('rules', () => {
    const s = crazy8.initialize(['a', 'b'], {}); s.discard = [c('7', 'H')]; s.suit = 'H'; s.hands.a = [c('K', 'S'), c('8', 'C'), c('2', 'H')]; s.hands.b = [c('3', 'D')]; s.turn = 0;
    expect(() => crazy8.handleAction(s, 'a', { type: 'play', i: 0 })).toThrow(); expect(() => crazy8.handleAction(s, 'a', { type: 'play', i: 1 })).toThrow('suit');
    expect(crazy8.handleAction(s, 'a', { type: 'play', i: 1, suit: 'D' }).suit).toBe('D');
    const t = crazy8.handleAction(s, 'a', { type: 'play', i: 2 }); expect(t.hands.b.length).toBe(3); expect(t.turn).toBe(0);
    expect(JSON.stringify(crazy8.getPlayerView(s, 'b'))).not.toContain('"K"');
  });
});
describe('bluff', () => {
  it('bluff caught / honest', () => {
    const s = bluff.initialize(['a', 'b'], {}); s.hands.a = [c('A'), c('5'), c('9')]; s.hands.b = [c('K')];
    let t = bluff.handleAction(s, 'a', { type: 'play', cards: [0, 1] }); expect(t.pile.length).toBe(2);
    expect(() => bluff.handleAction(t, 'a', { type: 'call' })).toThrow();
    const u = bluff.handleAction(t, 'b', { type: 'call' }); expect(u.hands.a.length).toBe(3); expect(u.reveal.honest).toBe(false);
    const h = bluff.handleAction(s, 'a', { type: 'play', cards: [0] }); const v = bluff.handleAction(h, 'b', { type: 'call' }); expect(v.hands.b.length).toBe(2);
    expect(JSON.stringify(bluff.getPlayerView(t, 'b'))).not.toContain('"5"');
  });
  it('win needs to survive the call', () => {
    const s = bluff.initialize(['a', 'b'], {}); s.hands.a = [c('A')]; const t = bluff.handleAction(s, 'a', { type: 'play', cards: [0] });
    expect(bluff.handleAction(t, 'b', { type: 'accept' }).winner).toBe('a');
  });
});
describe('gofish', () => {
  it('ask, go fish, books', () => {
    const s = gofish.initialize(['a', 'b'], {}); s.hands.a = [c('5'), c('5', 'H'), c('5', 'D'), c('9')]; s.hands.b = [c('5', 'C'), c('2')]; s.deck = [c('K')]; s.turn = 0; s.books = { a: [], b: [] };
    const t = gofish.handleAction(s, 'a', { type: 'ask', target: 'b', rank: '5' }); expect(t.books.a).toEqual(['5']); expect(t.turn).toBe(0);
    expect(() => gofish.handleAction(s, 'a', { type: 'ask', target: 'b', rank: '2' })).toThrow();
    const u = gofish.handleAction(t, 'a', { type: 'ask', target: 'b', rank: '9' }); expect(u.turn).toBe(1);
  });
});
