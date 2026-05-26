import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/Card';

const mockLogs = [
  { id: '1', action: 'ROOM_CREATED', user: 'Alice Smith', timestamp: '2024-05-12T10:00:00Z', details: 'Created room "Q2 Planning"' },
  { id: '2', action: 'MEMBER_INVITED', user: 'Bob Jones', timestamp: '2024-05-12T11:30:00Z', details: 'Invited charlie@example.com' },
  { id: '3', action: 'ROLE_CHANGED', user: 'Alice Smith', timestamp: '2024-05-13T09:15:00Z', details: 'Changed Charlie to Editor' },
];

export function WorkspaceAuditPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-surface-50">Audit Logs</h1>
      <p className="text-sm text-surface-400">Security and activity logs for your workspace.</p>
      
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-surface-400 bg-surface-900 border-b border-surface-800">
                <tr>
                  <th className="px-6 py-3 font-semibold">Action</th>
                  <th className="px-6 py-3 font-semibold">User</th>
                  <th className="px-6 py-3 font-semibold">Date</th>
                  <th className="px-6 py-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-800">
                {mockLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-900/50">
                    <td className="px-6 py-4 text-surface-200 font-mono text-xs">{log.action}</td>
                    <td className="px-6 py-4 text-surface-200">{log.user}</td>
                    <td className="px-6 py-4 text-surface-400">{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="px-6 py-4 text-surface-400">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
