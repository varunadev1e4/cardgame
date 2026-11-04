import { describe, it, expect } from 'vitest';
import { kittens } from '../server/games/kittens';
import { crazy8 } from '../server/games/crazy8';
import { Room } from '../server/room';
const ids = ['a', 'b', 'c'];
const mk = () => { const s = kittens.initialize(ids, { fast: false }); s.hands.a = ['attack', 'skip', 'nope', 'tabby', 'tabby', 'tabby', 'defuse']; s.hands.b = ['nope', 'defuse', 'favor']; s.hands.c = ['skip', 'defuse']; s.deck = ['x', 'y', 'z']; s.turn = 0; return s; };
describe('kittens', () => {
  it('setup: bombs, defuses, hands', () => {
    const s = kittens.initialize(['a', 'b', 'c', 'd', 'e'], {}); expect(s.deck.filter(c => c === 'boom').length).toBe(4); expect(s.hands.a.length).toBe(8); expect(s.hands.a.filter(c => c === 'defuse').length).toBe(1);
    expect(s.deck.filter(c => c === 'defuse').length).toBe(1); 
    const f = kittens.initialize(['a', 'b'], {}); expect(f.deck.filter(c => c === 'boom').length).toBe(1);
  });
  it('attack stacking and nope cancel', () => {
    let s = mk(); s = kittens.handleAction(s, 'a', { type: 'play', card: 'attack' }); expect(s.phase).toBe('pending');
    s = kittens.handleAction(s, 'b', { type: 'nope' }); s.pending.deadline = 0; s = kittens.handleAction(s, 'c', { type: 'resolve' }); expect(s.turn).toBe(0); expect(s.phase).toBe('turn');
    s.hands.a.push('attack'); s = kittens.handleAction(s, 'a', { type: 'play', card: 'attack' }); s.pending.deadline = 0; s = kittens.handleAction(s, 'a', { type: 'resolve' }); expect(s.ids[s.turn]).toBe('b'); expect(s.owed).toBe(2);
    s.hands.b.push('attack'); s = kittens.handleAction(s, 'b', { type: 'play', card: 'attack' }); s.pending.deadline = 0; s = kittens.handleAction(s, 'b', { type: 'resolve' }); expect(s.ids[s.turn]).toBe('c'); expect(s.owed).toBe(4);
  });
  it('the player who acted cannot Nope their own action, but can Nope a Nope', () => {
    let s = mk(); s = kittens.handleAction(s, 'a', { type: 'play', card: 'attack' });
    expect(() => kittens.handleAction(s, 'a', { type: 'nope' })).toThrow('own action');
    expect((kittens.getPlayerView(s, 'a') as any).pending.canNope).toBe(false); expect((kittens.getPlayerView(s, 'b') as any).pending.canNope).toBe(true);
    s = kittens.handleAction(s, 'b', { type: 'nope' }); expect(() => kittens.handleAction(s, 'b', { type: 'nope' })).toThrow();
    s = kittens.handleAction(s, 'a', { type: 'nope' }); expect(s.pending.nopes).toBe(2);
  });
  it('bomb, defuse reinsert, explode', () => {
    let s = mk(); s.deck = ['x', 'boom']; s = kittens.handleAction(s, 'a', { type: 'draw' }); expect(s.phase).toBe('reinsert');
    s = kittens.handleAction(s, 'a', { type: 'reinsert', pos: 0 }); expect(s.deck[s.deck.length - 1]).toBe('boom'); expect(s.ids[s.turn]).toBe('b');
    s.hands.b = []; s = kittens.handleAction(s, 'b', { type: 'draw' }); expect(s.alive).toEqual(['a', 'c']); expect(s.ids[s.turn]).toBe('c');
  });
  it('favor and three of a kind, privacy', () => {
    let s = mk(); s.hands.a.push('favor'); s = kittens.handleAction(s, 'a', { type: 'play', card: 'favor', target: 'b' }); s.pending.deadline = 0; s = kittens.handleAction(s, 'c', { type: 'resolve' });
    expect(s.phase).toBe('favor'); s = kittens.handleAction(s, 'b', { type: 'give', card: 'nope' }); expect(s.phase).toBe('turn');
    s.hands.c.push('tabby'); s = kittens.handleAction(s, 'a', { type: 'combo', card: 'tabby', count: 3, target: 'c', name: 'tabby' }); s.pending.deadline = 0; s = kittens.handleAction(s, 'b', { type: 'resolve' });
    expect(s.hands.c.includes('tabby')).toBe(false); const v: any = kittens.getPlayerView(s, 'b'); expect(v.hands).toBeUndefined(); expect(v.deck).toBeUndefined();
  });
});
describe('leaving mid-game', () => {
  it('multi-player engines drop the player; two-player game is abandoned', async () => {
    const ctx: any = { blockConcurrencyWhile: (f: any) => f(), storage: { get: async () => undefined, put: async () => {}, deleteAll: async () => {}, setAlarm: async () => {} } };
    const r = new Room(ctx, { GUEST_TOKEN_SECRET: 'x' }); r.members = ['a', 'b', 'c'].map(id => ({ id, nickname: id, hash: id, connected: true })); r.hostId = 'a'; r.game = 'crazy8'; r.status = 'active'; r.state = crazy8.initialize(['a', 'b', 'c'], {});
    expect(r.dropMembers(['a'])).toEqual(['a']); expect(r.hostId).toBe('b'); expect(r.state.ids).toEqual(['b', 'c']); expect(r.status).toBe('active'); expect(r.state.hands.a).toBeUndefined();
    r.dropMembers(['c']); expect(r.status).toBe('completed'); expect(r.abandoned).toBe(true);
  });
});
