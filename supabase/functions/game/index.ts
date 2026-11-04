// server/engine.ts
function randInt(n) {
  const lim = Math.floor(4294967296 / n) * n, b = new Uint32Array(1);
  do
    crypto.getRandomValues(b);
  while (b[0] >= lim);
  return b[0] % n;
}
function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j2 = randInt(i + 1);
    [r[i], r[j2]] = [r[j2], r[i]];
  }
  return r;
}
var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
var SUITS = ["S", "H", "D", "C"];
var newDeck = () => shuffle(SUITS.flatMap((s) => RANKS.map((r) => ({ r, s }))));
var sortHand = (h) => h.sort((a, b) => RANKS.indexOf(a.r) - RANKS.indexOf(b.r) || SUITS.indexOf(a.s) - SUITS.indexOf(b.s));
var finalTwo = (ids, w) => w ? [{ id: w, label: "Winner" }, ...ids.filter((i) => i !== w).map((id) => ({ id, label: "Runner-up" }))] : ids.map((id) => ({ id, label: "Draw" }));
function dropId(s, id) {
  const i = s.ids ? s.ids.indexOf(id) : -1;
  for (const k of Object.keys(s)) {
    const v = s[k];
    if (Array.isArray(v)) s[k] = v.filter((x) => x !== id && x?.id !== id);
    else if (v && typeof v === "object" && id in v) delete v[id];
  }
  if (i >= 0 && typeof s.turn === "number") {
    if (i < s.turn) s.turn--;
    if (s.turn >= s.ids.length) s.turn = 0;
  }
  return s;
}

