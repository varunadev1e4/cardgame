import { GameEngine, randInt } from '../engine';
const SN: Record<number, number> = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
const LD: Record<number, number> = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
export const sl: GameEngine<any, any, any, any> = {
  id: 'sl', minPlayers: 2, maxPlayers: 4,
  initialize: (ids, st) => ({ ids, pos: Object.fromEntries(ids.map(i => [i, 0])), turn: 0, last: null, winner: null, exact: st.exact !== false, sixExtra: !!st.sixExtra }),
  getPlayerView: (s, me) => ({ game: 'sl', you: me, ids: s.ids, pos: s.pos, last: s.last, jumps: { ...SN, ...LD }, turn: s.winner ? null : s.ids[s.turn],
    final: s.winner ? s.ids.map((id: string) => ({ id, label: id === s.winner ? 'Reached 100' : `Square ${s.pos[id]}` })).sort((a: any, b: any) => (b.id === s.winner ? 1 : 0) - (a.id === s.winner ? 1 : 0) || parseInt(b.label.replace(/\D/g, '')) - parseInt(a.label.replace(/\D/g, ''))) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.winner) throw new Error('Game over'); if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    if (a.type !== 'roll') throw new Error('Unknown action');
    const roll = randInt(6) + 1, from = s.pos[pid]; let to = from + roll, event = '';
    if (to > 100) { if (s.exact) { to = from; event = 'Needs an exact roll'; } else to = 100; }
    if (to < 100 && SN[to]) { event = `Snake! ${to} → ${SN[to]}`; to = SN[to]; } else if (to < 100 && LD[to]) { event = `Ladder! ${to} → ${LD[to]}`; to = LD[to]; }
    s.pos[pid] = to; s.last = { pid, roll, from, to, event };
    if (to === 100) s.winner = pid; else if (!(roll === 6 && s.sixExtra)) s.turn = (s.turn + 1) % s.ids.length; return s;
  },
  isGameOver: s => !!s.winner, getResults: s => ({ winner: s.winner }),
};
// Ludo: 52-square ring, each seat starts 13 squares apart. Token pos: -1 yard, 0..50 track, 51..55 home column, 56 home.
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const absOf = (s: any, id: string, p: number) => (13 * s.seats[id] + p) % 52;
const lud = (s: any, id: string, roll: number) => s.tok[id].map((p: number, t: number) => (p === -1 ? (roll === 6 || !s.enterOnSix) : p + roll <= 56) ? t : -1).filter((t: number) => t >= 0);
const endTurn = (s: any, extra: boolean) => { s.phase = 'roll'; s.legal = []; if (!extra) s.turn = (s.turn + 1) % s.ids.length; };
export const ludo: GameEngine<any, any, any, any> = {
  id: 'ludo', minPlayers: 2, maxPlayers: 4,
  initialize(ids, st) {
    const seats = ids.length === 2 ? [0, 2] : ids.map((_, i) => i);
    return { ids, seats: Object.fromEntries(ids.map((id, i) => [id, seats[i]])), tok: Object.fromEntries(ids.map(id => [id, [-1, -1, -1, -1]])), turn: 0, phase: 'roll', dice: null, legal: [], winner: null, log: ['Game started'],
      enterOnSix: st.enterOnSix !== false, sixExtra: st.sixExtra !== false, captureExtra: st.captureExtra !== false };
  },
  getPlayerView: (s, me) => ({ game: 'ludo', you: me, ids: s.ids, seats: s.seats, tok: s.tok, turn: s.winner ? null : s.ids[s.turn], phase: s.phase, dice: s.dice, legal: s.ids[s.turn] === me ? s.legal : [], log: s.log.slice(-5),
    final: s.winner ? s.ids.map((id: string) => ({ id, label: id === s.winner ? 'All tokens home' : `${s.tok[id].filter((p: number) => p === 56).length} home` })).sort((a: any, b: any) => (b.id === s.winner ? 1 : 0) - (a.id === s.winner ? 1 : 0)) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.winner) throw new Error('Game over'); if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    if (a.type === 'roll') {
      if (s.phase !== 'roll') throw new Error('Move a token first');
      s.dice = randInt(6) + 1; s.legal = lud(s, pid, s.dice); s.log.push(`${pid} rolls ${s.dice}`);
      if (!s.legal.length) { s.log.push(`${pid} has no move`); endTurn(s, s.dice === 6 && s.sixExtra); } else s.phase = 'move'; return s;
    }
    if (a.type !== 'move' || s.phase !== 'move' || !s.legal.includes(a.t)) throw new Error('Illegal move');
    const old = s.tok[pid][a.t], np = old === -1 ? 0 : old + s.dice; s.tok[pid][a.t] = np; let cap = false;
    if (np <= 50 && !SAFE.has(absOf(s, pid, np))) for (const o of s.ids) if (o !== pid) s.tok[o].forEach((q: number, i: number) => { if (q >= 0 && q <= 50 && absOf(s, o, q) === absOf(s, pid, np)) { s.tok[o][i] = -1; cap = true; s.log.push(`${pid} captures a token of ${o}`); } });
    if (np === 56) s.log.push(`${pid} brings a token home`);
    if (s.tok[pid].every((p: number) => p === 56)) { s.winner = pid; return s; }
    endTurn(s, (s.dice === 6 && s.sixExtra) || (cap && s.captureExtra)); return s;
  },
  isGameOver: s => !!s.winner, getResults: s => ({ winner: s.winner }),
};
const FLEET = [5, 4, 3, 3, 2];
const cells = (h: any) => Array.from({ length: h.len }, (_, k) => h.dir === 'h' ? h.r * 10 + h.c + k : (h.r + k) * 10 + h.c);
function clean(ships: any[]) {
  if (!Array.isArray(ships) || ships.length !== 5) return null;
  const out = ships.map(x => ({ r: x?.r, c: x?.c, len: x?.len, dir: x?.dir })), used = new Set<number>();
  if (out.map(x => x.len).sort().join() !== [...FLEET].sort().join()) return null;
  for (const x of out) { if (!['h', 'v'].includes(x.dir) || !Number.isInteger(x.r) || !Number.isInteger(x.c) || x.r < 0 || x.c < 0 || (x.dir === 'h' ? x.c + x.len > 10 || x.r > 9 : x.r + x.len > 10 || x.c > 9)) return null; for (const c of cells(x)) { if (used.has(c)) return null; used.add(c); } }
  return out;
}
function randomFleet() {
  for (;;) {
    const used = new Set<number>(), out: any[] = []; let ok = true;
    for (const len of FLEET) { let placed = false; for (let k = 0; k < 100 && !placed; k++) { const dir = randInt(2) ? 'h' : 'v', sh = { r: randInt(dir === 'v' ? 11 - len : 10), c: randInt(dir === 'h' ? 11 - len : 10), len, dir }; if (cells(sh).every(x => !used.has(x))) { cells(sh).forEach(x => used.add(x)); out.push(sh); placed = true; } } if (!placed) { ok = false; break; } }
    if (ok) return out;
  }
}
export const bs: GameEngine<any, any, any, any> = {
  id: 'bs', minPlayers: 2, maxPlayers: 2,
  initialize: (ids, st) => ({ ids, ships: {}, ready: { [ids[0]]: false, [ids[1]]: false }, shots: { [ids[0]]: Array(100).fill(0), [ids[1]]: Array(100).fill(0) }, turn: 0, phase: 'place', winner: null, hitAgain: !!st.hitAgain, log: ['Place your fleet'] }),
  getPlayerView(s, me) {
    const opp = s.ids.find((i: string) => i !== me), mine = s.ships[me] || [];
    return { game: 'bs', you: me, ids: s.ids, phase: s.phase, turn: s.phase === 'battle' ? s.ids[s.turn] : null, ready: s.ready, myShips: mine.map((h: any) => ({ cells: cells(h), len: h.len })), shotsAtMe: s.shots[opp], myShots: s.shots[me],
      enemySunk: (s.ships[opp] || []).filter((h: any) => cells(h).every(x => s.shots[me][x] === 2)).map((h: any) => ({ cells: cells(h), len: h.len })), log: s.log.slice(-5),
      final: s.winner ? [{ id: s.winner, label: 'Fleet survives' }, { id: opp === s.winner ? me : opp, label: 'Fleet destroyed' }] : null };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.winner) throw new Error('Game over'); const opp = s.ids.find((i: string) => i !== pid);
    if (s.phase === 'place') {
      if (a.type !== 'place' || s.ready[pid]) throw new Error('Already placed');
      const f = a.random ? randomFleet() : clean(a.ships); if (!f) throw new Error('Invalid ship placement');
      s.ships[pid] = f; s.ready[pid] = true; if (s.ready[opp]) { s.phase = 'battle'; s.log.push('Battle begins!'); } return s;
    }
    if (s.ids[s.turn] !== pid) throw new Error('Not your turn'); const i = a.i;
    if (a.type !== 'fire' || !Number.isInteger(i) || i < 0 || i > 99 || s.shots[pid][i] !== 0) throw new Error('Invalid target');
    const ship = s.ships[opp].find((h: any) => cells(h).includes(i)); s.shots[pid][i] = ship ? 2 : 1;
    s.log.push(`${pid} fires at ${String.fromCharCode(65 + (i % 10))}${Math.floor(i / 10) + 1}: ${ship ? 'HIT' : 'miss'}`);
    if (ship && cells(ship).every(x => s.shots[pid][x] === 2)) s.log.push(`${pid} sinks a ship of length ${ship.len}!`);
    if (s.ships[opp].every((h: any) => cells(h).every(x => s.shots[pid][x] === 2))) { s.winner = pid; return s; }
    if (!(ship && s.hitAgain)) s.turn = 1 - s.turn; return s;
  },
  isGameOver: s => !!s.winner, getResults: s => ({ winner: s.winner }),
};
const WORDS: any = {
  1: ['cat', 'lion', 'tiger', 'zebra', 'panda', 'giraffe', 'elephant', 'kangaroo', 'crocodile', 'dolphin', 'penguin', 'rabbit'],
  2: ['rice', 'pizza', 'burger', 'noodles', 'biryani', 'pancake', 'sandwich', 'chocolate', 'strawberry', 'mushroom', 'pineapple', 'dumpling'],
  3: ['india', 'japan', 'brazil', 'canada', 'germany', 'argentina', 'australia', 'indonesia', 'switzerland', 'madagascar', 'portugal', 'thailand'],
  4: ['code', 'robot', 'laptop', 'server', 'browser', 'database', 'keyboard', 'internet', 'algorithm', 'javascript', 'processor', 'cybersecurity'] };
