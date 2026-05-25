import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Command, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const shortcuts = [
    { key: 'Cmd/Ctrl + K', description: 'Open Command Palette' },
    { key: 'Space / Right Arrow', description: 'Next Slide' },
    { key: 'Left Arrow', description: 'Previous Slide' },
    { key: 'Cmd/Ctrl + P', description: 'Toggle Presenter Mode' },
    { key: 'Cmd/Ctrl + /', description: 'Show Shortcuts (This Modal)' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md bg-surface-900 border border-surface-800 shadow-2xl rounded-xl overflow-hidden focus:outline-none"
            tabIndex={-1}
          >
            <div className="flex items-center justify-between p-4 border-b border-surface-800 bg-surface-950/50">
              <h2 id="shortcuts-title" className="text-lg font-medium text-surface-50 flex items-center gap-2">
                <Command size={18} /> Keyboard Shortcuts
              </h2>
              <button 
                onClick={onClose} 
                className="text-surface-400 hover:text-surface-200 p-1 rounded transition-colors"
                aria-label="Close shortcuts modal"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <ul className="space-y-2">
                {shortcuts.map((s, i) => (
                  <li key={i} className="flex items-center justify-between py-2 border-b border-surface-800/50 last:border-0">
                    <span className="text-sm text-surface-300">{s.description}</span>
                    <kbd className="px-2 py-1 bg-surface-800 border border-surface-700 rounded text-xs font-mono text-surface-200">
                      {s.key}
                    </kbd>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="p-4 bg-surface-950/50 border-t border-surface-800 flex items-center gap-2 text-xs text-surface-400">
              <Keyboard size={14} /> Tip: Keyboard navigation is supported across the UI.
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
