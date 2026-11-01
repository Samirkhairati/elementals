// Event graphs: pure, immutable helpers (no React, no Phaser). Every function returns new data and
// never mutates its inputs. See docs/event-graph-spec.md.
//
// A graph is `nodes` (a command plus a canvas position and its wiring) and visual `frames`. Flow runs
// from the single `start` node along `out` wires; a port with no wire ends the run.

import type {
  Command,
  EventGraph,
  GraphFrame,
  GraphIssue,
  GraphNode,
  IssueSeverity,
  PortDef,
  ValidationContext,
} from './types.ts';
import { COMMAND_CATALOG, getBranchDefs, getCommandDef, validateCommandParams } from './commands.ts';
import { newId, type IdFn } from './ids.ts';
import { cloneJson, deepEqual, isRecord } from './util.ts';

// ── node types ──────────────────────────────────────────────────────────────────────────────────

/** Structural node types: handled by the interpreter itself, not by command handlers. */
export const GRAPH_START = 'start';
export const GRAPH_END = 'end';
export const GRAPH_JUNCTION = 'junction';
export const STRUCTURAL_TYPES: readonly string[] = [GRAPH_START, GRAPH_END, GRAPH_JUNCTION];

/** Tree-only flow commands. A loop is a cycle in a graph and `end` replaces `exitEvent`. */
export const TREE_ONLY_TYPES: readonly string[] = ['loop', 'breakLoop', 'exitEvent'];

/**
 * Commands that wait for time or input, so a cycle through one of them cannot freeze the game.
 * A cycle made only of other nodes is rejected by validation (`cycle-without-wait`).
 */
export const YIELDING_TYPES: readonly string[] = Object.values(COMMAND_CATALOG)
  .filter((d) => d.yields === true)
  .map((d) => d.type);

/** Whether a node waits: its catalog `yields` flag, evaluated against the node's params when it is a predicate. */
export function isYieldingNode(node: Pick<GraphNode, 'type' | 'params'>): boolean {
  const yields = getCommandDef(node.type)?.yields;
  if (typeof yields === 'function') return yields(isRecord(node.params) ? node.params : {});
  return yields === true;
}

export const NEXT_PORT = 'next';
const NEXT: PortDef = { id: NEXT_PORT, label: '' };

export function isStructural(type: string): boolean {
  return STRUCTURAL_TYPES.includes(type);
}

/** Output ports a node currently exposes (derived from its params for `showChoices`). */
export function getPortDefs(node: Pick<GraphNode, 'type' | 'params'>): PortDef[] {
  switch (node.type) {
    case GRAPH_START:
    case GRAPH_JUNCTION:
      return [{ ...NEXT }];
    case GRAPH_END:
      return [];
  }
  const d = getCommandDef(node.type);
  if (!d || TREE_ONLY_TYPES.includes(node.type)) return [];
  const branches = getBranchDefs(node);
  // Branching commands (conditional, showChoices) have no `next`: each branch wires onward by itself.
  return branches.length > 0 ? branches.map((b) => ({ ...b })) : [{ ...NEXT }];
}

// ── creation ────────────────────────────────────────────────────────────────────────────────────

export function createGraphNode(
  type: string,
  options: { params?: Record<string, unknown>; x?: number; y?: number; id?: string } = {},
  idFn: IdFn = newId,
): GraphNode {
  const d = getCommandDef(type);
  return {
    id: options.id ?? idFn(),
    type,
    params: { ...(d ? cloneJson(d.defaultParams) : {}), ...(options.params ? cloneJson(options.params) : {}) },
    out: {},
    x: options.x ?? 0,
    y: options.y ?? 0,
  };
}

/** A graph holding only its `start` node. */
export function createGraph(idFn: IdFn = newId): EventGraph {
  return { nodes: [createGraphNode(GRAPH_START, { x: 0, y: 0 }, idFn)], frames: [] };
}

/** The command nodes of a graph in authoring order (start / end / junction left out). */
export function commandNodes(graph: Pick<EventGraph, 'nodes'>): GraphNode[] {
  return graph.nodes.filter((n) => !isStructural(n.type));
}

