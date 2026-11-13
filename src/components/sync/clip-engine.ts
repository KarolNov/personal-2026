// The logic behind the <ClipPlayground> demos: one clip on a video timeline, edited by two
// clients through a server, stored four different ways. Kept free of DOM code, like ./engine.ts,
// so each data model reads on its own and they all sit behind one interface.
//
// Times are in seconds. The clip runs from `in` to `out` on a track TRACK seconds long.

export type ClientId = 'alice' | 'bob';
export type Replica = ClientId | 'server';
export const CLIENTS: ClientId[] = ['alice', 'bob'];

export const TRACK = 20;
/** The shortest clip the app allows. Each client respects it locally; only merges break it. */
export const MIN = 1;

export type Clip = { in: number; out: number };

/** What a person did with the mouse: dragged the body, or one of the two edges. */
export type Gesture = { kind: 'move' | 'trimStart' | 'trimEnd'; by: number };

export type LogEntry = { by: ClientId; text: string; changed?: boolean };
/** `fix` marks a correction the server made itself, drawn in grey like an ack. */
export type Message = { label: string; ack?: boolean; fix?: boolean; from?: ClientId; payload: unknown };

/** One stored field, as the playground draws it under each copy. */
export type Field = { key: string; value: string; stamp?: string; by?: ClientId | 'server'; pending?: boolean };

export interface Strategy {
  clip(who: Replica): Clip;
  fields(who: Replica): Field[];
  /** A finished drag. Returns what goes on the wire. */
  gesture(who: ClientId, g: Gesture): Message[];
  serverReceive(from: ClientId, msg: Message): { log?: LogEntry; out: { to: ClientId; msg: Message }[] };
  clientReceive(who: ClientId, msg: Message): { out: Message[] };
}

const NAME: Record<ClientId, string> = { alice: 'Alice', bob: 'Bob' };
const other = (c: ClientId): ClientId => (c === 'alice' ? 'bob' : 'alice');
const round = (n: number) => Math.round(n * 2) / 2;
export const fmt = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}s`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`;
export const valid = (c: Clip) => c.out - c.in >= MIN - 1e-9 && c.in >= 0 && c.out <= TRACK;

/**
 * The one repair rule: a clip that ends too early is pushed out to the minimum length, keeping
 * where it starts. Deterministic, so the server and every reader that applies it agree.
 */
export const repair = (c: Clip): Clip => (c.out - c.in >= MIN ? c : { in: c.in, out: round(c.in + MIN) });

/**
 * Apply a gesture to a clip and keep the result valid: no shorter than MIN, inside the track.
 * Every client runs this on its own edits, and the intent server runs it on every operation.
 * Returns the new clip, and whether a rule had to step in.
 */
export function apply(c: Clip, g: Gesture): { clip: Clip; clamped: boolean } {
  let next: Clip;
  if (g.kind === 'move') {
    const by = Math.min(Math.max(g.by, -c.in), TRACK - c.out);
    next = { in: c.in + by, out: c.out + by };
  } else if (g.kind === 'trimStart') {
    next = { in: Math.min(Math.max(c.in + g.by, 0), c.out - MIN), out: c.out };
  } else {
    next = { in: c.in, out: Math.max(Math.min(c.out + g.by, TRACK), c.in + MIN) };
  }
  next = { in: round(next.in), out: round(next.out) };
  const wanted = g.kind === 'trimEnd' ? c.out + g.by : c.in + g.by;
  const got = g.kind === 'trimEnd' ? next.out : next.in;
  return { clip: next, clamped: Math.abs(wanted - got) > 1e-9 };
}

const describe = (g: Gesture) =>
  g.kind === 'move' ? `move ${signed(g.by)}` : g.kind === 'trimStart' ? `start ${signed(g.by)}` : `end ${signed(g.by)}`;

// ---------------------------------------------------------------------------------------------
// Last-write-wins registers, one per key, the way a Y.Map or a Liveblocks LiveObject merges a
// record. Each write carries a Lamport clock; the higher clock wins, and a tie goes to the higher
// client id. Every copy applies the same rule, so every copy converges — whatever the values mean.

type Stamp = { clock: number; by: ClientId | 'seed' | 'server' };
type Register<V> = { value: V; stamp: Stamp };
const RANK = { seed: 0, alice: 1, bob: 2, server: 3 };
const newer = (a: Stamp, b: Stamp) => a.clock > b.clock || (a.clock === b.clock && RANK[a.by] > RANK[b.by]);