// server/games/blackjack.ts
var value = (h) => {
  let t = 0, aces = 0;
  for (const c of h) {
    if (c.r === "A") {
      aces++;
      t += 11;
    } else t += ["J", "Q", "K"].includes(c.r) ? 10 : +c.r;
  }
  while (t > 21 && aces) {
    t -= 10;
    aces--;
  }
  return { total: t, soft: aces > 0 };
};
var isBJ = (h) => h.length === 2 && value(h).total === 21;
function deal(s) {
  if (s.deck.length < 20 + s.players.length * 6) s.deck = newDeck();
  s.dealer = [s.deck.pop(), s.deck.pop()];
  for (const p of s.players) {
    p.hand = [s.deck.pop(), s.deck.pop()];
    p.doubled = false;
    p.last = void 0;
    p.status = isBJ(p.hand) ? "blackjack" : "playing";
  }
  s.phase = "player";
  s.turn = -1;
  advance(s);
}
function advance(s) {
  s.turn = s.players.findIndex((p, i) => i > s.turn && p.status === "playing");
  if (s.turn === -1) finish(s);
}
function finish(s) {
  if (s.players.some((p) => p.status !== "bust")) {
    for (; ; ) {
      const { total: total2, soft } = value(s.dealer);
      if (total2 < 17 || total2 === 17 && soft && s.hitSoft17) s.dealer.push(s.deck.pop());
      else break;
    }
  }
  const d = value(s.dealer).total, dBJ = isBJ(s.dealer), out = {};
  for (const p of s.players) {
    const t = value(p.hand).total, m = p.doubled ? 2 : 1;
    let r, pts2;
    if (p.status === "bust") [r, pts2] = ["loss", -m];
    else if (p.status === "blackjack") [r, pts2] = dBJ ? ["push", 0] : ["blackjack", 1.5];
    else if (dBJ) [r, pts2] = ["loss", -m];
    else if (d > 21 || t > d) [r, pts2] = ["win", m];
    else if (t === d) [r, pts2] = ["push", 0];
    else [r, pts2] = ["loss", -m];
    p.score += pts2;
    p.last = r;
    out[p.id] = r;
  }
  s.history.push({ round: s.round, outcomes: out });
  s.phase = s.round >= s.rounds ? "over" : "roundOver";
}
var blackjack = {
  id: "blackjack",
  minPlayers: 1,
  maxPlayers: 7,
  initialize(ids, st) {
    const s = {
      deck: newDeck(),
      dealer: [],
      turn: -1,
      round: 1,
      rounds: Math.min(50, Math.max(1, Number(st.rounds) || 5)),
      hitSoft17: !!st.hitSoft17,
      allowDouble: st.allowDouble !== false,
      phase: "player",
      history: [],
      players: ids.map((id) => ({ id, hand: [], status: "playing", doubled: false, score: 0 }))
    };
    deal(s);
    return s;
  },
  getPlayerView(s, me) {
    const hide = s.phase === "player";
    return {
      game: "blackjack",
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      you: me,
      turn: s.turn >= 0 ? s.players[s.turn].id : null,
      dealer: hide ? [s.dealer[0], null] : s.dealer,
      dealerTotal: hide ? null : value(s.dealer).total,
      players: s.players.map((p) => ({ id: p.id, hand: p.hand, total: value(p.hand).total, status: p.status, score: p.score, last: p.last })),
      history: s.history
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (a.type === "next") {
      if (s.phase !== "roundOver") throw new Error("Round not finished");
      s.round++;
      deal(s);
      return s;
    }
    if (s.phase !== "player") throw new Error("No round in progress");
    const p = s.players[s.turn];
    if (!p || p.id !== pid) throw new Error("Not your turn");
    if (a.type === "hit") {
      p.hand.push(s.deck.pop());
      const t = value(p.hand).total;
      if (t > 21) {
        p.status = "bust";
        advance(s);
      } else if (t === 21) {
        p.status = "stand";
        advance(s);
      }
    } else if (a.type === "stand") {
      p.status = "stand";
      advance(s);
    } else if (a.type === "double") {
      if (!s.allowDouble || p.hand.length !== 2) throw new Error("Cannot double");
      p.hand.push(s.deck.pop());
      p.doubled = true;
      p.status = value(p.hand).total > 21 ? "bust" : "stand";
      advance(s);
    } else throw new Error("Unknown action");
    return s;
  },
  isGameOver: (s) => s.phase === "over",
  getResults: (s) => ({ ranking: [...s.players].sort((x, y) => y.score - x.score).map((p) => ({ id: p.id, score: p.score })), history: s.history })
};

// server/games/inbetween.ts
var rv = (c, ah) => c.r === "A" ? ah ? 14 : 1 : c.r === "J" ? 11 : c.r === "Q" ? 12 : c.r === "K" ? 13 : +c.r;
function deal2(s) {
  if (s.deck.length < 10) s.deck = newDeck();
  const a = s.deck.pop(), b = s.deck.pop();
  s.pair = rv(a, s.aceHigh) <= rv(b, s.aceHigh) ? [a, b] : [b, a];
}
function next(s) {
  s.turn++;
  if (s.turn >= s.ids.length) {
    s.turn = 0;
    s.round++;
  }
  if (s.round > s.rounds) {
    s.phase = "over";
    return;
  }
  deal2(s);
  skipDead(s);
}
function skipDead(s) {
  while (s.phase === "play" && rv(s.pair[1], s.aceHigh) - rv(s.pair[0], s.aceHigh) < 2) {
    s.last = { pid: s.ids[s.turn], pair: s.pair, third: null, result: "no gap - auto pass", delta: 0 };
    next(s);
  }
}
var inbetween = {
  id: "inbetween",
  minPlayers: 2,
  maxPlayers: 8,
  initialize(ids, st) {
    const s = { deck: newDeck(), ids, scores: Object.fromEntries(ids.map((i) => [i, 0])), turn: 0, round: 1, rounds: Math.min(30, Math.max(1, Number(st.rounds) || 5)), pair: [], aceHigh: st.aceHigh !== false, post: Math.max(1, Number(st.postPenalty) || 2), phase: "play" };
    deal2(s);
    skipDead(s);
    return s;
  },
  getPlayerView(s, me) {
    const cur = s.phase === "play" ? s.ids[s.turn] : null;
    return {
      game: "inbetween",
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      turn: cur,
      scores: s.scores,
      pair: cur === me ? s.pair : null,
      last: s.last,
      rules: `Ace ${s.aceHigh ? "high" : "low"}. Strictly between: +1. Outside: -1. Hitting a post (equal to a card): -${s.post}. Equal/consecutive pairs auto-pass.`
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.phase !== "play") throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    if (a.type === "pass") s.last = { pid, pair: s.pair, third: null, result: "pass", delta: 0 };
    else if (a.type === "in") {
      const t = s.deck.pop(), v = rv(t, s.aceHigh), lo = rv(s.pair[0], s.aceHigh), hi = rv(s.pair[1], s.aceHigh);
      const [result, delta] = v > lo && v < hi ? ["in between", 1] : v === lo || v === hi ? ["hit the post", -s.post] : ["outside", -1];
      s.scores[pid] += delta;
      s.last = { pid, pair: s.pair, third: t, result, delta };
    } else throw new Error("Unknown action");
    next(s);
    return s;
  },
  isGameOver: (s) => s.phase === "over",
  getResults: (s) => ({ ranking: s.ids.map((id) => ({ id, score: s.scores[id] })).sort((a, b) => b.score - a.score) })
};

// server/games/flip7.ts
var mk = () => {
  const d = [];
  for (let n = 1; n <= 9; n++) for (let i = 0; i < n; i++) d.push({ k: "n", v: n });
  for (let i = 0; i < 4; i++) d.push({ k: "shield" });
  for (let i = 0; i < 3; i++) {
    d.push({ k: "x2" });
    d.push({ k: "p5" });
  }
  return shuffle(d);
};
var roundScore = (p) => p.status === "bust" ? 0 : p.nums.reduce((a, b) => a + b, 0) * (p.x2 ? 2 : 1) + p.p5 * 5 + (p.nums.length >= 7 ? 15 : 0);
function start(s) {
  s.deck = mk();
  s.turn = 0;
  s.phase = "play";
  for (const p of s.players) Object.assign(p, { nums: [], shield: false, x2: false, p5: 0, status: "active" });
  s.log = [`Round ${s.round} begins`];
}
function finish2(s) {
  for (const p of s.players) {
    const r = roundScore(p);
    p.total += r;
    s.log.push(`${p.id}: ${p.status} +${r}`);
  }
  s.phase = Math.max(...s.players.map((p) => p.total)) >= s.target || s.round >= s.rounds ? "over" : "roundOver";
}
function advance2(s) {
  for (let i = 1; i <= s.players.length; i++) {
    const k = (s.turn + i) % s.players.length;
    if (s.players[k].status === "active") {
      s.turn = k;
      return;
    }
  }
  finish2(s);
}
var flip7 = {
  id: "flip7",
  minPlayers: 2,
  maxPlayers: 8,
  initialize(ids, st) {
    const s = {
      deck: [],
      turn: 0,
      round: 1,
      rounds: Math.min(30, Math.max(1, Number(st.rounds) || 10)),
      target: Math.max(20, Number(st.target) || 100),
      phase: "play",
      log: [],
      players: ids.map((id) => ({ id, nums: [], shield: false, x2: false, p5: 0, status: "active", total: 0 }))
    };
    start(s);
    return s;
  },
  getPlayerView(s, me) {
    return {
      game: "flip7",
      you: me,
      phase: s.phase,
      round: s.round,
      rounds: s.rounds,
      target: s.target,
      turn: s.phase === "play" ? s.players[s.turn].id : null,
      deckCount: s.deck.length,
      players: s.players.map((p) => ({ ...p, roundScore: roundScore(p) })),
      log: s.log
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (a.type === "next") {
      if (s.phase !== "roundOver") throw new Error("Round not finished");
      s.round++;
      start(s);
      return s;
    }
    if (s.phase !== "play") throw new Error("No round in progress");
    const p = s.players[s.turn];
    if (p.id !== pid || p.status !== "active") throw new Error("Not your turn");
    if (a.type === "stop") {
      p.status = "stopped";
      s.log.push(`${pid} stops`);
      advance2(s);
      return s;
    }
    if (a.type !== "draw") throw new Error("Unknown action");
    if (!s.deck.length) s.deck = mk();
    const c = s.deck.pop();
    if (c.k === "shield") p.shield = true;
    else if (c.k === "x2") p.x2 = true;
    else if (c.k === "p5") p.p5++;
    else if (p.nums.includes(c.v)) {
      if (p.shield) {
        p.shield = false;
        s.log.push(`${pid} drew duplicate ${c.v}, Shield absorbed it`);
      } else {
        p.status = "bust";
        s.log.push(`${pid} busts on ${c.v}`);
        advance2(s);
      }
    } else {
      p.nums.push(c.v);
      if (p.nums.length >= 7) {
        s.log.push(`${pid} flips 7!`);
        for (const q of s.players) if (q.status === "active") q.status = "stopped";
        finish2(s);
      }
    }
    return s;
  },
  isGameOver: (s) => s.phase === "over",
  getResults: (s) => ({ ranking: s.players.map((p) => ({ id: p.id, score: p.total })).sort((a, b) => b.score - a.score) })
};

// server/games/leastcount.ts
var cv = (c) => c.r === "JK" ? 0 : c.r === "A" ? 1 : ["J", "Q", "K"].includes(c.r) ? 10 : +c.r;
var total = (h) => h.reduce((a, c) => a + cv(c), 0);
function deal3(s) {
  s.deck = shuffle([...newDeck(), ...s.jokers ? [{ r: "JK", s: "*" }, { r: "JK", s: "*" }] : []]);
  s.hands = Object.fromEntries(s.ids.map((i) => [i, []]));
  for (let k = 0; k < s.dealt; k++) for (const i of s.ids) s.hands[i].push(s.deck.pop());
  s.discard = [s.deck.pop()];
  s.turn = (s.round - 1) % s.ids.length;
  s.tp = "start";
  s.phase = "play";
  s.revealed = void 0;
  s.summary = void 0;
}
var leastcount = {
  id: "leastcount",
  minPlayers: 2,
  maxPlayers: 6,
  initialize(ids, st) {
    const s = {
      ids,
      scores: Object.fromEntries(ids.map((i) => [i, 0])),
      round: 1,
      dealt: Math.min(10, Math.max(3, Number(st.dealt) || 7)),
      declareMax: Number(st.declareMax) || 10,
      penalty: Number(st.penalty) || 40,
      target: Math.max(20, Number(st.target) || 100),
      jokers: st.jokers !== false
    };
    deal3(s);
    return s;
  },
  getPlayerView(s, me) {
    const ended = s.phase !== "play";
    return {
      game: "leastcount",
      you: me,
      phase: s.phase,
      round: s.round,
      turn: ended ? null : s.ids[s.turn],
      turnPhase: s.tp,
      hand: s.hands[me] ?? [],
      counts: Object.fromEntries(s.ids.map((i) => [i, s.hands[i].length])),
      discardTop: s.discard[s.discard.length - 1],
      stock: s.deck.length,
      scores: s.scores,
      revealed: s.revealed,
      summary: s.summary,
      rules: `Deal ${s.dealt}. Show when hand \u2264 ${s.declareMax}; if anyone has equal or lower you take +${s.penalty}. Ace 1, J/Q/K 10, Joker ${s.jokers ? 0 : "off"}. Out at ${s.target}.`
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (a.type === "next") {
      if (s.phase !== "roundOver") throw new Error("Round not finished");
      s.round++;
      deal3(s);
      return s;
    }
    if (s.phase !== "play") throw new Error("No round in progress");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const hand = s.hands[pid];
    if (a.type === "draw") {
      if (s.tp !== "start") throw new Error("Already drew");
      if (a.from === "discard") {
        if (s.discard.length < 1) throw new Error("Empty");
        hand.push(s.discard.pop());
      } else {
        if (!s.deck.length) {
          const top2 = s.discard.pop();
          s.deck = shuffle(s.discard);
          s.discard = [top2];
        }
        if (!s.deck.length) throw new Error("No cards");
        hand.push(s.deck.pop());
      }
      s.tp = "discard";
    } else if (a.type === "discard") {
      if (s.tp !== "discard") throw new Error("Draw first");
      const idx = [...new Set(a.cards)];
      if (!idx.length || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= hand.length)) throw new Error("Bad cards");
      if (new Set(idx.map((i) => hand[i].r)).size !== 1) throw new Error("Discard must share a rank");
      s.discard.push(...idx.map((i) => hand[i]));
      s.hands[pid] = hand.filter((_, i) => !idx.includes(i));
      s.turn = (s.turn + 1) % s.ids.length;
      s.tp = "start";
    } else if (a.type === "show") {
      if (s.tp !== "start") throw new Error("Show before drawing");
      const mine = total(hand);
      if (mine > s.declareMax) throw new Error(`Hand must be \u2264 ${s.declareMax}`);
      const t = Object.fromEntries(s.ids.map((i) => [i, total(s.hands[i])])), min = Math.min(...s.ids.map((i) => t[i]));
      const won = mine <= Math.min(...s.ids.filter((i) => i !== pid).map((i) => t[i])) && mine < Math.min(...s.ids.filter((i) => i !== pid).map((i) => t[i]));
      for (const i of s.ids) s.scores[i] += i === pid ? won ? 0 : s.penalty : !won && t[i] === min ? 0 : t[i];
      s.revealed = structuredClone(s.hands);
      s.summary = `${pid} showed ${mine}: ${won ? "valid" : "penalty"}`;
      s.phase = Math.max(...Object.values(s.scores)) >= s.target ? "over" : "roundOver";
    } else throw new Error("Unknown action");
    return s;
  },
  isGameOver: (s) => s.phase === "over",
  getResults: (s) => ({ ranking: s.ids.map((id) => ({ id, score: s.scores[id] })).sort((a, b) => a.score - b.score) })
};

// server/games/elimination.ts
function advance3(s) {
  do
    s.turn = (s.turn + 1) % s.ids.length;
  while (!s.alive.includes(s.ids[s.turn]));
  s.owed = 1;
}
function endTurn(s) {
  if (--s.owed <= 0) advance3(s);
}
var elimination = {
  id: "elimination",
  minPlayers: 2,
  maxPlayers: 6,
  initialize(ids) {
    const tac = shuffle(["skip", "peek", "shuffle", "attack"].flatMap((k) => Array(6).fill(k)));
    const hands = Object.fromEntries(ids.map((i) => [i, ["defuse", ...tac.splice(0, 3)]]));
    const deck = shuffle([...tac, ...Array(ids.length - 1).fill("bomb"), "defuse", "defuse"]);
    return { deck, hands, ids, alive: [...ids], out: [], turn: 0, owed: 1, peeks: {}, log: ["Game started"], phase: "play" };
  },
  getPlayerView(s, me) {
    return {
      game: "elimination",
      you: me,
      phase: s.phase,
      turn: s.phase === "play" ? s.ids[s.turn] : null,
      turnsOwed: s.owed,
      hand: s.hands[me] ?? [],
      peek: s.peeks[me] ?? null,
      counts: Object.fromEntries(s.ids.map((i) => [i, s.hands[i].length])),
      deckCount: s.deck.length,
      alive: s.alive,
      eliminated: s.out,
      log: s.log
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.phase !== "play") throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const hand = s.hands[pid];
    if (a.type === "play") {
      const i = hand.indexOf(a.card);
      if (!["skip", "peek", "shuffle", "attack"].includes(a.card) || i < 0) throw new Error("Cannot play that card");
      hand.splice(i, 1);
      s.log.push(`${pid} plays ${a.card}`);
      if (a.card === "skip") endTurn(s);
      else if (a.card === "attack") {
        advance3(s);
        s.owed = 2;
      } else if (a.card === "peek") s.peeks[pid] = s.deck.slice(-3).reverse();
      else {
        s.deck = shuffle(s.deck);
        s.peeks = {};
      }
    } else if (a.type === "draw") {
      const c = s.deck.pop();
      if (!c) throw new Error("Deck empty");
      s.peeks = {};
      if (c !== "bomb") {
        hand.push(c);
        endTurn(s);
      } else if (hand.includes("defuse")) {
        hand.splice(hand.indexOf("defuse"), 1);
        s.deck.splice(randInt(s.deck.length + 1), 0, "bomb");
        s.log.push(`${pid} defuses a bomb`);
        endTurn(s);
      } else {
        s.alive = s.alive.filter((x) => x !== pid);
        s.out.push(pid);
        s.hands[pid] = [];
        s.log.push(`${pid} is eliminated`);
        if (s.alive.length === 1) s.phase = "over";
        else advance3(s);
      }
    } else throw new Error("Unknown action");
    return s;
  },
  isGameOver: (s) => s.phase === "over",
  getResults: (s) => ({ ranking: [...s.alive, ...[...s.out].reverse()].map((id, i) => ({ id, place: i + 1 })) })
};

// server/games/crazy8.ts
var SYM = { S: "\u2660", H: "\u2665", D: "\u2666", C: "\u2663" };
var pts = (c) => c.r === "8" ? 50 : ["J", "Q", "K"].includes(c.r) ? 10 : c.r === "A" ? 1 : +c.r;
var top = (s) => s.discard[s.discard.length - 1];
var ok = (s, c) => c.r === "8" || c.s === s.suit || c.r === top(s).r;
var adv = (s, n = 1) => {
  s.turn = (s.turn + n) % s.ids.length;
  s.drew = false;
};
function draw(s) {
  if (!s.deck.length && s.discard.length > 1) {
    const t = s.discard.pop();
    s.deck = shuffle(s.discard);
    s.discard = [t];
  }
  return s.deck.pop();
}
var crazy8 = {
  id: "crazy8",
  minPlayers: 2,
  maxPlayers: 6,
  initialize(ids) {
    let deck = newDeck();
    while (deck[deck.length - 1].r === "8") deck = shuffle(deck);
    const n = ids.length > 4 ? 5 : 7, hands = {};
    for (const i of ids) hands[i] = [];
    for (let k = 0; k < n; k++) for (const i of ids) hands[i].push(deck.pop());
    ids.forEach((i) => sortHand(hands[i]));
    const d = deck.pop();
    return { deck, discard: [d], hands, ids, turn: 0, suit: d.s, drew: false, log: ["Game started"] };
  },
  getPlayerView(s, me) {
    return {
      game: "crazy8",
      you: me,
      turn: s.winner ? null : s.ids[s.turn],
      hand: s.hands[me] ?? [],
      counts: Object.fromEntries(s.ids.map((i) => [i, s.hands[i].length])),
      top: top(s),
      suit: s.suit,
      deckCount: s.deck.length,
      drew: s.drew,
      winner: s.winner ?? null,
      points: s.winner ? Object.fromEntries(s.ids.map((i) => [i, s.hands[i].reduce((a, c) => a + pts(c), 0)])) : null,
      log: s.log.slice(-6)
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.winner) throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const h = s.hands[pid];
    if (a.type === "draw") {
      if (s.drew) throw new Error("Already drew");
      const c = draw(s);
      if (!c) {
        s.log.push(`${pid} cannot draw`);
        adv(s);
        return s;
      }
      h.push(c);
      sortHand(h);
      s.log.push(`${pid} draws a card`);
      if (!h.some((x) => ok(s, x))) adv(s);
      else s.drew = true;
      return s;
    }
    if (a.type === "pass") {
      if (!s.drew) throw new Error("Draw first");
      adv(s);
      return s;
    }
    if (a.type === "play") {
      const c = h[a.i];
      if (!c || !ok(s, c)) throw new Error("That card can't be played");
      if (c.r === "8" && !SUITS.includes(a.suit)) throw new Error("Choose a suit");
      h.splice(a.i, 1);
      s.discard.push(c);
      s.suit = c.r === "8" ? a.suit : c.s;
      s.log.push(`${pid} plays ${c.r}${SYM[c.s]}${c.r === "8" ? ` and picks ${SYM[a.suit]}` : ""}`);
      if (!h.length) {
        s.winner = pid;
        s.log.push(`${pid} is out of cards!`);
        return s;
      }
      const nxt = s.ids[(s.turn + 1) % s.ids.length];
      if (c.r === "2") {
        for (let k = 0; k < 2; k++) {
          const d = draw(s);
          if (d) s.hands[nxt].push(d);
        }
        sortHand(s.hands[nxt]);
        s.log.push(`${nxt} draws 2 and loses a turn`);
        adv(s, 2);
      } else if (c.r === "J") {
        s.log.push(`${nxt} is skipped`);
        adv(s, 2);
      } else adv(s);
      return s;
    }
    throw new Error("Unknown action");
  },
  isGameOver: (s) => !!s.winner,
  getResults: (s) => ({ winner: s.winner })
};

// server/games/bluff.ts
var bluff = {
  id: "bluff",
  minPlayers: 2,
  maxPlayers: 6,
  initialize(ids) {
    const deck = newDeck(), hands = Object.fromEntries(ids.map((i) => [i, []]));
    deck.forEach((c, k) => hands[ids[k % ids.length]].push(c));
    ids.forEach((i) => sortHand(hands[i]));
    return { ids, hands, pile: [], rankIdx: 0, turn: 0, log: ["Game started"] };
  },
  getPlayerView(s, me) {
    return {
      game: "bluff",
      you: me,
      turn: s.winner ? null : s.ids[s.turn],
      hand: s.hands[me] ?? [],
      counts: Object.fromEntries(s.ids.map((i) => [i, s.hands[i].length])),
      pile: s.pile.length,
      claim: s.last ? { by: s.last.by, n: s.last.n, rank: s.last.rank } : null,
      nextRank: RANKS[s.rankIdx],
      canCall: !!s.last && !s.winner && s.ids[s.turn] === me,
      pendingWin: s.pendingWin ?? null,
      reveal: s.reveal ?? null,
      winner: s.winner ?? null,
      log: s.log.slice(-6)
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.winner) throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const h = s.hands[pid];
    if (a.type === "play") {
      if (s.pendingWin) throw new Error("Call bluff or accept first");
      const idx = [...new Set(a.cards)];
      if (idx.length < 1 || idx.length > 4 || idx.some((i) => !Number.isInteger(i) || i < 0 || i >= h.length)) throw new Error("Play 1 to 4 cards");
      const cards = idx.map((i) => h[i]);
      s.hands[pid] = h.filter((_, i) => !idx.includes(i));
      s.pile.push(...cards);
      const rank = RANKS[s.rankIdx];
      s.last = { by: pid, n: cards.length, rank, cards };
      s.rankIdx = (s.rankIdx + 1) % 13;
      s.reveal = void 0;
      s.log.push(`${pid} plays ${cards.length} card${cards.length > 1 ? "s" : ""} as ${rank}`);
      if (!s.hands[pid].length) s.pendingWin = pid;
      s.turn = (s.turn + 1) % s.ids.length;
    } else if (a.type === "call") {
      if (!s.last) throw new Error("Nothing to call");
      const L = s.last, honest = L.cards.every((c) => c.r === L.rank), loser = honest ? pid : L.by;
      s.hands[loser].push(...s.pile);
      sortHand(s.hands[loser]);
      s.reveal = { by: L.by, n: L.n, rank: L.rank, cards: L.cards, honest, loser };
      s.log.push(`${pid} calls bluff: ${honest ? "it was honest" : "caught bluffing"}, ${loser} takes the pile`);
      s.pile = [];
      s.last = void 0;
      if (s.pendingWin) {
        if (honest) s.winner = s.pendingWin;
        else s.pendingWin = void 0;
      }
    } else if (a.type === "accept") {
      if (!s.pendingWin) throw new Error("Nothing to accept");
      s.winner = s.pendingWin;
    } else throw new Error("Unknown action");
    return s;
  },
  isGameOver: (s) => !!s.winner,
  getResults: (s) => ({ winner: s.winner })
};

// server/games/gofish.ts
function bookUp(s, id) {
  for (const r of RANKS) if (s.hands[id].filter((c) => c.r === r).length === 4) {
    s.hands[id] = s.hands[id].filter((c) => c.r !== r);
    s.books[id].push(r);
    s.log.push(`${id} completes a book of ${r}s`);
  }
}
function settle(s) {
  const next2 = () => {
    s.turn = (s.turn + 1) % s.ids.length;
  };
  for (let k = 0; k < s.ids.length * 3 + 5; k++) {
    if (s.ids.reduce((a, i) => a + s.books[i].length, 0) >= 13) {
      s.phase = "over";
      return;
    }
    const id = s.ids[s.turn];
    if (!s.hands[id].length) for (let n = 0; n < 5 && s.deck.length; n++) s.hands[id].push(s.deck.pop());
    sortHand(s.hands[id]);
    bookUp(s, id);
    if (!s.hands[id].length) {
      next2();
      continue;
    }
    if (s.ids.some((i) => i !== id && s.hands[i].length)) return;
    if (s.deck.length) {
      s.hands[id].push(s.deck.pop());
      sortHand(s.hands[id]);
      bookUp(s, id);
      s.log.push(`${id} has nobody to ask and fishes from the pond`);
      next2();
      continue;
    }
    break;
  }
  s.phase = "over";
}
var gofish = {
  id: "gofish",
  minPlayers: 2,
  maxPlayers: 6,
  initialize(ids) {
    const deck = newDeck(), n = ids.length > 3 ? 5 : 7, hands = Object.fromEntries(ids.map((i) => [i, []]));
    for (let k = 0; k < n; k++) for (const i of ids) hands[i].push(deck.pop());
    const s = { deck, hands, books: Object.fromEntries(ids.map((i) => [i, []])), ids, turn: 0, log: ["Game started"], phase: "play" };
    ids.forEach((i) => {
      sortHand(s.hands[i]);
      bookUp(s, i);
    });
    settle(s);
    return s;
  },
  getPlayerView(s, me) {
    return { game: "gofish", you: me, phase: s.phase, turn: s.phase === "play" ? s.ids[s.turn] : null, hand: s.hands[me] ?? [], counts: Object.fromEntries(s.ids.map((i) => [i, s.hands[i].length])), books: s.books, deckCount: s.deck.length, log: s.log.slice(-6) };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.phase !== "play") throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    if (a.type !== "ask") throw new Error("Unknown action");
    const h = s.hands[pid], t = s.hands[a.target];
    if (!s.ids.includes(a.target) || a.target === pid || !t?.length) throw new Error("Pick another player who has cards");
    if (!h.some((c) => c.r === a.rank)) throw new Error("You must hold a card of that rank");
    const got = t.filter((c) => c.r === a.rank);
    if (got.length) {
      s.hands[a.target] = t.filter((c) => c.r !== a.rank);
      h.push(...got);
      s.log.push(`${pid} takes ${got.length} ${a.rank}${got.length > 1 ? "s" : ""} from ${a.target}`);
    } else {
      s.log.push(`${a.target} says Go Fish to ${pid}`);
      const c = s.deck.pop();
      if (c) {
        h.push(c);
        if (c.r === a.rank) s.log.push(`${pid} fishes the ${a.rank} they wanted and goes again`);
        else s.turn = (s.turn + 1) % s.ids.length;
      } else s.turn = (s.turn + 1) % s.ids.length;
    }
    sortHand(h);
    bookUp(s, pid);
    settle(s);
    return s;
  },
  isGameOver: (s) => s.phase === "over",
  getResults: (s) => ({ books: s.books })
};

// server/games/abstract.ts
var over2 = (s) => !!s.winner || !!s.draw;
var L3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
var ttt = {
  id: "ttt",
  minPlayers: 2,
  maxPlayers: 2,
  initialize: (ids) => ({ ids, b: Array(9).fill(null), turn: 0, winner: null, draw: false, line: null }),
  getPlayerView: (s, me) => ({ game: "ttt", you: me, ids: s.ids, b: s.b, turn: over2(s) ? null : s.ids[s.turn], line: s.line, draw: s.draw, final: over2(s) ? finalTwo(s.ids, s.winner) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (over2(s)) throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const i = a.i;
    if (!Number.isInteger(i) || i < 0 || i > 8 || s.b[i] !== null) throw new Error("Invalid square");
    s.b[i] = s.turn;
    const w = L3.find((l) => l.every((k) => s.b[k] === s.turn));
    if (w) {
      s.winner = pid;
      s.line = w;
    } else if (s.b.every((x) => x !== null)) s.draw = true;
    else s.turn = 1 - s.turn;
    return s;
  },
  isGameOver: over2,
  getResults: (s) => ({ winner: s.winner })
};
var R = 6;
var C = 7;
function c4line(b, r, c, p) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells2 = [r * C + c];
    for (const g of [1, -1]) {
      let rr = r + dr * g, cc = c + dc * g;
      while (rr >= 0 && rr < R && cc >= 0 && cc < C && b[rr * C + cc] === p) {
        cells2.push(rr * C + cc);
        rr += dr * g;
        cc += dc * g;
      }
    }
    if (cells2.length >= 4) return cells2;
  }
  return null;
}
var c4 = {
  id: "c4",
  minPlayers: 2,
  maxPlayers: 2,
  initialize: (ids) => ({ ids, b: Array(R * C).fill(null), turn: 0, winner: null, draw: false, line: null }),
  getPlayerView: (s, me) => ({ game: "c4", you: me, ids: s.ids, b: s.b, turn: over2(s) ? null : s.ids[s.turn], line: s.line, draw: s.draw, final: over2(s) ? finalTwo(s.ids, s.winner) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (over2(s)) throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const col = a.col;
    if (!Number.isInteger(col) || col < 0 || col >= C) throw new Error("Invalid column");
    let r = R - 1;
    while (r >= 0 && s.b[r * C + col] !== null) r--;
    if (r < 0) throw new Error("Column is full");
    s.b[r * C + col] = s.turn;
    const w = c4line(s.b, r, col, s.turn);
    if (w) {
      s.winner = pid;
      s.line = w;
    } else if (s.b.every((x) => x !== null)) s.draw = true;
    else s.turn = 1 - s.turn;
    return s;
  },
  isGameOver: over2,
  getResults: (s) => ({ winner: s.winner })
};
var dab = {
  id: "dab",
  minPlayers: 2,
  maxPlayers: 2,
  initialize(ids, st) {
    const n = Math.min(6, Math.max(2, Number(st.size) || 3));
    return { ids, n, h: Array.from({ length: n + 1 }, () => Array(n).fill(null)), v: Array.from({ length: n }, () => Array(n + 1).fill(null)), box: Array.from({ length: n }, () => Array(n).fill(null)), score: [0, 0], turn: 0 };
  },
  getPlayerView(s, me) {
    const done = s.score[0] + s.score[1] === s.n * s.n;
    return {
      game: "dab",
      you: me,
      ids: s.ids,
      n: s.n,
      h: s.h,
      v: s.v,
      box: s.box,
      score: s.score,
      turn: done ? null : s.ids[s.turn],
      final: done ? s.ids.map((id, i) => ({ id, label: `${s.score[i]} boxes` })).sort((a, b) => parseInt(b.label) - parseInt(a.label)) : null
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.score[0] + s.score[1] === s.n * s.n) throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const arr = a.k === "h" ? s.h : a.k === "v" ? s.v : null;
    if (!arr || !Number.isInteger(a.r) || !Number.isInteger(a.c) || arr[a.r]?.[a.c] !== null) throw new Error("Invalid line");
    arr[a.r][a.c] = s.turn;
    let got = 0;
    const full = (r, c) => r >= 0 && c >= 0 && r < s.n && c < s.n && s.box[r][c] === null && s.h[r][c] !== null && s.h[r + 1][c] !== null && s.v[r][c] !== null && s.v[r][c + 1] !== null;
    for (const [r, c] of a.k === "h" ? [[a.r - 1, a.c], [a.r, a.c]] : [[a.r, a.c - 1], [a.r, a.c]]) if (full(r, c)) {
      s.box[r][c] = s.turn;
      s.score[s.turn]++;
      got++;
    }
    if (!got) s.turn = 1 - s.turn;
    return s;
  },
  isGameOver: (s) => s.score[0] + s.score[1] === s.n * s.n,
  getResults: (s) => ({ score: s.score })
};
var nim = {
  id: "nim",
  minPlayers: 2,
  maxPlayers: 2,
  initialize: (ids, st) => ({ ids, piles: Array.from({ length: Math.min(8, Math.max(2, Number(st.piles) || 4)) }, (_, i) => 2 * i + 1), maxTake: Math.max(0, Number(st.maxTake) || 0), misere: !!st.misere, turn: 0, winner: null }),
  getPlayerView: (s, me) => ({ game: "nim", you: me, ids: s.ids, piles: s.piles, maxTake: s.maxTake, misere: s.misere, turn: s.winner ? null : s.ids[s.turn], final: s.winner ? finalTwo(s.ids, s.winner) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.winner) throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const p = s.piles[a.pile];
    if (!Number.isInteger(a.pile) || !Number.isInteger(a.n) || p === void 0 || a.n < 1 || a.n > p || s.maxTake > 0 && a.n > s.maxTake) throw new Error("Invalid move");
    s.piles[a.pile] -= a.n;
    if (s.piles.every((x) => x === 0)) s.winner = s.misere ? s.ids[1 - s.turn] : pid;
    else s.turn = 1 - s.turn;
    return s;
  },
  isGameOver: (s) => !!s.winner,
  getResults: (s) => ({ winner: s.winner })
};
var BEATS = { rock: "scissors", paper: "rock", scissors: "paper" };
var rps = {
  id: "rps",
  minPlayers: 2,
  maxPlayers: 2,
  initialize(ids, st) {
    const bestOf = Number(st.bestOf) === 5 ? 5 : 3;
    return { ids, bestOf, need: Math.ceil(bestOf / 2), picks: { [ids[0]]: null, [ids[1]]: null }, wins: { [ids[0]]: 0, [ids[1]]: 0 }, round: 1, history: [], winner: null };
  },
  getPlayerView: (s, me) => ({ game: "rps", you: me, ids: s.ids, bestOf: s.bestOf, need: s.need, round: s.round, wins: s.wins, myPick: s.picks[me], picked: Object.fromEntries(s.ids.map((i) => [i, !!s.picks[i]])), history: s.history, winner: s.winner, turn: null, final: s.winner ? finalTwo(s.ids, s.winner) : null }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.winner) throw new Error("Match over");
    if (!BEATS[a.pick]) throw new Error("Invalid choice");
    if (s.picks[pid]) throw new Error("Already chosen");
    s.picks[pid] = a.pick;
    const [x, y] = s.ids;
    if (s.picks[x] && s.picks[y]) {
      const w = s.picks[x] === s.picks[y] ? null : BEATS[s.picks[x]] === s.picks[y] ? x : y;
      s.history.push({ round: s.round, picks: { ...s.picks }, winner: w });
      if (w) {
        s.wins[w]++;
        if (s.wins[w] >= s.need) s.winner = w;
      }
      s.picks = { [x]: null, [y]: null };
      s.round++;
    }
    return s;
  },
  isGameOver: (s) => !!s.winner,
  getResults: (s) => ({ winner: s.winner })
};