const CATS = ['', 'Animals', 'Food', 'Countries', 'Tech'];
export const wg: GameEngine<any, any, any, any> = {
  id: 'wg', minPlayers: 2, maxPlayers: 6,
  initialize(ids, st) {
    const cat = Math.min(4, Math.max(1, Number(st.category) || 1)), d = Math.min(3, Math.max(1, Number(st.difficulty) || 2)), team = !!st.team && ids.length >= 2;
    const all: string[] = WORDS[cat], pool = all.filter(w => d === 1 ? w.length <= 5 : d === 2 ? w.length >= 6 && w.length <= 8 : w.length >= 9), list = pool.length ? pool : all;
    const sideOf = (i: number) => team ? (i % 2 ? 'B' : 'A') : ids[i], sides = [...new Set(ids.map((_, i) => sideOf(i)))], lives = [8, 6, 5][d - 1];
    return { ids, team, word: list[randInt(list.length)], cat: CATS[cat], guessed: [], sideOf: Object.fromEntries(ids.map((id, i) => [id, sideOf(i)])), lives: Object.fromEntries(sides.map(x => [x, lives])), turn: 0, winnerSide: null, over: false, log: ['Game started'] };
  },
  getPlayerView: (s, me) => ({ game: 'wg', you: me, ids: s.ids, team: s.team, cat: s.cat, len: s.word.length, mask: [...s.word].map((c: string) => s.guessed.includes(c) || s.over ? c : null), guessed: s.guessed, lives: s.lives, sideOf: s.sideOf, turn: s.over ? null : s.ids[s.turn], log: s.log.slice(-5),
    final: s.over ? s.ids.map((id: string) => ({ id, label: s.winnerSide && s.sideOf[id] === s.winnerSide ? `Solved “${s.word}”` : s.winnerSide ? 'Out' : `Nobody solved “${s.word}”` })).sort((a: any, b: any) => (b.label.startsWith('Solved') ? 1 : 0) - (a.label.startsWith('Solved') ? 1 : 0)) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.over) throw new Error('Game over'); if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    const side = s.sideOf[pid]; let right = false;
    if (a.type === 'letter') {
      const ch = String(a.ch || '').toLowerCase(); if (!/^[a-z]$/.test(ch) || s.guessed.includes(ch)) throw new Error('Pick a new letter');
      s.guessed.push(ch); right = s.word.includes(ch); s.log.push(`${pid} guesses ${ch.toUpperCase()}: ${right ? 'correct' : 'wrong'}`);
      if ([...s.word].every((c: string) => s.guessed.includes(c))) { s.winnerSide = side; s.over = true; return s; }
    } else if (a.type === 'word') {
      const w = String(a.word || '').toLowerCase().trim(); if (!/^[a-z]{1,20}$/.test(w)) throw new Error('Enter a word');
      if (w === s.word) { s.winnerSide = side; s.over = true; s.log.push(`${pid} solves it!`); return s; } s.log.push(`${pid} guesses the word and is wrong`);
    } else throw new Error('Unknown action');
    if (!right) s.lives[side]--;
    if (Object.values(s.lives).every((x: any) => x <= 0)) { s.over = true; return s; }
    if (!right || a.type === 'word') for (let k = 1; k <= s.ids.length; k++) { const j = (s.turn + k) % s.ids.length; if (s.lives[s.sideOf[s.ids[j]]] > 0) { s.turn = j; break; } }
    else if (s.lives[side] <= 0) for (let k = 1; k <= s.ids.length; k++) { const j = (s.turn + k) % s.ids.length; if (s.lives[s.sideOf[s.ids[j]]] > 0) { s.turn = j; break; } }
    return s;
  },
  isGameOver: s => s.over, getResults: s => ({ winnerSide: s.winnerSide }),
};
