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
import { Plus, Sparkles, Copy, Trash2, Pipette, Palette } from 'lucide-react'
import { OVERLAY_COLORS } from '@/hooks/editor/canvas/canvasView'
import { PRESET_PREFABS } from '@/lib/componentRegistry'
import { EntityData, ComponentType } from '@/types/editor'

export interface CanvasContextMenuTarget {
  type: 'tile' | 'entity'
  tileX?: number
  tileY?: number
  entity?: EntityData
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
    components?: Partial<Record<ComponentType, Record<string, any>>>
  ) => void
  onDuplicateEntity?: (id: string) => void
  onDeleteEntity?: (id: string) => void
  /** Sets the tint of an entity's area outline ('' = white). */
  onSetAreaColor?: (id: string, color: string) => void
  onSampleTile?: (tileX: number, tileY: number) => void
}

export function CanvasContextMenu({
  menuState,
  onClose,
  onCreateEntity,
  onDuplicateEntity,
  onDeleteEntity,
  onSetAreaColor,
  onSampleTile,
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
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                // Center entity on tile: x = tileX * 32 + 16, y = tileY * 32 + 32
                onCreateEntity('New Entity', tileX * 32 + 16, tileY * 32 + 32)
                onClose()
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-2 text-primary" />
              New Empty Entity
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Sparkles className="w-3.5 h-3.5 mr-2 text-amber-400" />
                From Prefab
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48 text-xs z-50 bg-popover/95 backdrop-blur-sm">
                {PRESET_PREFABS.map((prefab) => (
                  <DropdownMenuItem
                    key={prefab.name}
                    onClick={() => {
                      onCreateEntity(
                        prefab.name,
                        tileX * 32 + 16,
                        tileY * 32 + 32,
                        prefab.components
                      )
                      onClose()
                    }}
                  >
                    {prefab.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>

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
