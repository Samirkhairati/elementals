// Entity validation for editor and CLI. Never throws; returns a flat list of issues.

import type { EntityIssue, FieldDef, IssueSeverity, ValidationContext } from './types.ts';
import { COMPONENT_SCHEMAS, isComponentType } from './components.ts';
import { validateCommands, validateConditions } from './commands.ts';
import { EVENT_TRIGGERS, isFacing } from './constants.ts';
import { isLegacyComponentType } from './migrate.ts';
import { isRecord } from './util.ts';

/** `[2, 'then', 0]` -> `commands[2].branches.then[0]`. */
export function formatCommandPath(path: (string | number)[], root = 'commands'): string {
  let out = root;
  let expectBranch = false;
  for (const part of path) {
    if (typeof part === 'number') {
      out += `[${part}]`;
      expectBranch = true;
    } else {
      out += expectBranch ? `.branches.${part}` : `.${part}`;
      expectBranch = false;
    }
  }
  return out;
}

function checkField(field: FieldDef, value: unknown, path: string, add: (s: IssueSeverity, code: string, msg: string, p?: string) => void): void {
  const bad = (what: string) => add('error', 'bad-prop', `${field.label}: ${what}`, path);
  switch (field.kind) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) return bad('must be a number');
      if (field.min !== undefined && value < field.min) add('warning', 'out-of-range', `${field.label}: ${value} is below the minimum ${field.min}`, path);
      if (field.max !== undefined && value > field.max) add('warning', 'out-of-range', `${field.label}: ${value} is above the maximum ${field.max}`, path);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') bad('must be true or false');
      return;
    case 'select':
      if (typeof value !== 'string' || (field.options && !field.options.some((o) => o.value === value))) bad(`"${String(value)}" is not a valid choice`);
      return;
    case 'facing':
      if (!isFacing(value)) bad(`"${String(value)}" is not a direction`);
      return;
    case 'color':
      if (typeof value !== 'string' || (value !== '' && !/^#[0-9a-fA-F]{6}$/.test(value))) bad('must be empty or a #rrggbb colour');
      return;
    default:
      if (typeof value !== 'string') bad('must be text');
  }
}

/** Validates one entity (canonical components expected; legacy ones are reported as warnings). */
export function validateEntity(entity: unknown, ctx: ValidationContext = {}): EntityIssue[] {
  const issues: EntityIssue[] = [];
  if (!isRecord(entity)) {
    return [{ entityId: '', path: '', severity: 'error', code: 'bad-entity', message: 'Entity is not an object' }];
  }
  const entityId = typeof entity.id === 'string' ? entity.id : '';
  const add = (severity: IssueSeverity, code: string, message: string, path = '', commandId?: string) => {
    const issue: EntityIssue = { entityId, path, severity, message, code };
    if (commandId) issue.commandId = commandId;
    issues.push(issue);
  };

  if (entityId === '') add('error', 'bad-id', 'Entity id must be a non-empty string', 'id');
  if (typeof entity.name !== 'string') add('error', 'bad-name', 'Entity name must be a string', 'name');
  const hasPosition = typeof entity.x === 'number' && Number.isFinite(entity.x) && typeof entity.y === 'number' && Number.isFinite(entity.y);
  if (!hasPosition) add('error', 'bad-position', 'Entity x/y must be finite numbers', 'x');

  if (!isRecord(entity.components)) {
    add('error', 'bad-components', 'Entity components must be an object', 'components');
    return issues;
  }
  const components = entity.components;

  if (components.Transform === undefined) add('error', 'missing-transform', 'Entity has no Transform component', 'components.Transform');

  for (const [type, props] of Object.entries(components)) {
    const base = `components.${type}`;
    if (isLegacyComponentType(type)) {
      add('warning', 'legacy-component', `Legacy component ${type} (it is converted on load/export)`, base);
      continue;
    }
    if (!isComponentType(type)) {
      add('error', 'unknown-component', `Unknown component type "${type}"`, base);
      continue;
    }
    if (!isRecord(props)) {
      add('error', 'bad-component', `Component ${type} must be an object`, base);
      continue;
    }

    const schema = COMPONENT_SCHEMAS[type];
    for (const field of schema.fields) {
      if (Object.hasOwn(props, field.key)) checkField(field, props[field.key], `${base}.${field.key}`, add);
    }
    if (type !== 'Event') {
      const known = new Set(schema.fields.map((f) => f.key));
      for (const key of Object.keys(props)) {
        if (!known.has(key)) add('warning', 'unknown-prop', `${type} has an unknown property "${key}"`, `${base}.${key}`);
      }
    }

    if (type === 'Transform' && hasPosition && typeof props.x === 'number' && typeof props.y === 'number') {
      if (props.x !== entity.x || props.y !== entity.y) {
        add('warning', 'transform-mismatch', `Transform (${props.x}, ${props.y}) differs from the entity position (${String(entity.x)}, ${String(entity.y)})`, base);
      }
    }

    if (type === 'Sprite' && typeof props.asset === 'string' && props.asset !== '' && ctx.spriteIds && !ctx.spriteIds.includes(props.asset)) {
      add('warning', 'dangling-sprite', `Sprite asset "${props.asset}" does not exist`, `${base}.asset`);
    }

    if (type === 'Event') validateEvent(props, base, ctx, add);
  }

  return issues;
}

