import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

export function EmbedPlaybackPage() {
  const { replayId } = useParams<{ replayId: string }>();
  const [error, setError] = useState<string | null>(null);

  // In a real app, this would fetch the .slidereplay from replayId
  useEffect(() => {
    if (!replayId) {
      setError('Invalid Replay ID');
    }
  }, [replayId]);

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface-950 text-surface-50">
        <p className="text-rose-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-surface-950 text-surface-50 overflow-hidden p-4 items-center justify-center">
      <div className="max-w-md w-full p-8 bg-surface-900 rounded-xl border border-surface-800 shadow-xl text-center">
        <h1 className="text-xl font-semibold mb-2">Embed Replay Viewer</h1>
        <p className="text-sm text-surface-400">
          This is an embeddable, iframe-safe version of the Playback Page for replay ID: <span className="text-brand-300 font-mono">{replayId}</span>
        </p>
      </div>
    </div>
  );
}
