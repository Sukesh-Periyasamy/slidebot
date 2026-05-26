import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/Card';
import { BarChart2, Users, Eye, Clock } from 'lucide-react';

export function WorkspaceAnalyticsPage() {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-surface-50">Analytics Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-surface-400">
              <Users size={16} /> Total Attendees
            </div>
            <div className="text-3xl font-bold text-surface-50">1,245</div>
            <div className="text-xs text-emerald-400">+12% this month</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-surface-400">
              <Eye size={16} /> Replay Views
            </div>
            <div className="text-3xl font-bold text-surface-50">842</div>
            <div className="text-xs text-emerald-400">+5% this month</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-surface-400">
              <Clock size={16} /> Avg. Time in Room
            </div>
            <div className="text-3xl font-bold text-surface-50">42m</div>
            <div className="text-xs text-surface-500">Stable</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-surface-400">
              <BarChart2 size={16} /> Engagement Score
            </div>
            <div className="text-3xl font-bold text-surface-50">94</div>
            <div className="text-xs text-emerald-400">Top 10%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Presentations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-surface-500 border border-dashed border-surface-700 rounded-lg">
            [Chart Placeholder]
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
