import { createRouter, createRoute, createHashHistory } from '@tanstack/react-router'
import { rootRoute } from '@/routes/__root'
import { IndexPage } from '@/routes/index'
import { EditorPage } from '@/routes/editor'
import { AssetsPage } from '@/routes/assets'
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

const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assets',
  component: AssetsPage,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

const routeTree = rootRoute.addChildren([indexRoute, editorRoute, assetsRoute, settingsRoute])
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
