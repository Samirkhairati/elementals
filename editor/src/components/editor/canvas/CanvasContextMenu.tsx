import React from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuLabel,
} from '@/components/ui/context-menu'
import { Plus, Sparkles, Copy, Trash2, Maximize2, Pipette } from 'lucide-react'
import { PRESET_PREFABS } from '@/lib/componentRegistry'
import { EntityData, ComponentType } from '@/types/editor'

export interface CanvasContextMenuTarget {
  type: 'tile' | 'entity'
  tileX?: number
  tileY?: number
  entity?: EntityData
}

interface CanvasContextMenuProps {
  children: React.ReactNode
  target: CanvasContextMenuTarget | null
  onCreateEntity: (
    name: string,
    x: number,
    y: number,
    components?: Partial<Record<ComponentType, Record<string, any>>>
  ) => void
  onDuplicateEntity?: (id: string) => void
  onDeleteEntity?: (id: string) => void
  onStartResizeCollider?: (id: string) => void
  onSampleTile?: (tileX: number, tileY: number) => void
}

export function CanvasContextMenu({
  children,
  target,
  onCreateEntity,
  onDuplicateEntity,
  onDeleteEntity,
  onStartResizeCollider,
  onSampleTile,
}: CanvasContextMenuProps) {
  const tileX = target?.tileX ?? 0
  const tileY = target?.tileY ?? 0

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52 font-mono text-xs">
        {target?.type === 'entity' && target.entity ? (
          <>
            <ContextMenuLabel className="truncate text-foreground font-semibold">
              {target.entity.name}
            </ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onStartResizeCollider?.(target.entity!.id)}
            >
              <Maximize2 className="w-3.5 h-3.5 mr-2 text-primary" />
              Resize Collider
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onDuplicateEntity?.(target.entity!.id)}
            >
              <Copy className="w-3.5 h-3.5 mr-2" />
              Duplicate
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onDeleteEntity?.(target.entity!.id)}
              className="text-red-400 focus:text-red-400 focus:bg-red-500/10"
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" />
              Delete Entity
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuLabel className="text-muted-foreground font-normal text-[10px]">
              Tile ({tileX}, {tileY})
            </ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => {
                // Center entity on tile: x = tileX * 32 + 16, y = tileY * 32 + 32
                onCreateEntity('New Entity', tileX * 32 + 16, tileY * 32 + 32)
              }}
            >
              <Plus className="w-3.5 h-3.5 mr-2 text-primary" />
              New Empty Entity
            </ContextMenuItem>

            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Sparkles className="w-3.5 h-3.5 mr-2 text-amber-400" />
                From Prefab
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48 font-mono text-xs">
                {PRESET_PREFABS.map(prefab => (
                  <ContextMenuItem
                    key={prefab.name}
                    onClick={() => {
                      onCreateEntity(
                        prefab.name,
                        tileX * 32 + 16,
                        tileY * 32 + 32,
                        prefab.components
                      )
                    }}
                  >
                    {prefab.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>

            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onSampleTile?.(tileX, tileY)}
            >
              <Pipette className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
              Sample Tile Here
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