function validateEvent(
  props: Record<string, unknown>,
  base: string,
  ctx: ValidationContext,
  add: (s: IssueSeverity, code: string, msg: string, p?: string, commandId?: string) => void,
): void {
  if (!Array.isArray(props.states) || props.states.length === 0) {
    add('error', 'no-states', 'Event needs at least one state', `${base}.states`);
    return;
  }
  const stateIds = new Set<string>();
  props.states.forEach((state: unknown, i: number) => {
    const pp = `${base}.states[${i}]`;
    if (!isRecord(state)) {
      add('error', 'bad-state', `State ${i + 1} is not an object`, pp);
      return;
    }
    if (typeof state.id !== 'string' || state.id === '') add('error', 'bad-state', `State ${i + 1} has no id`, `${pp}.id`);
    else if (stateIds.has(state.id)) add('error', 'duplicate-state-id', `State id "${state.id}" is used more than once`, `${pp}.id`);
    else stateIds.add(state.id);

    if (!(EVENT_TRIGGERS as readonly unknown[]).includes(state.trigger)) {
      add('error', 'bad-trigger', `State ${i + 1}: unknown trigger "${String(state.trigger)}"`, `${pp}.trigger`);
    }
    if (state.faceOnInteract !== undefined && typeof state.faceOnInteract !== 'boolean') {
      add('error', 'bad-state', `State ${i + 1}: faceOnInteract must be true or false`, `${pp}.faceOnInteract`);
    }
    if (state.solid !== undefined && state.solid !== null && typeof state.solid !== 'boolean') {
      add('error', 'bad-state', `State ${i + 1}: solid must be true, false or null`, `${pp}.solid`);
    }

    for (const issue of validateConditions(state.conditions ?? [], ctx)) {
      add(issue.severity, issue.code, `State ${i + 1}: ${issue.message}`, issue.index >= 0 ? `${pp}.conditions[${issue.index}]` : `${pp}.conditions`);
    }

    if (isRecord(state.appearance) && typeof state.appearance.asset === 'string' && state.appearance.asset !== '' && ctx.spriteIds && !ctx.spriteIds.includes(state.appearance.asset)) {
      add('warning', 'dangling-sprite', `State ${i + 1}: appearance sprite "${state.appearance.asset}" does not exist`, `${pp}.appearance.asset`);
    }

    if (!Array.isArray(state.commands)) {
      add('error', 'bad-state', `State ${i + 1}: commands must be a list`, `${pp}.commands`);
      return;
    }
    for (const issue of validateCommands(state.commands as never, ctx)) {
      add(issue.severity, issue.code, `State ${i + 1}: ${issue.message}`, formatCommandPath(issue.path, `${pp}.commands`), issue.commandId);
    }
  });
}

/** Validates a list of entities, including duplicate ids. */
export function validateEntities(entities: unknown, ctx: ValidationContext = {}): EntityIssue[] {
  if (!Array.isArray(entities)) {
    return [{ entityId: '', path: 'entities', severity: 'error', code: 'bad-entities', message: 'entities must be an array' }];
  }
  const issues: EntityIssue[] = [];
  const seen = new Set<string>();
  for (const entity of entities) {
    issues.push(...validateEntity(entity, ctx));
    if (isRecord(entity) && typeof entity.id === 'string' && entity.id !== '') {
      if (seen.has(entity.id)) {
        issues.push({ entityId: entity.id, path: 'id', severity: 'error', code: 'duplicate-id', message: `Duplicate entity id "${entity.id}"` });
      }
      seen.add(entity.id);
    }
  }
  return issues;
}
