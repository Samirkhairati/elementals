// Common events (project/common/<id>.json): named graphs any node graph can call. See docs/event-graph-spec.md §7.

import type { EventGraph, GraphIssue, ValidationContext } from './types.ts';
import { normalizeGraph, validateGraph } from './graph.ts';
import { isRecord } from './util.ts';

export const COMMON_EVENT_NODE = 'callCommonEvent';
/** Nested `callCommonEvent` calls beyond this depth stop the run with a warning. */
export const MAX_COMMON_DEPTH = 16;

export interface CommonEvent {
  version: 1;
  id: string;
  name: string;
  folder?: string;
  /** Same shape as a state's graph; its `start` is the entry. */
  graph: EventGraph;
}

/** What the game loads as `data/common.json`. */
export interface CommonEventsManifest {
  version: 1;
  events: CommonEvent[];
}

/** Cleans an untrusted common event. Returns null when it has no usable id. Never throws. */
export function normalizeCommonEvent(raw: unknown): CommonEvent | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id === '') return null;
  const folder =
    typeof raw.folder === 'string'
      ? raw.folder
          .split('/')
          .map((p) => p.trim())
          .filter(Boolean)
          .join('/')
      : '';
  return {
    version: 1,
    id: raw.id,
    name: typeof raw.name === 'string' && raw.name !== '' ? raw.name : raw.id,
    ...(folder ? { folder } : {}),
    graph: normalizeGraph(raw.graph),
  };
}

/** Ids of the common events a graph calls (in node order, duplicates removed, empty ids skipped). */
export function commonCallsOf(graph: Pick<EventGraph, 'nodes'>): string[] {
  const out: string[] = [];
  for (const n of graph.nodes) {
    const id = n.type === COMMON_EVENT_NODE && isRecord(n.params) ? n.params.id : undefined;
    if (typeof id === 'string' && id !== '' && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Ids of the common events that (indirectly) call themselves: every member of a cycle, A -> B -> A. */
export function findCommonCycles(events: readonly Pick<CommonEvent, 'id' | 'graph'>[]): Set<string> {
  const calls = new Map(events.map((e) => [e.id, commonCallsOf(e.graph)]));
  const members = new Set<string>();
  for (const e of events) {
    const seen = new Set<string>();
    const stack = [...(calls.get(e.id) ?? [])];
    while (stack.length > 0) {
      const id = stack.pop() as string;
      if (id === e.id) {
        members.add(e.id);
        break;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(calls.get(id) ?? []));
    }
  }
  return members;
}

/**
 * Validates every common event: the usual graph checks plus a `common-cycle` error on each node of a
 * cycle member that makes the offending call. `ctx.commonIds` defaults to the ids of `events`.
 * Returns the issues per event id (events without issues are absent).
 */
export function validateCommonEvents(events: readonly CommonEvent[], ctx: ValidationContext = {}): Map<string, GraphIssue[]> {
  const full: ValidationContext = { ...ctx, commonIds: ctx.commonIds ?? events.map((e) => e.id) };
  const cycle = findCommonCycles(events);
  const result = new Map<string, GraphIssue[]>();
  for (const e of events) {
    const issues = validateGraph(e.graph, full);
    if (cycle.has(e.id)) {
      const cyclic = new Set([...cycle]);
      for (const n of e.graph.nodes) {
        const target = n.type === COMMON_EVENT_NODE && isRecord(n.params) ? n.params.id : undefined;
        if (typeof target === 'string' && cyclic.has(target)) {
          issues.push({ nodeId: n.id, severity: 'error', code: 'common-cycle', message: `Calling "${target}" here makes common events call each other in a loop` });
        }
      }
    }
    if (issues.length > 0) result.set(e.id, issues);
  }
  return result;
}

/** Normalises and orders the common events for `data/common.json` (duplicates keep the first, sorted by id). */
export function buildCommonManifest(events: readonly unknown[]): CommonEventsManifest {
  const seen = new Set<string>();
  const out: CommonEvent[] = [];
  for (const raw of events) {
    const e = normalizeCommonEvent(raw);
    if (!e || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { version: 1, events: out };
}

/** Parses `data/common.json` defensively; unusable entries are dropped. */
export function parseCommonManifest(raw: unknown): CommonEvent[] {
  return buildCommonManifest(isRecord(raw) && Array.isArray(raw.events) ? raw.events : []).events;
}
