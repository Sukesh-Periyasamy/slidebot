import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointer2, PenTool, KeySquare } from 'lucide-react';

export function OnboardingGuide() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem('slidebot_onboarded');
    if (!hasSeen) {
      // Small delay to let the initial rendering finish
      const timer = setTimeout(() => setIsOpen(true), 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, []);

  const handleClose = () => {
    localStorage.setItem('slidebot_onboarded', 'true');
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-surface-950/60 backdrop-blur-sm p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md overflow-hidden rounded-xl border border-surface-800 bg-surface-900 shadow-2xl"
          >
            <div className="p-6">
              <h2 className="mb-2 text-xl font-bold text-surface-50">Welcome to SlideBot!</h2>
              <p className="mb-6 text-sm text-surface-400">
                You're in a live collaborative presentation. Here are a few tips to get you started:
              </p>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-400">
                    <MousePointer2 size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-surface-200">Follow the Presenter</h3>
                    <p className="mt-0.5 text-xs text-surface-400">
                      Your screen automatically stays in sync with the presenter. If you explore other slides, you can quickly snap back.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                    <PenTool size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-surface-200">Collaborative Drawing</h3>
                    <p className="mt-0.5 text-xs text-surface-400">
                      When presenting, use the toolbar at the bottom to draw, highlight, or use the laser pointer in real-time.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
                    <KeySquare size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-surface-200">Keyboard Shortcuts</h3>
                    <p className="mt-0.5 text-xs text-surface-400">
                      Use left/right arrows to change slides, and press <kbd className="rounded bg-surface-800 px-1 py-0.5 text-surface-300">?</kbd> anytime to view all shortcuts.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end border-t border-surface-800 bg-surface-900/50 p-4">
              <button
                onClick={handleClose}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                Got it, let's go!
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
