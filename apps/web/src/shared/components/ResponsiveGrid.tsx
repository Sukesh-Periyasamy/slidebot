import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const ResponsiveGrid = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={twMerge(
        clsx(
          "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-[var(--spacing-base)]",
          className
        )
      )}
      {...props}
    />
  )
);
ResponsiveGrid.displayName = "ResponsiveGrid";
