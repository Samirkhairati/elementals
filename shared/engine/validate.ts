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
  if (!Array.isArray(props.pages) || props.pages.length === 0) {
    add('error', 'no-pages', 'Event needs at least one page', `${base}.pages`);
    return;
  }
  const pageIds = new Set<string>();
  props.pages.forEach((page: unknown, i: number) => {
    const pp = `${base}.pages[${i}]`;
    if (!isRecord(page)) {
      add('error', 'bad-page', `Page ${i + 1} is not an object`, pp);
      return;
    }
    if (typeof page.id !== 'string' || page.id === '') add('error', 'bad-page', `Page ${i + 1} has no id`, `${pp}.id`);
    else if (pageIds.has(page.id)) add('error', 'duplicate-page-id', `Page id "${page.id}" is used more than once`, `${pp}.id`);
    else pageIds.add(page.id);

    if (!(EVENT_TRIGGERS as readonly unknown[]).includes(page.trigger)) {
      add('error', 'bad-trigger', `Page ${i + 1}: unknown trigger "${String(page.trigger)}"`, `${pp}.trigger`);
    }
    if (page.faceOnInteract !== undefined && typeof page.faceOnInteract !== 'boolean') {
      add('error', 'bad-page', `Page ${i + 1}: faceOnInteract must be true or false`, `${pp}.faceOnInteract`);
    }
    if (page.solid !== undefined && page.solid !== null && typeof page.solid !== 'boolean') {
      add('error', 'bad-page', `Page ${i + 1}: solid must be true, false or null`, `${pp}.solid`);
    }

    for (const issue of validateConditions(page.conditions ?? [], ctx)) {
      add(issue.severity, issue.code, `Page ${i + 1}: ${issue.message}`, issue.index >= 0 ? `${pp}.conditions[${issue.index}]` : `${pp}.conditions`);
    }

    if (isRecord(page.appearance) && typeof page.appearance.asset === 'string' && page.appearance.asset !== '' && ctx.spriteIds && !ctx.spriteIds.includes(page.appearance.asset)) {
      add('warning', 'dangling-sprite', `Page ${i + 1}: appearance sprite "${page.appearance.asset}" does not exist`, `${pp}.appearance.asset`);
    }

    if (!Array.isArray(page.commands)) {
      add('error', 'bad-page', `Page ${i + 1}: commands must be a list`, `${pp}.commands`);
      return;
    }
    for (const issue of validateCommands(page.commands as never, ctx)) {
      add(issue.severity, issue.code, `Page ${i + 1}: ${issue.message}`, formatCommandPath(issue.path, `${pp}.commands`), issue.commandId);
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
