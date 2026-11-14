import { create } from 'zustand'
import type { SceneNode } from '../../../shared/sceneTree'

/** What Ctrl/Cmd+C copied inside the editor (kept in memory): nodes of the scene tree, each with what is inside it. */
export type ClipboardContent = { kind: 'nodes'; nodes: SceneNode[] }

interface EditorClipboardState {
  content: ClipboardContent | null
  set: (content: ClipboardContent | null) => void
}

export const useEditorClipboard = create<EditorClipboardState>(set => ({
  content: null,
  set: content => set({ content }),
}))

/** Deep copy so later edits of the originals do not change what was copied. */
export const snapshot = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T
