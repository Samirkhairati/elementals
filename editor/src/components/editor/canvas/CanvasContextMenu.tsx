import React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { DropShadowDropdownItem } from '../look/DropShadowMenuItem'
import { Plus, Sparkles, Copy, CopyPlus, Trash2, Pipette, Palette, CircleDot } from 'lucide-react'
import { NamedIcon } from '../ui/icons'
import { OVERLAY_COLORS } from '@/hooks/editor/canvas/canvasView'
import { usePrefabLibrary } from '@/lib/prefabLibrary'
import { placePrefab } from '../../../../../shared/prefabs'
import type { SceneNode } from '../../../../../shared/sceneTree'
import { EntityData, ComponentType, type PropBag } from '@/types/editor'

export interface CanvasContextMenuTarget {
  type: 'tile' | 'entity'
  tileX?: number
  tileY?: number
  /** The map pixel that was right-clicked (where a new entity goes while the magnet is off). */
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
  /** Puts a new node on the map (a plain Node or a placed prefab, made with fresh ids). */
  onPlaceNode?: (make: (newId: () => string) => SceneNode) => void
  onCreateEntity: (
    name: string,
    x: number,
    y: number,
    components?: Partial<Record<ComponentType, PropBag>>
  ) => void
  /** The top toolbar's magnet: a new entity lands on the clicked tile instead of the exact pixel. */
  snapToGrid?: boolean
  onDuplicateEntity?: (id: string) => void
  onDeleteEntity?: (id: string) => void
  /** Sets the tint of an entity's area outline ('' = white). */
  onSetAreaColor?: (id: string, color: string) => void
  onSampleTile?: (tileX: number, tileY: number) => void
  /** "Place multiple" on the picture that was right-clicked. */
  onPlaceMultiple?: (imageId: string) => void
  /** The drop shadow of the picture that was right-clicked: whether it has one, and adding it (null: not a picture). */
  pictureShadow?: (imageId: string) => { has: boolean; add: () => void } | null
  /** Shown next to the entry (the shortcut, if any). */
  placeMultipleKeys?: string
}

export function CanvasContextMenu({
  menuState,
  onClose,
  onCreateEntity,
  onPlaceNode,
  onDuplicateEntity,
  onDeleteEntity,
  onSetAreaColor,
  onSampleTile,
  onPlaceMultiple,
  pictureShadow,
  placeMultipleKeys,
  snapToGrid = true,
}: CanvasContextMenuProps) {
  const prefabs = usePrefabLibrary().file.prefabs
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
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          document.body.style.pointerEvents = ''
        }}
      >
        {target?.type === 'entity' && target.entity ? (
          <>
            <DropdownMenuLabel className="truncate text-foreground">
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
              <Copy />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onDeleteEntity?.(target.entity!.id)
                onClose()
              }}
              destructive
            >
              <Trash2 />
              Delete Entity
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="font-normal">
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
                  <CopyPlus className="text-primary" />
                  Place multiple
                  {placeMultipleKeys && <DropdownMenuShortcut>{placeMultipleKeys}</DropdownMenuShortcut>}
                </DropdownMenuItem>
                {pictureShadow?.(target.pictureId) && (
                  <DropShadowDropdownItem
                    has={pictureShadow(target.pictureId!)!.has}
                    onClick={() => {
                      pictureShadow(target.pictureId!)!.add()
                      onClose()
                    }}
                  />
                )}
                <DropdownMenuSeparator />
              </>
            )}
            {(() => {
              // Where the entity goes: with the magnet on, the anchor of the clicked tile (a one-tile entity fills the
              // tile); off, the exact pixel that was right-clicked.
              const at = snapToGrid
                ? { x: tileX * 32 + 16, y: tileY * 32 + 32 }
                : { x: Math.round(target?.worldX ?? tileX * 32 + 16), y: Math.round(target?.worldY ?? tileY * 32 + 32) }
              return (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CircleDot className="text-sky-400" />
                    Node
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      title="An empty Node with its anchor here: add an AnimatedSprite, an Area or a StaticBody with a CollisionShape, an Event..."
                      onClick={() => {
                        if (onPlaceNode) onPlaceNode((newId) => ({ id: newId(), type: 'group', name: 'Node', x: at.x, y: at.y, children: [] }))
                        else onCreateEntity('New Entity', at.x, at.y, undefined)
                        onClose()
                      }}
                    >
                      <Plus className="text-primary" />
                      New Node
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Sparkles className="text-amber-400" />
                        Prefab
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {prefabs.map((prefab) => (
                          <DropdownMenuItem
                            key={prefab.id}
                            title={prefab.description}
                            onClick={() => {
                              if (onPlaceNode) onPlaceNode((newId) => placePrefab(prefab, at.x, at.y, newId))
                              onClose()
                            }}
                          >
                            <NamedIcon name={prefab.icon ?? 'package'} className="text-muted-foreground" />
                            {prefab.name}
                          </DropdownMenuItem>
                        ))}
                        {prefabs.length === 0 && <DropdownMenuItem disabled>No prefabs yet</DropdownMenuItem>}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )
            })()}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                onSampleTile?.(tileX, tileY)
                onClose()
              }}
            >
              <Pipette className="text-muted-foreground" />
              Sample Tile Here
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
