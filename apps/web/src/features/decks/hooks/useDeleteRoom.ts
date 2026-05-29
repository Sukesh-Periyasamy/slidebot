import { useCallback, useState } from 'react';
import { isAxiosError } from 'axios';

import { deleteRoom } from '../api/roomsApi';
import { useToast } from '@/shared/components/useToast';

interface UseDeleteRoomOptions {
  onSuccess?: (roomId: string) => void;
}

export function useDeleteRoom(options?: UseDeleteRoomOptions) {
  const [isDeleting, setIsDeleting] = useState(false);
  const toast = useToast();

  const handleDelete = useCallback(
    async (roomId: string) => {
      setIsDeleting(true);
      try {
        await deleteRoom(roomId);
        options?.onSuccess?.(roomId);
      } catch (err: unknown) {
        if (isAxiosError(err)) {
          const status = err.response?.status;
          switch (status) {
            case 403:
              toast.error("You don't have permission to delete this room");
              break;
            case 404:
              toast.info('Room not found — it may have already been deleted');
              options?.onSuccess?.(roomId);
              break;
            case 500:
              toast.error('Failed to delete room. Please try again.');
              break;
            default:
              toast.error('Failed to delete room. Please try again.');
              break;
          }
        } else {
          toast.error('Network error. Please check your connection and try again.');
        }
      } finally {
        setIsDeleting(false);
      }
    },
    [options, toast]
  );

  return {
    deleteRoom: handleDelete,
    isDeleting,
  };
}
