import { useGameSettings } from '@/hooks/useGameSettings'
import { EdButton, Field, NumberField, Section, Toggle } from '@/components/editor/ui/controls'
import { GAME_SETTINGS_SCHEMA, viewSizeForTiles, type SettingField } from '../../../shared/gameSettings'

/** The game's own settings (view size, camera, movement), grouped by category; the schema in shared/gameSettings.ts drives the form. */
export function GameSettingsPage() {
  const { settings, loading, error, dirty, syncNote, set, reset } = useGameSettings()

  const status = error
    ? { text: error, tone: 'text-destructive' }
    : dirty
      ? { text: 'Saving…', tone: 'text-muted-foreground' }
      : syncNote
        ? { text: `Saved in the project. Not copied to the game: ${syncNote}`, tone: 'text-muted-foreground' }
        : { text: 'Saved. The game uses it the next time it loads.', tone: 'text-muted-foreground' }

  const view = settings ? viewSizeForTiles(settings.display.visibleTilesX) : null

  return (
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto p-12 pt-14 text-xs" data-testid="game-settings">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Game Settings</h1>
          <p className="text-muted-foreground">How the game looks and plays.</p>
        </div>
        <EdButton onClick={reset} disabled={!settings} title="Put every setting back to its default">
          Reset to defaults
        </EdButton>
      </div>

      {loading ? <p className="text-muted-foreground">Loading…</p> : null}

      {settings ? (
        <div className="space-y-4" style={{ ['--label-w' as string]: '14rem' }}>
          {GAME_SETTINGS_SCHEMA.map((category) => (
            <Section key={category.id} title={category.label} info={category.description}>
              <div className="space-y-1">
                {category.fields.map((field) => (
                  <SettingRow
                    key={field.key}
                    field={field}
                    value={(settings[category.id] as unknown as Record<string, number | boolean>)[field.key]}
                    onChange={(value) => set(category.id, field.key, value)}
                  />
                ))}
                {category.id === 'display' && view ? (
                  <p className="pt-1 text-muted-foreground" data-testid="view-size">
                    Shows {settings.display.visibleTilesX} × {Math.round((view.height / 32) * 10) / 10} tiles ({view.width} × {view.height} px)
                  </p>
                ) : null}
              </div>
            </Section>
          ))}
        </div>
      ) : null}

      <p className={`mt-4 ${status.tone}`} role="status" data-testid="settings-status">
        {status.text}
      </p>
    </div>
  )
}

function SettingRow({ field, value, onChange }: { field: SettingField; value: number | boolean; onChange: (value: number | boolean) => void }) {
  const id = `setting-${field.key}`
  return (
    <Field label={field.label} info={field.info} htmlFor={id}>
      {field.kind === 'toggle' ? (
        <Toggle id={id} aria-label={field.label} checked={value === true} onChange={onChange} />
      ) : (
        <NumberField
          id={id}
          aria-label={field.label}
          size="sm"
          value={typeof value === 'number' ? value : field.default}
          min={field.min}
          max={field.max}
          step={field.step}
          unit={field.unit}
          onCommit={onChange}
        />
      )}
    </Field>
  )
}