// server/games/party.ts
var SN = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };
var LD = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
var sl = {
  id: "sl",
  minPlayers: 2,
  maxPlayers: 4,
  initialize: (ids, st) => ({ ids, pos: Object.fromEntries(ids.map((i) => [i, 0])), turn: 0, last: null, winner: null, exact: st.exact !== false, sixExtra: !!st.sixExtra }),
  getPlayerView: (s, me) => ({
    game: "sl",
    you: me,
    ids: s.ids,
    pos: s.pos,
    last: s.last,
    jumps: { ...SN, ...LD },
    turn: s.winner ? null : s.ids[s.turn],
    final: s.winner ? s.ids.map((id) => ({ id, label: id === s.winner ? "Reached 100" : `Square ${s.pos[id]}` })).sort((a, b) => (b.id === s.winner ? 1 : 0) - (a.id === s.winner ? 1 : 0) || parseInt(b.label.replace(/\D/g, "")) - parseInt(a.label.replace(/\D/g, ""))) : null
  }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.winner) throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    if (a.type !== "roll") throw new Error("Unknown action");
    const roll = randInt(6) + 1, from = s.pos[pid];
    let to = from + roll, event = "";
    if (to > 100) {
      if (s.exact) {
        to = from;
        event = "Needs an exact roll";
      } else to = 100;
    }
    if (to < 100 && SN[to]) {
      event = `Snake! ${to} \u2192 ${SN[to]}`;
      to = SN[to];
    } else if (to < 100 && LD[to]) {
      event = `Ladder! ${to} \u2192 ${LD[to]}`;
      to = LD[to];
    }
    s.pos[pid] = to;
    s.last = { pid, roll, from, to, event };
    if (to === 100) s.winner = pid;
    else if (!(roll === 6 && s.sixExtra)) s.turn = (s.turn + 1) % s.ids.length;
    return s;
  },
  isGameOver: (s) => !!s.winner,
  getResults: (s) => ({ winner: s.winner })
};
var SAFE = /* @__PURE__ */ new Set([0, 8, 13, 21, 26, 34, 39, 47]);
var absOf = (s, id, p) => (13 * s.seats[id] + p) % 52;
var lud = (s, id, roll) => s.tok[id].map((p, t) => (p === -1 ? roll === 6 || !s.enterOnSix : p + roll <= 56) ? t : -1).filter((t) => t >= 0);
var endTurn2 = (s, extra) => {
  s.phase = "roll";
  s.legal = [];
  if (!extra) s.turn = (s.turn + 1) % s.ids.length;
};
var ludo = {
  id: "ludo",
  minPlayers: 2,
  maxPlayers: 4,
  initialize(ids, st) {
    const seats = ids.length === 2 ? [0, 2] : ids.map((_, i) => i);
    return {
      ids,
      seats: Object.fromEntries(ids.map((id, i) => [id, seats[i]])),
      tok: Object.fromEntries(ids.map((id) => [id, [-1, -1, -1, -1]])),
      turn: 0,
      phase: "roll",
      dice: null,
      legal: [],
      winner: null,
      log: ["Game started"],
      enterOnSix: st.enterOnSix !== false,
      sixExtra: st.sixExtra !== false,
      captureExtra: st.captureExtra !== false
    };
  },
  getPlayerView: (s, me) => ({
    game: "ludo",
    you: me,
    ids: s.ids,
    seats: s.seats,
    tok: s.tok,
    turn: s.winner ? null : s.ids[s.turn],
    phase: s.phase,
    dice: s.dice,
    legal: s.ids[s.turn] === me ? s.legal : [],
    log: s.log.slice(-5),
    final: s.winner ? s.ids.map((id) => ({ id, label: id === s.winner ? "All tokens home" : `${s.tok[id].filter((p) => p === 56).length} home` })).sort((a, b) => (b.id === s.winner ? 1 : 0) - (a.id === s.winner ? 1 : 0)) : null
  }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.winner) throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    if (a.type === "roll") {
      if (s.phase !== "roll") throw new Error("Move a token first");
      s.dice = randInt(6) + 1;
      s.legal = lud(s, pid, s.dice);
      s.log.push(`${pid} rolls ${s.dice}`);
      if (!s.legal.length) {
        s.log.push(`${pid} has no move`);
        endTurn2(s, s.dice === 6 && s.sixExtra);
      } else s.phase = "move";
      return s;
    }
    if (a.type !== "move" || s.phase !== "move" || !s.legal.includes(a.t)) throw new Error("Illegal move");
    const old = s.tok[pid][a.t], np = old === -1 ? 0 : old + s.dice;
    s.tok[pid][a.t] = np;
    let cap = false;
    if (np <= 50 && !SAFE.has(absOf(s, pid, np))) {
      for (const o of s.ids) if (o !== pid) s.tok[o].forEach((q, i) => {
        if (q >= 0 && q <= 50 && absOf(s, o, q) === absOf(s, pid, np)) {
          s.tok[o][i] = -1;
          cap = true;
          s.log.push(`${pid} captures a token of ${o}`);
        }
      });
    }
    if (np === 56) s.log.push(`${pid} brings a token home`);
    if (s.tok[pid].every((p) => p === 56)) {
      s.winner = pid;
      return s;
    }
    endTurn2(s, s.dice === 6 && s.sixExtra || cap && s.captureExtra);
    return s;
  },
  isGameOver: (s) => !!s.winner,
  getResults: (s) => ({ winner: s.winner })
};
var FLEET = [5, 4, 3, 3, 2];
var cells = (h) => Array.from({ length: h.len }, (_, k) => h.dir === "h" ? h.r * 10 + h.c + k : (h.r + k) * 10 + h.c);
function clean(ships) {
  if (!Array.isArray(ships) || ships.length !== 5) return null;
  const out = ships.map((x) => ({ r: x?.r, c: x?.c, len: x?.len, dir: x?.dir })), used = /* @__PURE__ */ new Set();
  if (out.map((x) => x.len).sort().join() !== [...FLEET].sort().join()) return null;
  for (const x of out) {
    if (!["h", "v"].includes(x.dir) || !Number.isInteger(x.r) || !Number.isInteger(x.c) || x.r < 0 || x.c < 0 || (x.dir === "h" ? x.c + x.len > 10 || x.r > 9 : x.r + x.len > 10 || x.c > 9)) return null;
    for (const c of cells(x)) {
      if (used.has(c)) return null;
      used.add(c);
    }
  }
  return out;
}
function randomFleet() {
  for (; ; ) {
    const used = /* @__PURE__ */ new Set(), out = [];
    let ok2 = true;
    for (const len of FLEET) {
      let placed = false;
      for (let k = 0; k < 100 && !placed; k++) {
        const dir = randInt(2) ? "h" : "v", sh = { r: randInt(dir === "v" ? 11 - len : 10), c: randInt(dir === "h" ? 11 - len : 10), len, dir };
        if (cells(sh).every((x) => !used.has(x))) {
          cells(sh).forEach((x) => used.add(x));
          out.push(sh);
          placed = true;
        }
      }
      if (!placed) {
        ok2 = false;
        break;
      }
    }
    if (ok2) return out;
  }
}
var bs = {
  id: "bs",
  minPlayers: 2,
  maxPlayers: 2,
  initialize: (ids, st) => ({ ids, ships: {}, ready: { [ids[0]]: false, [ids[1]]: false }, shots: { [ids[0]]: Array(100).fill(0), [ids[1]]: Array(100).fill(0) }, turn: 0, phase: "place", winner: null, hitAgain: !!st.hitAgain, log: ["Place your fleet"] }),
  getPlayerView(s, me) {
    const opp = s.ids.find((i) => i !== me), mine = s.ships[me] || [];
    return {
      game: "bs",
      you: me,
      ids: s.ids,
      phase: s.phase,
      turn: s.phase === "battle" ? s.ids[s.turn] : null,
      ready: s.ready,
      myShips: mine.map((h) => ({ cells: cells(h), len: h.len })),
      shotsAtMe: s.shots[opp],
      myShots: s.shots[me],
      enemySunk: (s.ships[opp] || []).filter((h) => cells(h).every((x) => s.shots[me][x] === 2)).map((h) => ({ cells: cells(h), len: h.len })),
      log: s.log.slice(-5),
      final: s.winner ? [{ id: s.winner, label: "Fleet survives" }, { id: opp === s.winner ? me : opp, label: "Fleet destroyed" }] : null
    };
  },
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.winner) throw new Error("Game over");
    const opp = s.ids.find((i2) => i2 !== pid);
    if (s.phase === "place") {
      if (a.type !== "place" || s.ready[pid]) throw new Error("Already placed");
      const f = a.random ? randomFleet() : clean(a.ships);
      if (!f) throw new Error("Invalid ship placement");
      s.ships[pid] = f;
      s.ready[pid] = true;
      if (s.ready[opp]) {
        s.phase = "battle";
        s.log.push("Battle begins!");
      }
      return s;
    }
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const i = a.i;
    if (a.type !== "fire" || !Number.isInteger(i) || i < 0 || i > 99 || s.shots[pid][i] !== 0) throw new Error("Invalid target");
    const ship = s.ships[opp].find((h) => cells(h).includes(i));
    s.shots[pid][i] = ship ? 2 : 1;
    s.log.push(`${pid} fires at ${String.fromCharCode(65 + i % 10)}${Math.floor(i / 10) + 1}: ${ship ? "HIT" : "miss"}`);
    if (ship && cells(ship).every((x) => s.shots[pid][x] === 2)) s.log.push(`${pid} sinks a ship of length ${ship.len}!`);
    if (s.ships[opp].every((h) => cells(h).every((x) => s.shots[pid][x] === 2))) {
      s.winner = pid;
      return s;
    }
    if (!(ship && s.hitAgain)) s.turn = 1 - s.turn;
    return s;
  },
  isGameOver: (s) => !!s.winner,
  getResults: (s) => ({ winner: s.winner })
};
var WORDS = {
  1: ["cat", "lion", "tiger", "zebra", "panda", "giraffe", "elephant", "kangaroo", "crocodile", "dolphin", "penguin", "rabbit"],
  2: ["rice", "pizza", "burger", "noodles", "biryani", "pancake", "sandwich", "chocolate", "strawberry", "mushroom", "pineapple", "dumpling"],
  3: ["india", "japan", "brazil", "canada", "germany", "argentina", "australia", "indonesia", "switzerland", "madagascar", "portugal", "thailand"],
  4: ["code", "robot", "laptop", "server", "browser", "database", "keyboard", "internet", "algorithm", "javascript", "processor", "cybersecurity"]
};
var CATS = ["", "Animals", "Food", "Countries", "Tech"];
var wg = {
  id: "wg",
  minPlayers: 2,
  maxPlayers: 6,
  initialize(ids, st) {
    const cat = Math.min(4, Math.max(1, Number(st.category) || 1)), d = Math.min(3, Math.max(1, Number(st.difficulty) || 2)), team = !!st.team && ids.length >= 2;
    const all = WORDS[cat], pool = all.filter((w) => d === 1 ? w.length <= 5 : d === 2 ? w.length >= 6 && w.length <= 8 : w.length >= 9), list = pool.length ? pool : all;
    const sideOf = (i) => team ? i % 2 ? "B" : "A" : ids[i], sides = [...new Set(ids.map((_, i) => sideOf(i)))], lives = [8, 6, 5][d - 1];
    return { ids, team, word: list[randInt(list.length)], cat: CATS[cat], guessed: [], sideOf: Object.fromEntries(ids.map((id, i) => [id, sideOf(i)])), lives: Object.fromEntries(sides.map((x) => [x, lives])), turn: 0, winnerSide: null, over: false, log: ["Game started"] };
  },
  getPlayerView: (s, me) => ({
    game: "wg",
    you: me,
    ids: s.ids,
    team: s.team,
    cat: s.cat,
    len: s.word.length,
    mask: [...s.word].map((c) => s.guessed.includes(c) || s.over ? c : null),
    guessed: s.guessed,
    lives: s.lives,
    sideOf: s.sideOf,
    turn: s.over ? null : s.ids[s.turn],
    log: s.log.slice(-5),
    final: s.over ? s.ids.map((id) => ({ id, label: s.winnerSide && s.sideOf[id] === s.winnerSide ? `Solved \u201C${s.word}\u201D` : s.winnerSide ? "Out" : `Nobody solved \u201C${s.word}\u201D` })).sort((a, b) => (b.label.startsWith("Solved") ? 1 : 0) - (a.label.startsWith("Solved") ? 1 : 0)) : null
  }),
  handleAction(s0, pid, a) {
    const s = structuredClone(s0);
    if (s.over) throw new Error("Game over");
    if (s.ids[s.turn] !== pid) throw new Error("Not your turn");
    const side = s.sideOf[pid];
    let right = false;
    if (a.type === "letter") {
      const ch = String(a.ch || "").toLowerCase();
      if (!/^[a-z]$/.test(ch) || s.guessed.includes(ch)) throw new Error("Pick a new letter");
      s.guessed.push(ch);
      right = s.word.includes(ch);
      s.log.push(`${pid} guesses ${ch.toUpperCase()}: ${right ? "correct" : "wrong"}`);
      if ([...s.word].every((c) => s.guessed.includes(c))) {
        s.winnerSide = side;
        s.over = true;
        return s;
      }
    } else if (a.type === "word") {
      const w = String(a.word || "").toLowerCase().trim();
      if (!/^[a-z]{1,20}$/.test(w)) throw new Error("Enter a word");
      if (w === s.word) {
        s.winnerSide = side;
        s.over = true;
        s.log.push(`${pid} solves it!`);
        return s;
      }
      s.log.push(`${pid} guesses the word and is wrong`);
    } else throw new Error("Unknown action");
    if (!right) s.lives[side]--;
    if (Object.values(s.lives).every((x) => x <= 0)) {
      s.over = true;
      return s;
    }
    if (!right || a.type === "word") for (let k = 1; k <= s.ids.length; k++) {
      const j2 = (s.turn + k) % s.ids.length;
      if (s.lives[s.sideOf[s.ids[j2]]] > 0) {
        s.turn = j2;
        break;
      }
    }
    else if (s.lives[side] <= 0) for (let k = 1; k <= s.ids.length; k++) {
      const j2 = (s.turn + k) % s.ids.length;
      if (s.lives[s.sideOf[s.ids[j2]]] > 0) {
        s.turn = j2;
        break;
      }
    }
    return s;
  },
  isGameOver: (s) => s.over,
  getResults: (s) => ({ winnerSide: s.winnerSide })
};

