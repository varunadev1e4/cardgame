// What happens when a player leaves or times out mid-game. Games without an entry here are two-player games (the room ends them as abandoned).
import { dropId } from '../engine';
import { blackjack, advance as bjAdvance } from './blackjack';
import { inbetween } from './inbetween';
import { flip7, advance as f7Advance } from './flip7';
import { leastcount } from './leastcount';
import { elimination } from './elimination';
import { crazy8 } from './crazy8';
import { bluff } from './bluff';
import { gofish, settle } from './gofish';
import { kittens, adv as kAdv } from './kittens';
import { sl, ludo, wg } from './party';
import { randInt } from '../engine';
const wrap = (f: (s: any, id: string) => void) => (s0: any, id: string) => { const s = structuredClone(s0); f(s, id); return s; };
blackjack.removePlayer = wrap((s, id) => { const i = s.players.findIndex((p: any) => p.id === id); if (i < 0) return; s.players.splice(i, 1);
  if (!s.players.length) { s.phase = 'over'; return; } if (s.phase === 'player') { if (i < s.turn) s.turn--; else if (i === s.turn) { s.turn = i - 1; bjAdvance(s); } } });
flip7.removePlayer = wrap((s, id) => { const i = s.players.findIndex((p: any) => p.id === id); if (i < 0) return; s.players.splice(i, 1);
  if (i < s.turn) s.turn--; else if (i === s.turn && s.phase === 'play') { s.turn = i - 1; f7Advance(s); } if (s.turn >= s.players.length || s.turn < 0) s.turn = 0; });
inbetween.removePlayer = wrap(dropId); sl.removePlayer = wrap(dropId); wg.removePlayer = wrap(dropId);
leastcount.removePlayer = wrap((s, id) => { const was = s.ids[s.turn] === id; dropId(s, id); if (was) s.tp = 'start'; });
crazy8.removePlayer = wrap((s, id) => { const was = s.ids[s.turn] === id; dropId(s, id); if (was) s.drew = false; });
ludo.removePlayer = wrap((s, id) => { const was = s.ids[s.turn] === id; dropId(s, id); if (was) { s.phase = 'roll'; s.legal = []; } });
bluff.removePlayer = wrap((s, id) => { if (s.last?.by === id) s.last = undefined; if (s.pendingWin === id) s.pendingWin = undefined; dropId(s, id); });
gofish.removePlayer = wrap((s, id) => { dropId(s, id); if (s.phase === 'play') settle(s); });
elimination.removePlayer = wrap((s, id) => { dropId(s, id); s.owed = 1; if (s.alive.length <= 1) { s.phase = 'over'; return; } while (!s.alive.includes(s.ids[s.turn])) s.turn = (s.turn + 1) % s.ids.length; });
kittens.removePlayer = wrap((s, id) => {
  if (!s.alive.includes(id)) return; const wasTurn = s.ids[s.turn] === id;
  s.discard.push(...s.hands[id]); s.hands[id] = []; s.alive = s.alive.filter((x: string) => x !== id); s.out.push(id);
  if (s.phase === 'reinsert' && wasTurn) s.deck.splice(randInt(s.deck.length + 1), 0, 'boom');
  if (s.favor && (s.favor.from === id || s.favor.to === id)) { s.favor = undefined; s.phase = 'turn'; }
  if (s.pending?.by === id || s.pending?.target === id) { s.pending = undefined; s.phase = 'turn'; }
  if (s.alive.length <= 1) { s.winner = s.alive[0]; s.phase = 'over'; return; }
  if (wasTurn) kAdv(s);
});
