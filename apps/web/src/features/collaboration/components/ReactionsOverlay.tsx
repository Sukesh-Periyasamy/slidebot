import React, { memo } from 'react';
import { useUxStore } from '../store/uxStore';

export const ReactionsOverlay: React.FC = memo(() => {
  const reactions = useUxStore((state) => state.reactions);

  if (reactions.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-50">
      {reactions.map((r) => (
        <div
          key={r.id}
          className="absolute bottom-10 animate-float-up text-4xl opacity-0"
          style={{
            left: `${Math.random() * 80 + 10}%`,
            animation: `floatUp 3s ease-in forwards`,
          }}
        >
          {r.emoji}
        </div>
      ))}
      <style>
        {`
          @keyframes floatUp {
            0% { transform: translateY(0) scale(0.5); opacity: 0; }
            20% { transform: translateY(-50px) scale(1.2); opacity: 1; }
            80% { transform: translateY(-200px) scale(1); opacity: 1; }
            100% { transform: translateY(-250px) scale(1); opacity: 0; }
          }
        `}
      </style>
    </div>
  );
});

ReactionsOverlay.displayName = 'ReactionsOverlay';
