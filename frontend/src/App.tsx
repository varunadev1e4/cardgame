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
const Card = ({ c, sel, onClick, sm, hint }: any) => {
  if (!c) return <div className={'card back' + (sm ? ' sm' : '')} />;
  const sym: any = { S: '♠', H: '♥', D: '♦', C: '♣', '*': '★' }, jk = c.r === 'JK';
  return <div onClick={onClick} className={'card deal' + (c.s === 'H' || c.s === 'D' ? ' red' : '') + (sel ? ' sel' : '') + (sm ? ' sm' : '') + (hint ? ' hint' : '') + (onClick ? ' tap' : '')}>
    <span className="cn">{jk ? '🃏' : c.r}</span><span className="cs">{jk ? 'JOKER' : sym[c.s]}</span></div>;
};
const Cards = ({ cs }: any) => <div className="row">{cs.map((c: any, i: number) => <Card key={i} c={c} />)}</div>;
const hue = (s: string) => [...String(s)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 360;
const Av = ({ name, size = 32 }: any) => <span className="av" style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${hue(name)} 45% 38%)` }}>{String(name || '?')[0]?.toUpperCase()}</span>;
const Scores = ({ s, nm, turn }: any) => <div className="row">{Object.entries(s).map(([id, v]: any) => <span className={'pill' + (turn === id ? ' on' : '')} key={id}><Av name={nm(id)} size={22} />{nm(id)} <b>{v}</b></span>)}</div>;
const Bars = ({ s, max, nm, turn }: any) => <div className="bars">{Object.entries(s).map(([id, x]: any) => <div key={id} className={'bar' + (turn === id ? ' on' : '')}><Av name={nm(id)} size={24} /><span className="bn">{nm(id)}</span><div className="track"><div style={{ width: Math.min(100, Math.max(0, (x / max) * 100)) + '%' }} /></div><b>{x}</b></div>)}</div>;
const META: Record<string, [string, string]> = { blackjack: ['🂡', 'Beat the dealer to 21'], inbetween: ['🎯', 'Bet a card lands between two others'], flip7: ['🎲', 'Push your luck, bank your points'], leastcount: ['🃏', 'Keep the lowest hand'], elimination: ['💣', 'Dodge bombs, outwit opponents'] };
const ICON: Record<string, string> = { bomb: '💣', defuse: '🧯', skip: '⏭', peek: '👁', shuffle: '🔀', attack: '⚔️' };
const RULES: Record<string, string> = {
  blackjack: 'Get closer to 21 than the dealer without going over. Hit draws a card, Stand stops, Double draws exactly one card for double stakes. A two-card 21 pays 1.5.',
  inbetween: 'On your turn you see two cards. Bet that the next card lands strictly between them, or pass. Between: +1. Outside: -1. Matching a card exactly costs extra. Pairs with no gap are skipped automatically.',
  flip7: 'On your turn, Draw or Bank. Every number can be held only once, so drawing a number you already hold busts you for 0 this round, unless you have a 🛡 Shield. Hold 7 different numbers for +15 and the round ends. ×2 doubles your number total, +5 adds 5. First to the target score wins.',
  leastcount: 'Lowest hand wins. Each turn, draw from the stock or take the top discard, then throw away one card, or several cards of the same rank. When your hand total is at or under the limit, press Show. If nobody has an equal or lower total you score 0 and everyone else adds their hand total. If someone does, you take the penalty. Ace = 1, J/Q/K = 10, Joker = 0.',
  elimination: 'Draw a card to end your turn. A 💣 bomb eliminates you unless you hold a 🧯 defuse. Before drawing, play action cards: ⏭ skip your draw, ⚔️ attack (next player takes 2 turns), 👁 peek at the top 3, 🔀 shuffle the deck. Last one standing wins.' };
const MEDAL = ['🥇', '🥈', '🥉'];
function ranking(g: string, v: any): { id: string; label: string }[] {
  if (g === 'blackjack') return [...v.players].sort((a: any, b: any) => b.score - a.score).map((p: any) => ({ id: p.id, label: `${p.score} pts` }));
  if (g === 'flip7') return [...v.players].sort((a: any, b: any) => b.total - a.total).map((p: any) => ({ id: p.id, label: `${p.total} pts` }));
  if (g === 'inbetween' || g === 'leastcount') return Object.entries(v.scores).sort((a: any, b: any) => (g === 'leastcount' ? a[1] - b[1] : b[1] - a[1])).map(([id, s]: any) => ({ id, label: `${s} pts` }));
  return [...v.alive, ...[...v.eliminated].reverse()].map((id: string, i: number) => ({ id, label: i === 0 ? 'Last one standing' : 'Eliminated' }));
}
const Podium = ({ g, v, nm }: any) => <div className="podium"><h2>Final results</h2>{ranking(g, v).map((x, i) => <div key={x.id} className={'prow p' + i}><span className="medal">{MEDAL[i] || i + 1}</span><Av name={nm(x.id)} /><b>{nm(x.id)}</b><span className="grow" /><span>{x.label}</span></div>)}</div>;
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
  const me = v.players.find((p: any) => p.id === v.you), mine = v.turn === v.you && v.phase === 'play' && me?.status === 'active', last = v.log.slice(-4);
  return <div className="f7"><p className="info">Round {v.round}/{v.rounds} · first to <b>{v.target}</b> · {v.deckCount} cards left</p>
    <Bars s={Object.fromEntries(v.players.map((p: any) => [p.id, p.total]))} max={v.target} nm={nm} turn={v.turn} />
    <div className="grid">{v.players.map((p: any) => <div key={p.id} className={'pcard ' + p.status + (v.turn === p.id ? ' on' : '') + (p.id === v.you ? ' me' : '')}>
      <div className="ph"><Av name={nm(p.id)} /><b>{nm(p.id)}{p.id === v.you && ' (you)'}</b><span className={'badge ' + p.status}>{p.status === 'active' ? 'Playing' : p.status === 'stopped' ? 'Banked' : '💥 Bust'}</span></div>
      <div className="tiles">{p.nums.map((n: number) => <span key={n} className={'tile n' + n}>{n}</span>)}{p.shield && <span className="tile sp">🛡</span>}{p.x2 && <span className="tile sp">×2</span>}{p.p5 > 0 && <span className="tile sp">+5{p.p5 > 1 ? '×' + p.p5 : ''}</span>}{!p.nums.length && !p.shield && <span className="muted">no cards yet</span>}</div>
      <div className="seven">{Array.from({ length: 7 }, (_, i) => <i key={i} className={i < p.nums.length ? 'f' : ''} />)}<small>{p.nums.length}/7 for +15</small></div>
      <div className="rs">{p.status === 'bust' ? 0 : '+' + p.roundScore}<small> this round</small></div></div>)}</div>
    <div className="feed">{last.map((x: string, i: number) => <div key={x + i} className={i === last.length - 1 ? 'new' : ''}>{x}</div>)}</div>
    {mine && <div className="actions"><button className="primary big" onClick={() => act({ type: 'draw' })}>Draw a card</button><button className="gold big" onClick={() => act({ type: 'stop' })}>Bank +{me.roundScore}</button></div>}
    {mine && me.nums.length > 0 && <p className="muted">Drawing a duplicate of {me.nums.join(', ')} busts you{me.shield ? ' (your 🛡 saves you once)' : ''}.</p>}
    {v.phase === 'roundOver' && <div className="actions"><button className="primary big" onClick={() => act({ type: 'next' })}>Next round</button></div>}</div>;
}
const cval = (c: any) => c.r === 'JK' ? 0 : c.r === 'A' ? 1 : ['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r;
function LC({ v, act, nm }: any) {
  const [sel, setSel] = useState<number[]>([]);
  useEffect(() => setSel([]), [v.turnPhase, v.round, v.hand.length]);
  const play = v.phase === 'play', mine = v.turn === v.you && play, start = mine && v.turnPhase === 'start', disc = mine && v.turnPhase === 'discard';
  const lim = +(/≤ (\d+)/.exec(v.rules)?.[1] ?? 10), target = +(/Out at (\d+)/.exec(v.rules)?.[1] ?? 100);
  const tot = v.hand.reduce((a: number, c: any) => a + cval(c), 0), canShow = start && tot <= lim;
  const ranks = new Set(sel.map(i => v.hand[i].r)), okSel = sel.length > 0 && ranks.size === 1;
  const tog = (i: number) => setSel(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i]);
  const hint = !play ? '' : !mine ? `Waiting for ${nm(v.turn)}…` : start ? 'Your turn: tap the Stock or the Discard pile to draw' + (canShow ? ', or Show your hand' : '') : 'Tap the card(s) to throw away. Several cards only if they share a rank.';
  return <div className="lc">
    <div className="opps">{Object.entries(v.counts).filter(([id]) => id !== v.you).map(([id, n]: any) => <div key={id} className={'opp' + (v.turn === id ? ' on' : '')}><Av name={nm(id)} /><b>{nm(id)}</b><div className="fan">{Array.from({ length: Math.min(n, 9) }, (_, i) => <i key={i} />)}</div><small>{n} cards · {v.scores[id]} pts</small></div>)}</div>
    <div className="table">
      <div className={'pile' + (start ? ' tap' : '')} onClick={() => start && act({ type: 'draw', from: 'stock' })}><div className="card back" /><small>Stock · {v.stock}</small></div>
      <div className={'pile' + (start ? ' tap' : '')} onClick={() => start && act({ type: 'draw', from: 'discard' })}><Card c={v.discardTop} /><small>Discard</small></div></div>
    {hint && <p className={'hint-line' + (mine ? ' mine' : '')}>{hint}</p>}
    <div className="hand">{v.hand.map((c: any, i: number) => <div key={i} className="slot"><Card c={c} sel={sel.includes(i)} hint={disc && sel.length > 0 && !sel.includes(i) && ranks.has(c.r)} onClick={disc ? () => tog(i) : undefined} /><small>{cval(c)}</small></div>)}</div>
    <p className="total">Your hand: <b className={tot <= lim ? 'good' : ''}>{tot}</b> · you may Show at {lim} or less</p>
    {start && <div className="actions"><button className="primary big" onClick={() => act({ type: 'draw', from: 'stock' })}>Draw from stock</button><button className="big" onClick={() => act({ type: 'draw', from: 'discard' })}>Take discard</button><button className="gold big" disabled={!canShow} onClick={() => act({ type: 'show' })}>Show</button></div>}
    {disc && <div className="actions"><button className="primary big" disabled={!okSel} onClick={() => { act({ type: 'discard', cards: sel }); setSel([]); }}>{sel.length ? `Discard ${sel.length} card${sel.length > 1 ? 's' : ''}` : 'Pick a card'}</button>{sel.length > 1 && !okSel && <span className="muted">Selected cards must share a rank</span>}</div>}
    {v.summary && <div className="banner">{v.summary}</div>}
    {v.revealed && <div className="reveal">{Object.entries(v.revealed).map(([id, h]: any) => <div className="seat" key={id}><Av name={nm(id)} /> <b>{nm(id)}</b> <span className="chip">{h.reduce((a: number, c: any) => a + cval(c), 0)} in hand</span><Cards cs={h} /></div>)}</div>}
    {v.phase === 'roundOver' && <div className="actions"><button className="primary big" onClick={() => act({ type: 'next' })}>Next round</button></div>}
    <h4>Scores (out at {target})</h4><Bars s={v.scores} max={target} nm={nm} turn={v.turn} /></div>;
}
function EL({ v, act, nm }: any) {
  const mine = v.turn === v.you && v.phase === 'play';
  return <div><p>Alive: {v.alive.map(nm).join(', ')} · Eliminated: {v.eliminated.map(nm).join(', ') || 'none'} · Deck {v.deckCount}</p>
    {v.turn && <p>Turn: <b>{nm(v.turn)}</b> {v.turnsOwed > 1 && `(${v.turnsOwed} turns owed)`}</p>}
    <div className="row">{Object.entries(v.counts).map(([id, n]: any) => <span className="chip" key={id}>{nm(id)}: {n} cards</span>)}</div>
    <h4>Your hand</h4><div className="row">{v.hand.map((c: string, i: number) => <button key={i} className={'tcard ' + (['skip', 'peek', 'shuffle', 'attack'].includes(c) && mine ? 'play' : 'ghost')} onClick={() => mine && act({ type: 'play', card: c })}>{ICON[c]} {c}</button>)}</div>
    {v.peek && <p>Top of deck: {v.peek.join(' → ')}</p>}{mine && <Btn onClick={() => act({ type: 'draw' })}>Draw card (ends turn)</Btn>}
    <div className="chat">{v.log.slice().reverse().map((x: string, i: number) => <div key={i}>{x}</div>)}</div></div>;
}
const BOARDS: any = { blackjack: BJ, inbetween: IB, flip7: F7, leastcount: LC, elimination: EL };

function Lobby({ r, me, send, nm }: any) {
  const host = r.players.find((p: any) => p.id === me)?.isHost, g = GAMES[r.game];
  const set: any = { ...Object.fromEntries(g.set.map(([k, , d]) => [k, d])), ...r.settings };
  const cfg = (game: string, settings: any) => send({ t: 'config', game, settings });
  return <div className="lobby"><div className="codebox"><small>Room code</small><div className="code">{r.code}</div><small>Press Invite at the top and send the link to your friends</small></div>
    <div className="panel"><h4>Players ({r.players.length})</h4><div className="plist">{r.players.map((p: any) => <div className="pl" key={p.id}><Av name={p.nickname} /><b>{p.nickname}</b>{p.isHost && <span className="chip">host</span>}<span className={'dot' + (p.connected ? ' on' : '')} /><span className="grow" />{host && p.id !== me && <button className="ghost sm" onClick={() => send({ t: 'kick', playerId: p.id })}>Remove</button>}</div>)}</div></div>
    <div className="panel"><h4>Game</h4><div className="gpick">{Object.entries(GAMES).map(([k, x]) => <button key={k} disabled={!host} className={'gcard' + (r.game === k ? ' on' : '')} onClick={() => cfg(k, {})}><span className="gi">{META[k][0]}</span><b>{x.name}</b><small>{META[k][1]}</small></button>)}</div>
      <p className="muted">{RULES[r.game]}</p>
      <div className="settings">{g.set.map(([k, label, d]) => <label key={k}>{label}{typeof d === 'boolean'
        ? <input type="checkbox" disabled={!host} checked={!!set[k]} onChange={e => cfg(r.game, { ...set, [k]: e.target.checked })} />
        : <input type="number" disabled={!host} value={set[k]} onChange={e => cfg(r.game, { ...set, [k]: +e.target.value })} />}</label>)}</div></div>
    {host ? <button className="primary big" onClick={() => send({ t: 'start' })}>Start game</button> : <p className="muted center">Waiting for the host to start…</p>}</div>;
}
function Room({ code, nick, create, leave }: any) {
  const { room, view, chat, err, me, online, flash, send, act } = useRoom(code, nick, create);
  const [txt, setTxt] = useState(''), [help, setHelp] = useState(false), [chatOpen, setChatOpen] = useState(false);
  const nm = (id: string) => room?.players.find((p: any) => p.id === id)?.nickname ?? String(id).slice(0, 4);
  const Board = room && BOARDS[room.game], host = room?.players.find((p: any) => p.id === me)?.isHost;
  const turn = room?.status === 'active' ? view?.turn : null, mineTurn = !!turn && turn === me;
  useEffect(() => { if (mineTurn) navigator.vibrate?.(120); }, [mineTurn]);
  const link = `${location.origin}/?room=${code}`;
  return <div className="wrap"><div className="top"><h2>Room <span className="code sm">{code}</span></h2><div className="row"><span className={'chip ' + (online ? 'ok' : 'bad')}>{online ? 'Connected' : 'Reconnecting…'}</span>
    {room && <button className="ghost" onClick={() => setHelp(true)}>How to play</button>}<button className="ghost" onClick={() => navigator.clipboard?.writeText(link)}>Invite</button>
    <button className="ghost chatbtn" onClick={() => setChatOpen(o => !o)}>Chat {chat.length}</button><button className="ghost" onClick={leave}>Leave</button></div></div>
    {err && <div className="err">{err}</div>}{flash && <div className="flash">{nm(flash.from)} {flash.emoji}</div>}
    {turn && <div className={'turnbar' + (mineTurn ? ' mine' : '')}>{mineTurn ? 'Your turn' : `${nm(turn)} is playing…`}</div>}
    {help && room && <div className="modal" onClick={() => setHelp(false)}><div className="mbox"><h3>{GAMES[room.game].name}</h3><p>{RULES[room.game]}</p><button className="primary" onClick={() => setHelp(false)}>Got it</button></div></div>}
    <div className="layout"><div>{!room ? <p className="muted">Connecting…</p> : room.status === 'waiting' ? <Lobby r={room} me={me} send={send} nm={nm} /> :
      <div className="panel board">{room.status === 'completed' && view && <><Podium g={room.game} v={view} nm={nm} />{host ? <div className="actions"><button className="primary big" onClick={() => send({ t: 'rematch' })}>Play again</button></div> : <p className="muted center">Waiting for the host to start a rematch.</p>}</>}
        {view ? <Board v={view} act={act} nm={nm} /> : <p>Loading…</p>}</div>}</div>
      <div className={'panel side' + (chatOpen ? ' open' : '')}><h4>Players</h4>{room?.players.map((p: any) => <div className="pl" key={p.id}><Av name={p.nickname} size={24} />{p.nickname}{p.isHost ? ' (host)' : ''}<span className="grow" /><span className={'dot' + (p.connected ? ' on' : '')} /></div>)}
        <h4>Chat</h4><div className="chat">{chat.map((m, i) => <div key={i} className={m.system ? 'sys' : ''}>{m.system ? '' : <b>{m.from}: </b>}{m.text}</div>)}</div>
        <div className="row">{EMOJI.map(e => <button key={e} className="ghost sm" onClick={() => send({ t: 'react', emoji: e })}>{e}</button>)}</div>
        <input style={{ width: '100%' }} value={txt} maxLength={300} placeholder="Message…" onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && txt.trim()) { send({ t: 'chat', text: txt }); setTxt(''); } }} /></div></div></div>;
}
function Home({ initial, onEnter }: any) {
  const [nick, setNick] = useState(localStorage.getItem('cr_nick') || ''), [code, setCode] = useState(initial), [e, setE] = useState('');
  const go = (c: string, create = false) => { const n = nick.trim(); if (!n) return setE('Enter a nickname first'); localStorage.setItem('cr_nick', n); onEnter(c.toUpperCase(), n, create); };
  const create = () => go(newCode(), true);
  return <div className="home panel"><h1>Cardroom</h1><p className="muted">Private card games with friends. No sign-up.</p><input placeholder="Your nickname" maxLength={16} value={nick} onChange={e => setNick(e.target.value)} />
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
