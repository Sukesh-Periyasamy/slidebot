import { useState } from 'react';
import { useSettingsStore, type SlideBotSettings } from '../store/settingsStore';
import clsx from 'clsx';
import { Button } from '@/shared/components/Button';
import { Download, Upload } from 'lucide-react';

type Category = 'appearance' | 'collaboration' | 'performance' | 'presenter' | 'notifications' | 'accessibility';

export function SettingsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('appearance');
  const { settings, updateSetting, resetSettings, updateSettings } = useSettingsStore();

  const categories = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'collaboration', label: 'Collaboration' },
    { id: 'performance', label: 'Performance' },
    { id: 'presenter', label: 'Presenter Controls' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'accessibility', label: 'Accessibility' },
  ] as const;

  const handleExport = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "slidebot-settings.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          updateSettings(imported);
        } catch (error) {
          console.error("Failed to parse settings", error);
        }
      };
      reader.readAsText(file);
    }
  };

  const ToggleItem = ({ 
    label, 
    description, 
    settingKey,
    checked,
    onChange
  }: { 
    label: string, 
    description: string, 
    settingKey?: keyof SlideBotSettings,
    checked?: boolean,
    onChange?: (val: boolean) => void
  }) => {
    const isChecked = settingKey ? settings[settingKey] as boolean : checked;
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (settingKey) {
        updateSetting(settingKey, e.target.checked);
      } else if (onChange) {
        onChange(e.target.checked);
      }
    };
    
    return (
      <div>
        <div className="flex items-start gap-3">
          <input
            id={`toggle-${settingKey || label.replace(/\s+/g, '-')}`}
            type="checkbox"
            checked={!!isChecked}
            onChange={handleChange}
            className="mt-1 h-4 w-4 rounded border-surface-700 bg-surface-900 text-brand-500 focus:ring-brand-500 focus:ring-offset-surface-900"
          />
          <label htmlFor={`toggle-${settingKey || label.replace(/\s+/g, '-')}`} className="flex flex-col cursor-pointer">
            <span className="text-sm font-medium text-surface-200">{label}</span>
            <span className="text-xs text-surface-500">{description}</span>
          </label>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeCategory) {
      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-surface-50">Theme</h3>
              <p className="text-xs text-surface-400 mb-3">Choose your preferred visual theme.</p>
              <div className="flex gap-4">
                {(['light', 'dark', 'system'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => updateSetting('theme', t)}
                    className={clsx(
                      "px-4 py-2 rounded border text-sm font-medium capitalize transition-colors",
                      settings.theme === t
                        ? "border-brand-500 bg-brand-500/10 text-brand-400"
                        : "border-surface-700 hover:border-surface-600 text-surface-300"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Density toggle - temporary adaptation until UI matches UIDensity enum */}
            <ToggleItem
              label="Compact Mode"
              description="Reduce padding and UI element size"
              checked={settings.density === 'compact'}
              onChange={(checked) => updateSettings({ density: checked ? 'compact' : 'comfortable' })}
            />
          </div>
        );
      case 'collaboration':
        return (
          <div className="space-y-6">
            <ToggleItem 
              label="Show Multiplayer Cursors" 
              description="See where others are pointing in real-time." 
              settingKey="showCursors" 
            />
            <ToggleItem 
              label="Show Participant Activity" 
              description="Display active speaker and typing indicators." 
              settingKey="showParticipantActivity" 
            />
            <ToggleItem 
              label="Cursor Animations" 
              description="Smooth interpolation for remote cursor movements." 
              settingKey="cursorAnimation" 
            />
            <ToggleItem 
              label="Annotation Smoothing" 
              description="Apply curve smoothing to hand-drawn annotations." 
              settingKey="annotationSmoothing" 
            />
          </div>
        );
      case 'performance':
        return (
          <div className="space-y-6">
            <ToggleItem 
              label="Bandwidth Saver Mode" 
              description="Reduce network update frequency to save data." 
              settingKey="bandwidthSaver" 
            />
            <ToggleItem 
              label="Adaptive Rendering" 
              description="Automatically lower resolution during heavy panning." 
              settingKey="adaptiveRendering" 
            />
            <ToggleItem 
              label="Low Memory Mode" 
              description="Aggressively clear cached slides and resources." 
              settingKey="lowMemoryMode" 
            />
            <ToggleItem 
              label="Live Thumbnails" 
              description="Render live previews in the slide navigator." 
              settingKey="liveThumbnails" 
            />
            <div>
              <h3 className="text-sm font-medium text-surface-50 mb-2">Replay Quality</h3>
              <select 
                value={settings.replayQuality}
                onChange={(e) => updateSetting('replayQuality', e.target.value as 'low' | 'medium' | 'high')}
                className="w-full max-w-xs bg-surface-900 border border-surface-700 text-surface-200 text-sm rounded-md px-3 py-2 focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
              >
                <option value="low">Low (Fastest)</option>
                <option value="medium">Medium</option>
                <option value="high">High (Best quality)</option>
              </select>
            </div>
          </div>
        );
      case 'presenter':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-surface-50">Laser Pointer Color</h3>
              <div className="mt-3 flex gap-3">
                {['#ff0000', '#00ff00', '#0000ff', '#ff00ff', '#ffa500'].map(color => (
                  <button
                    key={color}
                    onClick={() => updateSetting('laserPointerColor', color)}
                    className={clsx(
                      "w-8 h-8 rounded-full border-2 transition-transform",
                      settings.laserPointerColor === color ? "border-white scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <ToggleItem label="Auto-hide Toolbar" description="Hide the presenter toolbar when inactive." settingKey="autoHideToolbar" />
            <ToggleItem label="Auto Fullscreen" description="Automatically enter fullscreen when presenting." settingKey="autoFullscreen" />
            <ToggleItem label="Timer Persistence" description="Remember presentation timer across reloads." settingKey="timerPersistence" />
            <ToggleItem label="Audience Mode Defaults" description="Start rooms with attendees muted by default." settingKey="audienceModeDefaults" />
            <ToggleItem label="Quick Handoff" description="Allow instant presenter handoff without approval." settingKey="quickHandoff" />
          </div>
        );
      case 'notifications':
        return (
          <div className="space-y-6">
            <ToggleItem label="Enable Toasts" description="Show pop-up notifications for important events." settingKey="enableToasts" />
            <ToggleItem label="Sound Effects" description="Play a sound when receiving notifications." settingKey="soundEnabled" />
            <ToggleItem label="Quiet Mode" description="Suppress all non-critical notifications." settingKey="quietMode" />
            <ToggleItem label="Reconnect Alerts" description="Notify when connection is lost and restored." settingKey="reconnectAlerts" />
            <ToggleItem label="Handoff Alerts" description="Notify when presenter role changes." settingKey="handoffAlerts" />
            <ToggleItem label="Invite Notifications" description="Notify when invited to a new workspace." settingKey="inviteNotifications" />
          </div>
        );
      case 'accessibility':
        return (
          <div className="space-y-6">
            <ToggleItem label="Reduced Motion" description="Minimize animations and transitions." settingKey="reducedMotion" />
            <ToggleItem label="High Contrast" description="Increase contrast for better readability." settingKey="highContrast" />
            <ToggleItem label="Keyboard Navigation" description="Optimize focus states for keyboard users." settingKey="keyboardNavigation" />
            <ToggleItem label="Focus Ring Visibility" description="Always show focus rings on active elements." settingKey="focusRingVisibility" />
            
            <div>
              <div className="flex justify-between">
                <h3 className="text-sm font-medium text-surface-50">Font Scaling</h3>
                <span className="text-xs text-brand-400">{settings.fontScaling}%</span>
              </div>
              <input 
                type="range" 
                min="75" 
                max="150" 
                step="5"
                value={settings.fontScaling}
                onChange={(e) => updateSetting('fontScaling', parseInt(e.target.value))}
                className="w-full mt-2 accent-brand-500"
              />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-6 text-surface-100 flex flex-col md:flex-row gap-8">
      <aside className="w-full md:w-64 flex-shrink-0">
        <h1 className="text-2xl font-semibold mb-6 text-surface-50">Settings</h1>
        <nav className="flex flex-col gap-1">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={clsx(
                "text-left px-3 py-2 rounded-md text-sm font-medium transition-colors",
                activeCategory === cat.id
                  ? "bg-surface-800 text-brand-400"
                  : "text-surface-400 hover:text-surface-200 hover:bg-surface-800/50"
              )}
            >
              {cat.label}
            </button>
          ))}
        </nav>
      </aside>
      
      <main className="flex-1 bg-surface-900 border border-surface-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-8 border-b border-surface-800 pb-4">
          <h2 className="text-xl font-medium text-surface-50">{categories.find(c => c.id === activeCategory)?.label}</h2>
          
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-settings')?.click()}>
              <Upload size={14} className="mr-2" /> Import
            </Button>
            <input id="import-settings" type="file" accept=".json" className="hidden" onChange={handleImport} />
            
            <Button variant="ghost" size="sm" onClick={handleExport}>
              <Download size={14} className="mr-2" /> Export
            </Button>
            
            <Button variant="ghost" size="sm" onClick={resetSettings} className="text-surface-400">
              Reset
            </Button>
          </div>
        </div>
        
        {renderContent()}
      </main>
    </div>
  );
}