export function findStart(graph: EventGraph): GraphNode | undefined {
  return graph.nodes.find((n) => n.type === GRAPH_START);
}

export function getNode(graph: EventGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

const DEFAULT_FRAME_COLOR = '#64748b';

const finiteOr = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/**
 * Cleans an untrusted graph (from JSON): keeps well-formed nodes and frames, repairs missing fields and
 * guarantees exactly one `start` node (the first one wins, a missing one is created). Wires are kept as
 * they are even when they dangle, so `validateGraph` can still report them. Never throws.
 */
export function normalizeGraph(raw: unknown, idFn: IdFn = newId): EventGraph {
  const nodes: GraphNode[] = [];
  const seen = new Set<string>();
  let start = false;
  const list = isRecord(raw) && Array.isArray(raw.nodes) ? raw.nodes : [];
  for (const n of list) {
    if (!isRecord(n) || typeof n.id !== 'string' || n.id === '' || typeof n.type !== 'string' || seen.has(n.id)) continue;
    if (n.type === GRAPH_START) {
      if (start) continue;
      start = true;
    }
    seen.add(n.id);
    nodes.push({
      id: n.id,
      type: n.type,
      params: isRecord(n.params) ? cloneJson(n.params) : {},
      out: isRecord(n.out) ? Object.fromEntries(Object.entries(n.out).filter(([, to]) => typeof to === 'string')) as Record<string, string> : {},
      x: finiteOr(n.x, 0),
      y: finiteOr(n.y, 0),
    });
  }
  if (!start) nodes.unshift(createGraphNode(GRAPH_START, {}, idFn));

  const frames: EventGraph['frames'] = [];
  const frameIds = new Set<string>();
  for (const f of isRecord(raw) && Array.isArray(raw.frames) ? raw.frames : []) {
    if (!isRecord(f) || typeof f.id !== 'string' || f.id === '' || frameIds.has(f.id)) continue;
    frameIds.add(f.id);
    frames.push({
      id: f.id,
      title: typeof f.title === 'string' ? f.title : '',
      color: typeof f.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(f.color) ? f.color : DEFAULT_FRAME_COLOR,
      x: finiteOr(f.x, 0),
      y: finiteOr(f.y, 0),
      w: Math.max(40, finiteOr(f.w, 240)),
      h: Math.max(40, finiteOr(f.h, 160)),
    });
  }
  return { nodes, frames };
}

/** Deep copy. With `freshIds` every node and frame gets a new id and the wires follow. */
export function cloneGraph(graph: EventGraph, freshIds = false, idFn: IdFn = newId): EventGraph {
  const map = new Map(graph.nodes.map((n) => [n.id, freshIds ? idFn() : n.id]));
  return {
    nodes: graph.nodes.map((n) => ({
      id: map.get(n.id) as string,
      type: n.type,
      params: cloneJson(n.params),
      out: Object.fromEntries(Object.entries(n.out).map(([port, to]) => [port, map.get(to) ?? to])),
      x: n.x,
      y: n.y,
    })),
    frames: graph.frames.map((f) => ({ ...f, id: freshIds ? idFn() : f.id })),
  };
}

// ── edits (immutable) ───────────────────────────────────────────────────────────────────────────

export function addNode(graph: EventGraph, node: GraphNode): EventGraph {
  if (getNode(graph, node.id)) return graph;
  if (node.type === GRAPH_START && findStart(graph)) return graph;
  return { ...graph, nodes: [...graph.nodes, node] };
}

function replaceNode(graph: EventGraph, id: string, fn: (n: GraphNode) => GraphNode): EventGraph {
  let changed = false;
  const nodes = graph.nodes.map((n) => {
    if (n.id !== id) return n;
    const next = fn(n);
    if (next !== n) changed = true;
    return next;
  });
  return changed ? { ...graph, nodes } : graph;
}

/** Removes `out` entries pointing at `targetIds`. */
function unwire(graph: EventGraph, targetIds: ReadonlySet<string>): GraphNode[] {
  return graph.nodes.map((n) => {
    const keys = Object.keys(n.out).filter((p) => targetIds.has(n.out[p]));
    if (keys.length === 0) return n;
    const out = { ...n.out };
    for (const k of keys) delete out[k];
    return { ...n, out };
  });
}

/** Removes nodes and every wire into them. `start` cannot be removed. */
export function removeNodes(graph: EventGraph, ids: readonly string[]): EventGraph {
  const doomed = new Set(ids.filter((id) => getNode(graph, id)?.type !== GRAPH_START && getNode(graph, id)));
  if (doomed.size === 0) return graph;
  const nodes = unwire(graph, doomed).filter((n) => !doomed.has(n.id));
  return { ...graph, nodes };
}

export function removeNode(graph: EventGraph, id: string): EventGraph {
  return removeNodes(graph, [id]);
}

/**
 * Removes a node but keeps the flow going: every wire that led into it now leads to its `next` target
 * (only for nodes with exactly one output port; otherwise it is a plain removal).
 */
export function dissolveNode(graph: EventGraph, id: string): EventGraph {
  const node = getNode(graph, id);
  if (!node || node.type === GRAPH_START) return graph;
  const ports = getPortDefs(node);
  const target = ports.length === 1 ? node.out[ports[0].id] : undefined;
  if (!target || target === id) return removeNode(graph, id);
  const nodes = graph.nodes
    .filter((n) => n.id !== id)
    .map((n) => {
      const keys = Object.keys(n.out).filter((p) => n.out[p] === id);
      if (keys.length === 0) return n;
      const out = { ...n.out };
      for (const k of keys) out[k] = target;
      return { ...n, out };
    });
  return { ...graph, nodes };
}

/**
 * Wires `from.port` to `to`, replacing any wire already on that port. Refused (graph returned as it
 * is) for unknown nodes, ports the node does not offer, wires into `start` and self-loops.
 */
export function connect(graph: EventGraph, from: string, port: string, to: string): EventGraph {
  const source = getNode(graph, from);
  const target = getNode(graph, to);
  if (!source || !target || from === to || target.type === GRAPH_START) return graph;
  if (!getPortDefs(source).some((p) => p.id === port)) return graph;
  if (source.out[port] === to) return graph;
  return replaceNode(graph, from, (n) => ({ ...n, out: { ...n.out, [port]: to } }));
}

export function disconnect(graph: EventGraph, from: string, port: string): EventGraph {
  return replaceNode(graph, from, (n) => {
    if (!(port in n.out)) return n;
    const out = { ...n.out };
    delete out[port];
    return { ...n, out };
  });
}

export function moveNode(graph: EventGraph, id: string, x: number, y: number): EventGraph {
  return replaceNode(graph, id, (n) => (n.x === x && n.y === y ? n : { ...n, x, y }));
}

/**
 * Merges `patch` into a node's params. Wires on ports the new params no longer offer (a removed
 * choice option) are dropped.
 */
export function updateNodeParams(graph: EventGraph, id: string, patch: Record<string, unknown>): EventGraph {
  return replaceNode(graph, id, (n) => {
    if (Object.entries(patch).every(([k, v]) => deepEqual(n.params[k], v))) return n;
    const params = { ...n.params, ...patch };
    const valid = new Set(getPortDefs({ type: n.type, params }).map((p) => p.id));
    const out = Object.fromEntries(Object.entries(n.out).filter(([port]) => valid.has(port)));
    return { ...n, params, out: Object.keys(out).length === Object.keys(n.out).length ? n.out : out };
  });
}

/**
 * Adds `node` and, when `from` is given, wires `from.nodeId`'s port to it. If that port already led
 * somewhere and the new node has a `next` port, the new node takes over the old target (the node is
 * inserted into the wire instead of cutting it off).
 */
export function addNodeFrom(graph: EventGraph, node: GraphNode, from?: { nodeId: string; port: string }): EventGraph {
  const added = addNode(graph, node);
  if (added === graph || !from) return added;
  const source = getNode(added, from.nodeId);
  if (!source || !getPortDefs(source).some((p) => p.id === from.port)) return added;
  const displaced = source.out[from.port];
  let next = connect(added, from.nodeId, from.port, node.id);
  if (displaced && displaced !== node.id && !node.out[NEXT_PORT] && getPortDefs(node).some((p) => p.id === NEXT_PORT)) {
    next = connect(next, node.id, NEXT_PORT, displaced);
  }
  return next;
}

/** A copy of some nodes (and frames) that can be pasted into any graph: wires between them are kept, the rest dropped. */
export interface GraphFragment {
  /** Positions are relative to the top-left of the selection. */
  nodes: GraphNode[];
  /** Frames copied with the nodes, positioned the same way. */
  frames?: GraphFrame[];
}

/** Copies the given nodes (never `start`) and frames. Wires to nodes outside the selection are dropped. */
export function extractFragment(graph: EventGraph, ids: readonly string[], frameIds: readonly string[] = []): GraphFragment {
  const wanted = new Set(ids);
  const chosen = graph.nodes.filter((n) => wanted.has(n.id) && n.type !== GRAPH_START);
  const frames = graph.frames.filter((f) => frameIds.includes(f.id));
  const inside = new Set(chosen.map((n) => n.id));
  const xs = [...chosen.map((n) => n.x), ...frames.map((f) => f.x)];
  const ys = [...chosen.map((n) => n.y), ...frames.map((f) => f.y)];
  const minX = xs.length ? Math.min(...xs) : 0;
  const minY = ys.length ? Math.min(...ys) : 0;
  const fragment: GraphFragment = {
    nodes: chosen.map((n) => ({
      id: n.id,
      type: n.type,
      params: cloneJson(n.params),
      out: Object.fromEntries(Object.entries(n.out).filter(([, to]) => inside.has(to))),
      x: n.x - minX,
      y: n.y - minY,
    })),
  };
  if (frames.length > 0) fragment.frames = frames.map((f) => ({ ...f, x: f.x - minX, y: f.y - minY }));
  return fragment;
}

/** Adds a fragment with fresh ids at `at` (the top-left of the pasted group). Returns the new node and frame ids. */
export function pasteFragment(graph: EventGraph, fragment: GraphFragment, at: { x: number; y: number }, idFn: IdFn = newId): { graph: EventGraph; ids: string[]; frameIds: string[] } {
  const fresh = new Map(fragment.nodes.filter((n) => n.type !== GRAPH_START).map((n) => [n.id, idFn()]));
  const pasted: GraphNode[] = fragment.nodes
    .filter((n) => fresh.has(n.id))
    .map((n) => ({
      id: fresh.get(n.id) as string,
      type: n.type,
      params: cloneJson(n.params),
      out: Object.fromEntries(Object.entries(n.out).filter(([, to]) => fresh.has(to)).map(([port, to]) => [port, fresh.get(to) as string])),
      x: n.x + at.x,
      y: n.y + at.y,
    }));
  const frames: GraphFrame[] = (fragment.frames ?? []).map((f) => ({ ...f, id: idFn(), x: f.x + at.x, y: f.y + at.y }));
  return {
    graph: { ...graph, nodes: [...graph.nodes, ...pasted], frames: [...graph.frames, ...frames] },
    ids: pasted.map((n) => n.id),
    frameIds: frames.map((f) => f.id),
  };
}

// ── queries ─────────────────────────────────────────────────────────────────────────────────────

export interface GraphEdge {
  /** `${from}:${port}`, unique because a port has at most one wire. */
  id: string;
  from: string;
  port: string;
  to: string;
}

export function edgesOf(graph: EventGraph): GraphEdge[] {
  const ids = new Set(graph.nodes.map((n) => n.id));
  const edges: GraphEdge[] = [];
  for (const n of graph.nodes) {
    for (const [port, to] of Object.entries(n.out)) {
      if (ids.has(to)) edges.push({ id: `${n.id}:${port}`, from: n.id, port, to });
    }
  }
  return edges;
}

/** Ids of the nodes reachable from `start`. */
export function reachableFromStart(graph: EventGraph): Set<string> {
  const start = findStart(graph);
  const seen = new Set<string>();
  if (!start) return seen;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const stack = [start.id];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const to of Object.values(byId.get(id)?.out ?? {})) if (byId.has(to) && !seen.has(to)) stack.push(to);
  }
  return seen;
}

