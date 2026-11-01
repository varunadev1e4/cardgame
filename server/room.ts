import type { ClientMsg, ServerMsg, PublicPlayer, GameId, RoomStatus } from '../shared/types';
import { engines } from './games';
interface Member { id: string; nickname: string; hash: string; connected: boolean }
export class Room {
  state: any = null; status: RoomStatus = 'waiting'; game: GameId = 'blackjack'; settings: any = {};
  members: Member[] = []; hostId = ''; code = ''; lastSeq = new Map<string, number>();
  sockets = new Map<WebSocket, string>();
  constructor(private ctx: DurableObjectState, private env: any) {
    this.ctx.blockConcurrencyWhile(async () => { Object.assign(this, await this.ctx.storage.get('room') ?? {}); this.members.forEach(m => m.connected = false); });
  }
  async fetch(req: Request) {
    const url = new URL(req.url);
    this.code ||= url.searchParams.get('code') ?? '';
    const [client, server] = Object.values(new WebSocketPair()) as WebSocket[];
    (server as any).accept();
    server.addEventListener('message', e => this.ctx.blockConcurrencyWhile(() => this.onMsg(server, String(e.data))));
    server.addEventListener('close', () => this.ctx.blockConcurrencyWhile(() => this.onClose(server)));
    return new Response(null, { status: 101, webSocket: client } as any);
  }
  async hashTok(t: string) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t + this.env.GUEST_TOKEN_SECRET));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  send(ws: WebSocket, m: ServerMsg) { try { ws.send(JSON.stringify(m)); } catch {} }
  pub(): PublicPlayer[] { return this.members.map(m => ({ id: m.id, nickname: m.nickname, connected: m.connected, isHost: m.id === this.hostId })); }
  async save() { await this.ctx.storage.put('room', { state: this.state, status: this.status, game: this.game, settings: this.settings, members: this.members, hostId: this.hostId, code: this.code }); }
  broadcast() {
    for (const [ws, id] of this.sockets) {
      this.send(ws, { t: 'room', code: this.code, status: this.status, game: this.game, settings: this.settings, players: this.pub() });
      if (this.state) this.send(ws, { t: 'state', view: engines[this.game].getPlayerView(this.state, id) });
    }
  }
  sys(text: string) { for (const ws of this.sockets.keys()) this.send(ws, { t: 'chat', from: 'system', text, system: true }); }
  async onMsg(ws: WebSocket, raw: string) {
    let m: ClientMsg; try { m = JSON.parse(raw); } catch { return; }
    try {
      if (m.t === 'join') return await this.join(ws, m);
      const id = this.sockets.get(ws); if (!id) throw new Error('Not joined');
      const isHost = id === this.hostId;
      switch (m.t) {
        case 'config':
          if (!isHost || this.status !== 'waiting') throw new Error('Host only, before start');
          if (!engines[m.game]) throw new Error('Unknown game');
          this.game = m.game; this.settings = m.settings ?? {}; break;
        case 'start': case 'rematch': {
          if (!isHost) throw new Error('Host only');
          if (m.t === 'start' && this.status !== 'waiting') throw new Error('Already started');
          if (m.t === 'rematch' && this.status !== 'completed') throw new Error('Game not finished');
          const e = engines[this.game], ids = this.members.filter(x => x.connected).map(x => x.id);
          if (ids.length < e.minPlayers || ids.length > e.maxPlayers) throw new Error(`Needs ${e.minPlayers}-${e.maxPlayers} players`);
          this.state = e.initialize(ids, this.settings); this.status = 'active'; this.lastSeq.clear(); this.sys('Game started'); break;
        }
        case 'kick':
          if (!isHost || m.playerId === id) throw new Error('Not allowed');
          for (const [w, pid] of this.sockets) if (pid === m.playerId) { this.sockets.delete(w); w.close(4000, 'removed'); }
          this.members = this.members.filter(x => x.id !== m.playerId); break;
        case 'action': {
          if (this.status !== 'active') throw new Error('No active game');
          if (!Number.isInteger(m.seq) || m.seq <= (this.lastSeq.get(id) ?? -1)) throw new Error('Duplicate action');
          this.lastSeq.set(id, m.seq);
          const e = engines[this.game]; this.state = e.handleAction(this.state, id, m.action);
          if (e.isGameOver(this.state)) { this.status = 'completed'; this.sys('Game over'); } break;
        }
        case 'chat': { const t = String(m.text).replace(/[\u0000-\u001f<>]/g, '').slice(0, 300).trim(); if (!t) return; const n = this.members.find(x => x.id === id)!.nickname; for (const w of this.sockets.keys()) this.send(w, { t: 'chat', from: n, text: t }); return; }
        case 'react': if (!['👍','😂','😮','😢','🔥','👏'].includes(m.emoji)) return; for (const w of this.sockets.keys()) this.send(w, { t: 'react', from: id, emoji: m.emoji }); return;
      }
      await this.save(); this.broadcast();
    } catch (e: any) { this.send(ws, { t: 'error', message: e.message ?? 'Error' }); }
  }
  async join(ws: WebSocket, m: Extract<ClientMsg, { t: 'join' }>) {
    const nick = String(m.nickname).replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 16);
    if (!m.token || m.token.length < 32 || !nick) throw new Error('Invalid nickname or session');
    const hash = await this.hashTok(m.token); let me = this.members.find(x => x.hash === hash);
    if (!me) {
      if (this.status === 'closed') throw new Error('Room closed');
      if (this.status !== 'waiting') throw new Error('Game already in progress');
      if (this.members.length >= 8) throw new Error('Room full');
      if (this.members.some(x => x.nickname.toLowerCase() === nick.toLowerCase())) throw new Error('Nickname taken');
      me = { id: crypto.randomUUID(), nickname: nick, hash, connected: true }; this.members.push(me);
      if (!this.hostId) this.hostId = me.id; this.sys(`${nick} joined`);
    }
    me.connected = true; this.sockets.set(ws, me.id);
    this.send(ws, { t: 'joined', playerId: me.id }); await this.save(); this.broadcast();
  }
  async onClose(ws: WebSocket) {
    const id = this.sockets.get(ws); this.sockets.delete(ws); if (!id) return;
    const me = this.members.find(x => x.id === id); if (!me) return;
    me.connected = [...this.sockets.values()].includes(id);
    if (!me.connected && id === this.hostId) { const n = this.members.find(x => x.connected); if (n) { this.hostId = n.id; this.sys(`${n.nickname} is now host`); } }
    if (!this.members.some(x => x.connected)) await this.ctx.storage.setAlarm(Date.now() + 6 * 3600e3);
    await this.save(); this.broadcast();
  }
  async alarm() { if (!this.members.some(x => x.connected)) { this.status = 'closed'; await this.ctx.storage.deleteAll(); } }
}
