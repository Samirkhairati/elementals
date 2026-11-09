import { create } from 'zustand'
import type { EntityData, ImageGroup, ImageItem, Layer } from '@/types/editor'

/** What Ctrl/Cmd+C copied inside the editor (kept in memory; pasting needs the same kind of target). */
export type ClipboardContent =
  | { kind: 'images'; items: ImageItem[]; /** The groups the copied pictures belonged to. */ groups?: ImageGroup[] }
  | { kind: 'entities'; entities: EntityData[] }
  | { kind: 'layers'; layers: Layer[] }

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
