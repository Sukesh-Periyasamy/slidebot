import { useState } from 'react';
import { useSettingsStore, type SlideBotSettings } from '../store/settingsStore';
import clsx from 'clsx';

type Category = 'appearance' | 'collaboration' | 'presenter' | 'notifications' | 'accessibility';

export function SettingsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('appearance');
  const { settings, updateSetting, resetSettings } = useSettingsStore();

  const categories = [
    { id: 'appearance', label: 'Appearance' },
    { id: 'collaboration', label: 'Collaboration' },
    { id: 'presenter', label: 'Presenter' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'accessibility', label: 'Accessibility' },
  ] as const;

  const renderContent = () => {
    switch (activeCategory) {
      case 'appearance':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-surface-50">Theme</h3>
              <p className="text-sm text-surface-400 mb-4">Choose your preferred visual theme.</p>
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

            <div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(e) => updateSetting('reducedMotion', e.target.checked)}
                  className="rounded border-surface-700 bg-surface-900 text-brand-500 focus:ring-brand-500"
                />
                <div>
                  <span className="block text-sm font-medium text-surface-50">Reduced Motion</span>
                  <span className="block text-xs text-surface-400">Minimize animations and transitions</span>
                </div>
              </label>
            </div>
          </div>
        );
      case 'collaboration':
        return (
          <div className="space-y-6">
            <div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.showCursors}
                  onChange={(e) => updateSetting('showCursors', e.target.checked)}
                  className="rounded border-surface-700 bg-surface-900 text-brand-500 focus:ring-brand-500"
                />
                <div>
                  <span className="block text-sm font-medium text-surface-50">Show Multiplayer Cursors</span>
                  <span className="block text-xs text-surface-400">See where others are pointing in real-time</span>
                </div>
              </label>
            </div>
            <div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.bandwidthSaver}
                  onChange={(e) => updateSetting('bandwidthSaver', e.target.checked)}
                  className="rounded border-surface-700 bg-surface-900 text-brand-500 focus:ring-brand-500"
                />
                <div>
                  <span className="block text-sm font-medium text-surface-50">Bandwidth Saver Mode</span>
                  <span className="block text-xs text-surface-400">Reduce update frequency to save data</span>
                </div>
              </label>
            </div>
          </div>
        );
      case 'presenter':
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-surface-50">Laser Pointer Color</h3>
              <div className="mt-4 flex gap-3">
                {['#ff0000', '#00ff00', '#0000ff', '#ff00ff'].map(color => (
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
            <div>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={settings.autoHideToolbar}
                  onChange={(e) => updateSetting('autoHideToolbar', e.target.checked)}
                  className="rounded border-surface-700 bg-surface-900 text-brand-500 focus:ring-brand-500"
                />
                <div>
                  <span className="block text-sm font-medium text-surface-50">Auto-hide Toolbar</span>
                  <span className="block text-xs text-surface-400">Hide the presenter toolbar when inactive</span>
                </div>
              </label>
            </div>
          </div>
        );
      case 'notifications':
      case 'accessibility':
        return <div className="text-surface-400 text-sm">More settings coming soon...</div>;
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-6 text-surface-100 flex flex-col md:flex-row gap-8">
      <aside className="w-full md:w-64 flex-shrink-0">
        <h1 className="text-2xl font-semibold mb-6">Settings</h1>
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
          <h2 className="text-xl font-medium capitalize text-surface-50">{activeCategory}</h2>
          <button
            onClick={resetSettings}
            className="text-sm text-surface-400 hover:text-surface-200"
          >
            Reset Defaults
          </button>
        </div>
        
        {renderContent()}
      </main>
    </div>
  );
}
