import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Divider = React.forwardRef<HTMLHRElement, React.HTMLAttributes<HTMLHRElement> & { orientation?: 'horizontal' | 'vertical' }>(
  ({ className, orientation = 'horizontal', ...props }, ref) => (
    <hr
      ref={ref}
      className={twMerge(
        clsx(
          "shrink-0 bg-border",
          orientation === 'horizontal' ? "h-[1px] w-full" : "h-full w-[1px]",
          className
        )
      )}
      {...props}
    />
  )
);
Divider.displayName = "Divider";
