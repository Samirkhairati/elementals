import React, { useState } from 'react'
import { Settings2, ChevronDown, ChevronRight } from 'lucide-react'
import { ActiveTool, TileSelection, MapData, DebugInfo } from '@/types/editor'

interface DebugStatusBadgeProps {
  activeTool: ActiveTool
  tileSelection: TileSelection | null
  activeLayerId: string | null
  activeMap: MapData | null
  isPainting: boolean
  debugInfo: DebugInfo | null
}

export const DebugStatusBadge = React.memo(function DebugStatusBadge({
  activeTool,
  tileSelection,
  activeLayerId,
  activeMap,
  isPainting,
  debugInfo,
}: DebugStatusBadgeProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`absolute bottom-4 right-4 bg-black/80 text-green-400 rounded font-mono z-50 shadow-lg ring-1 ring-white/20 min-w-[250px] transition-all overflow-hidden ${
        expanded ? 'p-4' : 'p-2'
      }`}
    >
      <div
        className="font-bold text-white uppercase tracking-wider flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(prev => !prev)}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-green-400" />
          <span className="text-xs">Debug Status (Konva)</span>
        </div>
        <button className="hover:bg-white/10 p-1 rounded" type="button">
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-1 mt-2 border-t border-white/20 pt-2 text-xs pointer-events-none">
          <div>Engine: Konva Canvas 2D</div>
          <div>Tool: {activeTool}</div>
          <div>Selection: {tileSelection ? `${tileSelection.width}x${tileSelection.height} tiles` : 'NONE'}</div>
          <div>Active Layer ID: {activeLayerId || 'NONE'}</div>
          <div>Active Map: {activeMap ? `${activeMap.name} (${activeMap.width}x${activeMap.height})` : 'NONE'}</div>
          <div>isPainting: {isPainting ? 'TRUE' : 'FALSE'}</div>
          <div className="mt-2 text-yellow-400">Last Paint Result:</div>
          <div className="whitespace-pre-wrap">
            {debugInfo
              ? `${debugInfo.action.toUpperCase()} at [${debugInfo.x ?? '-'}, ${debugInfo.y ?? '-'}]\nReason: ${debugInfo.error}`
              : 'Waiting for input...'}
          </div>
        </div>
      )}
    </div>
  )
})
