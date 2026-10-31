// Event graphs: pure, immutable helpers (no React, no Phaser). Every function returns new data and
// never mutates its inputs. See docs/event-graph-spec.md.
//
// A graph is `nodes` (a command plus a canvas position and its wiring) and visual `frames`. Flow runs
// from the single `start` node along `out` wires; a port with no wire ends the run.

import type {
  Command,
  EventGraph,
  GraphIssue,
  GraphNode,
  IssueSeverity,
  PortDef,
  ValidationContext,
} from './types.ts';
import { getBranchDefs, getCommandDef, validateCommandParams } from './commands.ts';
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
export const YIELDING_TYPES: readonly string[] = ['showText', 'showChoices', 'wait', 'moveRoute', 'fadeScreen', 'shakeScreen'];

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

export function findStart(graph: EventGraph): GraphNode | undefined {
  return graph.nodes.find((n) => n.type === GRAPH_START);
}

export function getNode(graph: EventGraph, id: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
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
 * Ids of nodes that sit on a cycle containing no yielding node (see YIELDING_TYPES): such a loop would
 * spin without ever waiting. Only nodes reachable from `start` are considered.
 */
export function findYieldlessCycles(graph: EventGraph): Set<string> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const live = reachableFromStart(graph);
  const eligible = (id: string): boolean => {
    const n = byId.get(id);
    return !!n && live.has(id) && !YIELDING_TYPES.includes(n.type);
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

  for (const node of valid) {
    const params = isRecord(node.params) ? node.params : {};
    if (isStructural(node.type)) {
      // nothing to check in params
    } else if (TREE_ONLY_TYPES.includes(node.type)) {
      add(node.id, 'error', 'legacy-flow-node', `"${node.type}" cannot be used in a graph (use a wire back for loops, End instead of Exit Event)`);
    } else {
      validateCommandParams({ type: node.type, params: node.params }, ctx, (severity, code, message) => add(node.id, severity, code, message));
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
    const live = reachableFromStart(typed);
    for (const node of valid) {
      if (node.type !== GRAPH_START && node.id && !live.has(node.id)) add(node.id, 'warning', 'unreachable', 'Nothing leads to this node, so it never runs');
    }
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
 * Positions are laid out with `layoutGraph`.
 */
export function commandsToGraph(commands: readonly Command[], idFn: IdFn = newId): EventGraph {
  const made: GraphNode[] = [];

  const lower = (list: readonly Command[], after: string | null, breakTarget: string | null): string | null => {
    let next = after;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      const params = isRecord(c.params) ? cloneJson(c.params) : {};
      const wire = (node: GraphNode, port: string, to: string | null): void => {
        if (to !== null) node.out[port] = to;
      };

      switch (c.type) {
        case 'breakLoop':
          // Leaves the cycle; commands after it in this list are already lowered and are now unwired.
          next = breakTarget;
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
  const first = lower(commands, null, null);
  if (first !== null) start.out[NEXT_PORT] = first;
  return layoutGraph({ nodes: [start, ...made.reverse()], frames: [] });
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
