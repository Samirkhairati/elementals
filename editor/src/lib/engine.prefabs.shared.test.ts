/* eslint-disable @typescript-eslint/no-explicit-any -- loose fixtures on purpose */
import { describe, it, expect } from 'vitest'
import {
  COMMAND_CATALOG,
  PREFABS,
  getPrefab,
  instantiatePrefab,
  validateEntity,
  walkCommands,
} from '../../../shared/engine/index'

const commandTypes = (entity: any): string[] => {
  const out: string[] = []
  for (const page of entity.components.Event?.pages ?? []) walkCommands(page.commands, (c) => void out.push(c.type))
  return out
}

describe('PREFABS', () => {
  it('provides the documented set with unique ids', () => {
    expect(PREFABS.map((p) => p.id)).toEqual(['npc', 'sign', 'chest', 'door', 'trigger', 'item-ball', 'trainer'])
    expect(PREFABS.map((p) => p.name)).toEqual(['NPC', 'Sign', 'Chest', 'Door / Warp', 'Trigger Zone', 'Item Ball', 'Trainer'])
    for (const p of PREFABS) {
      expect(p.description.length).toBeGreaterThan(10)
      expect(p.icon).toMatch(/^[a-z][a-z-]*$/)
      expect(getPrefab(p.id)).toBe(p)
    }
    expect(getPrefab('nope')).toBeUndefined()
  })

  it.each(PREFABS.map((p) => [p.id, p] as const))('%s instantiates into a valid entity', (_id, prefab) => {
    const e = instantiatePrefab(prefab, { x: 112, y: 96 })
    const issues = validateEntity(e)
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
    // only deliberate "not configured yet" warnings are allowed
    for (const i of issues) expect(i.code).toBe('missing-param')
    expect(e.components.Transform).toMatchObject({ x: 112, y: 96 })
    expect(e).toMatchObject({ x: 112, y: 96, name: prefab.name, visible: true, folder: null })
    // every command exists in the catalog
    for (const t of commandTypes(e)) expect(COMMAND_CATALOG[t], t).toBeDefined()
  })

  it('NPC: character sprite, no movement by default, one action page with showText', () => {
    const e = instantiatePrefab(getPrefab('npc')!, { x: 16, y: 32 })
    expect(e.components.Sprite).toMatchObject({ asset: 'characters/player' })
    expect(e.components.Movement).toMatchObject({ controller: 'none' })
    expect(e.components.Collider).toMatchObject({ width: 32, height: 32, isSolid: true })
    expect(e.components.Event!.pages).toHaveLength(1)
    expect(e.components.Event!.pages[0].trigger).toBe('action')
    expect(commandTypes(e)).toEqual(['showText'])
    expect(e.components.Tag).toEqual({ tag: 'npc' })
  })

  it('Sign: solid, readable', () => {
    const e = instantiatePrefab(getPrefab('sign')!, { x: 16, y: 32 })
    expect(commandTypes(e)).toEqual(['showText'])
    expect(e.components.Collider!.isSolid).toBe(true)
  })

  it('Chest: closed page sets self switch A, open page reacts to it and shows frame 1', () => {
    const e = instantiatePrefab(getPrefab('chest')!, { x: 16, y: 32 })
    const [closed, open] = e.components.Event!.pages
    expect(closed.commands.map((c) => c.type)).toEqual(['showText', 'setSelfSwitch'])
    expect(closed.commands[1].params).toMatchObject({ key: 'A', value: true })
    expect(closed.conditions).toEqual([])
    expect(open.conditions).toEqual([{ kind: 'selfSwitch', key: 'A', value: true }])
    expect(open.appearance).toEqual({ frame: 1 })
    expect(e.components.Sprite).toMatchObject({ frame: 0 })
  })

  it('Door / Warp: non-solid, playerTouch, warp', () => {
    const e = instantiatePrefab(getPrefab('door')!, { x: 16, y: 32 })
    expect(e.components.Collider!.isSolid).toBe(false)
    expect(e.components.Event!.pages[0].trigger).toBe('playerTouch')
    expect(commandTypes(e)).toEqual(['warp'])
    expect(e.components.Sprite).toBeUndefined()
    expect(e.components.Transform!.depth).toBe(5)
  })

  it('Trigger Zone: invisible non-solid playerTouch', () => {
    const e = instantiatePrefab(getPrefab('trigger')!, { x: 16, y: 32 })
    expect(e.components.Sprite).toBeUndefined()
    expect(e.components.Collider!.isSolid).toBe(false)
    expect(e.components.Event!.pages[0]).toMatchObject({ trigger: 'playerTouch', commands: [] })
  })

  it('Item Ball: giveItem then hide through self switch A', () => {
    const e = instantiatePrefab(getPrefab('item-ball')!, { x: 16, y: 32 })
    const [pick, taken] = e.components.Event!.pages
    expect(pick.commands.map((c) => c.type)).toEqual(['giveItem', 'showText', 'setSelfSwitch'])
    expect(taken.appearance).toEqual({ visible: false })
    expect(taken.solid).toBe(false)
    expect(taken.conditions).toEqual([{ kind: 'selfSwitch', key: 'A', value: true }])
  })

  it('Trainer: dialogue + planned startBattle placeholder', () => {
    const e = instantiatePrefab(getPrefab('trainer')!, { x: 16, y: 32 })
    expect(commandTypes(e)).toEqual(['showText', 'startBattle', 'setSelfSwitch', 'showText'])
    expect(COMMAND_CATALOG.startBattle.status).toBe('planned')
  })
})

describe('instantiatePrefab', () => {
  it('gives every instance fresh entity, page and command ids', () => {
    const prefab = getPrefab('chest')!
    const a = instantiatePrefab(prefab, { x: 16, y: 32 })
    const b = instantiatePrefab(prefab, { x: 16, y: 32 })
    expect(a.id).not.toBe(b.id)
    const ids = (e: any) => e.components.Event.pages.flatMap((p: any) => [p.id, ...p.commands.map((c: any) => c.id)])
    const all = [...ids(a), ...ids(b)]
    expect(new Set(all).size).toBe(all.length)
    expect(ids(a).some((id: string) => ids(prefab as any).includes(id))).toBe(false)
  })

  it('does not alias or mutate the prefab; options override name, id and folder', () => {
    const prefab = getPrefab('npc')!
    const before = JSON.stringify(prefab)
    const e = instantiatePrefab(prefab, { x: 48, y: 64, name: 'Guard', id: 'fixed', folder: 'f' })
    e.components.Collider!.width = 99
    e.components.Event!.pages[0].commands[0].params.text = 'changed'
    expect(JSON.stringify(prefab)).toBe(before)
    expect(e).toMatchObject({ id: 'fixed', name: 'Guard', folder: 'f', x: 48, y: 64 })
    expect(prefab.components.Transform).toMatchObject({ x: 0, y: 0 })
  })

  it('static prefab data is stable across loads (deterministic ids)', () => {
    expect(getPrefab('chest')!.components.Event!.pages[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
