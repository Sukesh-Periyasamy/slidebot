import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/Dialog';
import { Button } from '@/shared/components/Button';
import { useDeleteRoom } from '../hooks/useDeleteRoom';

interface DeleteRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  deckName: string;
  onDeleted?: (roomId: string) => void;
}

export function DeleteRoomDialog({
  open,
  onOpenChange,
  roomId,
  deckName,
  onDeleted,
}: DeleteRoomDialogProps) {
  const { deleteRoom, isDeleting } = useDeleteRoom({
    onSuccess: (deletedRoomId) => {
      onOpenChange(false);
      onDeleted?.(deletedRoomId);
    },
  });

  const handleConfirm = () => {
    void deleteRoom(roomId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete Room</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <span className="font-medium text-surface-50">{deckName}</span>? This action is permanent and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} isLoading={isDeleting}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