// server/games/kittens.ts
var CATS2 = ["tabby", "calico", "siamese", "sphynx", "bengal"];
var ALL = [...CATS2, "defuse", "attack", "nope", "shuffle", "skip", "favor", "future"];
var WIN = 5e3;
var rep = (n, c) => Array(c).fill(n);
function adv2(s) {
  do
    s.turn = (s.turn + 1) % s.ids.length;
  while (!s.alive.includes(s.ids[s.turn]));
  s.owed = 1;
  s.stack = false;
  s.phase = "turn";
}
var endDraw = (s) => {
  s.peeks = {};
  if (--s.owed <= 0) adv2(s);
  else s.phase = "turn";
};
function boom(s, id) {
  s.discard.push(...s.hands[id]);
  s.hands[id] = [];
  s.alive = s.alive.filter((x) => x !== id);
  s.out.push(id);
  s.log.push(`${id} explodes!`);
  if (s.alive.length === 1) {
    s.winner = s.alive[0];
    s.phase = "over";
  } else adv2(s);
}
function resolve(s) {
  const p = s.pending;
  s.pending = void 0;
  s.phase = "turn";
  const by = p.by, c = p.cards[0];
  if (p.nopes % 2) {
    s.log.push(`${p.cards.join(" + ")} was stopped by a Nope`);
    return;
  }
  if (p.kind === "card") {
    if (c === "attack") {
      const t = (s.stack ? s.owed : 0) + 2;
      adv2(s);
      s.owed = t;
      s.stack = true;
      s.log.push(`${by} attacks! The next player must take ${t} turns`);
    } else if (c === "skip") {
      s.log.push(`${by} skips their draw`);
      if (--s.owed <= 0) adv2(s);
    } else if (c === "shuffle") {
      s.deck = shuffle(s.deck);
      s.peeks = {};
      s.log.push(`${by} shuffles the deck`);
    } else if (c === "future") {
      s.peeks[by] = s.deck.slice(-3).reverse();
      s.log.push(`${by} peeks at the future`);
    } else if (c === "favor" && s.hands[p.target].length) {
      s.phase = "favor";
      s.favor = { from: p.target, to: by };
      s.log.push(`${p.target} must give a card to ${by}`);
    }
  } else {
    const t = s.hands[p.target];
    if (p.cards.length === 2) {
      if (t.length) {
        s.hands[by].push(...t.splice(randInt(t.length), 1));
        s.log.push(`${by} steals a random card from ${p.target}`);
      }
    } else {
      const i = t.indexOf(p.name);
      if (i >= 0) {
        s.hands[by].push(...t.splice(i, 1));
        s.log.push(`${by} names ${p.name} and takes it from ${p.target}`);
      } else s.log.push(`${by} names ${p.name}, but ${p.target} has none`);
    }
  }
}
var kittens = {
  id: "kittens",
  minPlayers: 2,
  maxPlayers: 8,
  initialize(ids, st) {
    const n = ids.length, copies = n > 5 ? 2 : 1;
    const base = [...rep("attack", 4), ...rep("nope", 5), ...rep("shuffle", 4), ...rep("skip", 4), ...rep("favor", 4), ...rep("future", 5), ...CATS2.flatMap((c) => rep(c, 4))];
    let deck = shuffle(Array.from({ length: copies }).flatMap(() => base));
    const hands = Object.fromEntries(ids.map((i) => [i, ["defuse"]]));
    for (let k = 0; k < 7; k++) for (const i of ids) hands[i].push(deck.pop());
    deck.push(...rep("defuse", Math.min(2, 6 * copies - n)));
    deck = shuffle(deck);
    if (n <= 3 && st.fast !== false) deck = deck.slice(Math.floor(deck.length / 3));
    deck = shuffle([...deck, ...rep("boom", n - 1)]);
    return { ids, alive: [...ids], out: [], hands, deck, discard: [], turn: 0, owed: 1, stack: false, phase: "turn", peeks: {}, log: ["Game started"] };
  },
  getPlayerView(s, me) {
    const p = s.pending;
    return {
      game: "kittens",
      you: me,
      ids: s.ids,
      phase: s.phase,
      turn: s.phase === "over" || s.phase === "pending" ? null : s.phase === "favor" ? s.favor.from : s.ids[s.turn],
      owed: s.owed,
      hand: s.hands[me] ?? [],
      counts: Object.fromEntries(s.ids.map((i) => [i, s.hands[i].length])),
      deckCount: s.deck.length,
      discard: s.discard.slice(-1),
      alive: s.alive,
      out: s.out,
      peek: s.peeks[me] ?? null,
      pending: p ? { by: p.by, cards: p.cards, kind: p.kind, target: p.target ?? null, nopes: p.nopes, msLeft: Math.max(0, p.deadline - Date.now()), canAllow: s.alive.includes(me) && me !== p.last && !p.passed.includes(me), canNope: s.alive.includes(me) && me !== p.last && (s.hands[me] ?? []).includes("nope") } : null,
      favor: s.favor ?? null,
      log: s.log.slice(-8),
      winner: s.winner ?? null,
      final: s.winner ? [s.winner, ...[...s.out].reverse()].map((id, i) => ({ id, label: i === 0 ? "Last cat standing" : "Exploded" })) : null
    };
  },
  handleAction(s0, pid, a) {
    if ((a.type === "resolve" || a.type === "allow") && s0.phase !== "pending") return s0;
    const s = structuredClone(s0), now = Date.now();
    if (s.phase === "over") throw new Error("Game over");
    if (!s.alive.includes(pid)) throw new Error("You are out");
    const me = s.hands[pid], take = (name) => {
      const i = me.indexOf(name);
      if (i < 0) throw new Error(`You don't have ${name}`);
      me.splice(i, 1);
      s.discard.push(name);
    };
    if (s.phase === "pending") {
      const p = s.pending;
      if (a.type === "nope") {
        if (pid === p.last) throw new Error("You can't Nope your own action");
        take("nope");
        p.nopes++;
        p.last = pid;
        p.passed = [];
        p.deadline = now + WIN;
        s.log.push(`${pid} plays NOPE`);
      } else if (a.type === "allow") {
        if (pid !== p.last && !p.passed.includes(pid)) p.passed.push(pid);
        if (s.alive.every((x) => x === p.last || p.passed.includes(x))) resolve(s);
      } else if (a.type === "resolve") {
        if (now >= p.deadline) resolve(s);
      } else throw new Error("Wait for the action to resolve");
      return s;
    }
    if (s.phase === "favor") {
      if (a.type !== "give" || pid !== s.favor.from) throw new Error("Waiting for the favor");
      const i = me.indexOf(a.card);
      if (i < 0) throw new Error("Choose a card you hold");
      s.hands[s.favor.to].push(...me.splice(i, 1));
      s.favor = void 0;
      s.phase = "turn";
      return s;
    }
    if (pid !== s.ids[s.turn]) throw new Error("Not your turn");
    if (s.phase === "reinsert") {
      if (a.type !== "reinsert") throw new Error("Put the bomb back first");
      const pos = Math.min(s.deck.length, Math.max(0, Number(a.pos) | 0));
      s.deck.splice(s.deck.length - pos, 0, "boom");
      s.log.push(`${pid} hides the bomb in the deck`);
      endDraw(s);
      return s;
    }
    if (a.type === "draw") {
      const c = s.deck.pop();
      s.peeks = {};
      if (c !== "boom") {
        me.push(c);
        endDraw(s);
      } else if (me.includes("defuse")) {
        take("defuse");
        s.log.push(`${pid} defuses the bomb`);
        s.phase = "reinsert";
      } else boom(s, pid);
      return s;
    }
    const target = (t) => {
      if (!s.alive.includes(t) || t === pid || !s.hands[t].length) throw new Error("Pick another player who has cards");
      return t;
    };
    const open = (cards, extra) => {
      s.pending = { by: pid, cards, deadline: now + WIN, nopes: 0, passed: [], last: pid, ...extra };
      s.phase = "pending";
      s.log.push(`${pid} plays ${cards.join(" + ")}`);
    };
    if (a.type === "play") {
      const c = String(a.card);
      if (!["attack", "skip", "shuffle", "future", "favor"].includes(c)) throw new Error("That card can't be played alone");
      const t = c === "favor" ? target(a.target) : void 0;
      take(c);
      open([c], { kind: "card", target: t });
      return s;
    }
    if (a.type === "combo") {
      const c = String(a.card), n = a.count === 3 ? 3 : 2;
      if (!ALL.includes(c) || me.filter((x) => x === c).length < n) throw new Error("You need matching cards");
      const t = target(a.target);
      if (n === 3 && !ALL.includes(a.name)) throw new Error("Name a card");
      for (let k = 0; k < n; k++) take(c);
      open(Array(n).fill(c), { kind: "combo", target: t, name: a.name });
      return s;
    }
    throw new Error("Unknown action");
  },
  isGameOver: (s) => s.phase === "over",
  getResults: (s) => ({ winner: s.winner })
};

