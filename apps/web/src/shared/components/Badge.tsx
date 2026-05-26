import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Badge = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'secondary' | 'outline' }>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants = {
      default: "border-transparent bg-brand-500 text-white hover:bg-brand-600",
      secondary: "border-transparent bg-surface-200 text-surface-900 hover:bg-surface-300 dark:bg-surface-800 dark:text-surface-100 dark:hover:bg-surface-700",
      outline: "text-text-primary border-border",
    };
    
    return (
      <div
        ref={ref}
        className={twMerge(
          clsx(
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2",
            variants[variant],
            className
          )
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";
