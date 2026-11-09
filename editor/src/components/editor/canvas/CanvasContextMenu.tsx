import React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Plus, Sparkles, Copy, CopyPlus, Trash2, Pipette, Palette } from 'lucide-react'
import { OVERLAY_COLORS } from '@/hooks/editor/canvas/canvasView'
import { PRESET_PREFABS } from '@/lib/componentRegistry'
import { EntityData, ComponentType } from '@/types/editor'

export interface CanvasContextMenuTarget {
  type: 'tile' | 'entity'
  tileX?: number
  tileY?: number
  /** The map pixel that was right-clicked (where a free entity is created). */
  worldX?: number
  worldY?: number
  entity?: EntityData
  /** A tile menu opened over a picture of the active image layer. */
  pictureId?: string
}

export interface CanvasContextMenuState {
  isOpen: boolean
  x: number
  y: number
  target: CanvasContextMenuTarget | null
}

interface CanvasContextMenuProps {
  menuState: CanvasContextMenuState
  onClose: () => void
  onCreateEntity: (
    name: string,
    x: number,
    y: number,
    components?: Partial<Record<ComponentType, Record<string, any>>>,
    /** A free entity: any pixel position and size, instead of one on the tile grid. */
    free?: boolean
  ) => void
  onDuplicateEntity?: (id: string) => void
  onDeleteEntity?: (id: string) => void
  /** Sets the tint of an entity's area outline ('' = white). */
  onSetAreaColor?: (id: string, color: string) => void
  onSampleTile?: (tileX: number, tileY: number) => void
  /** "Place multiple" on the picture that was right-clicked. */
  onPlaceMultiple?: (imageId: string) => void
  /** Shown next to the entry (the shortcut, if any). */
  placeMultipleKeys?: string
}

export function CanvasContextMenu({
  menuState,
  onClose,
  onCreateEntity,
  onDuplicateEntity,
  onDeleteEntity,
  onSetAreaColor,
  onSampleTile,
  onPlaceMultiple,
  placeMultipleKeys,
}: CanvasContextMenuProps) {
  const { isOpen, x, y, target } = menuState
  const tileX = target?.tileX ?? 0
  const tileY = target?.tileY ?? 0

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DropdownMenuTrigger asChild>
        <div
          style={{
            position: 'fixed',
            left: `${x}px`,
            top: `${y}px`,
            width: 1,
            height: 1,
            pointerEvents: 'none',
            opacity: 0,
          }}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        side="bottom"
        className="w-52 text-xs z-50 bg-popover/95 backdrop-blur-sm border-border/80 shadow-2xl"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          document.body.style.pointerEvents = ''
        }}
      >
        {target?.type === 'entity' && target.entity ? (
          <>
            <DropdownMenuLabel className="truncate text-foreground font-semibold">
              {target.entity.name}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* Inline swatches: a submenu did not open reliably from this canvas menu. */}
            <div role="group" aria-label="Area colour" className="px-2 py-1.5">
              <div className="mb-1.5 flex items-center gap-2 text-ed-label text-muted-foreground">
                <Palette className="h-3.5 w-3.5" />
                Area colour
              </div>
              <div className="flex items-center gap-1.5">
                {OVERLAY_COLORS.map((c) => (
                  <button
                    key={c.id || 'white'}
                    type="button"
                    aria-label={`Area colour ${c.label}`}
                    aria-pressed={(target.entity!.components.Tag?.color ?? '') === c.id}
                    title={c.label}
                    onClick={() => {
                      onSetAreaColor?.(target.entity!.id, c.id)
                      onClose()
                    }}
                    className="h-5 w-5 rounded-full border border-black/40 hover:scale-110 aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-1 aria-pressed:ring-offset-background"
                    style={{ background: `rgb(${c.rgb})` }}
                  />
                ))}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onDuplicateEntity?.(target.entity!.id)
                onClose()
              }}
            >
              <Copy className="w-3.5 h-3.5 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onDeleteEntity?.(target.entity!.id)
                onClose()
              }}
              className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete Entity
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="text-muted-foreground font-normal text-[10px]">
              Tile ({tileX}, {tileY})
            </DropdownMenuLabel>
            {target?.pictureId && onPlaceMultiple && (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    onPlaceMultiple(target.pictureId!)
                    onClose()
                  }}
                >
                  <CopyPlus className="w-3.5 h-3.5 mr-2 text-primary" />
                  Place multiple
                  {placeMultipleKeys && <span className="ml-auto pl-3 text-muted-foreground">{placeMultipleKeys}</span>}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            {([false, true] as const).map((free) => {
              // Tile-based entities are centred on the tile; a free one is created on the exact pixel.
              const at = free ? { x: target?.worldX ?? tileX * 32 + 16, y: target?.worldY ?? tileY * 32 + 32 } : { x: tileX * 32 + 16, y: tileY * 32 + 32 }
              return (
                <React.Fragment key={free ? 'free' : 'tile'}>
                  <DropdownMenuItem
                    onClick={() => {
                      onCreateEntity('New Entity', at.x, at.y, undefined, free)
                      onClose()
                    }}
                  >
                    <Plus className="w-3.5 h-3.5 mr-2 text-primary" />
                    {free ? 'New Free Entity' : 'New Tile Entity'}
                  </DropdownMenuItem>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <Sparkles className="w-3.5 h-3.5 mr-2 text-amber-400" />
                      {free ? 'Free From Prefab' : 'Tile From Prefab'}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-48 text-xs z-50 bg-popover/95 backdrop-blur-sm">
                      {PRESET_PREFABS.map((prefab) => (
                        <DropdownMenuItem
                          key={prefab.name}
                          onClick={() => {
                            onCreateEntity(prefab.name, at.x, at.y, prefab.components, free)
                            onClose()
                          }}
                        >
                          {prefab.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </React.Fragment>
              )
            })}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onSampleTile?.(tileX, tileY)
                onClose()
              }}
            >
              <Pipette className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              Sample Tile Here
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
