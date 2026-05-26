import React, { memo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useUxStore } from '../store/uxStore';

export const ActivityFeed: React.FC = memo(() => {
  const feed = useUxStore((state) => state.activityFeed);

  const parentRef = useRef<HTMLDivElement>(null);
  
  const rowVirtualizer = useVirtualizer({
    count: feed.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28, // approximate height of one item
    overscan: 5,
  });

  if (feed.length === 0) return null;

  return (
    <div 
      ref={parentRef}
      className="absolute bottom-4 left-4 w-64 max-h-48 overflow-y-auto flex flex-col gap-1 z-40 pointer-events-none fade-mask"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = feed[virtualRow.index];
          if (!item) return null;
          return (
            <div 
              key={item.id} 
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="text-xs bg-black/40 text-white px-2 py-1 rounded w-fit animate-in fade-in slide-in-from-left-2 backdrop-blur-sm mb-1"
            >
              <span className="font-semibold">{item.displayName}</span>
              <span className="opacity-80 ml-1">
                {item.type === 'join' && 'joined'}
                {item.type === 'leave' && 'left'}
                {item.type === 'reaction' && `reacted ${item.metadata?.emoji}`}
                {item.type === 'hand_raise' && 'raised hand'}
                {item.type === 'comment' && 'commented'}
              </span>
            </div>
          );
        })}
      </div>
      <style>
        {`
          .fade-mask {
            mask-image: linear-gradient(to bottom, transparent, black 20%);
          }
        `}
      </style>
    </div>
  );
});

ActivityFeed.displayName = 'ActivityFeed';
