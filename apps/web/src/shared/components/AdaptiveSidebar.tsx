import React from 'react';
import { useIsMobile } from '../hooks/useBreakpoint';
import { Sheet, SheetContent, SheetTrigger } from './Sheet';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface AdaptiveSidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  mobileTrigger?: React.ReactNode;
  side?: 'left' | 'right';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const AdaptiveSidebar = React.forwardRef<HTMLDivElement, AdaptiveSidebarProps>(
  ({ className, children, mobileTrigger, side = 'left', open, onOpenChange, ...props }, ref) => {
    const isMobile = useIsMobile();

    if (isMobile) {
      return (
        <Sheet open={open ?? false} onOpenChange={onOpenChange as (open: boolean) => void}>
          {mobileTrigger && <SheetTrigger asChild>{mobileTrigger}</SheetTrigger>}
          <SheetContent side={side} className={twMerge("w-[85vw] sm:w-[380px] p-0", className)}>
            {children}
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <aside
        ref={ref}
        className={twMerge(
          clsx(
            "flex h-full w-[var(--sidebar-width)] flex-col bg-surface-100 dark:bg-surface-900 border-border",
            side === 'left' ? 'border-r' : 'border-l',
            className
          )
        )}
        {...props}
      >
        {children}
      </aside>
    );
  }
);
AdaptiveSidebar.displayName = "AdaptiveSidebar";
