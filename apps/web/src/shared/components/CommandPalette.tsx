import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Presentation, Settings, User, LogOut, Sun, Moon, Monitor } from 'lucide-react';
import { useSettingsStore } from '@/features/settings/store/settingsStore';
import { useAuth } from '@/features/auth/hooks/useAuth';

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const navigate = useNavigate();
  const { updateSetting, settings } = useSettingsStore();
  const { signOut } = useAuth();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const actions = [
    { id: 'home', label: 'Go to Dashboard', icon: Presentation, action: () => navigate('/') },
    { id: 'settings', label: 'Open Settings', icon: Settings, action: () => navigate('/settings') },
    { id: 'account', label: 'Open Account', icon: User, action: () => navigate('/account') },
    { id: 'theme-light', label: 'Set Theme: Light', icon: Sun, action: () => updateSetting('theme', 'light') },
    { id: 'theme-dark', label: 'Set Theme: Dark', icon: Moon, action: () => updateSetting('theme', 'dark') },
    { id: 'theme-system', label: 'Set Theme: System', icon: Monitor, action: () => updateSetting('theme', 'system') },
    { id: 'signout', label: 'Sign Out', icon: LogOut, action: () => { signOut(); navigate('/login'); } },
  ];

  const filtered = query 
    ? actions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
    : actions;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
      setIsOpen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} aria-hidden="true" />
      <div 
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-xl bg-surface-900 border border-surface-700 shadow-2xl rounded-xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center px-4 py-3 border-b border-surface-800">
          <Search size={20} className="text-surface-400 mr-3" />
          <input 
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none text-surface-100 placeholder-surface-500 text-lg"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2" role="listbox">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-surface-500 text-sm">No results found.</div>
          ) : (
            filtered.map((action, index) => {
              const Icon = action.icon;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={action.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => { action.action(); setIsOpen(false); }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-colors ${
                    isSelected ? 'bg-brand-500/15 text-brand-300' : 'text-surface-300 hover:bg-surface-800 hover:text-surface-200'
                  }`}
                >
                  <Icon size={16} className={isSelected ? 'text-brand-400' : 'text-surface-500'} />
                  {action.label}
                </button>
              );
            })
          )}
        </div>
        <div className="px-4 py-2 border-t border-surface-800 bg-surface-950/50 flex items-center gap-4 text-xs text-surface-500">
          <span><kbd className="font-mono bg-surface-800 px-1 rounded">↑↓</kbd> Navigate</span>
          <span><kbd className="font-mono bg-surface-800 px-1 rounded">↵</kbd> Select</span>
          <span><kbd className="font-mono bg-surface-800 px-1 rounded">esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
