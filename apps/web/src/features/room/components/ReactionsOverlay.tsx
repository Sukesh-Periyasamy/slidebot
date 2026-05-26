import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ReactionEvent {
  detail: {
    sessionId: string;
    userId: string;
    displayName: string;
    emoji: string;
    timestamp: string;
  };
}

interface ActiveReaction {
  id: string;
  emoji: string;
  x: number;
}

export const ReactionsOverlay: React.FC = () => {
  const [reactions, setReactions] = useState<ActiveReaction[]>([]);

  useEffect(() => {
    const handleReaction = (e: Event) => {
      const { emoji } = (e as unknown as ReactionEvent).detail;
      const id = Math.random().toString(36).substring(2, 9);
      
      // Random x position near the bottom right (20% width)
      const x = Math.random() * 100 - 50; 
      
      setReactions((prev) => [...prev, { id, emoji, x }]);

      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== id));
      }, 3000);
    };

    window.addEventListener('reaction_received', handleReaction);
    return () => window.removeEventListener('reaction_received', handleReaction);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-24 right-12 z-50 flex flex-col items-center justify-end w-32 h-64 overflow-visible">
      <AnimatePresence>
        {reactions.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 50, x: r.x, scale: 0.5 }}
            animate={{ opacity: 1, y: -200, x: r.x + (Math.random() * 40 - 20), scale: 1.5 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 2, ease: 'easeOut' }}
            className="absolute bottom-0 text-4xl drop-shadow-md"
          >
            {r.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