// server/games/leave.ts
var wrap = (f) => (s0, id) => {
  const s = structuredClone(s0);
  f(s, id);
  return s;
};
blackjack.removePlayer = wrap((s, id) => {
  const i = s.players.findIndex((p) => p.id === id);
  if (i < 0) return;
  s.players.splice(i, 1);
  if (!s.players.length) {
    s.phase = "over";
    return;
  }
  if (s.phase === "player") {
    if (i < s.turn) s.turn--;
    else if (i === s.turn) {
      s.turn = i - 1;
      advance(s);
    }
  }
});
flip7.removePlayer = wrap((s, id) => {
  const i = s.players.findIndex((p) => p.id === id);
  if (i < 0) return;
  s.players.splice(i, 1);
  if (i < s.turn) s.turn--;
  else if (i === s.turn && s.phase === "play") {
    s.turn = i - 1;
    advance2(s);
  }
  if (s.turn >= s.players.length || s.turn < 0) s.turn = 0;
});
inbetween.removePlayer = wrap(dropId);
sl.removePlayer = wrap(dropId);
wg.removePlayer = wrap(dropId);
leastcount.removePlayer = wrap((s, id) => {
  const was = s.ids[s.turn] === id;
  dropId(s, id);
  if (was) s.tp = "start";
});
crazy8.removePlayer = wrap((s, id) => {
  const was = s.ids[s.turn] === id;
  dropId(s, id);
  if (was) s.drew = false;
});
ludo.removePlayer = wrap((s, id) => {
  const was = s.ids[s.turn] === id;
  dropId(s, id);
  if (was) {
    s.phase = "roll";
    s.legal = [];
  }
});
bluff.removePlayer = wrap((s, id) => {
  if (s.last?.by === id) s.last = void 0;
  if (s.pendingWin === id) s.pendingWin = void 0;
  dropId(s, id);
});
gofish.removePlayer = wrap((s, id) => {
  dropId(s, id);
  if (s.phase === "play") settle(s);
});
elimination.removePlayer = wrap((s, id) => {
  dropId(s, id);
  s.owed = 1;
  if (s.alive.length <= 1) {
    s.phase = "over";
    return;
  }
  while (!s.alive.includes(s.ids[s.turn])) s.turn = (s.turn + 1) % s.ids.length;
});
kittens.removePlayer = wrap((s, id) => {
  if (!s.alive.includes(id)) return;
  const wasTurn = s.ids[s.turn] === id;
  s.discard.push(...s.hands[id]);
  s.hands[id] = [];
  s.alive = s.alive.filter((x) => x !== id);
  s.out.push(id);
  if (s.phase === "reinsert" && wasTurn) s.deck.splice(randInt(s.deck.length + 1), 0, "boom");
  if (s.favor && (s.favor.from === id || s.favor.to === id)) {
    s.favor = void 0;
    s.phase = "turn";
  }
  if (s.pending?.by === id || s.pending?.target === id) {
    s.pending = void 0;
    s.phase = "turn";
  }
  if (s.alive.length <= 1) {
    s.winner = s.alive[0];
    s.phase = "over";
    return;
  }
  if (wasTurn) adv2(s);
});

