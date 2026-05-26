import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/Card';
import { useRealtimeDebugStore } from '../store/realtimeDebugStore';

export function PerformanceDebugPage() {
  const [memory, setMemory] = useState<any>(null);
  const metrics = useRealtimeDebugStore((state) => state.metrics);

  useEffect(() => {
    const checkMemory = () => {
      // @ts-expect-error - performance.memory is not standard
      if (performance && performance.memory) {
        // @ts-expect-error - performance.memory is not standard
        setMemory(performance.memory);
      }
    };
    const id = setInterval(checkMemory, 1000);
    checkMemory();
    return () => clearInterval(id);
  }, []);

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-surface-50">Performance & Telemetry</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Memory Diagnostics (Chrome Only)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 font-mono text-sm">
            {memory ? (
              <>
                <div className="flex justify-between border-b border-surface-800 pb-2">
                  <span className="text-surface-400">JS Heap Size Limit</span>
                  <span className="text-surface-50">{formatBytes(memory.jsHeapSizeLimit)}</span>
                </div>
                <div className="flex justify-between border-b border-surface-800 pb-2">
                  <span className="text-surface-400">Total JS Heap Size</span>
                  <span className="text-surface-50">{formatBytes(memory.totalJSHeapSize)}</span>
                </div>
                <div className="flex justify-between border-b border-surface-800 pb-2">
                  <span className="text-surface-400">Used JS Heap Size</span>
                  <span className="text-brand-400 font-bold">{formatBytes(memory.usedJSHeapSize)}</span>
                </div>
              </>
            ) : (
              <div className="text-surface-500 italic">performance.memory not available in this browser.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Websocket Telemetry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 font-mono text-sm">
            <div className="flex justify-between border-b border-surface-800 pb-2">
              <span className="text-surface-400">Socket Status</span>
              <span className={`font-bold ${metrics.socketStatus === 'connected' ? 'text-emerald-400' : 'text-rose-400'}`}>
                {metrics.socketStatus}
              </span>
            </div>
            <div className="flex justify-between border-b border-surface-800 pb-2">
              <span className="text-surface-400">Bytes Received</span>
              <span className="text-surface-50">{formatBytes(metrics.bytesReceived)}</span>
            </div>
            <div className="flex justify-between border-b border-surface-800 pb-2">
              <span className="text-surface-400">Bytes Sent</span>
              <span className="text-surface-50">{formatBytes(metrics.bytesSent)}</span>
            </div>
            <div className="flex justify-between border-b border-surface-800 pb-2">
              <span className="text-surface-400">Events Received</span>
              <span className="text-surface-50">{metrics.eventsReceived}</span>
            </div>
            <div className="flex justify-between border-b border-surface-800 pb-2">
              <span className="text-surface-400">Events Sent</span>
              <span className="text-surface-50">{metrics.eventsSent}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
