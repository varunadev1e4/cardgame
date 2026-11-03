import { GameEngine, shuffle, randInt } from '../engine';
// "Boom Cats": original-name implementation of the exploding-cards genre rules (Nope window, stacking attacks, combos, favor, defuse re-insert).
const CATS = ['tabby', 'calico', 'siamese', 'sphynx', 'bengal'], ALL = [...CATS, 'defuse', 'attack', 'nope', 'shuffle', 'skip', 'favor', 'future'], WIN = 5000;
const rep = (n: string, c: number) => Array<string>(c).fill(n);
export interface K { ids: string[]; alive: string[]; out: string[]; hands: Record<string, string[]>; deck: string[]; discard: string[]; turn: number; owed: number; stack: boolean;
  phase: 'turn' | 'pending' | 'favor' | 'reinsert' | 'over'; pending?: any; favor?: { from: string; to: string }; peeks: Record<string, string[]>; log: string[]; winner?: string }
export function adv(s: K) { do s.turn = (s.turn + 1) % s.ids.length; while (!s.alive.includes(s.ids[s.turn])); s.owed = 1; s.stack = false; s.phase = 'turn'; }
const endDraw = (s: K) => { s.peeks = {}; if (--s.owed <= 0) adv(s); else s.phase = 'turn'; };
function boom(s: K, id: string) {
  s.discard.push(...s.hands[id]); s.hands[id] = []; s.alive = s.alive.filter(x => x !== id); s.out.push(id); s.log.push(`${id} explodes!`);
  if (s.alive.length === 1) { s.winner = s.alive[0]; s.phase = 'over'; } else adv(s);
}
function resolve(s: K) {
  const p = s.pending; s.pending = undefined; s.phase = 'turn'; const by = p.by, c = p.cards[0];
  if (p.nopes % 2) { s.log.push(`${p.cards.join(' + ')} was stopped by a Nope`); return; }
  if (p.kind === 'card') {
    if (c === 'attack') { const t = (s.stack ? s.owed : 0) + 2; adv(s); s.owed = t; s.stack = true; s.log.push(`${by} attacks! The next player must take ${t} turns`); }
    else if (c === 'skip') { s.log.push(`${by} skips their draw`); if (--s.owed <= 0) adv(s); }
    else if (c === 'shuffle') { s.deck = shuffle(s.deck); s.peeks = {}; s.log.push(`${by} shuffles the deck`); }
    else if (c === 'future') { s.peeks[by] = s.deck.slice(-3).reverse(); s.log.push(`${by} peeks at the future`); }
    else if (c === 'favor' && s.hands[p.target].length) { s.phase = 'favor'; s.favor = { from: p.target, to: by }; s.log.push(`${p.target} must give a card to ${by}`); }
  } else {
    const t = s.hands[p.target];
    if (p.cards.length === 2) { if (t.length) { s.hands[by].push(...t.splice(randInt(t.length), 1)); s.log.push(`${by} steals a random card from ${p.target}`); } }
    else { const i = t.indexOf(p.name); if (i >= 0) { s.hands[by].push(...t.splice(i, 1)); s.log.push(`${by} names ${p.name} and takes it from ${p.target}`); } else s.log.push(`${by} names ${p.name}, but ${p.target} has none`); }
  }
}
export const kittens: GameEngine<K, any, any, any> = {
  id: 'kittens', minPlayers: 2, maxPlayers: 5,
  initialize(ids, st) {
    const n = ids.length; let deck = shuffle([...rep('attack', 4), ...rep('nope', 5), ...rep('shuffle', 4), ...rep('skip', 4), ...rep('favor', 4), ...rep('future', 5), ...CATS.flatMap(c => rep(c, 4))]);
    const hands: Record<string, string[]> = Object.fromEntries(ids.map(i => [i, ['defuse']]));
    for (let k = 0; k < 7; k++) for (const i of ids) hands[i].push(deck.pop()!);
    deck.push(...rep('defuse', Math.min(2, 6 - n))); deck = shuffle(deck);
    if (n <= 3 && st.fast !== false) deck = deck.slice(Math.floor(deck.length / 3));
    deck = shuffle([...deck, ...rep('boom', n - 1)]);
    return { ids, alive: [...ids], out: [], hands, deck, discard: [], turn: 0, owed: 1, stack: false, phase: 'turn', peeks: {}, log: ['Game started'] };
  },
  getPlayerView(s, me) {
    const p = s.pending;
    return { game: 'kittens', you: me, ids: s.ids, phase: s.phase, turn: s.phase === 'over' || s.phase === 'pending' ? null : s.phase === 'favor' ? s.favor!.from : s.ids[s.turn], owed: s.owed, hand: s.hands[me] ?? [],
      counts: Object.fromEntries(s.ids.map(i => [i, s.hands[i].length])), deckCount: s.deck.length, discard: s.discard.slice(-1), alive: s.alive, out: s.out, peek: s.peeks[me] ?? null,
      pending: p ? { by: p.by, cards: p.cards, kind: p.kind, target: p.target ?? null, nopes: p.nopes, msLeft: Math.max(0, p.deadline - Date.now()), canAllow: s.alive.includes(me) && me !== p.last && !p.passed.includes(me) } : null,
      favor: s.favor ?? null, log: s.log.slice(-8), winner: s.winner ?? null,
      final: s.winner ? [s.winner, ...[...s.out].reverse()].map((id, i) => ({ id, label: i === 0 ? 'Last cat standing' : 'Exploded' })) : null };
  },
  handleAction(s0, pid, a) {
    if ((a.type === 'resolve' || a.type === 'allow') && s0.phase !== 'pending') return s0;
    const s = structuredClone(s0), now = Date.now();
    if (s.phase === 'over') throw new Error('Game over'); if (!s.alive.includes(pid)) throw new Error('You are out');
    const me = s.hands[pid], take = (name: string) => { const i = me.indexOf(name); if (i < 0) throw new Error(`You don't have ${name}`); me.splice(i, 1); s.discard.push(name); };
    if (s.phase === 'pending') {
      const p = s.pending;
      if (a.type === 'nope') { take('nope'); p.nopes++; p.last = pid; p.passed = []; p.deadline = now + WIN; s.log.push(`${pid} plays NOPE`); }
      else if (a.type === 'allow') { if (pid !== p.last && !p.passed.includes(pid)) p.passed.push(pid); if (s.alive.every(x => x === p.last || p.passed.includes(x))) resolve(s); }
      else if (a.type === 'resolve') { if (now >= p.deadline) resolve(s); } else throw new Error('Wait for the action to resolve');
      return s;
    }
    if (s.phase === 'favor') {
      if (a.type !== 'give' || pid !== s.favor!.from) throw new Error('Waiting for the favor'); const i = me.indexOf(a.card); if (i < 0) throw new Error('Choose a card you hold');
      s.hands[s.favor!.to].push(...me.splice(i, 1)); s.favor = undefined; s.phase = 'turn'; return s;
    }
    if (pid !== s.ids[s.turn]) throw new Error('Not your turn');
    if (s.phase === 'reinsert') {
      if (a.type !== 'reinsert') throw new Error('Put the bomb back first'); const pos = Math.min(s.deck.length, Math.max(0, Number(a.pos) | 0));
      s.deck.splice(s.deck.length - pos, 0, 'boom'); s.log.push(`${pid} hides the bomb in the deck`); endDraw(s); return s;
    }
    if (a.type === 'draw') {
      const c = s.deck.pop()!; s.peeks = {};
      if (c !== 'boom') { me.push(c); endDraw(s); } else if (me.includes('defuse')) { take('defuse'); s.log.push(`${pid} defuses the bomb`); s.phase = 'reinsert'; } else boom(s, pid);
      return s;
    }
    const target = (t: string) => { if (!s.alive.includes(t) || t === pid || !s.hands[t].length) throw new Error('Pick another player who has cards'); return t; };
    const open = (cards: string[], extra: any) => { s.pending = { by: pid, cards, deadline: now + WIN, nopes: 0, passed: [], last: pid, ...extra }; s.phase = 'pending'; s.log.push(`${pid} plays ${cards.join(' + ')}`); };
    if (a.type === 'play') {
      const c = String(a.card); if (!['attack', 'skip', 'shuffle', 'future', 'favor'].includes(c)) throw new Error("That card can't be played alone");
      const t = c === 'favor' ? target(a.target) : undefined; take(c); open([c], { kind: 'card', target: t }); return s;
    }
    if (a.type === 'combo') {
      const c = String(a.card), n = a.count === 3 ? 3 : 2; if (!ALL.includes(c) || me.filter(x => x === c).length < n) throw new Error('You need matching cards');
      const t = target(a.target); if (n === 3 && !ALL.includes(a.name)) throw new Error('Name a card'); for (let k = 0; k < n; k++) take(c); open(Array(n).fill(c), { kind: 'combo', target: t, name: a.name }); return s;
    }
    throw new Error('Unknown action');
  },
  isGameOver: s => s.phase === 'over', getResults: s => ({ winner: s.winner }),
};
