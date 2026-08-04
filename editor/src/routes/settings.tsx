import { useThemeStore } from '@/store/themeStore'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function SettingsPage() {
  const { mode, setMode, accentColor, setAccentColor } = useThemeStore()

  return (
    <div className="max-w-2xl space-y-8 mx-auto w-full pt-14 p-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your app preferences.</p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card/40">
          <div className="space-y-0.5">
            <label className="text-base font-medium">Dark Mode</label>
            <p className="text-sm text-muted-foreground">Toggle between light and dark theme.</p>
          </div>
          <Switch
            checked={mode === 'dark'}
            onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
          />
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg border bg-card/40">
          <div className="space-y-0.5">
            <label className="text-base font-medium">Accent Color</label>
            <p className="text-sm text-muted-foreground">Choose a primary accent color for the UI.</p>
          </div>
          <Select value={accentColor} onValueChange={setAccentColor}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select accent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blue">Purple (Default)</SelectItem>
              <SelectItem value="red">Red</SelectItem>
              <SelectItem value="green">Green</SelectItem>
              <SelectItem value="orange">Orange</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
