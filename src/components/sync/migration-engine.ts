// The logic behind <MigrationPlayground>: the clip from part two, stored as `in`/`out` (v1) and
// then migrated to `start`/`length` (v2) while one client still runs the v1 code. Kept free of DOM
// code, like ./clip-engine.ts.
//
// The server is in charge: it applies each push in the order it arrives and sends every client a
// snapshot of the result, in that client's schema version. Each client shows the last snapshot
// with its own unconfirmed edits on top.

import { apply, fmt, type Clip, type ClientId, type Gesture } from './clip-engine';

export type Version = 1 | 2;
/** `reload` refuses clients on an old version; `bridge` translates for them. */
export type Mode = 'reload' | 'bridge';
export type Rec = Record<string, number>;
type By = ClientId | 'seed';
type Cell = { value: number; by: By; seq: number };
type Cells = Record<string, { value: number; by: By }>;

const round = (n: number) => Math.round(n * 2) / 2;
const KEYS: Record<Version, string[]> = { 1: ['in', 'out'], 2: ['start', 'length'] };

/** How each version stores a clip. */
export const toRecord = (c: Clip, v: Version): Rec =>
  v === 1 ? { in: c.in, out: c.out } : { start: c.in, length: round(c.out - c.in) };

/** Reading a clip back. Old code reading new data finds no `in` and `out`, and gets nothing. */
export function fromRecord(r: Partial<Rec>, v: Version): Clip | null {
  const [a, b] = KEYS[v].map((k) => r[k]);
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  return v === 1 ? { in: a, out: b } : { in: a, out: round(a + b) };
}

/** The migration, both ways. `up` is what a migrate-once script runs; `down` is what the bridge adds. */
export const up = (r: Rec): Rec => ({ start: r.in, length: round(r.out - r.in) });
export const down = (r: Rec): Rec => ({ in: r.start, out: round(r.start + r.length) });

type Push = { kind: 'push'; id: number; version: Version; base: Rec; writes: Rec };
type Snapshot = { kind: 'snapshot'; cells: Cells; ack?: number };
type Reload = { kind: 'reload' };
export type Message = { label: string; ack?: boolean; payload: Push | Snapshot | Reload };
export type LogEntry = { by: ClientId | 'server'; text: string; changed?: boolean };
export type Field = { key: string; value: string; by?: By; pending?: boolean; unknown?: boolean };

type Client = { version: Version; confirmed: Cells; pending: Push[]; outdated: boolean };

const NAME: Record<ClientId, string> = { alice: 'Alice', bob: 'Bob' };
const CLIENTS: ClientId[] = ['alice', 'bob'];
const show = (r: Rec) => Object.entries(r).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ');
const values = (cells: Cells): Rec => Object.fromEntries(Object.entries(cells).map(([k, c]) => [k, c.value]));

