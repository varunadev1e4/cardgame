import { useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
const SB = String(import.meta.env.VITE_SUPABASE_URL || ''), KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
const sb = createClient(SB, KEY);
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => [...crypto.getRandomValues(new Uint8Array(6))].map(x => ALPHA[x % 32]).join('');
const EMOJI = ['👍', '😂', '😮', '😢', '🔥', '👏'];
const token = () => { let t = localStorage.getItem('cr_tok'); if (!t) { t = crypto.randomUUID() + crypto.randomUUID(); localStorage.setItem('cr_tok', t); } return t; };
const GAMES: Record<string, { name: string; set: [string, string, number | boolean][] }> = {
  blackjack: { name: 'Blackjack', set: [['rounds', 'Rounds', 5], ['hitSoft17', 'Dealer hits soft 17', false], ['allowDouble', 'Allow double down', true]] },
  inbetween: { name: 'In Between', set: [['rounds', 'Rounds', 5], ['postPenalty', 'Post penalty', 2], ['aceHigh', 'Ace high', true]] },
  flip7: { name: 'Lucky Seven (push your luck)', set: [['target', 'Target score', 100], ['rounds', 'Max rounds', 10]] },
  leastcount: { name: 'Least Count', set: [['dealt', 'Cards dealt', 7], ['declareMax', 'Show if hand ≤', 10], ['penalty', 'Wrong-show penalty', 40], ['target', 'Out at score', 100], ['jokers', 'Jokers', true]] },
  elimination: { name: 'Powder Keg (elimination)', set: [] },
};
function useRoom(code: string, nick: string, create: boolean) {
  const [room, setRoom] = useState<any>(null), [view, setView] = useState<any>(null), [chat, setChat] = useState<any[]>([]);
  const [err, setErr] = useState(''), [me, setMe] = useState(''), [online, setOnline] = useState(false), [flash, setFlash] = useState<any>(null);
  const seq = useRef(Date.now()), busy = useRef(false), joined = useRef(false);
  const handle = (m: any) => {
    if (m.t === 'joined') { setMe(m.playerId); setErr(''); } else if (m.t === 'room') setRoom(m); else if (m.t === 'state') setView(m.view);
    else if (m.t === 'chat') setChat(c => [...c.slice(-99), m]); else if (m.t === 'error') setErr(m.message);
    else if (m.t === 'react') { setFlash(m); setTimeout(() => setFlash(null), 1800); }
  };
  const call = async (msg: any) => {
    try {
      const r = await fetch(`${SB}/functions/v1/game`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` }, body: JSON.stringify({ code, token: token(), msg, create }) });
      const j = await r.json(); setOnline(true); (j.msgs || []).forEach(handle); return j;
    } catch { setOnline(false); return null; }
  };
  useEffect(() => {
    let dead = false, hb: any, viewCh: any;
    const roomCh = sb.channel(`room:${code}`).on('broadcast', { event: 'm' }, ({ payload }) => handle(payload)).subscribe();
    const join = async () => {
      const j = await call({ t: 'join', token: token(), nickname: nick });
      if (dead || !j?.viewKey) return false;
      if (!viewCh) viewCh = sb.channel(`v:${j.viewKey}`).on('broadcast', { event: 'm' }, ({ payload }) => handle(payload)).subscribe();
      joined.current = true; return true;
    };
    join().then(ok => { if (ok) hb = setInterval(async () => { const j = await call({ t: 'ping' }); if (!j) joined.current = false; else if (!joined.current) await join(); }, 12000); });
    return () => { dead = true; clearInterval(hb); sb.removeChannel(roomCh); if (viewCh) sb.removeChannel(viewCh); };
  }, [code, nick]);
  const send = (m: any) => { call(m); };
  const act = async (action: any) => { if (busy.current) return; busy.current = true; await call({ t: 'action', seq: ++seq.current, action }); busy.current = false; };
  return { room, view, chat, err, me, online, flash, send, act };
}
const Card = ({ c, sel, onClick }: any) => {
  if (!c) return <div className="card back">?</div>;
  const sym: any = { S: '♠', H: '♥', D: '♦', C: '♣', '*': '' };
  return <div className={'card' + (c.s === 'H' || c.s === 'D' ? ' red' : '') + (sel ? ' sel' : '')} onClick={onClick}>{c.r === 'JK' ? '🃏' : <span>{c.r}<br />{sym[c.s]}</span>}</div>;
};
const Cards = ({ cs }: any) => <div className="row">{cs.map((c: any, i: number) => <Card key={i} c={c} />)}</div>;
const Scores = ({ s, nm }: any) => <div className="row">{Object.entries(s).map(([id, v]: any) => <span className="chip" key={id}>{nm(id)}: {v}</span>)}</div>;
const Btn = ({ onClick, children, ghost }: any) => <button className={ghost ? 'ghost' : ''} onClick={onClick}>{children}</button>;

function BJ({ v, act, nm }: any) {
  return <div><p>Round {v.round}/{v.rounds}</p><h3>Dealer {v.dealerTotal ?? ''}</h3><Cards cs={v.dealer} />
    {v.players.map((p: any) => <div key={p.id} className={'seat' + (v.turn === p.id ? ' turn' : '')}><b>{nm(p.id)}</b> · {p.total} · {p.status} · score {p.score} {p.last ? `(${p.last})` : ''}<Cards cs={p.hand} /></div>)}
    {v.phase === 'player' && v.turn === v.you && <div className="row"><Btn onClick={() => act({ type: 'hit' })}>Hit</Btn><Btn onClick={() => act({ type: 'stand' })}>Stand</Btn><Btn ghost onClick={() => act({ type: 'double' })}>Double</Btn></div>}
    {v.phase === 'roundOver' && <Btn onClick={() => act({ type: 'next' })}>Next round</Btn>}</div>;
}
function IB({ v, act, nm }: any) {
  const l = v.last;
  return <div><p>Round {v.round}/{v.rounds} · {v.rules}</p>{v.turn && <p>Turn: <b>{nm(v.turn)}</b></p>}
    {v.pair && <><Cards cs={v.pair} /><div className="row"><Btn onClick={() => act({ type: 'in' })}>Bet it lands between</Btn><Btn ghost onClick={() => act({ type: 'pass' })}>Pass</Btn></div></>}
    {l && <div className="seat">Last: <b>{nm(l.pid)}</b> — {l.result} ({l.delta > 0 ? '+' : ''}{l.delta})<div className="row">{l.pair.map((c: any, i: number) => <Card key={i} c={c} />)}{l.third && <Card c={l.third} />}</div></div>}
    <Scores s={v.scores} nm={nm} /></div>;
}
function F7({ v, act, nm }: any) {
  return <div><p>Round {v.round}/{v.rounds} · first to {v.target} · deck {v.deckCount}</p>
    {v.players.map((p: any) => <div key={p.id} className={'seat' + (v.turn === p.id ? ' turn' : '')}><b>{nm(p.id)}</b> · {p.status} · total {p.total} · this round {p.roundScore}
      <div className="row">{p.nums.map((n: number, i: number) => <span className="chip" key={i}>{n}</span>)}{p.shield && <span className="chip">🛡 Shield</span>}{p.x2 && <span className="chip">×2</span>}{p.p5 > 0 && <span className="chip">+5 ×{p.p5}</span>}</div></div>)}
    {v.phase === 'play' && v.turn === v.you && <div className="row"><Btn onClick={() => act({ type: 'draw' })}>Draw</Btn><Btn ghost onClick={() => act({ type: 'stop' })}>Stop & bank</Btn></div>}
    {v.phase === 'roundOver' && <Btn onClick={() => act({ type: 'next' })}>Next round</Btn>}
    <div className="chat">{v.log.map((x: string, i: number) => <div key={i}>{x}</div>)}</div></div>;
}
function LC({ v, act, nm }: any) {
  const [sel, setSel] = useState<number[]>([]); const mine = v.turn === v.you;
  const tog = (i: number) => setSel(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i]);
  return <div><p>Round {v.round} · {v.rules}</p>{v.turn && <p>Turn: <b>{nm(v.turn)}</b> ({v.turnPhase === 'start' ? 'draw or show' : 'discard'})</p>}
    <div className="row"><span>Discard top:</span><Card c={v.discardTop} /><span className="chip">Stock {v.stock}</span>{Object.entries(v.counts).map(([id, n]: any) => <span className="chip" key={id}>{nm(id)}: {n} cards</span>)}</div>
    <h4>Your hand</h4><div className="row">{v.hand.map((c: any, i: number) => <Card key={i} c={c} sel={sel.includes(i)} onClick={() => mine && v.turnPhase === 'discard' && tog(i)} />)}</div>
    {v.phase === 'play' && mine && v.turnPhase === 'start' && <div className="row"><Btn onClick={() => act({ type: 'draw', from: 'stock' })}>Draw stock</Btn><Btn onClick={() => act({ type: 'draw', from: 'discard' })}>Take discard</Btn><Btn ghost onClick={() => act({ type: 'show' })}>Show</Btn></div>}
    {v.phase === 'play' && mine && v.turnPhase === 'discard' && <Btn onClick={() => { act({ type: 'discard', cards: sel }); setSel([]); }}>Discard selected (same rank only)</Btn>}
    {v.summary && <div className="banner">{v.summary}</div>}
    {v.revealed && Object.entries(v.revealed).map(([id, h]: any) => <div key={id}><b>{nm(id)}</b><Cards cs={h} /></div>)}
    {v.phase === 'roundOver' && <Btn onClick={() => act({ type: 'next' })}>Next round</Btn>}<Scores s={v.scores} nm={nm} /></div>;
}
function EL({ v, act, nm }: any) {
  const mine = v.turn === v.you && v.phase === 'play';
  return <div><p>Alive: {v.alive.map(nm).join(', ')} · Eliminated: {v.eliminated.map(nm).join(', ') || 'none'} · Deck {v.deckCount}</p>
    {v.turn && <p>Turn: <b>{nm(v.turn)}</b> {v.turnsOwed > 1 && `(${v.turnsOwed} turns owed)`}</p>}
    <div className="row">{Object.entries(v.counts).map(([id, n]: any) => <span className="chip" key={id}>{nm(id)}: {n} cards</span>)}</div>
    <h4>Your hand</h4><div className="row">{v.hand.map((c: string, i: number) => <button key={i} className={['skip', 'peek', 'shuffle', 'attack'].includes(c) && mine ? '' : 'ghost'} onClick={() => mine && act({ type: 'play', card: c })}>{c}</button>)}</div>
    {v.peek && <p>Top of deck: {v.peek.join(' → ')}</p>}{mine && <Btn onClick={() => act({ type: 'draw' })}>Draw card (ends turn)</Btn>}
    <div className="chat">{v.log.slice().reverse().map((x: string, i: number) => <div key={i}>{x}</div>)}</div></div>;
}
const BOARDS: any = { blackjack: BJ, inbetween: IB, flip7: F7, leastcount: LC, elimination: EL };

function Lobby({ r, me, send, nm }: any) {
  const host = r.players.find((p: any) => p.id === me)?.isHost, g = GAMES[r.game];
  const set: any = { ...Object.fromEntries(g.set.map(([k, , d]) => [k, d])), ...r.settings };
  const cfg = (game: string, settings: any) => send({ t: 'config', game, settings });
  return <div className="panel"><h3>Lobby</h3>
    <ul>{r.players.map((p: any) => <li key={p.id}><span className={'dot' + (p.connected ? ' on' : '')} />{p.nickname} {p.isHost && '👑'} {host && p.id !== me && <button className="ghost" onClick={() => send({ t: 'kick', playerId: p.id })}>Remove</button>}</li>)}</ul>
    <div className="row"><label>Game <select disabled={!host} value={r.game} onChange={e => cfg(e.target.value, {})}>{Object.entries(GAMES).map(([k, x]) => <option key={k} value={k}>{x.name}</option>)}</select></label></div>
    {g.set.map(([k, label, d]) => <div className="row" key={k}><label>{label} {typeof d === 'boolean'
      ? <input type="checkbox" disabled={!host} checked={!!set[k]} onChange={e => cfg(r.game, { ...set, [k]: e.target.checked })} />
      : <input type="number" style={{ width: 80 }} disabled={!host} value={set[k]} onChange={e => cfg(r.game, { ...set, [k]: +e.target.value })} />}</label></div>)}
    {host ? <Btn onClick={() => send({ t: 'start' })}>Start game</Btn> : <p>Waiting for the host to start…</p>}</div>;
}
function Room({ code, nick, create, leave }: any) {
  const { room, view, chat, err, me, online, flash, send, act } = useRoom(code, nick, create);
  const [txt, setTxt] = useState('');
  const nm = (id: string) => room?.players.find((p: any) => p.id === id)?.nickname ?? String(id).slice(0, 4);
  const Board = room && BOARDS[room.game], host = room?.players.find((p: any) => p.id === me)?.isHost;
  const link = `${location.origin}/?room=${code}`;
  return <div className="wrap"><div className="top"><h2>Room {code}</h2><div className="row"><span className="chip">{online ? '🟢 connected' : '🔴 reconnecting…'}</span>
    <Btn ghost onClick={() => navigator.clipboard?.writeText(link)}>Copy invite link</Btn><Btn ghost onClick={leave}>Leave</Btn></div></div>
    {err && <div className="err">{err}</div>}{flash && <div className="flash">{nm(flash.from)} {flash.emoji}</div>}
    <div className="layout"><div>{!room ? <p>Connecting…</p> : room.status === 'waiting' ? <Lobby r={room} me={me} send={send} nm={nm} /> :
      <div className="panel">{room.status === 'completed' && <div className="banner">🏁 Game over — final scores below. {host && <Btn onClick={() => send({ t: 'rematch' })}>Rematch</Btn>}</div>}
        {view ? <Board v={view} act={act} nm={nm} /> : <p>Loading…</p>}</div>}</div>
      <div className="panel"><h4>Players</h4>{room?.players.map((p: any) => <div key={p.id}><span className={'dot' + (p.connected ? ' on' : '')} />{p.nickname}{p.isHost ? ' 👑' : ''}</div>)}
        <h4>Chat</h4><div className="chat">{chat.map((m, i) => <div key={i} className={m.system ? 'sys' : ''}>{m.system ? '' : <b>{m.from}: </b>}{m.text}</div>)}</div>
        <div className="row">{EMOJI.map(e => <button key={e} className="ghost" onClick={() => send({ t: 'react', emoji: e })}>{e}</button>)}</div>
        <input style={{ width: '100%' }} value={txt} maxLength={300} placeholder="Message…" onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && txt.trim()) { send({ t: 'chat', text: txt }); setTxt(''); } }} /></div></div></div>;
}
function Home({ initial, onEnter }: any) {
  const [nick, setNick] = useState(localStorage.getItem('cr_nick') || ''), [code, setCode] = useState(initial), [e, setE] = useState('');
  const go = (c: string, create = false) => { const n = nick.trim(); if (!n) return setE('Enter a nickname first'); localStorage.setItem('cr_nick', n); onEnter(c.toUpperCase(), n, create); };
  const create = () => go(newCode(), true);
  return <div className="home panel"><h1>🃏 Cardroom</h1><input placeholder="Your nickname" maxLength={16} value={nick} onChange={e => setNick(e.target.value)} />
    <Btn onClick={create}>Create private room</Btn><p>or join with a code</p>
    <input placeholder="ROOM CODE" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} /><Btn ghost onClick={() => /^[A-HJ-NP-Z2-9]{6}$/.test(code) ? go(code) : setE('Invalid room code')}>Join room</Btn>
    {e && <div className="err">{e}</div>}</div>;
}
export default function App() {
  const [s, setS] = useState<{ code: string; nick: string; create: boolean } | null>(null);
  const initial = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (s) return <Room code={s.code} nick={s.nick} create={s.create} leave={() => { history.replaceState(null, '', '/'); setS(null); }} />;
  return <Home initial={initial} onEnter={(code: string, nick: string, create: boolean) => { history.replaceState(null, '', `/?room=${code}`); setS({ code, nick, create }); }} />;
}
