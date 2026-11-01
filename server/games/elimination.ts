import { GameEngine, shuffle, randInt } from '../engine';
type K = 'bomb' | 'defuse' | 'skip' | 'peek' | 'shuffle' | 'attack';
export interface E { deck: K[]; hands: Record<string, K[]>; ids: string[]; alive: string[]; out: string[]; turn: number; owed: number; peeks: Record<string, K[]>; log: string[]; phase: 'play' | 'over' }
// "Powder Keg": drawing a bomb eliminates you unless you hold a Defuse. Skip ends your turn undrawn, Attack passes 2 turns to the next player,
// Peek shows the top 3 cards (private), Shuffle reshuffles the deck.
function advance(s: E) { do s.turn = (s.turn + 1) % s.ids.length; while (!s.alive.includes(s.ids[s.turn])); s.owed = 1; }
function endTurn(s: E) { if (--s.owed <= 0) advance(s); }
export const elimination: GameEngine<E, any, any, any> = {
  id: 'elimination', minPlayers: 2, maxPlayers: 6,
  initialize(ids) {
    const tac: K[] = shuffle((['skip', 'peek', 'shuffle', 'attack'] as K[]).flatMap(k => Array(6).fill(k)));
    const hands = Object.fromEntries(ids.map(i => [i, ['defuse', ...tac.splice(0, 3)] as K[]]));
    const deck = shuffle<K>([...tac, ...Array<K>(ids.length - 1).fill('bomb'), 'defuse', 'defuse']);
    return { deck, hands, ids, alive: [...ids], out: [], turn: 0, owed: 1, peeks: {}, log: ['Game started'], phase: 'play' };
  },
  getPlayerView(s, me) {
    return { game: 'elimination', you: me, phase: s.phase, turn: s.phase === 'play' ? s.ids[s.turn] : null, turnsOwed: s.owed, hand: s.hands[me], peek: s.peeks[me] ?? null,
      counts: Object.fromEntries(s.ids.map(i => [i, s.hands[i].length])), deckCount: s.deck.length, alive: s.alive, eliminated: s.out, log: s.log };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.phase !== 'play') throw new Error('Game over');
    if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    const hand = s.hands[pid];
    if (a.type === 'play') {
      const i = hand.indexOf(a.card);
      if (!['skip', 'peek', 'shuffle', 'attack'].includes(a.card) || i < 0) throw new Error('Cannot play that card');
      hand.splice(i, 1); s.log.push(`${pid} plays ${a.card}`);
      if (a.card === 'skip') endTurn(s);
      else if (a.card === 'attack') { advance(s); s.owed = 2; }
      else if (a.card === 'peek') s.peeks[pid] = s.deck.slice(-3).reverse();
      else { s.deck = shuffle(s.deck); s.peeks = {}; }
    } else if (a.type === 'draw') {
      const c = s.deck.pop(); if (!c) throw new Error('Deck empty'); s.peeks = {};
      if (c !== 'bomb') { hand.push(c); endTurn(s); }
      else if (hand.includes('defuse')) { hand.splice(hand.indexOf('defuse'), 1); s.deck.splice(randInt(s.deck.length + 1), 0, 'bomb'); s.log.push(`${pid} defuses a bomb`); endTurn(s); }
      else {
        s.alive = s.alive.filter(x => x !== pid); s.out.push(pid); s.hands[pid] = []; s.log.push(`${pid} is eliminated`);
        if (s.alive.length === 1) s.phase = 'over'; else advance(s);
      }
    } else throw new Error('Unknown action');
    return s;
  },
  isGameOver: s => s.phase === 'over',
  getResults: s => ({ ranking: [...s.alive, ...[...s.out].reverse()].map((id, i) => ({ id, place: i + 1 })) }),
};
