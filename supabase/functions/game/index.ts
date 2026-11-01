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
    let r, pts;
    if (p.status === "bust") [r, pts] = ["loss", -m];
    else if (p.status === "blackjack") [r, pts] = dBJ ? ["push", 0] : ["blackjack", 1.5];
    else if (dBJ) [r, pts] = ["loss", -m];
    else if (d > 21 || t > d) [r, pts] = ["win", m];
    else if (t === d) [r, pts] = ["push", 0];
    else [r, pts] = ["loss", -m];
    p.score += pts;
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
      hand: s.hands[me],
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
          const top = s.discard.pop();
          s.deck = shuffle(s.discard);
          s.discard = [top];
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
      hand: s.hands[me],
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

// server/games/index.ts
var engines = { blackjack, inbetween, flip7, leastcount, elimination };

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
    await this.ctx.storage.put("room", { state: this.state, status: this.status, game: this.game, settings: this.settings, members: this.members, hostId: this.hostId, code: this.code });
  }
  broadcast() {
    for (const [ws, id] of this.sockets) {
      this.send(ws, { t: "room", code: this.code, status: this.status, game: this.game, settings: this.settings, players: this.pub() });
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
          this.members = this.members.filter((x) => x.id !== m.playerId);
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
var roomMsg = (r) => ({ t: "room", code: r.code, status: r.status, game: r.game, settings: r.settings, players: r.pub() });
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
  for (const m of room.members) m.connected = m.id === mm?.id || now - (data.seen[m.id] || 0) < STALE;
  const host = room.members.find((m) => m.id === room.hostId);
  if (!host?.connected) {
    const n = room.members.find((m) => m.connected);
    if (n) room.hostId = n.id;
  }
  const changed = was !== room.members.map((m) => m.connected).join() + room.hostId;
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
  let ok;
  if (version < 0) ok = (await fetch(`${URL_}/rest/v1/room_states`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ code, data, version: 0 }) })).ok;
  else {
    const r = await fetch(`${URL_}/rest/v1/room_states?code=eq.${code}&version=eq.${version}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ data, version: version + 1, updated_at: (/* @__PURE__ */ new Date()).toISOString() }) });
    ok = r.ok && (await r.json()).length > 0;
  }
  if (!ok) return null;
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
