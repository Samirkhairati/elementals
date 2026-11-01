import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDirTracker } from '../__testutils__/helpers';
import { deleteCommonEvent, isValidCommonId, listCommonEvents, saveCommonEvent, validateCommonEvent } from './commonStore';

const tmp = makeTempDirTracker();
let dir: string;
beforeEach(() => {
  dir = tmp.create();
});
afterEach(() => tmp.cleanup());

const ev = (id = 'heal', extra = {}) => ({ version: 1, id, name: 'Heal', graph: { nodes: [{ id: 's', type: 'start', params: {}, out: {}, x: 0, y: 0 }], frames: [] }, ...extra });

describe('validateCommonEvent', () => {
  it('accepts a valid event', () => expect(validateCommonEvent(ev())).toEqual([]));
  it.each([
    ['non-object', null, /JSON object/],
    ['path-like id', ev('../x'), /id must be/],
    ['empty name', ev('a', { name: ' ' }), /name/],
    ['no graph', { ...ev(), graph: null }, /graph/],
  ])('rejects %s', (_label, value, message) => expect(validateCommonEvent(value).join()).toMatch(message));
  it('only allows slug ids', () => {
    expect(isValidCommonId('a_b-1')).toBe(true);
    for (const bad of ['', ' a', 'a/b', '.x', 'a.json', 5]) expect(isValidCommonId(bad)).toBe(false);
  });
});

describe('store', () => {
  it('an empty project lists nothing', () => expect(listCommonEvents(dir)).toEqual({ events: [], warnings: [] }));

  it('saves, lists sorted, tidies folder and name, deletes', () => {
    saveCommonEvent(dir, ev('b'));
    saveCommonEvent(dir, ev('a', { name: '  Alpha ', folder: ' x / y/ ' }));
    const { events } = listCommonEvents(dir);
    expect(events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(events[0]).toMatchObject({ name: 'Alpha', folder: 'x/y' });
    expect(deleteCommonEvent(dir, 'a')).toEqual({});
    expect(listCommonEvents(dir).events.map((e) => e.id)).toEqual(['b']);
    expect(() => deleteCommonEvent(dir, 'a')).toThrow(/does not exist/);
  });

  it('refuses unsafe ids and reports broken files as warnings', () => {
    expect(() => saveCommonEvent(dir, ev('../evil'))).toThrow(/Invalid common event/);
    expect(() => deleteCommonEvent(dir, '../evil')).toThrow();
    fs.mkdirSync(path.join(dir, 'common'));
    fs.writeFileSync(path.join(dir, 'common', 'bad.json'), '{');
    fs.writeFileSync(path.join(dir, 'common', 'other.json'), JSON.stringify(ev('mismatch')));
    saveCommonEvent(dir, ev('ok'));
    const r = listCommonEvents(dir);
    expect(r.events.map((e) => e.id)).toEqual(['ok']);
    expect(r.warnings.map((w) => w.file)).toEqual(['bad.json', 'other.json']);
  });
});
