import { useMemo } from 'react'
import { useDatabase } from '@/hooks/useDatabase'
import { useCommonEvents } from '@/hooks/useCommonEvents'
import { EditorProvider, type EditorBaseContextValue } from '../layout/EditorContext'
import { DatabasePanel } from '../panels/DatabasePanel'
import type { DatabaseData } from './useDatabaseData'

/**
 * The Flags table hosts the event work's Database panel (switches, variables, stages, common events) unchanged.
 * Its common-event editor needs an editor context, so a small one is provided here (no map is open on this page).
 */
export function FlagsTable({ data }: { data: DatabaseData }) {
  const db = useDatabase()
  const common = useCommonEvents()
  const sprites = data.sprites
  const value = useMemo(
    () =>
      ({
        spriteAssets: sprites.assets, spriteList: sprites.list, getSpriteAsset: sprites.getAsset,
        switches: db.switches, variables: db.variables, stages: db.stages, getSwitch: db.getSwitch, getVariable: db.getVariable,
        addSwitch: db.addSwitch, addVariable: db.addVariable, addStage: db.addStage,
        commonEvents: common.events, maps: data.maps, activeMap: null, entities: [],
        handleUndo: () => {}, handleRedo: () => {}, historyIndex: 0, historyLength: 0,
        setConfirmDialog: () => {},
      }) as unknown as EditorBaseContextValue,
    [sprites.assets, sprites.list, sprites.getAsset, db.switches, db.variables, db.stages, db.getSwitch, db.getVariable, db.addSwitch, db.addVariable, db.addStage, common.events, data.maps],
  )
  return (
    <EditorProvider value={value}>
      <div className="h-full min-h-0 overflow-y-auto p-2 text-xs" data-testid="flags-table">
        <DatabasePanel
          switches={db.switches} variables={db.variables} stages={db.stages} maps={data.maps}
          addSwitch={db.addSwitch} renameSwitch={db.renameSwitch} removeSwitch={db.removeSwitch}
          addVariable={db.addVariable} renameVariable={db.renameVariable} setVariableInitial={db.setVariableInitial} removeVariable={db.removeVariable}
          addStage={db.addStage} renameStage={db.renameStage} removeStage={db.removeStage}
          addStageValue={db.addStageValue} renameStageValue={db.renameStageValue} removeStageValue={db.removeStageValue}
          moveStageValue={db.moveStageValue} setStageInitial={db.setStageInitial} setFolder={db.setFolder}
          commonEvents={common.events} addCommonEvent={common.addEvent} renameCommonEvent={common.renameEvent}
          removeCommonEvent={common.removeEvent} setCommonEventGraph={common.setEventGraph}
        />
      </div>
    </EditorProvider>
  )
}