// server/games/index.ts
var engines = { blackjack, inbetween, flip7, leastcount, elimination, crazy8, bluff, gofish, ttt, c4, dab, nim, rps, sl, ludo, bs, wg, kittens };

// server/room.ts
var Room = class {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.ctx.blockConcurrencyWhile(async () => {
      Object.assign(this, await this.ctx.storage.get("room") ?? {});
      this.members.forEach((m) => m.connected = false);
    });
  }
  state = null;
  status = "waiting";
  game = "blackjack";
  settings = {};
  abandoned = false;
  members = [];
  hostId = "";
  code = "";
  lastSeq = /* @__PURE__ */ new Map();
  sockets = /* @__PURE__ */ new Map();
  async fetch(req) {
    const url = new URL(req.url);
    this.code ||= url.searchParams.get("code") ?? "";
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    server.addEventListener("message", (e) => this.ctx.blockConcurrencyWhile(() => this.onMsg(server, String(e.data))));
    server.addEventListener("close", () => this.ctx.blockConcurrencyWhile(() => this.onClose(server)));
    return new Response(null, { status: 101, webSocket: client });
  }
  async hashTok(t) {
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t + this.env.GUEST_TOKEN_SECRET));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  }
  send(ws, m) {
    try {
      ws.send(JSON.stringify(m));
    } catch {
    }
  }
  pub() {
    return this.members.map((m) => ({ id: m.id, nickname: m.nickname, connected: m.connected, isHost: m.id === this.hostId }));
  }
  async save() {
    await this.ctx.storage.put("room", { state: this.state, status: this.status, game: this.game, settings: this.settings, members: this.members, hostId: this.hostId, code: this.code, abandoned: this.abandoned });
  }
  broadcast() {
    for (const [ws, id] of this.sockets) {
      this.send(ws, { t: "room", code: this.code, status: this.status, game: this.game, settings: this.settings, players: this.pub(), abandoned: this.abandoned });
      if (this.state) this.send(ws, { t: "state", view: engines[this.game].getPlayerView(this.state, id) });
    }
  }
  sys(text) {
    for (const ws of this.sockets.keys()) this.send(ws, { t: "chat", from: "system", text, system: true });
  }
  async onMsg(ws, raw) {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      if (m.t === "join") return await this.join(ws, m);
      const id = this.sockets.get(ws);
      if (!id) throw new Error("Not joined");
      const isHost = id === this.hostId;
      switch (m.t) {
        case "config":
          if (!isHost || this.status !== "waiting") throw new Error("Host only, before start");
          if (!engines[m.game]) throw new Error("Unknown game");
          this.game = m.game;
          this.settings = m.settings ?? {};
          break;
        case "start":
        case "rematch": {
          if (!isHost) throw new Error("Host only");
          if (m.t === "start" && this.status !== "waiting") throw new Error("Already started");
          if (m.t === "rematch" && this.status !== "completed") throw new Error("Game not finished");
          const e = engines[this.game], ids = this.members.filter((x) => x.connected).map((x) => x.id);
          if (ids.length < e.minPlayers || ids.length > e.maxPlayers) throw new Error(`Needs ${e.minPlayers}-${e.maxPlayers} players`);
          this.state = e.initialize(ids, this.settings);
          this.status = "active";
          this.abandoned = false;
          this.lastSeq.clear();
          this.sys("Game started");
          break;
        }
        case "kick":
          if (!isHost || m.playerId === id) throw new Error("Not allowed");
          for (const [w, pid] of this.sockets) if (pid === m.playerId) {
            this.sockets.delete(w);
            w.close(4e3, "removed");
          }
          this.dropMembers([m.playerId]);
          break;
        case "action": {
          if (this.status !== "active") throw new Error("No active game");
          if (!Number.isInteger(m.seq) || m.seq <= (this.lastSeq.get(id) ?? -1)) throw new Error("Duplicate action");
          this.lastSeq.set(id, m.seq);
          const e = engines[this.game];
          this.state = e.handleAction(this.state, id, m.action);
          if (e.isGameOver(this.state)) {
            this.status = "completed";
            this.sys("Game over");
          }
          break;
        }
        case "leave": {
          this.dropMembers([id]);
          this.sockets.delete(ws);
          await this.save();
          this.broadcast();
          return;
        }
        case "lobby":
          if (!isHost || this.status !== "completed") throw new Error("Host only, after the game");
          this.status = "waiting";
          this.state = null;
          this.abandoned = false;
          this.sys("Back to the lobby");
          break;
        case "chat": {
          const t = String(m.text).replace(/[\u0000-\u001f<>]/g, "").slice(0, 300).trim();
          if (!t) return;
          const n = this.members.find((x) => x.id === id).nickname;
          for (const w of this.sockets.keys()) this.send(w, { t: "chat", from: n, text: t });
          return;
        }
        case "react":
          if (!["\u{1F44D}", "\u{1F602}", "\u{1F62E}", "\u{1F622}", "\u{1F525}", "\u{1F44F}"].includes(m.emoji)) return;
          for (const w of this.sockets.keys()) this.send(w, { t: "react", from: id, emoji: m.emoji });
          return;
      }
      await this.save();
      this.broadcast();
    } catch (e) {
      this.send(ws, { t: "error", message: e.message ?? "Error" });
    }
  }
  /** Remove players (left, kicked or timed out). Mid-game the engine removes them if it can; otherwise the game is abandoned. */
  dropMembers(ids) {
    const gone = this.members.filter((m) => ids.includes(m.id));
    if (!gone.length) return [];
    this.members = this.members.filter((m) => !ids.includes(m.id));
    for (const [w, pid] of [...this.sockets]) if (ids.includes(pid)) this.sockets.delete(w);
    if (ids.includes(this.hostId)) this.hostId = (this.members.find((m) => m.connected) ?? this.members[0])?.id ?? "";
    const e = engines[this.game];
    if (this.status === "active" && this.state) {
      for (const m of gone) if (e.removePlayer && !e.isGameOver(this.state)) this.state = e.removePlayer(this.state, m.id);
      if (e.isGameOver(this.state)) this.status = "completed";
      else if (this.members.length < e.minPlayers) {
        this.status = "completed";
        this.abandoned = true;
      }
    }
    return gone.map((m) => m.nickname);
  }
  async join(ws, m) {
    const nick = String(m.nickname).replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 16);
    if (!m.token || m.token.length < 32 || !nick) throw new Error("Invalid nickname or session");
    const hash = await this.hashTok(m.token);
    let me = this.members.find((x) => x.hash === hash);
    if (!me) {
      if (this.status === "closed") throw new Error("Room closed");
      if (this.status !== "waiting") throw new Error("Game already in progress");
      if (this.members.length >= 8) throw new Error("Room full");
      if (this.members.some((x) => x.nickname.toLowerCase() === nick.toLowerCase())) throw new Error("Nickname taken");
      me = { id: crypto.randomUUID(), nickname: nick, hash, connected: true };
      this.members.push(me);
      if (!this.hostId) this.hostId = me.id;
      this.sys(`${nick} joined`);
    }
    me.connected = true;
    this.sockets.set(ws, me.id);
    this.send(ws, { t: "joined", playerId: me.id });
    await this.save();
    this.broadcast();
  }
  async onClose(ws) {
    const id = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (!id) return;
    const me = this.members.find((x) => x.id === id);
    if (!me) return;
    me.connected = [...this.sockets.values()].includes(id);
    if (!me.connected && id === this.hostId) {
      const n = this.members.find((x) => x.connected);
      if (n) {
        this.hostId = n.id;
        this.sys(`${n.nickname} is now host`);
      }
    }
    if (!this.members.some((x) => x.connected)) await this.ctx.storage.setAlarm(Date.now() + 6 * 36e5);
    await this.save();
    this.broadcast();
  }
  async alarm() {
    if (!this.members.some((x) => x.connected)) {
      this.status = "closed";
      await this.ctx.storage.deleteAll();
    }
  }
};

