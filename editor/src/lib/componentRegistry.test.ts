import { describe, it, expect } from 'vitest'
import { COMPONENT_REGISTRY, PRESET_PREFABS, isFieldVisible, toEditorField } from './componentRegistry'
import { COMPONENT_SCHEMAS, COMPONENT_TYPES, PREFABS, validateEntity } from '../../../shared/engine/index'
import type { ComponentType } from '@/types/editor'

describe('COMPONENT_REGISTRY (adapter over shared schemas)', () => {
  it('has an entry for each of the six components, with the shared labels and defaults', () => {
    expect(Object.keys(COMPONENT_REGISTRY).sort()).toEqual([...COMPONENT_TYPES].sort())
    for (const type of COMPONENT_TYPES as readonly ComponentType[]) {
      const entry = COMPONENT_REGISTRY[type]
      const schema = COMPONENT_SCHEMAS[type]
      expect(entry.label).toBe(schema.label)
      expect(entry.singleton).toBe(true)
      expect(entry.fields.map((f) => f.key)).toEqual(schema.fields.map((f) => f.key))
      expect(entry.icon).toBe(schema.icon)
    }
    expect(COMPONENT_REGISTRY.Collider.defaultProps).toEqual({ width: 32, height: 32, offsetX: 0, offsetY: 0, isSolid: true })
    expect(COMPONENT_REGISTRY.Transform.defaultProps).toEqual({ x: 0, y: 0, depth: 10 })
    expect(COMPONENT_REGISTRY.Event.defaultProps.pages).toHaveLength(1)
  })

  it('maps shared field kinds onto the primitive editors', () => {
    const byKey = (t: ComponentType) => Object.fromEntries(COMPONENT_REGISTRY[t].fields.map((f) => [f.key, f]))
    const sprite = byKey('Sprite')
    expect(sprite.asset).toMatchObject({ type: 'string', kind: 'sprite' })
    expect(sprite.tint).toMatchObject({ type: 'string', kind: 'color' })
    expect(sprite.facing.type).toBe('select')
    expect(sprite.facing.options?.map((o) => o.value)).toEqual(['down', 'left', 'right', 'up'])
    expect(sprite.flipX.type).toBe('boolean')
    expect(sprite.opacity).toMatchObject({ type: 'number', min: 0, max: 1, step: 0.05 })
    expect(byKey('Tag').tag.type).toBe('string')
    expect(byKey('Movement').controller.type).toBe('select')
    expect(byKey('Movement').speed).toMatchObject({ unit: 'px/s', min: 10 })
    expect(toEditorField({ key: 'k', label: 'K', kind: 'textarea' }).type).toBe('textarea')
  })

  it('isFieldVisible follows visibleWhen', () => {
    const movement = COMPONENT_REGISTRY.Movement.fields
    const canRun = movement.find((f) => f.key === 'canRun')!
    const radius = movement.find((f) => f.key === 'wanderRadius')!
    expect(isFieldVisible(canRun, { controller: 'player' })).toBe(true)
    expect(isFieldVisible(canRun, { controller: 'none' })).toBe(false)
    expect(isFieldVisible(radius, { controller: 'wander' })).toBe(true)
    expect(isFieldVisible(radius, {})).toBe(false)
    expect(isFieldVisible(movement.find((f) => f.key === 'speed')!, {})).toBe(true)
  })
})

describe('PRESET_PREFABS', () => {
  it('mirrors the shared prefabs and hands out fresh, valid components on every access', () => {
    expect(PRESET_PREFABS.map((p) => p.name)).toEqual(PREFABS.map((p) => p.name))
    const chest = PRESET_PREFABS.find((p) => p.id === 'chest')!
    const a = chest.components
    const b = chest.components
    expect(a).not.toBe(b)
    expect(a.Event?.pages[0].id).not.toBe(b.Event?.pages[0].id)
    const entity = { id: 'x', name: 'c', x: 0, y: 0, components: a }
    expect(validateEntity(entity).filter((i) => i.severity === 'error')).toEqual([])
    expect(Object.keys(a)).not.toContain('Interactable')
  })
})
