import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, Zap } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// SnapBackBanner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Floating banner shown when viewer is out of sync with presenter.
 * Appears from below with a spring animation.
 * Contains directional context + single "Snap Back" CTA.
 */
interface SnapBackBannerProps {
  presenterName: string;
  presenterSlide: number;
  totalSlides: number;
  slideDelta: number;
  onSnapBack: () => void;
  onDismiss?: () => void;
}

export function SnapBackBanner({
  presenterName,
  presenterSlide,
  totalSlides,
  slideDelta,
  onSnapBack,
}: SnapBackBannerProps) {
  const isBehind = slideDelta < 0;
  const count = Math.abs(slideDelta);

  const directionText = isBehind
    ? `${count} slide${count !== 1 ? 's' : ''} behind`
    : `${count} slide${count !== 1 ? 's' : ''} ahead`;

  return (
    <AnimatePresence>
      <motion.div
        key="snap-back-banner"
        initial={{ y: 80, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 80, opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
      >
        <div className="flex items-center gap-3 glass rounded-2xl px-4 py-3 shadow-panel border border-amber-500/20">
          {/* Pulsing indicator */}
          <div className="relative flex-shrink-0">
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <div className="absolute inset-0 h-2 w-2 rounded-full bg-amber-400 animate-ping opacity-75" />
          </div>

          {/* Context */}
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-surface-100 leading-none">
              Exploring independently
            </span>
            <span className="text-xs text-surface-400 mt-0.5 leading-none">
              <span className="text-amber-400 font-medium">{presenterName}</span> is on slide{' '}
              <span className="font-medium text-surface-200">
                {presenterSlide + 1}/{totalSlides}
              </span>{' '}
              · <span className="text-amber-400">{directionText}</span>
            </span>
          </div>

          {/* CTA */}
          <button
            onClick={onSnapBack}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 px-3 py-1.5 text-xs font-semibold text-white transition-colors ml-1 flex-shrink-0"
          >
            <Zap size={12} />
            Snap Back
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PresenterPositionPill
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Small persistent pill showing presenter's current slide.
 * Always visible in explore mode, hidden in follow mode.
 */
interface PresenterPositionPillProps {
  presenterName: string;
  presenterSlide: number;
  totalSlides: number;
  onClick: () => void;
}

export function PresenterPositionPill({
  presenterName,
  presenterSlide,
  totalSlides,
  onClick,
}: PresenterPositionPillProps) {
  return (
    <motion.button
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full glass border border-surface-700 px-2.5 py-1 text-xs text-surface-300 hover:border-brand-500/40 hover:text-surface-100 transition-all"
      title={`${presenterName} is on slide ${presenterSlide + 1} — click to follow`}
    >
      <MapPin size={10} className="text-brand-400" />
      <span className="font-medium text-brand-300">{presenterName}</span>
      <span className="text-surface-500">·</span>
      <span>
        {presenterSlide + 1}
        <span className="text-surface-600">/{totalSlides}</span>
      </span>
    </motion.button>
  );
}