// supabase/game-src.ts
var URL_ = Deno.env.get("SUPABASE_URL");
var KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var SECRET = Deno.env.get("GUEST_TOKEN_SECRET") || "";
var ORIGIN = (Deno.env.get("CLIENT_ORIGIN") || "*").replace(/\/$/, "");
var H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json" };
var cors = { "Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
var j = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
var STALE = 45e3;
var roomMsg = (r) => ({ t: "room", code: r.code, status: r.status, game: r.game, settings: r.settings, players: r.pub(), abandoned: r.abandoned });
async function attempt(code, token, msg, create) {
  const rows = await (await fetch(`${URL_}/rest/v1/room_states?code=eq.${code}&select=data,version`, { headers: H })).json();
  let data, version = -1;
  if (rows.length) ({ data, version } = rows[0]);
  else if (create && msg.t === "join") data = {};
  else return { msgs: [{ t: "error", message: "Room not found" }] };
  data.seen ??= {};
  data.keys ??= {};
  data.seq ??= {};
  const was = (data.room?.members || []).map((m) => m.connected).join() + data.room?.hostId;
  let ready;
  const ctx = { blockConcurrencyWhile: (f) => ready = f(), storage: { get: async () => data.room, put: async (_, v) => {
    data.room = v;
  }, deleteAll: async () => {
  }, setAlarm: async () => {
  } } };
  const room = new Room(ctx, { GUEST_TOKEN_SECRET: SECRET });
  await ready;
  room.code = code;
  room.lastSeq = new Map(Object.entries(data.seq));
  const hash = await room.hashTok(token), mm = room.members.find((m) => m.hash === hash);
  if (!mm && msg.t !== "join") return { msgs: [{ t: "error", message: "Not joined to this room" }] };
  const now = Date.now();
  if (mm) data.seen[mm.id] = now;
  const after = room.status === "active" ? 75e3 : room.status === "waiting" ? 12e4 : 3e5;
  const removed = room.dropMembers(room.members.filter((m) => m.id !== mm?.id && now - (data.seen[m.id] || 0) > after).map((m) => m.id));
  for (const m of room.members) m.connected = m.id === mm?.id || now - (data.seen[m.id] || 0) < STALE;
  const host = room.members.find((m) => m.id === room.hostId);
  if (!host?.connected) {
    const n = room.members.find((m) => m.connected);
    if (n) room.hostId = n.id;
  }
  const changed = removed.length > 0 || was !== room.members.map((m) => m.connected).join() + room.hostId;
  const outs = /* @__PURE__ */ new Map();
  const mk2 = (id) => {
    const a = [];
    outs.set(id, a);
    return { send: (s) => a.push(s), close() {
    } };
  };
  for (const m of room.members) if (m.id !== mm?.id) room.sockets.set(mk2(m.id), m.id);
  const cf = mk2("#");
  if (mm) room.sockets.set(cf, mm.id);
  removed.forEach((n) => room.sys(`${n} was removed for inactivity`));
  if (msg.t === "ping") {
    if (changed) {
      await room.save();
      room.broadcast();
    }
  } else await room.onMsg(cf, JSON.stringify(msg));
  const mine = (outs.get("#") || []).map((s) => JSON.parse(s));
  if (!data.room) return { msgs: mine };
  const myId = room.sockets.get(cf);
  data.seq = Object.fromEntries(room.lastSeq);
  if (myId) {
    data.keys[myId] ??= crypto.randomUUID();
    data.seen[myId] = now;
  }
  for (const id of Object.keys(data.keys)) if (!room.members.some((m) => m.id === id)) {
    delete data.keys[id];
    delete data.seen[id];
  }
  let ok2;
  if (version < 0) ok2 = (await fetch(`${URL_}/rest/v1/room_states`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ code, data, version: 0 }) })).ok;
  else {
    const r = await fetch(`${URL_}/rest/v1/room_states?code=eq.${code}&version=eq.${version}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ data, version: version + 1, updated_at: (/* @__PURE__ */ new Date()).toISOString() }) });
    ok2 = r.ok && (await r.json()).length > 0;
  }
  if (!ok2) return null;
  const pub = [], any = [...outs.values()].find((v) => v.length);
  for (const m of (any || []).map((s) => JSON.parse(s))) if (["room", "chat", "react"].includes(m.t)) pub.push({ topic: `room:${code}`, event: "m", payload: m, private: false });
  for (const [id, list] of outs) {
    if (id === "#") continue;
    const st = list.map((s) => JSON.parse(s)).filter((m) => m.t === "state").pop();
    if (st && data.keys[id]) pub.push({ topic: `v:${data.keys[id]}`, event: "m", payload: st, private: false });
  }
  if (pub.length) await fetch(`${URL_}/realtime/v1/api/broadcast`, { method: "POST", headers: H, body: JSON.stringify({ messages: pub }) }).catch(console.error);
  let msgs = mine.filter((m) => ["joined", "error", "room", "state"].includes(m.t));
  if (msg.t === "ping" && myId) msgs = [roomMsg(room), ...room.state ? [{ t: "state", view: engines[room.game].getPlayerView(room.state, myId) }] : []];
  return { msgs, viewKey: myId ? data.keys[myId] : void 0 };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { code, token, msg, create } = await req.json();
    if (!SECRET) return j({ msgs: [{ t: "error", message: "Server not configured (GUEST_TOKEN_SECRET)" }] });
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code) || typeof token !== "string" || token.length < 32 || !msg || typeof msg !== "object") return j({ msgs: [{ t: "error", message: "Bad request" }] });
    for (let i = 0; i < 6; i++) {
      const r = await attempt(code, token, msg, !!create);
      if (r) return j(r);
    }
    return j({ msgs: [{ t: "error", message: "Busy, please retry" }] });
  } catch (e) {
    console.error(e);
    return j({ msgs: [{ t: "error", message: "Server error" }] });
  }
});
