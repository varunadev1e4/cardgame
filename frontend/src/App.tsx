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
  crazy8: { name: 'Crazy Eights', set: [] },
  bluff: { name: 'Bluff (Cheat)', set: [] },
  gofish: { name: 'Go Fish', set: [] },
  ttt: { name: 'Tic-Tac-Toe', set: [] }, c4: { name: 'Connect Four', set: [] },
  dab: { name: 'Dots and Boxes', set: [['size', 'Boxes per side (2-6)', 3]] },
  nim: { name: 'Nim', set: [['piles', 'Piles (2-8)', 4], ['maxTake', 'Max per turn (0 = any)', 0], ['misere', 'Misère: last mover loses', false]] },
  rps: { name: 'Rock Paper Scissors', set: [['bestOf', 'Best of (3 or 5)', 3]] },
  sl: { name: 'Snakes and Ladders', set: [['exact', 'Exact roll to finish', true], ['sixExtra', 'Extra turn on a 6', false]] },
  ludo: { name: 'Ludo', set: [['enterOnSix', 'Need a 6 to leave the yard', true], ['sixExtra', 'Extra turn on a 6', true], ['captureExtra', 'Extra turn on capture', true]] },
  bs: { name: 'Battleship', set: [['hitAgain', 'A hit earns another shot', false]] },
  wg: { name: 'Word Guessing', set: [['category', 'Category (1 Animals, 2 Food, 3 Countries, 4 Tech)', 1], ['difficulty', 'Difficulty (1 easy to 3 hard)', 2], ['team', 'Team mode (2 teams)', false]] },
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
const fx = (x: string, nm: any) => x.replace(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/g, id => nm(id));
const hue = (s: string) => [...String(s)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 360;
const Av = ({ name, size = 32 }: any) => <span className="av" style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${hue(name)} 45% 38%)` }}>{String(name || '?')[0]?.toUpperCase()}</span>;
const Scores = ({ s, nm, turn }: any) => <div className="row">{Object.entries(s).map(([id, v]: any) => <span className={'pill' + (turn === id ? ' on' : '')} key={id}><Av name={nm(id)} size={22} />{nm(id)} <b>{v}</b></span>)}</div>;
const Bars = ({ s, max, nm, turn }: any) => <div className="bars">{Object.entries(s).map(([id, x]: any) => <div key={id} className={'bar' + (turn === id ? ' on' : '')}><Av name={nm(id)} size={24} /><span className="bn">{nm(id)}</span><div className="track"><div style={{ width: Math.min(100, Math.max(0, (x / max) * 100)) + '%' }} /></div><b>{x}</b></div>)}</div>;
const META: Record<string, [string, string]> = { blackjack: ['🂡', 'Beat the dealer to 21'], inbetween: ['🎯', 'Bet a card lands between two others'], flip7: ['🎲', 'Push your luck, bank your points'], leastcount: ['🃏', 'Keep the lowest hand'], elimination: ['💣', 'Dodge bombs, outwit opponents'], crazy8: ['8️⃣', 'Match suit or rank, 8s are wild'], bluff: ['🤥', 'Lie with your cards, catch the liars'], gofish: ['🐟', 'Ask for cards, collect books'], ttt: ['❌', 'Three in a row'], c4: ['🔴', 'Drop discs, connect four'], dab: ['🔲', 'Close boxes, score points'], nim: ['🪨', 'Take stones, make the last move'], rps: ['✊', 'Best-of rock paper scissors'], sl: ['🐍', 'Race to square 100'], ludo: ['🎲', 'Bring four tokens home'], bs: ['🚢', 'Sink the hidden fleet'], wg: ['🔤', 'Guess the secret word'] };
const ICON: Record<string, string> = { bomb: '💣', defuse: '🧯', skip: '⏭', peek: '👁', shuffle: '🔀', attack: '⚔️' };
const RULES: Record<string, string> = {
  blackjack: 'Get closer to 21 than the dealer without going over. Hit draws a card, Stand stops, Double draws exactly one card for double stakes. A two-card 21 pays 1.5.',
  inbetween: 'On your turn you see two cards. Bet that the next card lands strictly between them, or pass. Between: +1. Outside: -1. Matching a card exactly costs extra. Pairs with no gap are skipped automatically.',
  flip7: 'On your turn, Draw or Bank. Every number can be held only once, so drawing a number you already hold busts you for 0 this round, unless you have a 🛡 Shield. Hold 7 different numbers for +15 and the round ends. ×2 doubles your number total, +5 adds 5. First to the target score wins.',
  leastcount: 'Lowest hand wins. Each turn, draw from the stock or take the top discard, then throw away one card, or several cards of the same rank. When your hand total is at or under the limit, press Show. If nobody has an equal or lower total you score 0 and everyone else adds their hand total. If someone does, you take the penalty. Ace = 1, J/Q/K = 10, Joker = 0.',
  elimination: 'Draw a card to end your turn. A 💣 bomb eliminates you unless you hold a 🧯 defuse. Before drawing, play action cards: ⏭ skip your draw, ⚔️ attack (next player takes 2 turns), 👁 peek at the top 3, 🔀 shuffle the deck. Last one standing wins.',
  crazy8: 'Be first to empty your hand. Play a card that matches the top card by suit or rank. 8s are wild and let you pick the suit. A 2 makes the next player draw 2 and lose their turn, a Jack skips the next player. Can’t play? Draw a card; if it fits you may play it.',
  bluff: 'Get rid of all your cards. Each turn you play 1 to 4 cards face down and claim they are the required rank (A, 2, 3, … K, then around again). You may lie! The next player can Call bluff: if you lied you take the whole pile, if you told the truth they take it. Win by playing your last cards without being caught.',
  gofish: 'On your turn, pick a rank you hold and ask another player for it. If they have any, they hand them all over and you go again. If not, “Go Fish” and draw a card. Four of a kind makes a book. Most books wins.',
  ttt: 'Take turns placing your mark. Three in a row, column or diagonal wins. A full board is a draw.',
  c4: 'Take turns dropping a disc into a column. The first to line up four discs in a row, column or diagonal wins.',
  dab: 'Take turns drawing a line between two neighbouring dots. Closing the fourth side of a box scores it and gives you another turn. Most boxes wins.',
  nim: 'Take turns removing stones from ONE pile: tap a stone to take it and every stone to its right. In normal play whoever takes the last stone wins; in misère play they lose.',
  rps: 'Both players pick at the same time and picks stay hidden until both have chosen. Rock beats scissors, scissors beat paper, paper beats rock. Ties are replayed. First to the needed wins takes the match.',
  sl: 'Roll the dice and move forward. Ladders 🪜 lift you up, snakes 🐍 drop you down. Reach square 100 first. With exact finish on, you must roll the exact number to land on 100.',
  ludo: 'Roll to move. A 6 (if required) brings a token out. Walk your tokens around the ring, then up your coloured home column. Landing on an opponent’s token (not on a safe ★ or start square) sends it back to the yard. Get all four tokens home first. A token needs an exact roll to finish.',
  bs: 'Place your five ships secretly (or hit Random). Then take turns firing at squares on the enemy grid. Hits and misses are shown, and a ship is revealed only when sunk. Sink the whole enemy fleet first.',
  wg: 'A secret word is chosen. Take turns guessing a letter or the whole word. A right letter keeps your turn, a wrong guess costs a life. Run out of lives and you are out. In team mode two teams share lives.' };
const MEDAL = ['🥇', '🥈', '🥉'];
function ranking(g: string, v: any): { id: string; label: string }[] {
  if (v.final) return v.final;
  if (g === 'crazy8') return Object.keys(v.counts).sort((a, b) => (a === v.winner ? -1 : b === v.winner ? 1 : v.points[a] - v.points[b])).map(id => ({ id, label: id === v.winner ? 'Went out first' : `${v.points[id]} pts left` }));
  if (g === 'bluff') return Object.keys(v.counts).sort((a, b) => v.counts[a] - v.counts[b]).map(id => ({ id, label: `${v.counts[id]} cards left` }));
  if (g === 'gofish') return Object.keys(v.counts).sort((a, b) => v.books[b].length - v.books[a].length).map(id => ({ id, label: `${v.books[id].length} books` }));
  if (g === 'blackjack') return [...v.players].sort((a: any, b: any) => b.score - a.score).map((p: any) => ({ id: p.id, label: `${p.score} pts` }));
  if (g === 'flip7') return [...v.players].sort((a: any, b: any) => b.total - a.total).map((p: any) => ({ id: p.id, label: `${p.total} pts` }));
  if (g === 'inbetween' || g === 'leastcount') return Object.entries(v.scores).sort((a: any, b: any) => (g === 'leastcount' ? a[1] - b[1] : b[1] - a[1])).map(([id, s]: any) => ({ id, label: `${s} pts` }));
  return [...v.alive, ...[...v.eliminated].reverse()].map((id: string, i: number) => ({ id, label: i === 0 ? 'Last one standing' : 'Eliminated' }));
}
const Podium = ({ g, v, nm }: any) => <div className="podium"><h2>Final results</h2>{ranking(g, v).map((x, i) => <div key={x.id} className={'prow p' + i}><span className="medal">{MEDAL[i] || i + 1}</span><Av name={nm(x.id)} /><b>{nm(x.id)}</b><span className="grow" /><span>{x.label}</span></div>)}</div>;
const Btn = ({ onClick, children, ghost }: any) => <button className={ghost ? 'ghost' : ''} onClick={onClick}>{children}</button>;

const bjBadge: any = { win: ['Win', 'ok'], blackjack: ['Blackjack!', 'ok'], push: ['Push', 'mute'], loss: ['Lose', 'bad'] };
function BJ({ v, act, nm }: any) {
  const me = v.players.find((p: any) => p.id === v.you), mine = v.phase === 'player' && v.turn === v.you;
  const badge = (p: any) => p.last ? bjBadge[p.last] : p.status === 'bust' ? ['Bust', 'bad'] : p.status === 'blackjack' ? ['Blackjack!', 'ok'] : p.status === 'stand' ? ['Stand', 'mute'] : null;
  return <div className="bj"><p className="info">Round {v.round}/{v.rounds}</p>
    <div className="dealer"><div className="ph"><b>Dealer</b>{v.dealerTotal != null && <span className="tot">{v.dealerTotal}</span>}</div><div className="stack">{v.dealer.map((c: any, i: number) => <Card key={i} c={c} />)}</div></div>
    <div className="seats">{v.players.map((p: any) => { const b = badge(p); return <div key={p.id} className={'seat' + (v.turn === p.id ? ' turn' : '') + (p.id === v.you ? ' me' : '')}>
      <div className="ph"><Av name={nm(p.id)} /><b>{nm(p.id)}{p.id === v.you && ' (you)'}</b><span className="grow" />{b && <span className={'res ' + b[1]}>{b[0]}</span>}</div>
      <div className="stack">{p.hand.map((c: any, i: number) => <Card key={i} c={c} />)}</div>
      <div className="ph"><span className="tot">{p.total}</span><span className="grow" /><span className="muted">score {p.score}</span></div></div>; })}</div>
    {v.phase === 'player' && !mine && <p className="hint-line">Waiting for {nm(v.turn)}…</p>}
    {mine && <div className="actions"><button className="primary big" onClick={() => act({ type: 'hit' })}>Hit</button><button className="big" onClick={() => act({ type: 'stand' })}>Stand</button><button className="gold big" disabled={me?.hand.length !== 2} onClick={() => act({ type: 'double' })}>Double</button></div>}
    {v.phase === 'roundOver' && <div className="actions"><button className="primary big" onClick={() => act({ type: 'next' })}>Next round</button></div>}</div>;
}
function IB({ v, act, nm }: any) {
  const l = v.last, mine = !!v.pair && v.phase === 'play', ah = /Ace high/.test(v.rules);
  const rv = (c: any) => c.r === 'A' ? (ah ? 14 : 1) : c.r === 'J' ? 11 : c.r === 'Q' ? 12 : c.r === 'K' ? 13 : +c.r;
  const gap = mine ? rv(v.pair[1]) - rv(v.pair[0]) - 1 : 0, pct = Math.round(gap * 4 / 50 * 100);
  return <div className="ib"><p className="info">Round {v.round}/{v.rounds}</p>
    {v.phase === 'play' && <><div className="gate">{mine ? <Card c={v.pair[0]} /> : <Card />}<div className="slot3">?</div>{mine ? <Card c={v.pair[1]} /> : <Card />}</div>
      {mine ? <><p className="hint-line mine">{gap} card value{gap === 1 ? '' : 's'} fit between · about {pct}% chance</p>
        <div className="actions"><button className="primary big" onClick={() => act({ type: 'in' })}>Bet: lands between</button><button className="big" onClick={() => act({ type: 'pass' })}>Pass</button></div></>
        : <p className="hint-line">{nm(v.turn)} is deciding…</p>}</>}
    {l && <div className={'last ' + (l.delta > 0 ? 'ok' : l.delta < 0 ? 'bad' : '')}><div className="ph"><Av name={nm(l.pid)} /><b>{nm(l.pid)}</b><span className="grow" /><span className={'res ' + (l.delta > 0 ? 'ok' : l.delta < 0 ? 'bad' : 'mute')}>{l.result} {l.delta > 0 ? '+' : ''}{l.delta}</span></div>
      <div className="gate"><Card c={l.pair[0]} sm />{l.third ? <Card c={l.third} sm /> : <div className="slot3 sm">–</div>}<Card c={l.pair[1]} sm /></div></div>}
    <h4>Scores</h4><Scores s={v.scores} nm={nm} turn={v.turn} /></div>;
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
    <div className="feed">{last.map((x: string, i: number) => <div key={x + i} className={i === last.length - 1 ? 'new' : ''}>{fx(x, nm)}</div>)}</div>
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
const FX: Record<string, string> = { bomb: 'Eliminates you', defuse: 'Saves you from a bomb', skip: 'End your turn without drawing', attack: 'Next player takes 2 turns', peek: 'See the top 3 cards', shuffle: 'Shuffle the draw pile' };
function EL({ v, act, nm }: any) {
  const mine = v.turn === v.you && v.phase === 'play', out = v.eliminated.includes(v.you), playable = (c: string) => ['skip', 'peek', 'shuffle', 'attack'].includes(c);
  return <div className="el"><div className="opps">{Object.entries(v.counts).map(([id, n]: any) => { const dead = v.eliminated.includes(id); return <div key={id} className={'opp' + (v.turn === id ? ' on' : '') + (dead ? ' dead' : '')}><Av name={nm(id)} /><b>{nm(id)}{id === v.you && ' (you)'}</b><small>{dead ? '💀 out' : `${n} cards`}</small></div>; })}</div>
    <div className="table"><div className="pile"><div className="card back" /><small>Draw pile · {v.deckCount}</small></div>
      {v.peek && <div className="pile"><div className="row">{v.peek.map((c: string, i: number) => <span key={i} className="fxmini">{ICON[c]}<small>{c}</small></span>)}</div><small>Top 3 (next card first)</small></div>}</div>
    {out && <div className="banner">You were eliminated. Watch the rest of the game.</div>}
    {mine && v.turnsOwed > 1 && <p className="hint-line mine">You were attacked: take {v.turnsOwed} turns.</p>}
    {!out && <><h4>Your hand</h4><div className="hand">{v.hand.map((c: string, i: number) => playable(c) ? <button key={i} disabled={!mine} className={'fxcard ' + c} onClick={() => act({ type: 'play', card: c })}><span className="gi">{ICON[c]}</span><b>{c}</b><small>{FX[c]}</small></button> : <div key={i} className={'fxcard static ' + c}><span className="gi">{ICON[c]}</span><b>{c}</b><small>{FX[c]}</small></div>)}</div></>}
    {mine && <div className="actions"><button className="primary big" onClick={() => act({ type: 'draw' })}>Draw a card (ends your turn)</button></div>}
    <div className="feed">{v.log.slice(-6).reverse().map((x: string, i: number) => <div key={x + i} className={i === 0 ? 'new' : ''}>{fx(x, nm)}</div>)}</div></div>;
}
const SY: any = { S: '♠', H: '♥', D: '♦', C: '♣' };
const Opps = ({ v, nm, extra, pick, onPick }: any) => <div className="opps">{Object.entries(v.counts).filter(([id]) => id !== v.you).map(([id, n]: any) => <div key={id} onClick={() => onPick?.(id, n)} className={'opp' + (v.turn === id ? ' on' : '') + (pick === id ? ' pick' : '')}><Av name={nm(id)} /><b>{nm(id)}</b><div className="fan">{Array.from({ length: Math.min(n, 9) }, (_, i) => <i key={i} />)}</div><small>{n} cards{extra?.(id)}</small></div>)}</div>;
const Feed = ({ log, nm }: any) => <div className="feed">{log.slice().reverse().map((x: string, i: number) => <div key={x + i} className={i === 0 ? 'new' : ''}>{fx(x, nm)}</div>)}</div>;
function CE({ v, act, nm }: any) {
  const [wild, setWild] = useState<number | null>(null);
  useEffect(() => setWild(null), [v.turn, v.hand.length]);
  const mine = !v.winner && v.turn === v.you, ok = (c: any) => c.r === '8' || c.s === v.suit || c.r === v.top.r;
  return <div className="ce"><Opps v={v} nm={nm} />
    <div className="table"><div className={'pile' + (mine && !v.drew ? ' tap' : '')} onClick={() => mine && !v.drew && act({ type: 'draw' })}><div className="card back" /><small>Draw · {v.deckCount}</small></div>
      <div className="pile"><Card c={v.top} /><small>Top card</small></div>
      <div className="pile"><span className={'suitbig' + (v.suit === 'H' || v.suit === 'D' ? ' red' : '')}>{SY[v.suit]}</span><small>Play this suit</small></div></div>
    {mine && <p className="hint-line mine">{v.drew ? 'You drew a playable card: play it or pass' : 'Play a glowing card, or tap the draw pile'}</p>}
    <div className="hand">{v.hand.map((c: any, i: number) => <div key={i} className={'slot' + (mine && !ok(c) ? ' dim' : '')}><Card c={c} hint={mine && ok(c)} onClick={mine && ok(c) ? () => (c.r === '8' ? setWild(i) : act({ type: 'play', i })) : undefined} /></div>)}</div>
    {wild != null && <div className="actions"><span>Pick a suit:</span>{['S', 'H', 'D', 'C'].map(s => <button key={s} className="big" onClick={() => { act({ type: 'play', i: wild, suit: s }); setWild(null); }}>{SY[s]}</button>)}</div>}
    {mine && wild == null && <div className="actions">{!v.drew && <button className="primary big" onClick={() => act({ type: 'draw' })}>Draw a card</button>}{v.drew && <button className="big" onClick={() => act({ type: 'pass' })}>Pass</button>}</div>}
    <Feed log={v.log} nm={nm} /></div>;
}
function BL({ v, act, nm }: any) {
  const [sel, setSel] = useState<number[]>([]);
  useEffect(() => setSel([]), [v.turn, v.hand.length]);
  const mine = !v.winner && v.turn === v.you, play = mine && !v.pendingWin, r = v.reveal;
  const tog = (i: number) => setSel(s => s.includes(i) ? s.filter(x => x !== i) : s.length < 4 ? [...s, i] : s);
  return <div className="bl"><Opps v={v} nm={nm} />
    <div className="table"><div className="pile"><div className="stack">{Array.from({ length: Math.min(5, Math.max(1, v.pile)) }, (_, i) => <div key={i} className="card back" />)}</div><small>Pile · {v.pile} cards</small></div>
      <div className="pile"><span className="suitbig">{v.nextRank}</span><small>{mine ? 'You must claim' : 'Next claim'}</small></div></div>
    {v.claim && <p className="hint-line mine">{nm(v.claim.by)} says: {v.claim.n} × {v.claim.rank}</p>}
    {mine && <p className="hint-line">{v.pendingWin ? `${nm(v.pendingWin)} played their last cards. Call bluff or accept.` : v.claim ? `Call bluff, or play 1–4 cards and claim ${v.nextRank}` : `Play 1–4 cards and claim ${v.nextRank}`}</p>}
    {r && <div className={'banner'}>{nm(r.by)} claimed {r.n} × {r.rank}: {r.honest ? 'honest!' : 'a bluff!'} {nm(r.loser)} takes the pile.<div className="row">{r.cards.map((c: any, i: number) => <Card key={i} c={c} sm />)}</div></div>}
    <div className="hand">{v.hand.map((c: any, i: number) => <Card key={i} c={c} sel={sel.includes(i)} onClick={play ? () => tog(i) : undefined} />)}</div>
    {mine && <div className="actions">{play && <button className="primary big" disabled={!sel.length} onClick={() => { act({ type: 'play', cards: sel }); setSel([]); }}>{sel.length ? `Play ${sel.length} as ${v.nextRank}` : 'Pick cards'}</button>}
      {v.canCall && <button className="big danger" onClick={() => act({ type: 'call' })}>Call bluff!</button>}{v.pendingWin && <button className="big" onClick={() => act({ type: 'accept' })}>Accept</button>}</div>}
    <Feed log={v.log} nm={nm} /></div>;
}
function GF({ v, act, nm }: any) {
  const [rank, setRank] = useState(''), [target, setTarget] = useState('');
  useEffect(() => { setRank(''); setTarget(''); }, [v.turn, v.hand.length]);
  const mine = v.phase === 'play' && v.turn === v.you;
  return <div className="gf"><Opps v={v} nm={nm} pick={target} onPick={(id: string, n: number) => mine && n > 0 && setTarget(id)} extra={(id: string) => ` · ${v.books[id].length} books`} />
    <div className="table"><div className="pile"><div className="card back" /><small>Pond · {v.deckCount}</small></div></div>
    {mine && <p className="hint-line mine">{!rank ? '1. Tap a rank you hold' : !target ? '2. Tap the player you want to ask' : `Ask ${nm(target)} for ${rank}s`}</p>}
    <div className="hand">{v.hand.map((c: any, i: number) => <Card key={i} c={c} sel={c.r === rank} onClick={mine ? () => setRank(c.r) : undefined} />)}</div>
    {mine && <div className="actions"><button className="primary big" disabled={!rank || !target} onClick={() => act({ type: 'ask', target, rank })}>Ask for {rank || '…'}s</button></div>}
    <p className="total">Your books: {v.books[v.you].join(' ') || 'none yet'}</p><Feed log={v.log} nm={nm} /></div>;
}
const COL = ['#e3b44f', '#5ec2ff', '#ff7a8a', '#7ee2a8'];
const Grid = ({ cols, children, cls }: any) => <div className={cls} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)` }}>{children}</div>;
function TT({ v, act, nm }: any) {
  const mine = v.turn === v.you;
  return <div className="center"><p className="info">{nm(v.ids[0])} ✕ vs {nm(v.ids[1])} ◯</p><Grid cols={3} cls="ttt">{v.b.map((x: any, i: number) => <button key={i} disabled={!mine || x !== null} className={'cell' + (v.line?.includes(i) ? ' win' : '')} onClick={() => act({ type: 'place', i })}>{x === null ? '' : x === 0 ? '✕' : '◯'}</button>)}</Grid>{v.draw && <div className="banner">It’s a draw</div>}</div>;
}
function C4({ v, act, nm }: any) {
  const mine = v.turn === v.you;
  return <div className="center"><p className="info">{nm(v.ids[0])} 🟡 vs {nm(v.ids[1])} 🔴</p><Grid cols={7} cls="c4">{Array.from({ length: 7 }, (_, c) => <button key={c} className="ghost sm" disabled={!mine} onClick={() => act({ type: 'drop', col: c })}>▼</button>)}
    {v.b.map((x: any, i: number) => <span key={i} className={'disc' + (v.line?.includes(i) ? ' win' : '')} style={{ background: x === null ? '#0a2e24' : ['#e3b44f', '#ff6f7f'][x] }} />)}</Grid>{v.draw && <div className="banner">It’s a draw</div>}</div>;
}
function DB({ v, act, nm }: any) {
  const n = v.n, S = 56, M = 20, W = n * S + 2 * M, mine = v.turn === v.you, c2 = ['#e3b44f', '#5ec2ff'];
  const ln = (k: string, r: number, c: number, o: any) => { const x1 = M + c * S, y1 = M + r * S, x2 = k === 'h' ? x1 + S : x1, y2 = k === 'h' ? y1 : y1 + S; return <g key={k + r + c}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={o === null ? '#1f6350' : c2[o]} strokeWidth={o === null ? 4 : 7} strokeLinecap="round" />
    {o === null && mine && <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={22} style={{ cursor: 'pointer' }} onClick={() => act({ type: 'line', k, r, c })} />}</g>; };
  return <div className="center"><p className="info"><b style={{ color: c2[0] }}>{nm(v.ids[0])} {v.score[0]}</b> – <b style={{ color: c2[1] }}>{v.score[1]} {nm(v.ids[1])}</b></p>
    <svg viewBox={`0 0 ${W} ${W}`} style={{ maxWidth: 440, width: '100%' }}>
      {v.box.map((row: any[], r: number) => row.map((o, c) => o !== null && <rect key={r + '_' + c} x={M + c * S + 4} y={M + r * S + 4} width={S - 8} height={S - 8} rx={8} fill={c2[o]} opacity={0.5} />))}
      {v.h.map((row: any[], r: number) => row.map((o, c) => ln('h', r, c, o)))}{v.v.map((row: any[], r: number) => row.map((o, c) => ln('v', r, c, o)))}
      {Array.from({ length: (n + 1) * (n + 1) }, (_, i) => <circle key={i} cx={M + (i % (n + 1)) * S} cy={M + Math.floor(i / (n + 1)) * S} r={5} fill="#f3ecd9" />)}</svg></div>;
}
function NM({ v, act }: any) {
  const [sel, setSel] = useState<[number, number] | null>(null), mine = v.turn === v.you;
  useEffect(() => setSel(null), [v.turn, v.piles.join()]);
  const can = (n: number) => mine && (v.maxTake === 0 || n <= v.maxTake);
  return <div><p className="info">{v.misere ? 'Misère: taking the last stone loses' : 'Taking the last stone wins'}{v.maxTake > 0 && ` · max ${v.maxTake} per turn`}</p>
    {v.piles.map((p: number, i: number) => <div className="pile-row" key={i}><b>#{i + 1}</b>{Array.from({ length: p }, (_, k) => <span key={k} className={'stone' + (sel && sel[0] === i && k >= p - sel[1] ? ' sel' : '') + (can(p - k) ? ' tap' : '')} onClick={() => can(p - k) && setSel([i, p - k])} />)}<small>{p}</small></div>)}
    {mine && <div className="actions"><button className="primary big" disabled={!sel} onClick={() => act({ type: 'take', pile: sel![0], n: sel![1] })}>{sel ? `Take ${sel[1]} from pile ${sel[0] + 1}` : 'Tap stones to take them'}</button></div>}</div>;
}
function RP({ v, act, nm }: any) {
  const E: any = { rock: '✊', paper: '✋', scissors: '✌️' }, last = v.history[v.history.length - 1];
  return <div className="center"><p className="info">Best of {v.bestOf} · first to {v.need} · round {v.round}</p><Scores s={v.wins} nm={nm} />
    {!v.winner && <><p className="hint-line mine">{v.myPick ? `You chose ${E[v.myPick]}. Waiting for the other player…` : 'Choose your move'}</p><div className="actions">{Object.keys(E).map(k => <button key={k} disabled={!!v.myPick} className={'big rps' + (v.myPick === k ? ' primary' : '')} onClick={() => act({ type: 'choose', pick: k })}>{E[k]}</button>)}</div></>}
    {last && <div className="last"><b>Round {last.round}:</b> {v.ids.map((id: string) => `${nm(id)} ${E[last.picks[id]]}`).join('  vs  ')} → {last.winner ? `${nm(last.winner)} wins the round` : 'tie, replay'}</div>}</div>;
}
function SL({ v, act, nm }: any) {
  const mine = v.turn === v.you, rows = [];
  for (let i = 9; i >= 0; i--) rows.push(Array.from({ length: 10 }, (_, k) => (i % 2 === 0 ? i * 10 + k + 1 : i * 10 + 10 - k)));
  return <div className="center"><Scores s={v.pos} nm={nm} turn={v.turn} />
    <div className="slboard">{rows.flat().map(n => <div key={n} className={'sq' + (v.jumps[n] ? (v.jumps[n] > n ? ' lad' : ' snk') : '')}><small>{n}</small>{v.jumps[n] && <i>{v.jumps[n] > n ? '🪜' : '🐍'}{v.jumps[n]}</i>}<span>{v.ids.filter((id: string) => v.pos[id] === n).map((id: string) => <b key={id} className="tok" style={{ background: COL[v.ids.indexOf(id)] }} />)}</span></div>)}</div>
    {v.last && <p className="hint-line mine">{nm(v.last.pid)} rolled 🎲 {v.last.roll} {v.last.event && `· ${v.last.event}`}</p>}
    {mine && <div className="actions"><button className="primary big" onClick={() => act({ type: 'roll' })}>Roll the dice</button></div>}</div>;
}
function LU({ v, act, nm }: any) {
  const mine = v.turn === v.you, C0 = 200, ang = (a: number) => (a / 52) * 2 * Math.PI - Math.PI / 2, P = (a: number, r: number) => [C0 + r * Math.cos(ang(a)), C0 + r * Math.sin(ang(a))];
  const xy = (id: string, pos: number, t: number) => { const s = v.seats[id];
    if (pos === -1) { const [x, y] = P(s * 13 - 1.2, 178); return [x + (t % 2) * 18 - 9, y + Math.floor(t / 2) * 18 - 9]; }
    if (pos <= 50) return P((s * 13 + pos) % 52, 140);
    if (pos < 56) return P((s * 13 + 50) % 52, 140 - (pos - 50) * 20);
    return [C0 + (s % 2 ? 1 : -1) * 16 + t * 3, C0 + (s < 2 ? -1 : 1) * 12 + t * 3]; };
  return <div className="center"><svg viewBox="0 0 400 400" style={{ maxWidth: 460, width: '100%' }}>
    {Array.from({ length: 52 }, (_, a) => { const [x, y] = P(a, 140), st = a % 13 === 0, sf = [8, 21, 34, 47].includes(a); return <g key={a}><circle cx={x} cy={y} r={9} fill={st ? COL[a / 13] : '#0a2e24'} opacity={st ? 0.7 : 1} stroke="#1f6350" />{sf && <text x={x} y={y + 4} fontSize="11" textAnchor="middle" fill="#e3b44f">★</text>}</g>; })}
    {[0, 1, 2, 3].flatMap(s => Array.from({ length: 5 }, (_, k) => { const [x, y] = P((s * 13 + 50) % 52, 120 - k * 20); return <circle key={s + '_' + k} cx={x} cy={y} r={7} fill={COL[s]} opacity={0.35} />; }))}
    <circle cx={C0} cy={C0} r={24} fill="#0a2e24" stroke="#1f6350" />
    {v.ids.flatMap((id: string) => v.tok[id].map((pos: number, t: number) => { const [x, y] = xy(id, pos, t), leg = id === v.you && mine && v.phase === 'move' && v.legal.includes(t);
      return <circle key={id + t} cx={x} cy={y} r={9} fill={COL[v.seats[id]]} stroke={leg ? '#fff' : '#1b1b1b'} strokeWidth={leg ? 3 : 1.5} style={{ cursor: leg ? 'pointer' : 'default' }} onClick={() => leg && act({ type: 'move', t })} />; }))}</svg>
    <div className="row" style={{ justifyContent: 'center' }}>{v.ids.map((id: string) => <span key={id} className="pill" style={{ borderColor: COL[v.seats[id]] }}><b className="tok" style={{ background: COL[v.seats[id]] }} />{nm(id)} · {v.tok[id].filter((p: number) => p === 56).length}/4 home</span>)}</div>
    {v.dice && <p className="hint-line mine">🎲 {v.dice}</p>}
    {mine && v.phase === 'roll' && <div className="actions"><button className="primary big" onClick={() => act({ type: 'roll' })}>Roll the dice</button></div>}
    {mine && v.phase === 'move' && <p className="hint-line mine">Tap a glowing token to move it {v.dice} steps</p>}<Feed log={v.log} nm={nm} /></div>;
}
function BS({ v, act }: any) {
  const FLEET = [5, 4, 3, 3, 2], [ships, setShips] = useState<any[]>([]), [dir, setDir] = useState('h'), mine = v.turn === v.you;
  const cl = (s: any) => Array.from({ length: s.len }, (_, k) => s.dir === 'h' ? s.r * 10 + s.c + k : (s.r + k) * 10 + s.c);
  const occ = new Set(ships.flatMap(cl)), next = FLEET[ships.length];
  const put = (i: number) => { if (next == null) return; const r = Math.floor(i / 10), c = i % 10, s = { r, c, len: next, dir }; if (dir === 'h' ? c + next > 10 : r + next > 10) return; if (cl(s).some(x => occ.has(x))) return; setShips([...ships, s]); };
  const mineSet = new Set(v.myShips.flatMap((s: any) => s.cells)), sunk = new Set(v.enemySunk.flatMap((s: any) => s.cells));
  if (v.phase === 'place') return <div className="center">{v.ready[v.you] ? <p className="hint-line mine">Fleet ready. Waiting for your opponent…</p> : <>
    <p className="hint-line mine">{next ? `Tap a square to place your ship of length ${next} (${dir === 'h' ? 'horizontal' : 'vertical'})` : 'All ships placed'}</p>
    <Grid cols={10} cls="bsgrid">{Array.from({ length: 100 }, (_, i) => <div key={i} className={'bc' + (occ.has(i) ? ' ship' : '')} onClick={() => put(i)} />)}</Grid>
    <div className="actions"><button onClick={() => setDir(d => d === 'h' ? 'v' : 'h')}>Rotate</button><button onClick={() => setShips(s => s.slice(0, -1))}>Undo</button><button onClick={() => act({ type: 'place', random: true })}>Random fleet</button>
      <button className="primary" disabled={ships.length < 5} onClick={() => act({ type: 'place', ships })}>Confirm</button></div></>}</div>;
  return <div className="center"><h4>Enemy waters {mine ? '(tap a square to fire)' : ''}</h4>
    <Grid cols={10} cls="bsgrid">{v.myShots.map((x: number, i: number) => <div key={i} className={'bc' + (x === 1 ? ' miss' : x === 2 ? (sunk.has(i) ? ' sunk' : ' hit') : '') + (mine && x === 0 ? ' fire' : '')} onClick={() => mine && x === 0 && act({ type: 'fire', i })}>{x === 1 ? '•' : x === 2 ? '✕' : ''}</div>)}</Grid>
    <h4>Your fleet</h4><Grid cols={10} cls="bsgrid sm">{v.shotsAtMe.map((x: number, i: number) => <div key={i} className={'bc' + (mineSet.has(i) ? ' ship' : '') + (x === 2 ? ' hit' : x === 1 ? ' miss' : '')}>{x === 1 ? '•' : x === 2 ? '✕' : ''}</div>)}</Grid></div>;
}
function WG({ v, act, nm }: any) {
  const [w, setW] = useState(''), mine = v.turn === v.you, label = (k: string) => v.team ? 'Team ' + k : nm(k);
  return <div className="center"><p className="info">Category: <b>{v.cat}</b> · {v.len} letters</p>
    <div className="wlist">{v.mask.map((c: string | null, i: number) => <span key={i} className="wl">{c ? c.toUpperCase() : ''}</span>)}</div>
    <div className="row" style={{ justifyContent: 'center' }}>{Object.entries(v.lives).map(([k, n]: any) => <span key={k} className={'pill' + (v.sideOf[v.turn] === k ? ' on' : '')}>{label(k)} {n > 0 ? '❤'.repeat(n) : '💀'}</span>)}</div>
    {v.team && <p className="muted">Teams: {['A', 'B'].map(k => `${k}: ${v.ids.filter((i: string) => v.sideOf[i] === k).map(nm).join(', ')}`).join(' · ')}</p>}
    <div className="kb">{'abcdefghijklmnopqrstuvwxyz'.split('').map(ch => <button key={ch} className={'ghost sm' + (v.guessed.includes(ch) ? ' used' : '')} disabled={!mine || v.guessed.includes(ch)} onClick={() => act({ type: 'letter', ch })}>{ch.toUpperCase()}</button>)}</div>
    {mine && <div className="row" style={{ justifyContent: 'center' }}><input placeholder="Or guess the whole word" value={w} onChange={e => setW(e.target.value)} /><button disabled={!w.trim()} onClick={() => { act({ type: 'word', word: w }); setW(''); }}>Guess word</button></div>}<Feed log={v.log} nm={nm} /></div>;
}
const BOARDS: any = { blackjack: BJ, inbetween: IB, flip7: F7, leastcount: LC, elimination: EL, crazy8: CE, bluff: BL, gofish: GF, ttt: TT, c4: C4, dab: DB, nim: NM, rps: RP, sl: SL, ludo: LU, bs: BS, wg: WG };
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