/** How a record-shaped data model maps a clip to stored keys and back. */
interface Shape<R extends Record<string, unknown>> {
  toRecord(c: Clip): R;
  toClip(r: R): Clip;
  show(key: keyof R & string, value: R[keyof R]): string;
  /** If set, the server checks the merged record after every write and writes back a repair. */
  fix?(r: R): Partial<R> | null;
}

function lww<R extends Record<string, unknown>>(shape: Shape<R>, initial: Clip): Strategy {
  type Doc = { regs: { [K in keyof R]: Register<R[K]> }; clock: number };
  const seed = (): Doc => {
    const rec = shape.toRecord(initial);
    const regs = {} as Doc['regs'];
    for (const k in rec) regs[k] = { value: rec[k], stamp: { clock: 0, by: 'seed' } };
    return { regs, clock: 0 };
  };
  const docs: Record<Replica, Doc> = { alice: seed(), bob: seed(), server: seed() };
  const record = (d: Doc) => {
    const r = {} as R;
    for (const k in d.regs) r[k] = d.regs[k].value;
    return r;
  };
  type Write = { key: keyof R & string; value: unknown; stamp: Stamp };
  const integrate = (d: Doc, writes: Write[]) => {
    let won = 0;
    for (const w of writes) {
      d.clock = Math.max(d.clock, w.stamp.clock);
      const reg = d.regs[w.key];
      if (newer(w.stamp, reg.stamp)) {
        d.regs[w.key] = { value: w.value as R[typeof w.key], stamp: w.stamp };
        won++;
      }
    }
    return won;
  };
  const label = (writes: Write[]) =>
    writes.map((w) => `${w.key} ${shape.show(w.key, w.value as R[keyof R])}`).join(' · ');

  return {
    clip: (who) => shape.toClip(record(docs[who])),
    fields: (who) =>
      Object.entries(docs[who].regs).map(([key, reg]) => ({
        key,
        value: shape.show(key, reg.value as R[keyof R]),
        stamp: reg.stamp.by === 'seed' ? undefined : `${reg.stamp.clock}·${reg.stamp.by[0].toUpperCase()}`,
        by: reg.stamp.by === 'seed' ? undefined : reg.stamp.by,
      })),
    gesture(who, g) {
      const d = docs[who];
      const before = record(d);
      const after = shape.toRecord(apply(shape.toClip(before), g).clip);
      // Only the keys this edit changed are written. That's what makes the merge per field.
      const clock = d.clock + 1;
      const writes: Write[] = [];
      for (const k in after) {
        if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) writes.push({ key: k, value: after[k], stamp: { clock, by: who } });
      }
      if (!writes.length) return [];
      d.clock = clock;
      integrate(d, writes);
      return [{ label: label(writes), payload: writes }];
    },
    serverReceive(from, msg) {
      const writes = msg.payload as Write[];
      const won = integrate(docs.server, writes);
      let text =
        won === writes.length
          ? `${NAME[from]}: ${label(writes)} stored`
          : won === 0
            ? `${NAME[from]}: ${label(writes)} lost to a newer write`
            : `${NAME[from]}: kept ${won} of ${writes.length} fields`;
      const out: { to: ClientId; msg: Message }[] = [{ to: other(from), msg }];
      const patch = shape.fix?.(record(docs.server));
      if (patch) {
        // The repair is an ordinary write, stamped newer than anything it has seen, so it wins
        // the merge everywhere and syncs back to both clients like any other change.
        const clock = docs.server.clock + 1;
        const fixes: Write[] = Object.entries(patch).map(([key, value]) => ({ key, value, stamp: { clock, by: 'server' } }));
        integrate(docs.server, fixes);
        text = `${text} → fixed ${label(fixes)}`;
        const fixMsg: Message = { label: `fix ${label(fixes)}`, fix: true, payload: fixes };
        out.push({ to: from, msg: fixMsg }, { to: other(from), msg: fixMsg });
      }
      return { log: { by: from, text, changed: !!patch || !valid(shape.toClip(record(docs.server))) }, out };
    },
    clientReceive(who, msg) {
      integrate(docs[who], msg.payload as Write[]);
      return { out: [] };
    },
  };
}

/** Two independent keys for the two edges. The obvious model, and the one that breaks. */
export const inOut = (initial: Clip) =>
  lww<{ in: number; out: number }>(
    { toRecord: (c) => ({ in: c.in, out: c.out }), toClip: (r) => r, show: (_k, v) => fmt(v) },
    initial,
  );

