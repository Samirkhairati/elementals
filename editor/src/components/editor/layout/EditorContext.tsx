import React, { createContext, useContext } from 'react'

export const EditorContext = createContext<any>(null)

export function useEditorContext() {
  const ctx = useContext(EditorContext)
  if (!ctx) throw new Error('useEditorContext must be used within EditorContext.Provider')
  return ctx
}