/**
 * Ids of nodes that sit on a cycle containing no yielding node (see isYieldingNode): such a loop would
 * spin without ever waiting. Only nodes reachable from `start` are considered.
 */
export function findYieldlessCycles(graph: EventGraph): Set<string> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const live = reachableFromStart(graph);
  const eligible = (id: string): boolean => {
    const n = byId.get(id);
    return !!n && live.has(id) && !isYieldingNode(n);
  };
  const bad = new Set<string>();
  const state = new Map<string, 1 | 2>(); // 1 = on the DFS stack, 2 = done
  const path: string[] = [];

  const visit = (id: string): void => {
    state.set(id, 1);
    path.push(id);
    for (const to of Object.values(byId.get(id)?.out ?? {})) {
      if (!eligible(to)) continue;
      const s = state.get(to);
      if (s === 1) for (const p of path.slice(path.indexOf(to))) bad.add(p);
      else if (s === undefined) visit(to);
    }
    path.pop();
    state.set(id, 2);
  };

  for (const n of graph.nodes) if (eligible(n.id) && !state.has(n.id)) visit(n.id);
  return bad;
}

// ── validation ──────────────────────────────────────────────────────────────────────────────────

/** Validates a graph. Never throws, accepts untrusted input. */
export function validateGraph(graph: unknown, ctx: ValidationContext = {}): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const add = (nodeId: string, severity: IssueSeverity, code: string, message: string, port?: string): void => {
    issues.push(port === undefined ? { nodeId, severity, code, message } : { nodeId, port, severity, code, message });
  };

  if (!isRecord(graph) || !Array.isArray(graph.nodes)) {
    add('', 'error', 'bad-graph', 'Graph must have a list of nodes');
    return issues;
  }

  const nodes = graph.nodes as unknown[];
  const ids = new Set<string>();
  const valid: GraphNode[] = [];
  for (const raw of nodes) {
    if (!isRecord(raw)) {
      add('', 'error', 'bad-node', 'Node is not an object');
      continue;
    }
    const id = typeof raw.id === 'string' ? raw.id : '';
    if (!id) add('', 'error', 'missing-id', 'Node has no id');
    else if (ids.has(id)) add(id, 'error', 'duplicate-node-id', `Node id "${id}" is used more than once`);
    else ids.add(id);
    valid.push(raw as unknown as GraphNode);
  }

  const starts = valid.filter((n) => n.type === GRAPH_START);
  if (starts.length === 0) add('', 'error', 'no-start', 'The graph has no Start node');
  for (const extra of starts.slice(1)) add(extra.id, 'error', 'multiple-start', 'The graph has more than one Start node');

  // `self` can show more than its Sprite: a Change Sprite of this event swaps the character, so its clips count too.
  const swapped = valid.flatMap((n) => (n.type === 'changeSprite' && isRecord(n.params) && (n.params.target ?? 'self') === 'self' && typeof n.params.asset === 'string' && n.params.asset !== '' ? [n.params.asset] : []));
  const nodeCtx: ValidationContext = swapped.length > 0 ? { ...ctx, selfCharacters: [...new Set([...(ctx.selfCharacters ?? []), ...swapped])] } : ctx;

  for (const node of valid) {
    const params = isRecord(node.params) ? node.params : {};
    if (isStructural(node.type)) {
      // nothing to check in params
    } else if (TREE_ONLY_TYPES.includes(node.type)) {
      add(node.id, 'error', 'legacy-flow-node', `"${node.type}" cannot be used in a graph (use a wire back for loops, End instead of Exit Event)`);
    } else {
      validateCommandParams({ type: node.type, params: node.params }, nodeCtx, (severity, code, message) => add(node.id, severity, code, message));
    }

    const offered = new Set(getPortDefs({ type: node.type, params }).map((p) => p.id));
    const out = isRecord(node.out) ? node.out : {};
    for (const [port, to] of Object.entries(out)) {
      if (!offered.has(port)) add(node.id, 'error', 'unknown-port', `Output "${port}" does not exist on this node`, port);
      else if (typeof to !== 'string' || !ids.has(to)) add(node.id, 'error', 'dangling-edge', `Output "${port}" leads to a node that does not exist`, port);
      else if (valid.find((n) => n.id === to)?.type === GRAPH_START) add(node.id, 'error', 'edge-into-start', 'Nothing can lead back into Start', port);
    }
  }

  const typed = { nodes: valid, frames: [] } as EventGraph;
  if (starts.length > 0) {
    // Nodes nothing leads to are allowed (scratch space, parked ideas): they never run and are not a problem.
    for (const id of findYieldlessCycles(typed)) {
      add(id, 'error', 'cycle-without-wait', 'This loop never waits (add a Wait or Show Text inside it), so it would freeze the game');
    }
  }
  return issues;
}

