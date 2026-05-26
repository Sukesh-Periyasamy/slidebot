import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/Card';
import { Button } from '@/shared/components/Button';

export function WorkspaceSettingsPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-surface-50">Workspace Settings</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-surface-900 rounded-lg border border-surface-800">
            <div>
              <div className="font-semibold text-surface-200">Admins</div>
              <div className="text-sm text-surface-400">Can manage billing, members, and all decks.</div>
            </div>
            <Button variant="secondary" size="sm">Edit</Button>
          </div>
          <div className="flex items-center justify-between p-4 bg-surface-900 rounded-lg border border-surface-800">
            <div>
              <div className="font-semibold text-surface-200">Editors</div>
              <div className="text-sm text-surface-400">Can create and edit decks, but cannot manage billing.</div>
            </div>
            <Button variant="secondary" size="sm">Edit</Button>
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Moderation Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-surface-400 mb-4">
            Configure global defaults for new rooms in this workspace.
          </p>
          <div className="space-y-2 text-sm text-surface-200">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded border-surface-700 bg-surface-900 text-brand-500 focus:ring-brand-500" defaultChecked />
              Require authentication for viewers
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="rounded border-surface-700 bg-surface-900 text-brand-500 focus:ring-brand-500" />
              Disable anonymous annotations
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
