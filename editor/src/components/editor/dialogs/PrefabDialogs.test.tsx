/* eslint-disable @typescript-eslint/no-explicit-any -- tests read nodes of a partial tree */
import { afterEach, describe, expect, it } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import { PrefabDialogs, openPrefabDialog, prefabNamed } from './PrefabDialogs'
import { getPrefabLibrary, updatePrefabs } from '@/lib/prefabLibrary'
import { renderWithScene } from '@/test/sceneHarness'
import { makeGroup, makeMap, makePicture } from '@/test/helpers'
import { builtInPrefabs } from '../../../../../shared/prefabs'
import { findNode } from '../../../../../shared/sceneTree'

afterEach(() => {
  act(() => openPrefabDialog(null))
  updatePrefabs(() => builtInPrefabs())
})

const house = () => makeGroup('house', [makePicture('door', { x: 110, y: 200 })], { name: 'House', x: 100, y: 200 })

describe('prefab dialogs', () => {
  it('finds the prefab a name would replace, whatever its case', () => {
    expect(prefabNamed(builtInPrefabs(), '  npc ')?.id).toBe('npc')
    expect(prefabNamed(builtInPrefabs(), 'Castle')).toBeUndefined()
  })

  it('Save as Prefab stores the node tree at the origin and links the node to it', () => {
    const r = renderWithScene(<PrefabDialogs />, makeMap({ nodes: [house()] }))
    act(() => openPrefabDialog({ mode: 'save', nodeId: 'house' }))
    expect(screen.getByLabelText('Prefab name')).toHaveValue('House')
    expect(screen.getByText(/and the 1 node inside it/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save prefab' }))
    const saved = getPrefabLibrary().file.prefabs.find((p) => p.id === 'house')!
    expect(saved.node).toMatchObject({ x: 0, y: 0, name: 'House' })
    expect((findNode(r.map().nodes, 'house') as any).prefab).toBe('house')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('saving under the name of an existing prefab says it replaces it, and does', () => {
    renderWithScene(<PrefabDialogs />, makeMap({ nodes: [house()] }))
    act(() => openPrefabDialog({ mode: 'save', nodeId: 'house' }))
    fireEvent.change(screen.getByLabelText('Prefab name'), { target: { value: 'sign' } })
    expect(screen.getByTestId('prefab-replaces')).toHaveTextContent('Replaces the prefab "Sign"')
    fireEvent.click(screen.getByRole('button', { name: 'Update prefab' }))
    const sign = getPrefabLibrary().file.prefabs.find((p) => p.id === 'sign')!
    expect(sign.node.type).toBe('group')
    expect(getPrefabLibrary().file.prefabs.filter((p) => p.name.toLowerCase() === 'sign')).toHaveLength(1)
  })

  it('the prefab list renames and deletes (asking first)', () => {
    renderWithScene(<PrefabDialogs />, makeMap({ nodes: [] }))
    act(() => openPrefabDialog({ mode: 'manage', parentId: null }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename NPC' }))
    const input = screen.getByLabelText('Prefab name')
    fireEvent.change(input, { target: { value: 'Villager' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(getPrefabLibrary().file.prefabs.find((p) => p.id === 'npc')?.name).toBe('Villager')
    fireEvent.click(screen.getByRole('button', { name: 'Delete Villager' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete prefab' }))
    expect(getPrefabLibrary().file.prefabs.some((p) => p.id === 'npc')).toBe(false)
  })
})
