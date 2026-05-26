import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const IconButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'ghost' | 'solid' | 'outline' }>(
  ({ className, variant = 'ghost', ...props }, ref) => {
    const variants = {
      ghost: "hover:bg-surface-200 dark:hover:bg-surface-800 text-text-secondary hover:text-text-primary",
      solid: "bg-surface-200 dark:bg-surface-800 text-text-primary hover:bg-surface-300 dark:hover:bg-surface-700",
      outline: "border border-border text-text-secondary hover:text-text-primary hover:bg-surface-100 dark:hover:bg-surface-800",
    };
    
    return (
      <button
        ref={ref}
        className={twMerge(
          clsx(
            "inline-flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 disabled:pointer-events-none",
            "h-[var(--toolbar-height)] w-[var(--toolbar-height)] min-h-[40px] min-w-[40px]",
            variants[variant],
            className
          )
        )}
        {...props}
      />
    );
  }
);
IconButton.displayName = "IconButton";
