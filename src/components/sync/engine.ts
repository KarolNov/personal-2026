// The logic behind the <SyncPlayground> demos: three tiny sync strategies for one shared line of
// text, edited by two clients through a server. Kept free of DOM code so it reads like the
// article it illustrates — and so each strategy can be swapped behind one interface.
//
// Everything works on code points, not UTF-16 units, so typing an emoji is a single edit.

export type ClientId = 'alice' | 'bob';
export const CLIENTS: ClientId[] = ['alice', 'bob'];

export const chars = (s: string) => Array.from(s);

/** What a strategy reports back so the UI can move the caret and describe the change. */
export type Effect = { kind: 'ins' | 'del'; pos: number } | { kind: 'set' };

/** An entry in the server's log, shown under the server box. */
export type LogEntry = { by: ClientId; text: string; changed?: boolean };

/** A message on the wire. `label` is the short text drawn on the travelling pill. */
export type Message = { label: string; ack?: boolean; payload: unknown };

/**
 * One sync strategy. The playground calls `edit` when someone types, moves the returned
 * messages over the (simulated) network, and hands them to `serverReceive` / `clientReceive`.
 */
export interface Strategy {
  text(who: ClientId | 'server'): string;
  edit(who: ClientId, prev: string, next: string): Message[];
  /** The client's link came back online or got an ack: anything it was holding back. */
  flush(who: ClientId): Message[];
  serverReceive(from: ClientId, msg: Message): { log?: LogEntry; out: { to: ClientId; msg: Message }[] };
  clientReceive(who: ClientId, msg: Message): { effects: Effect[]; out: Message[] };
  /** The CRDT strategy exposes its items so the playground can draw them. */
  items?(who: ClientId): Item[];
}

const NAME: Record<ClientId, string> = { alice: 'Alice', bob: 'Bob' };
const short = (s: string, n = 11) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const show = (ch: string) => (ch === ' ' ? '␣' : ch);

// ---------------------------------------------------------------------------------------------
// 1. Naive: send the whole value, last write wins.

