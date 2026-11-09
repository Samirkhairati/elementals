// The editor's main views, in sidebar order (Ctrl+1.. jumps to the nth, Ctrl+Tab cycles).

export interface MainView {
  title: string
  url: string
}

export const MAIN_VIEWS: MainView[] = [
  { title: 'Home', url: '/' },
  { title: 'Map Editor', url: '/editor' },
  { title: 'Database', url: '/database' },
  { title: 'Game Settings', url: '/game-settings' },
  { title: 'Settings', url: '/settings' },
]

/** The view `step` places after the one at `pathname` (wraps around); an unknown path starts from the first view. */
export function cycleView(pathname: string, step: 1 | -1, views: MainView[] = MAIN_VIEWS): MainView {
  const at = views.findIndex(v => v.url === pathname)
  const from = at === -1 ? 0 : at
  return views[(from + step + views.length) % views.length]
}

/** The nth view (1-based), or undefined when there are fewer. */
export const viewAt = (n: number, views: MainView[] = MAIN_VIEWS): MainView | undefined => views[n - 1]