/** The same two keys, plus a server that repairs the merged record before anyone builds on it. */
export const normalise = (initial: Clip) =>
  lww<{ in: number; out: number }>(
    {
      toRecord: (c) => ({ in: c.in, out: c.out }),
      toClip: (r) => r,
      show: (_k, v) => fmt(v),
      fix: (r) => {
        const fixed = repair(r);
        return fixed.out !== r.out ? { out: fixed.out } : null;
      },
    },
    initial,
  );

/** The whole range as one value. Always valid; one person's edit simply disappears. */
export const whole = (initial: Clip) =>
  lww<{ range: [number, number] }>(
    {
      toRecord: (c) => ({ range: [c.in, c.out] }),
      toClip: (r) => ({ in: r.range[0], out: r.range[1] }),
      show: (_k, v) => `${fmt(v[0])}–${fmt(v[1])}`,
    },
    initial,
  );

/** Where it starts and how long it is. Moving touches one key, trimming the end touches the other. */
export const startLength = (initial: Clip) =>
  lww<{ start: number; length: number }>(
    {
      toRecord: (c) => ({ start: c.in, length: round(c.out - c.in) }),
      toClip: (r) => ({ in: r.start, out: round(r.start + r.length) }),
      show: (_k, v) => fmt(v),
    },
    initial,
  );

// ---------------------------------------------------------------------------------------------
// Intents. Clients send what the person did ("move +5s"), not the values it produced. The server
// applies operations in the order they arrive, runs the same rules the clients do, and sends back
// the result. Each client shows the server's state with its own unconfirmed operations replayed on
// top, the way Figma, Linear and Replicache keep the UI instant while the server stays in charge.

type Op = { id: number; g: Gesture };
type ServerState = { clip: Clip; ack?: number };

export function intent(initial: Clip): Strategy {
  let server = { ...initial };
  const confirmed: Record<ClientId, Clip> = { alice: { ...initial }, bob: { ...initial } };
  const pending: Record<ClientId, Op[]> = { alice: [], bob: [] };
  let nextId = 1;
  const view = (who: ClientId) => pending[who].reduce((c, op) => apply(c, op.g).clip, confirmed[who]);
  const range = (c: Clip) => `${fmt(c.in)}–${fmt(c.out)}`;

  return {
    clip: (who) => (who === 'server' ? server : view(who)),
    fields(who) {
      const c = who === 'server' ? server : confirmed[who];
      const base: Field[] = [
        { key: 'in', value: fmt(c.in) },
        { key: 'out', value: fmt(c.out) },
      ];
      if (who === 'server') return base;
      return base.concat(pending[who].map((op) => ({ key: 'queued', value: describe(op.g), by: who, pending: true })));
    },
    gesture(who, g) {
      const op = { id: nextId++, g };
      pending[who].push(op);
      return [{ label: describe(g), payload: op }];
    },
    serverReceive(from, msg) {
      const op = msg.payload as Op;
      const { clip, clamped } = apply(server, op.g);
      server = clip;
      const text = clamped
        ? `${NAME[from]}: ${describe(op.g)} → fixed to ${range(clip)} (min ${fmt(MIN)})`
        : `${NAME[from]}: ${describe(op.g)} → ${range(clip)}`;
      return {
        log: { by: from, text, changed: clamped },
        out: [
          { to: from, msg: { label: `✓ ${range(clip)}`, ack: true, payload: { clip, ack: op.id } satisfies ServerState } },
          { to: other(from), msg: { label: range(clip), payload: { clip } satisfies ServerState } },
        ],
      };
    },
    clientReceive(who, msg) {
      const state = msg.payload as ServerState;
      confirmed[who] = state.clip;
      if (state.ack != null) pending[who] = pending[who].filter((op) => op.id !== state.ack);
      return { out: [] };
    },
  };
}

export const STRATEGIES = { inOut, whole, startLength, normalise, intent };
export type Mode = keyof typeof STRATEGIES;

/** Two scripted situations, the same in every demo, so the models can be compared side by side. */
export const SCENARIOS: Record<string, { label: string; alice: Gesture; bob: Gesture }> = {
  moveTrim: { label: 'Move + trim', alice: { kind: 'move', by: 5 }, bob: { kind: 'trimEnd', by: -3 } },
  trimBoth: { label: 'Trim both ends', alice: { kind: 'trimStart', by: 4 }, bob: { kind: 'trimEnd', by: -3 } },
};