export function naive(initial: string): Strategy {
  const state = { alice: initial, bob: initial, server: initial };
  return {
    text: (who) => state[who],
    edit(who, _prev, next) {
      state[who] = next;
      return [{ label: `"${short(next)}"`, payload: next }];
    },
    flush: () => [],
    serverReceive(from, msg) {
      const text = msg.payload as string;
      const overwrote = state.server !== text;
      state.server = text;
      const to = from === 'alice' ? 'bob' : 'alice';
      return {
        log: { by: from, text: `stored ${NAME[from]}'s copy as-is`, changed: overwrote },
        out: [{ to, msg: { label: msg.label, payload: text } }],
      };
    },
    clientReceive(who, msg) {
      state[who] = msg.payload as string;
      return { effects: [{ kind: 'set' }], out: [] };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 2. Operational transformation, with a central server (the classic Jupiter / ot.js shape).
//    Every edit becomes single-character ops; the server orders them and transforms late ones.

export type TextOp =
  | { t: 'ins'; pos: number; ch: string; by: ClientId }
  | { t: 'del'; pos: number; by: ClientId }
  | { t: 'noop'; by: ClientId };

/** Turn "the input went from prev to next" into single-character ops. */
export function diff(prev: string, next: string, by: ClientId): TextOp[] {
  const a = chars(prev);
  const b = chars(next);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const ops: TextOp[] = [];
  for (let i = start; i < endA; i++) ops.push({ t: 'del', pos: start, by });
  for (let i = start; i < endB; i++) ops.push({ t: 'ins', pos: i, ch: b[i], by });
  return ops;
}

export function applyOp(text: string[], op: TextOp) {
  if (op.t === 'ins') text.splice(op.pos, 0, op.ch);
  else if (op.t === 'del') text.splice(op.pos, 1);
}

/**
 * Given two ops made concurrently on the same text, return [a', b'] so that applying a then b'
 * gives the same text as b then a'. Ties between inserts at one spot go to Alice — any rule
 * works, as long as every replica uses the same one.
 */
export function transform(a: TextOp, b: TextOp): [TextOp, TextOp] {
  if (a.t === 'noop' || b.t === 'noop') return [a, b];
  if (a.t === 'ins' && b.t === 'ins') {
    if (a.pos < b.pos || (a.pos === b.pos && a.by < b.by)) return [a, { ...b, pos: b.pos + 1 }];
    return [{ ...a, pos: a.pos + 1 }, b];
  }
  if (a.t === 'ins' && b.t === 'del') {
    if (a.pos <= b.pos) return [a, { ...b, pos: b.pos + 1 }];
    return [{ ...a, pos: a.pos - 1 }, b];
  }
  if (a.t === 'del' && b.t === 'ins') {
    const [b2, a2] = transform(b, a);
    return [a2, b2];
  }
  // Both deletes. Deleting the same character twice must only delete it once.
  if (a.pos === b.pos) return [{ t: 'noop', by: a.by }, { t: 'noop', by: b.by }];
  if (a.pos < b.pos) return [a, { ...b, pos: b.pos - 1 }];
  return [{ ...a, pos: a.pos - 1 }, b];
}

export const fmtOp = (op: TextOp) =>
  op.t === 'ins' ? `+${show(op.ch)}@${op.pos}` : op.t === 'del' ? `−@${op.pos}` : 'no-op';

const fmtOps = (ops: TextOp[]) => (ops.length === 1 ? fmtOp(ops[0]) : `${fmtOp(ops[0])} +${ops.length - 1}`);

export function ot(initial: string): Strategy {
  const server = { text: chars(initial), history: [] as TextOp[] };
  const clients = Object.fromEntries(
    CLIENTS.map((c) => [c, { text: chars(initial), rev: 0, inflight: null as TextOp[] | null, buffer: [] as TextOp[] }]),
  ) as Record<ClientId, { text: string[]; rev: number; inflight: TextOp[] | null; buffer: TextOp[] }>;

  function send(who: ClientId): Message[] {
    const c = clients[who];
    if (c.inflight || !c.buffer.length) return [];
    c.inflight = c.buffer;
    c.buffer = [];
    return [{ label: fmtOps(c.inflight), payload: { rev: c.rev, ops: c.inflight } }];
  }

  return {
    text: (who) => (who === 'server' ? server.text : clients[who].text).join(''),
    edit(who, prev, next) {
      const c = clients[who];
      const ops = diff(prev, next, who);
      ops.forEach((op) => applyOp(c.text, op));
      c.buffer.push(...ops);
      // Only one batch is in flight per client; the rest waits for the server's ack.
      return send(who);
    },
    flush: send,
    serverReceive(from, msg) {
      const { rev, ops } = msg.payload as { rev: number; ops: TextOp[] };
      // Everything the server applied since this client's last known revision happened
      // concurrently with these ops, so each op is transformed past all of it.
      const concurrent = server.history.slice(rev);
      const applied = ops.map((op) => {
        let o = op;
        for (let i = 0; i < concurrent.length; i++) [o, concurrent[i]] = transform(o, concurrent[i]);
        applyOp(server.text, o);
        server.history.push(o);
        return o;
      });
      const before = fmtOps(ops);
      const after = fmtOps(applied);
      const changed = before !== after;
      const to = from === 'alice' ? 'bob' : 'alice';
      return {
        log: {
          by: from,
          changed,
          text: changed ? `${before} → ${after} (moved past ${concurrent.length} earlier op${concurrent.length === 1 ? '' : 's'})` : `${before} applied as-is`,
        },
        out: [
          { to: from, msg: { label: 'ack', ack: true, payload: { ack: ops.length } } },
          { to, msg: { label: after, payload: { ops: applied } } },
        ],
      };
    },
    clientReceive(who, msg) {
      const c = clients[who];
      const payload = msg.payload as { ack?: number; ops?: TextOp[] };
      if (payload.ack) {
        c.rev += payload.ack;
        c.inflight = null;
        return { effects: [], out: send(who) };
      }
      const effects: Effect[] = [];
      for (const incoming of payload.ops!) {
        c.rev++;
        // The server's op doesn't know about our unacknowledged ops yet: transform it past
        // them (and them past it) before applying it locally.
        let s = incoming;
        if (c.inflight) c.inflight = c.inflight.map((p) => { const [p2, s2] = transform(p, s); s = s2; return p2; });
        c.buffer = c.buffer.map((p) => { const [p2, s2] = transform(p, s); s = s2; return p2; });
        applyOp(c.text, s);
        if (s.t !== 'noop') effects.push({ kind: s.t, pos: s.pos });
      }
      return { effects, out: [] };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// 3. A sequence CRDT (RGA). Every character gets a unique id and remembers the character it
//    was typed after. Ops point at ids, not positions, so they apply in any order — no
//    transforming, no central ordering. Deleted characters stay behind as tombstones.

export type Id = { c: ClientId | 'seed'; n: number };
export type Item = { id: Id; origin: Id | null; ch: string; deleted: boolean };
type CrdtOp = { t: 'ins'; id: Id; origin: Id | null; ch: string } | { t: 'del'; id: Id };

const sameId = (a: Id | null, b: Id | null) => !!a && !!b && a.c === b.c && a.n === b.n;
const after = (a: Id, b: Id) => a.n > b.n || (a.n === b.n && a.c > b.c);
export const fmtId = (id: Id) => `${id.c[0]}${id.n}`;

class Rga {
  items: Item[];
  clock: number;

  constructor(private who: ClientId | 'server', initial: string) {
    let origin: Id | null = null;
    this.items = chars(initial).map((ch, i) => {
      const item: Item = { id: { c: 'seed', n: i + 1 }, origin, ch, deleted: false };
      origin = item.id;
      return item;
    });
    this.clock = this.items.length;
  }

  text() {
    return this.items.filter((i) => !i.deleted).map((i) => i.ch).join('');
  }

  /** Index in `items` of the visible character at `pos` (or items.length past the end). */
  private indexOfVisible(pos: number) {
    let seen = -1;
    for (let i = 0; i < this.items.length; i++) if (!this.items[i].deleted && ++seen === pos) return i;
    return this.items.length;
  }

  private visiblePos(index: number) {
    let pos = 0;
    for (let i = 0; i < index; i++) if (!this.items[i].deleted) pos++;
    return pos;
  }

  local(op: TextOp): CrdtOp | null {
    if (op.t === 'ins') {
      const before = op.pos === 0 ? null : this.items[this.indexOfVisible(op.pos - 1)].id;
      const crdtOp: CrdtOp = { t: 'ins', id: { c: this.who as ClientId, n: ++this.clock }, origin: before, ch: op.ch };
      this.integrate(crdtOp);
      return crdtOp;
    }
    if (op.t === 'del') {
      const item = this.items[this.indexOfVisible(op.pos)];
      item.deleted = true;
      return { t: 'del', id: item.id };
    }
    return null;
  }

  /** Apply a remote op; returns what it did to the visible text. */
  integrate(op: CrdtOp): Effect | null {
    if (op.t === 'del') {
      const index = this.items.findIndex((i) => sameId(i.id, op.id));
      if (index < 0 || this.items[index].deleted) return null;
      this.items[index].deleted = true;
      return { kind: 'del', pos: this.visiblePos(index) };
    }
    if (this.items.some((i) => sameId(i.id, op.id))) return null;
    this.clock = Math.max(this.clock, op.id.n);
    // Start right after the character it was typed after, then skip any siblings with a
    // newer id (and, with them, everything typed after those). Every replica skips the same
    // ones, so every replica lands on the same spot.
    let index = op.origin ? this.items.findIndex((i) => sameId(i.id, op.origin)) + 1 : 0;
    while (index < this.items.length && after(this.items[index].id, op.id)) index++;
    this.items.splice(index, 0, { id: op.id, origin: op.origin, ch: op.ch, deleted: false });
    return { kind: 'ins', pos: this.visiblePos(index) };
  }
}

const fmtCrdt = (op: CrdtOp) => (op.t === 'ins' ? `+${show(op.ch)} ${fmtId(op.id)}` : `−${fmtId(op.id)}`);

export function crdt(initial: string): Strategy {
  const docs = {
    alice: new Rga('alice', initial),
    bob: new Rga('bob', initial),
    server: new Rga('server', initial),
  };
  return {
    text: (who) => docs[who].text(),
    items: (who) => docs[who].items,
    edit(who, prev, next) {
      const ops = diff(prev, next, who).map((op) => docs[who].local(op)!).filter(Boolean);
      return ops.length ? [{ label: ops.length === 1 ? fmtCrdt(ops[0]) : `${fmtCrdt(ops[0])} +${ops.length - 1}`, payload: ops }] : [];
    },
    flush: () => [],
    serverReceive(from, msg) {
      // The server can be a plain relay. Here it also keeps a copy, the way a Yjs server
      // does to persist documents — but it never has to rewrite anyone's ops.
      (msg.payload as CrdtOp[]).forEach((op) => docs.server.integrate(op));
      const to = from === 'alice' ? 'bob' : 'alice';
      return { log: { by: from, text: `${msg.label} relayed unchanged` }, out: [{ to, msg }] };
    },
    clientReceive(who, msg) {
      const effects = (msg.payload as CrdtOp[]).map((op) => docs[who].integrate(op)).filter((e): e is Effect => !!e);
      return { effects, out: [] };
    },
  };
}

export const STRATEGIES = { naive, ot, crdt };
export type Mode = keyof typeof STRATEGIES;
