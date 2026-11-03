import { GameEngine, finalTwo } from '../engine';
const over2 = (s: any) => !!s.winner || !!s.draw;
const L3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const ttt: GameEngine<any, any, any, any> = {
  id: 'ttt', minPlayers: 2, maxPlayers: 2,
  initialize: ids => ({ ids, b: Array(9).fill(null), turn: 0, winner: null, draw: false, line: null }),
  getPlayerView: (s, me) => ({ game: 'ttt', you: me, ids: s.ids, b: s.b, turn: over2(s) ? null : s.ids[s.turn], line: s.line, draw: s.draw, final: over2(s) ? finalTwo(s.ids, s.winner) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (over2(s)) throw new Error('Game over'); if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    const i = a.i; if (!Number.isInteger(i) || i < 0 || i > 8 || s.b[i] !== null) throw new Error('Invalid square');
    s.b[i] = s.turn; const w = L3.find(l => l.every(k => s.b[k] === s.turn));
    if (w) { s.winner = pid; s.line = w; } else if (s.b.every((x: any) => x !== null)) s.draw = true; else s.turn = 1 - s.turn; return s;
  },
  isGameOver: over2, getResults: s => ({ winner: s.winner }),
};
const R = 6, C = 7;
function c4line(b: any[], r: number, c: number, p: number) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [r * C + c];
    for (const g of [1, -1]) { let rr = r + dr * g, cc = c + dc * g; while (rr >= 0 && rr < R && cc >= 0 && cc < C && b[rr * C + cc] === p) { cells.push(rr * C + cc); rr += dr * g; cc += dc * g; } }
    if (cells.length >= 4) return cells;
  } return null;
}
export const c4: GameEngine<any, any, any, any> = {
  id: 'c4', minPlayers: 2, maxPlayers: 2,
  initialize: ids => ({ ids, b: Array(R * C).fill(null), turn: 0, winner: null, draw: false, line: null }),
  getPlayerView: (s, me) => ({ game: 'c4', you: me, ids: s.ids, b: s.b, turn: over2(s) ? null : s.ids[s.turn], line: s.line, draw: s.draw, final: over2(s) ? finalTwo(s.ids, s.winner) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (over2(s)) throw new Error('Game over'); if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    const col = a.col; if (!Number.isInteger(col) || col < 0 || col >= C) throw new Error('Invalid column');
    let r = R - 1; while (r >= 0 && s.b[r * C + col] !== null) r--; if (r < 0) throw new Error('Column is full');
    s.b[r * C + col] = s.turn; const w = c4line(s.b, r, col, s.turn);
    if (w) { s.winner = pid; s.line = w; } else if (s.b.every((x: any) => x !== null)) s.draw = true; else s.turn = 1 - s.turn; return s;
  },
  isGameOver: over2, getResults: s => ({ winner: s.winner }),
};
export const dab: GameEngine<any, any, any, any> = {
  id: 'dab', minPlayers: 2, maxPlayers: 2,
  initialize(ids, st) {
    const n = Math.min(6, Math.max(2, Number(st.size) || 3));
    return { ids, n, h: Array.from({ length: n + 1 }, () => Array(n).fill(null)), v: Array.from({ length: n }, () => Array(n + 1).fill(null)), box: Array.from({ length: n }, () => Array(n).fill(null)), score: [0, 0], turn: 0 };
  },
  getPlayerView(s, me) {
    const done = s.score[0] + s.score[1] === s.n * s.n;
    return { game: 'dab', you: me, ids: s.ids, n: s.n, h: s.h, v: s.v, box: s.box, score: s.score, turn: done ? null : s.ids[s.turn],
      final: done ? s.ids.map((id: string, i: number) => ({ id, label: `${s.score[i]} boxes` })).sort((a: any, b: any) => parseInt(b.label) - parseInt(a.label)) : null };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.score[0] + s.score[1] === s.n * s.n) throw new Error('Game over'); if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    const arr = a.k === 'h' ? s.h : a.k === 'v' ? s.v : null;
    if (!arr || !Number.isInteger(a.r) || !Number.isInteger(a.c) || arr[a.r]?.[a.c] !== null) throw new Error('Invalid line');
    arr[a.r][a.c] = s.turn; let got = 0;
    const full = (r: number, c: number) => r >= 0 && c >= 0 && r < s.n && c < s.n && s.box[r][c] === null && s.h[r][c] !== null && s.h[r + 1][c] !== null && s.v[r][c] !== null && s.v[r][c + 1] !== null;
    for (const [r, c] of a.k === 'h' ? [[a.r - 1, a.c], [a.r, a.c]] : [[a.r, a.c - 1], [a.r, a.c]]) if (full(r, c)) { s.box[r][c] = s.turn; s.score[s.turn]++; got++; }
    if (!got) s.turn = 1 - s.turn; return s;
  },
  isGameOver: s => s.score[0] + s.score[1] === s.n * s.n, getResults: s => ({ score: s.score }),
};
export const nim: GameEngine<any, any, any, any> = {
  id: 'nim', minPlayers: 2, maxPlayers: 2,
  initialize: (ids, st) => ({ ids, piles: Array.from({ length: Math.min(8, Math.max(2, Number(st.piles) || 4)) }, (_, i) => 2 * i + 1), maxTake: Math.max(0, Number(st.maxTake) || 0), misere: !!st.misere, turn: 0, winner: null }),
  getPlayerView: (s, me) => ({ game: 'nim', you: me, ids: s.ids, piles: s.piles, maxTake: s.maxTake, misere: s.misere, turn: s.winner ? null : s.ids[s.turn], final: s.winner ? finalTwo(s.ids, s.winner) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.winner) throw new Error('Game over'); if (s.ids[s.turn] !== pid) throw new Error('Not your turn');
    const p = s.piles[a.pile]; if (!Number.isInteger(a.pile) || !Number.isInteger(a.n) || p === undefined || a.n < 1 || a.n > p || (s.maxTake > 0 && a.n > s.maxTake)) throw new Error('Invalid move');
    s.piles[a.pile] -= a.n;
    if (s.piles.every((x: number) => x === 0)) s.winner = s.misere ? s.ids[1 - s.turn] : pid; else s.turn = 1 - s.turn; return s;
  },
  isGameOver: s => !!s.winner, getResults: s => ({ winner: s.winner }),
};
const BEATS: any = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
export const rps: GameEngine<any, any, any, any> = {
  id: 'rps', minPlayers: 2, maxPlayers: 2,
  initialize(ids, st) { const bestOf = Number(st.bestOf) === 5 ? 5 : 3; return { ids, bestOf, need: Math.ceil(bestOf / 2), picks: { [ids[0]]: null, [ids[1]]: null }, wins: { [ids[0]]: 0, [ids[1]]: 0 }, round: 1, history: [], winner: null }; },
  getPlayerView: (s, me) => ({ game: 'rps', you: me, ids: s.ids, bestOf: s.bestOf, need: s.need, round: s.round, wins: s.wins, myPick: s.picks[me], picked: Object.fromEntries(s.ids.map((i: string) => [i, !!s.picks[i]])), history: s.history, winner: s.winner, turn: null, final: s.winner ? finalTwo(s.ids, s.winner) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0); if (s.winner) throw new Error('Match over');
    if (!BEATS[a.pick]) throw new Error('Invalid choice'); if (s.picks[pid]) throw new Error('Already chosen');
    s.picks[pid] = a.pick; const [x, y] = s.ids;
    if (s.picks[x] && s.picks[y]) {
      const w = s.picks[x] === s.picks[y] ? null : BEATS[s.picks[x]] === s.picks[y] ? x : y;
      s.history.push({ round: s.round, picks: { ...s.picks }, winner: w }); if (w) { s.wins[w]++; if (s.wins[w] >= s.need) s.winner = w; }
      s.picks = { [x]: null, [y]: null }; s.round++;
    } return s;
  },
  isGameOver: s => !!s.winner, getResults: s => ({ winner: s.winner }),
};
