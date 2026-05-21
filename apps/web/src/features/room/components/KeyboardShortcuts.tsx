import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, X } from 'lucide-react';

export function KeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === '?') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const shortcuts = [
    { key: '?', description: 'Toggle this shortcuts menu' },
    { key: '← / →', description: 'Previous / Next slide' },
    { key: 'P', description: 'Toggle drawing Pen' },
    { key: 'L', description: 'Toggle Laser pointer' },
    { key: 'E', description: 'Toggle Eraser' },
    { key: 'M', description: 'Move / Select tool' },
    { key: 'Escape', description: 'Close menus or snap back to presenter' },
  ];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex h-8 w-8 items-center justify-center rounded-full bg-surface-800/80 text-surface-400 shadow-sm backdrop-blur-sm transition-colors hover:bg-surface-700 hover:text-surface-200"
        title="Keyboard Shortcuts (?)"
      >
        <HelpCircle size={16} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-950/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="w-full max-w-sm overflow-hidden rounded-xl border border-surface-800 bg-surface-900 shadow-2xl relative"
            >
              <div className="flex items-center justify-between border-b border-surface-800 p-4">
                <h2 className="text-sm font-semibold text-surface-50 flex items-center gap-2">
                  <HelpCircle size={16} className="text-surface-400" /> Keyboard Shortcuts
                </h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-1 text-surface-500 hover:bg-surface-800 hover:text-surface-200 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {shortcuts.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-surface-400">{shortcut.description}</span>
                    <kbd className="min-w-6 inline-flex justify-center rounded bg-surface-800 px-1.5 py-1 text-[10px] font-mono font-medium text-surface-200 border border-surface-700 shadow-sm">
                      {shortcut.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
