export interface GameEngine<S = any, A = any, V = any, Res = any> {
  id: string; minPlayers: number; maxPlayers: number;
  initialize(players: string[], settings: Record<string, any>): S;
  getPlayerView(state: S, playerId: string): V;
  handleAction(state: S, playerId: string, action: A): S; // throws Error on invalid
  isGameOver(state: S): boolean;
  getResults(state: S): Res;
  removePlayer?(state: S, playerId: string): S; // optional: called when a player leaves or times out mid-game
}
/** Unbiased CSPRNG integer in [0,n) via rejection sampling. */
export function randInt(n: number): number {
  const lim = Math.floor(0x100000000 / n) * n, b = new Uint32Array(1);
  do crypto.getRandomValues(b); while (b[0] >= lim);
  return b[0] % n;
}
export function shuffle<T>(a: readonly T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) { const j = randInt(i + 1); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}
export const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'] as const;
export const SUITS = ['S','H','D','C'] as const;
export type Card = { r: typeof RANKS[number]; s: typeof SUITS[number] };
export const newDeck = (): Card[] => shuffle(SUITS.flatMap(s => RANKS.map(r => ({ r, s }))));
export const sortHand = (h: Card[]) => h.sort((a, b) => RANKS.indexOf(a.r) - RANKS.indexOf(b.r) || SUITS.indexOf(a.s) - SUITS.indexOf(b.s));
export const finalTwo = (ids: string[], w: string | null) => w ? [{ id: w, label: 'Winner' }, ...ids.filter(i => i !== w).map(id => ({ id, label: 'Runner-up' }))] : ids.map(id => ({ id, label: 'Draw' }));
/** Remove a player id from a state object: string arrays, object arrays with .id, and id-keyed maps. Fixes the turn index. */
export function dropId(s: any, id: string) {
  const i = s.ids ? s.ids.indexOf(id) : -1;
  for (const k of Object.keys(s)) { const v = s[k];
    if (Array.isArray(v)) s[k] = v.filter((x: any) => x !== id && x?.id !== id);
    else if (v && typeof v === 'object' && id in v) delete v[id]; }
  if (i >= 0 && typeof s.turn === 'number') { if (i < s.turn) s.turn--; if (s.turn >= s.ids.length) s.turn = 0; }
  return s;
}
