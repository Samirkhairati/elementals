// Temporary page between the sprite Asset manager (removed) and the Database page: lists what the project holds.
import { useSpriteAssets } from '@/hooks/useSpriteAssets'

export function AssetsPage() {
  const sprites = useSpriteAssets()
  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3 overflow-auto bg-sidebar p-4" data-testid="assets-page">
      <h1 className="text-ed-title">Database</h1>
      {sprites.error && <p role="alert" className="text-destructive">{sprites.error}</p>}
      <section>
        <h2 className="text-ed-label">Characters ({sprites.list.length})</h2>
        <ul>{sprites.list.map((a) => <li key={a.id}>{a.meta.name || a.id} <span className="ed-hint">{a.id}</span></li>)}</ul>
      </section>
      <section>
        <h2 className="text-ed-label">Graphics ({sprites.graphics.length})</h2>
        <ul>{sprites.graphics.map((g) => <li key={g.id}>{g.id} <span className="ed-hint">{g.width}×{g.height}</span></li>)}</ul>
      </section>
    </div>
  )
}
