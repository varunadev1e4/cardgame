import { describe, it, expect } from 'vitest';
import { blackjack, value } from '../server/games/blackjack';
import { shuffle, newDeck } from '../server/engine';
const c = (r: any) => ({ r, s: 'S' } as const);
describe('blackjack', () => {
  it('values aces', () => { expect(value([c('A'), c('A'), c('9')]).total).toBe(21); expect(value([c('A'), c('K')]).total).toBe(21); });
  it('deck has 52 unique cards', () => { expect(new Set(newDeck().map(x => x.r + x.s)).size).toBe(52); expect(shuffle([1,2,3]).length).toBe(3); });
  it('hides hole card and rejects out-of-turn', () => {
    let s = blackjack.initialize(['a', 'b'], { rounds: 1 });
    s.players.forEach(p => { p.hand = [c('5'), c('6')]; p.status = 'playing'; }); s.turn = 0;
    expect(blackjack.getPlayerView(s, 'b').dealer[1]).toBeNull();
    expect(() => blackjack.handleAction(s, 'b', { type: 'stand' })).toThrow();
    s = blackjack.handleAction(s, 'a', { type: 'stand' }); expect(s.turn).toBe(1);
  });
  it('finishes after all stand', () => {
    let s = blackjack.initialize(['a'], { rounds: 1 }); s.players[0].status = 'playing'; s.players[0].hand = [c('10'), c('9')]; s.dealer = [c('10'), c('7')]; s.turn = 0;
    s = blackjack.handleAction(s, 'a', { type: 'stand' }); expect(blackjack.isGameOver(s)).toBe(true); expect(s.players[0].score).toBe(1);
  });
});