export function createRoom(mode: Mode, initial: Clip) {
  let seq = 0;
  let nextId = 1;
  let bridge = true;
  const server: { version: Version; cells: Record<string, Cell> } = { version: 1, cells: {} };
  for (const [k, v] of Object.entries(toRecord(initial, 1))) server.cells[k] = { value: v, by: 'seed', seq: 0 };

  const snapshotCells = (): Cells =>
    Object.fromEntries(Object.entries(server.cells).map(([k, c]) => [k, { value: c.value, by: c.by }]));
  const clients: Record<ClientId, Client> = {
    alice: { version: 1, confirmed: snapshotCells(), pending: [], outdated: false },
    bob: { version: 1, confirmed: snapshotCells(), pending: [], outdated: false },
  };

  /** The snapshot one client gets: the stored record, translated down if the bridge is on. */
  function cellsFor(c: Client): Cells {
    const cells = snapshotCells();
    if (c.version === server.version || !bridge) return cells;
    const { start, length } = server.cells;
    const rec = down({ start: start.value, length: length.value });
    // The derived `out` depends on both fields, so it carries whichever was written last.
    const outBy = length.seq > start.seq ? length.by : start.by;
    return { in: { value: rec.in, by: start.by }, out: { value: rec.out, by: outBy } };
  }

  function view(who: ClientId): Field[] {
    const c = clients[who];
    const out: Record<string, Field> = {};
    for (const [k, cell] of Object.entries(c.confirmed)) out[k] = { key: k, value: fmt(cell.value), by: cell.by };
    for (const p of c.pending) for (const [k, v] of Object.entries(p.writes)) out[k] = { key: k, value: fmt(v), by: who, pending: true };
    return Object.values(out).map((f) => ({ ...f, unknown: !KEYS[c.version].includes(f.key) }));
  }

  const viewRecord = (who: ClientId): Rec => {
    const c = clients[who];
    const r = values(c.confirmed);
    for (const p of c.pending) Object.assign(r, p.writes);
    return r;
  };

  function snapshotsFor(targets: ClientId[], ackFor?: { who: ClientId; id: number }) {
    return targets.map((to) => {
      const cells = cellsFor(clients[to]);
      const shown: Rec = {};
      for (const k of KEYS[clients[to].version]) if (cells[k]) shown[k] = cells[k].value;
      const ack = ackFor?.who === to ? ackFor.id : undefined;
      const label = Object.keys(shown).length ? show(shown) : 'start · length';
      return { to, msg: { label: ack ? `✓ ${label}` : label, ack: !!ack, payload: { kind: 'snapshot', cells, ack } } as Message };
    });
  }

  return {
    get serverVersion() { return server.version; },
    version: (who: ClientId) => clients[who].version,
    outdated: (who: ClientId) => clients[who].outdated,
    unsaved: (who: ClientId) => (clients[who].outdated ? clients[who].pending.length : 0),
    get bridge() { return bridge; },

    clip(who: ClientId | 'server'): Clip | null {
      if (who === 'server') {
        const r = Object.fromEntries(Object.entries(server.cells).map(([k, c]) => [k, c.value]));
        return fromRecord(r, server.version);
      }
      return fromRecord(viewRecord(who), clients[who].version);
    },

    fields(who: ClientId | 'server'): Field[] {
      if (who !== 'server') return view(who);
      return Object.entries(server.cells).map(([k, c]) => ({
        key: k, value: fmt(c.value), by: c.by, unknown: !KEYS[server.version].includes(k),
      }));
    },

    /** A local edit. Returns what goes on the wire; an outdated client keeps it to itself. */
    gesture(who: ClientId, g: Gesture): Message[] {
      const c = clients[who];
      const clip = fromRecord(viewRecord(who), c.version);
      if (!clip) return [];
      const base = toRecord(clip, c.version);
      const next = toRecord(apply(clip, g).clip, c.version);
      const writes: Rec = {};
      for (const k of Object.keys(next)) if (next[k] !== base[k]) writes[k] = next[k];
      if (!Object.keys(writes).length) return [];
      const push: Push = { kind: 'push', id: nextId++, version: c.version, base, writes };
      c.pending.push(push);
      if (c.outdated) return [];
      return [{ label: `v${c.version} ${show(writes)}`, payload: push }];
    },

    /** Ship v2: the server migrates what it stores once, and Bob opens the new build. */
    deploy(): { log: LogEntry[]; out: { to: ClientId; msg: Message }[] } {
      const { in: i, out: o } = server.cells;
      const rec = up({ in: i.value, out: o.value });
      const lenBy = o.seq > i.seq ? o : i;
      server.cells = {
        start: { value: rec.start, by: i.by, seq: i.seq },
        length: { value: rec.length, by: lenBy.by, seq: lenBy.seq },
      };
      server.version = 2;
      clients.bob = { version: 2, confirmed: snapshotCells(), pending: [], outdated: false };
      const log: LogEntry[] = [
        { by: 'server', text: `migrated in/out → start ${fmt(rec.start)} · length ${fmt(rec.length)}`, changed: true },
        { by: 'bob', text: 'Bob opened a new tab, running v2' },
      ];
      if (mode === 'reload') {
        log.unshift({ by: 'alice', text: 'Alice is on v1: told to reload', changed: true });
        return { log, out: [{ to: 'alice', msg: { label: '⟳ reload', ack: true, payload: { kind: 'reload' } } }] };
      }
      return { log, out: snapshotsFor(['alice']) };
    },

    setBridge(on: boolean) {
      bridge = on;
      return server.version === 2 ? snapshotsFor(CLIENTS.filter((c) => clients[c].version === 1)) : [];
    },

    serverReceive(from: ClientId, msg: Message): { log?: LogEntry; out: { to: ClientId; msg: Message }[] } {
      const push = msg.payload as Push;
      let writes = push.writes;
      let text = `${NAME[from]}: ${show(writes)}`;
      let changed = false;
      if (push.version !== server.version) {
        if (mode === 'reload') {
          return {
            log: { by: from, text: `${NAME[from]} is on v${push.version}: rejected, reload`, changed: true },
            out: [{ to: from, msg: { label: '⟳ reload', ack: true, payload: { kind: 'reload' } } }],
          };
        }
        if (bridge) {
          // Translate the edit, not the record: run both sides of it through `up` and keep only the
          // v2 fields that changed. A v1 move rewrites in and out, but it only changes `start`.
          const before = up(push.base);
          const after = up({ ...push.base, ...push.writes });
          writes = {};
          for (const k of Object.keys(after)) if (after[k] !== before[k]) writes[k] = after[k];
          text = `${NAME[from]} v1: ${show(push.writes)} → ${show(writes) || 'no change'}`;
        } else {
          text = `${NAME[from]} v1: stored ${show(writes)} as is`;
          changed = true;
        }
      }
      seq++;
      for (const [k, v] of Object.entries(writes)) server.cells[k] = { value: v, by: from, seq };
      return { log: { by: from, text, changed }, out: snapshotsFor(CLIENTS, { who: from, id: push.id }) };
    },

    clientReceive(who: ClientId, msg: Message) {
      const c = clients[who];
      const p = msg.payload;
      if (p.kind === 'reload') {
        c.outdated = true;
        return;
      }
      if (p.kind !== 'snapshot' || c.outdated) return;
      c.confirmed = p.cells;
      if (p.ack != null) c.pending = c.pending.filter((x) => x.id > p.ack!);
    },

    /** The person presses Reload: new code, the server's current state, and no unsent edits. */
    reload(who: ClientId): number {
      const c = clients[who];
      const dropped = c.pending.length;
      clients[who] = { version: server.version, confirmed: snapshotCells(), pending: [], outdated: false };
      return dropped;
    },
  };
}

export type Room = ReturnType<typeof createRoom>;
