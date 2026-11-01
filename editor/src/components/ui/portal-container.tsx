import { createContext } from 'react'

/**
 * Where floating panels (dropdown lists, colour pickers, popovers) render. A modal dialog supplies its own content
 * node: a panel outside it would count as an outside press (closing the dialog) and be blocked by the page lock.
 * null = the document body.
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null)
export const PortalContainerProvider = PortalContainerContext.Provider
