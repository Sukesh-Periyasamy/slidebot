import { Loader2, Trash2 } from 'lucide-react';

import { IconButton } from '@/shared/components/IconButton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/shared/components/Tooltip';

export interface DeleteRoomButtonProps {
  /** Whether the current user is the room owner (presenter) */
  isOwner: boolean;
  /** Whether a deletion request is currently in progress */
  isDeleting: boolean;
  /** Callback fired when the delete button is clicked */
  onClick: () => void;
}

export function DeleteRoomButton({ isOwner, isDeleting, onClick }: DeleteRoomButtonProps) {
  if (!isOwner) {
    return null;
  }

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <IconButton
          aria-label="Delete room"
          disabled={isDeleting}
          onClick={onClick}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>Delete room</TooltipContent>
    </Tooltip>
  );
}