// ── command tree -> graph ───────────────────────────────────────────────────────────────────────

/**
 * Converts a legacy command tree into a graph (see docs/event-graph-spec.md §9.2). Node ids are the old
 * command ids; the converted flow is identical:
 *   - a list becomes a chain of `next` wires;
 *   - `conditional` / `showChoices` branches become wires from their ports and rejoin at what follows;
 *   - `loop` becomes a `junction` loop head whose body leads back to it, `breakLoop` a wire out of the
 *     cycle, `exitEvent` an `end` node;
 *   - commands that could never run (after a `breakLoop` / `exitEvent`, orphan branches) are kept as
 *     unwired nodes instead of being dropped.
 * Positions are laid out with `layoutGraph` (pass `{ layout: false }` when only the flow matters).
 */
export function commandsToGraph(commands: readonly Command[], idFn: IdFn = newId, options: { layout?: boolean } = {}): EventGraph {
  const made: GraphNode[] = [];

  // `breakTarget`: where a breakLoop leads (null = the end of the flow); undefined = not inside a loop.
  const lower = (list: readonly Command[], after: string | null, breakTarget: string | null | undefined): string | null => {
    let next = after;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const params = isRecord(c.params) ? cloneJson(c.params) : {};
      const wire = (node: GraphNode, port: string, to: string | null): void => {
        if (to !== null) node.out[port] = to;
      };

      switch (c.type) {
        case 'breakLoop':
          // Outside a loop it does nothing (as in the old interpreter). Inside, it leaves the cycle;
          // commands after it in this list are already lowered and are now unwired.
          if (breakTarget !== undefined) next = breakTarget;
          continue;
        case 'exitEvent': {
          const end: GraphNode = { id: c.id, type: GRAPH_END, params: {}, out: {}, x: 0, y: 0 };
          made.push(end);
          next = end.id;
          continue;
        }
        case 'loop': {
          const head: GraphNode = { id: c.id, type: GRAPH_JUNCTION, params: {}, out: {}, x: 0, y: 0 };
          made.push(head);
          // The body's tail leads back to the head; `break` leaves to what follows the loop.
          wire(head, NEXT_PORT, lower(c.branches?.body ?? [], head.id, next));
          next = head.id;
          continue;
        }
      }

      const node: GraphNode = { id: c.id, type: c.type, params, out: {}, x: 0, y: 0 };
      const ports = getPortDefs(node);
      const branching = getBranchDefs(node).length > 0;
      if (!branching) {
        wire(node, NEXT_PORT, next);
      } else {
        for (const p of ports) wire(node, p.id, lower(c.branches?.[p.id] ?? [], next, breakTarget));
        // Branches the command no longer exposes keep their content, unwired.
        for (const [bid, sub] of Object.entries(c.branches ?? {})) {
          if (!ports.some((p) => p.id === bid) && Array.isArray(sub)) lower(sub, null, breakTarget);
        }
      }
      made.push(node);
      next = node.id;
    }
    return next;
  };

  const start = createGraphNode(GRAPH_START, {}, idFn);
  const first = lower(commands, null, undefined);
  if (first !== null) start.out[NEXT_PORT] = first;
  const graph: EventGraph = { nodes: [start, ...made.reverse()], frames: [] };
  return options.layout === false ? graph : layoutGraph(graph);
}

