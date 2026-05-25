import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, PlusCircle, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

import { useDeckUpload } from '../hooks/useDeckUpload';
import { listRecentRooms } from '../api/roomsApi';
import type { RoomListItem } from '../types/room';

export function DashboardPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lastRoomId, setLastRoomId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const { upload, isUploading, error, clearError } = useDeckUpload();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setRoomsLoading(true);
      try {
        const data = await listRecentRooms();
        if (!cancelled) setRooms(data);
      } catch {
        if (!cancelled) setRooms([]);
      } finally {
        if (!cancelled) setRoomsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPicker = () => {
    clearError();
    fileInputRef.current?.click();
  };

  const handleFilePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const { roomId } = await upload(file);
      navigate(`/room/${roomId}`);
      setLastRoomId(roomId);
    } catch {
      // Surface via state message.
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-6 text-surface-100">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-sm text-surface-400">
          Upload a PDF presentation and create a live room in one flow.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={openPicker}
          disabled={isUploading}
          className="flex h-32 items-center gap-4 rounded-xl border border-surface-800 bg-surface-900/60 px-5 text-left transition hover:border-brand-500/40 hover:bg-surface-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading ? (
            <Loader2 className="h-7 w-7 animate-spin text-brand-400" />
          ) : (
            <FileUp className="h-7 w-7 text-brand-400" />
          )}
          <div>
            <p className="text-base font-semibold">Upload Presentation</p>
            <p className="mt-1 text-xs text-surface-400">PDF only, up to 50MB.</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => (lastRoomId ? navigate(`/room/${lastRoomId}`) : openPicker())}
          disabled={isUploading}
          className="flex h-32 items-center gap-4 rounded-xl border border-surface-800 bg-surface-900/60 px-5 text-left transition hover:border-brand-500/40 hover:bg-surface-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PlusCircle className="h-7 w-7 text-brand-400" />
          <div>
            <p className="text-base font-semibold">Create Room</p>
            <p className="mt-1 text-xs text-surface-400">
              {lastRoomId ? 'Open the room for your last uploaded deck.' : 'Upload first, then open room.'}
            </p>
          </div>
          <ArrowRight className="ml-auto h-5 w-5 text-surface-500" />
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-surface-800 bg-surface-900/50 p-4">
        <h2 className="text-sm font-semibold text-surface-200">Recent Rooms</h2>
        {roomsLoading ? (
          <p className="mt-3 text-xs text-surface-400">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <p className="mt-3 text-xs text-surface-400">No rooms yet. Upload a PDF to create one.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rooms.map((room) => (
              <li key={room.roomId}>
                <button
                  type="button"
                  onClick={() => navigate(`/room/${room.roomId}`)}
                  className="flex w-full items-center justify-between rounded-lg border border-surface-800 bg-surface-950/40 px-3 py-2 text-left text-xs hover:border-brand-500/40"
                >
                  <span className="truncate text-surface-200">{room.deck.name}</span>
                  <span className="ml-4 text-surface-500">{room.status}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={handleFilePick}
      />
    </div>
  );
}
