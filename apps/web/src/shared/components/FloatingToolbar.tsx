import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const FloatingToolbar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { orientation?: 'horizontal' | 'vertical' }>(
  ({ className, orientation = 'horizontal', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={twMerge(
          clsx(
            "flex items-center gap-1 rounded-xl p-1 shadow-panel glass-strong pointer-events-auto",
            orientation === 'horizontal' ? "flex-row" : "flex-col",
            className
          )
        )}
        {...props}
      />
    );
  }
);
FloatingToolbar.displayName = "FloatingToolbar";