// ── layout ──────────────────────────────────────────────────────────────────────────────────────

export interface LayoutOptions {
  colWidth?: number;
  rowHeight?: number;
}

/**
 * Deterministic left-to-right layered layout: a node's column is its longest path from `start`
 * (back wires of cycles are ignored), nodes of one column are stacked in the order they are first
 * reached (ports top to bottom). Unreachable nodes go below, in their own columns. No dependencies.
 */
export function layoutGraph(graph: EventGraph, options: LayoutOptions = {}): EventGraph {
  const colWidth = options.colWidth ?? 260;
  const rowHeight = options.rowHeight ?? 120;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const portOrder = (n: GraphNode): string[] => {
    const offered = getPortDefs(n).map((p) => p.id);
    return [...offered.filter((p) => p in n.out), ...Object.keys(n.out).filter((p) => !offered.includes(p))];
  };
  const successors = (id: string): string[] => {
    const n = byId.get(id);
    return n ? portOrder(n).map((p) => n.out[p]).filter((to) => byId.has(to)) : [];
  };

  // Depth-first from a root: classify back edges, record visit order, collect a topological order.
  const column = new Map<string, number>();
  const order: string[] = [];
  const done = new Set<string>();
  const onStack = new Set<string>();
  const post: string[] = [];
  const back = new Set<string>(); // `${from}>${to}` for wires that lead back to an ancestor (cycles)
  const dfs = (id: string): void => {
    done.add(id);
    onStack.add(id);
    order.push(id);
    for (const to of successors(id)) {
      if (onStack.has(to)) back.add(`${id}>${to}`);
      else if (!done.has(to)) dfs(to);
    }
    onStack.delete(id);
    post.push(id);
  };

  const roots: string[] = [];
  const start = findStart(graph);
  if (start) roots.push(start.id);
  const columnsFor = (root: string, base: number): number => {
    const before = order.length;
    dfs(root);
    const members = order.slice(before);
    const set = new Set(members);
    // Longest-path layering. Without the cycle back wires the graph is a DAG, and reverse DFS
    // postorder is a topological order of it.
    const topo = post.filter((id) => set.has(id)).reverse();
    for (const id of topo) if (!column.has(id)) column.set(id, base);
    for (const id of topo) {
      for (const to of successors(id)) {
        if (!set.has(to) || back.has(`${id}>${to}`)) continue;
        column.set(to, Math.max(column.get(to) ?? base, (column.get(id) as number) + 1));
      }
    }
    return Math.max(...members.map((id) => column.get(id) as number));
  };

  const rows = new Map<number, number>(); // next free row per column
  const place = new Map<string, { x: number; y: number }>();
  const lay = (ids: string[], rowOffset: number): number => {
    let maxRow = rowOffset;
    for (const id of ids) {
      const c = column.get(id) as number;
      const row = Math.max(rows.get(c) ?? 0, rowOffset);
      rows.set(c, row + 1);
      place.set(id, { x: c * colWidth, y: row * rowHeight });
      maxRow = Math.max(maxRow, row);
    }
    return maxRow + 1;
  };

  let belowRow = 0;
  for (const root of roots) {
    const before = order.length;
    columnsFor(root, 0);
    belowRow = lay(order.slice(before), 0);
  }
  // Unreachable nodes: each connected chain in its own block below, in array order.
  for (const n of graph.nodes) {
    if (done.has(n.id)) continue;
    const before = order.length;
    columnsFor(n.id, 0);
    rows.clear();
    belowRow = lay(order.slice(before), belowRow + 1);
  }

  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = place.get(n.id);
      return p && (p.x !== n.x || p.y !== n.y) ? { ...n, x: p.x, y: p.y } : n;
    }),
  };
}
