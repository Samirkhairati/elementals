import { createRouter, createRoute, createHashHistory, redirect } from '@tanstack/react-router'
import { rootRoute } from '@/routes/__root'
import { IndexPage } from '@/routes/index'
import { EditorPage } from '@/routes/editor'
import { DatabasePage } from '@/components/editor/database/DatabasePage'
import { SettingsPage } from '@/routes/settings'

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: IndexPage,
})

const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor',
  component: EditorPage,
})

const databaseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/database',
  component: DatabasePage,
  validateSearch: (s: Record<string, unknown>) => ({
    table: typeof s.table === 'string' ? s.table : undefined,
    id: typeof s.id === 'string' ? s.id : undefined,
    tab: typeof s.tab === 'string' ? s.tab : undefined,
  }),
})

// The old Asset Manager lives on as the Database page.
const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assets',
  beforeLoad: () => {
    throw redirect({ to: '/database', search: {} as never })
  },
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([indexRoute, editorRoute, databaseRoute, assetsRoute, settingsRoute])
const hashHistory = createHashHistory()

export const router = createRouter({
  routeTree,
  history: hashHistory,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
