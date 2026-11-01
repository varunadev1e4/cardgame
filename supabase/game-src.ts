// Supabase Edge Function: one stateless endpoint. Game state lives in room_states (service-role only, no public access).
import { Room } from '../server/room';
import { engines } from '../server/games';
declare const Deno: any;
const URL_ = Deno.env.get('SUPABASE_URL'), KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), SECRET = Deno.env.get('GUEST_TOKEN_SECRET') || '';
const ORIGIN = (Deno.env.get('CLIENT_ORIGIN') || '*').replace(/\/$/, '');
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } });
const STALE = 45000; // a player with no heartbeat for 45s shows as disconnected
const roomMsg = (r: Room) => ({ t: 'room', code: r.code, status: r.status, game: r.game, settings: r.settings, players: r.pub() });

async function attempt(code: string, token: string, msg: any, create: boolean): Promise<any> {
  const rows = await (await fetch(`${URL_}/rest/v1/room_states?code=eq.${code}&select=data,version`, { headers: H })).json();
  let data: any, version = -1;
  if (rows.length) ({ data, version } = rows[0]);
  else if (create && msg.t === 'join') data = {};
  else return { msgs: [{ t: 'error', message: 'Room not found' }] };
  data.seen ??= {}; data.keys ??= {}; data.seq ??= {};
  const was = (data.room?.members || []).map((m: any) => m.connected).join() + data.room?.hostId;
  let ready: any;
  const ctx: any = { blockConcurrencyWhile: (f: any) => (ready = f()), storage: { get: async () => data.room, put: async (_: string, v: any) => { data.room = v; }, deleteAll: async () => {}, setAlarm: async () => {} } };
  const room = new Room(ctx, { GUEST_TOKEN_SECRET: SECRET }); await ready;
  room.code = code; room.lastSeq = new Map(Object.entries(data.seq));
  const hash = await room.hashTok(token), mm = room.members.find(m => m.hash === hash);
  if (!mm && msg.t !== 'join') return { msgs: [{ t: 'error', message: 'Not joined to this room' }] };
  const now = Date.now(); if (mm) data.seen[mm.id] = now;
  for (const m of room.members) m.connected = m.id === mm?.id || now - (data.seen[m.id] || 0) < STALE;
  const host = room.members.find(m => m.id === room.hostId);
  if (!host?.connected) { const n = room.members.find(m => m.connected); if (n) room.hostId = n.id; }
  const changed = was !== room.members.map(m => m.connected).join() + room.hostId;
  const outs = new Map<string, string[]>();
  const mk = (id: string) => { const a: string[] = []; outs.set(id, a); return { send: (s: string) => a.push(s), close() {} } as any; };
  for (const m of room.members) if (m.id !== mm?.id) room.sockets.set(mk(m.id), m.id);
  const cf = mk('#'); if (mm) room.sockets.set(cf, mm.id);
  if (msg.t === 'ping') { if (changed) { await room.save(); room.broadcast(); } } else await room.onMsg(cf, JSON.stringify(msg));
  const mine = (outs.get('#') || []).map(s => JSON.parse(s));
  if (!data.room) return { msgs: mine };
  const myId = room.sockets.get(cf);
  data.seq = Object.fromEntries(room.lastSeq);
  if (myId) { data.keys[myId] ??= crypto.randomUUID(); data.seen[myId] = now; }
  for (const id of Object.keys(data.keys)) if (!room.members.some(m => m.id === id)) { delete data.keys[id]; delete data.seen[id]; }
  let ok: boolean;
  if (version < 0) ok = (await fetch(`${URL_}/rest/v1/room_states`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ code, data, version: 0 }) })).ok;
  else { const r = await fetch(`${URL_}/rest/v1/room_states?code=eq.${code}&version=eq.${version}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ data, version: version + 1, updated_at: new Date().toISOString() }) }); ok = r.ok && (await r.json()).length > 0; }
  if (!ok) return null; // someone else wrote first: retry on fresh data
  const pub: any[] = [], any = [...outs.values()].find(v => v.length);
  for (const m of (any || []).map(s => JSON.parse(s))) if (['room', 'chat', 'react'].includes(m.t)) pub.push({ topic: `room:${code}`, event: 'm', payload: m, private: false });
  for (const [id, list] of outs) { if (id === '#') continue; const st = list.map(s => JSON.parse(s)).filter(m => m.t === 'state').pop(); if (st && data.keys[id]) pub.push({ topic: `v:${data.keys[id]}`, event: 'm', payload: st, private: false }); }
  if (pub.length) await fetch(`${URL_}/realtime/v1/api/broadcast`, { method: 'POST', headers: H, body: JSON.stringify({ messages: pub }) }).catch(console.error);
  let msgs = mine.filter(m => ['joined', 'error', 'room', 'state'].includes(m.t));
  if (msg.t === 'ping' && myId) msgs = [roomMsg(room), ...(room.state ? [{ t: 'state', view: engines[room.game].getPlayerView(room.state, myId) }] : [])];
  return { msgs, viewKey: myId ? data.keys[myId] : undefined };
}
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { code, token, msg, create } = await req.json();
    if (!SECRET) return j({ msgs: [{ t: 'error', message: 'Server not configured (GUEST_TOKEN_SECRET)' }] });
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code) || typeof token !== 'string' || token.length < 32 || !msg || typeof msg !== 'object') return j({ msgs: [{ t: 'error', message: 'Bad request' }] });
    for (let i = 0; i < 6; i++) { const r = await attempt(code, token, msg, !!create); if (r) return j(r); }
    return j({ msgs: [{ t: 'error', message: 'Busy, please retry' }] });
  } catch (e) { console.error(e); return j({ msgs: [{ t: 'error', message: 'Server error' }] }); }
});
