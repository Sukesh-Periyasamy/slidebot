import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/components/Card';
import { useAdminStore } from '../store/adminStore';

export function AdminDashboardPage() {
  const { retentionDays, ssoEnabled, ssoProvider, setRetentionDays, setSsoEnabled, setSsoProvider } = useAdminStore();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-surface-50">Enterprise Administration</h1>
      <p className="text-surface-400">Manage organizational policies, retention, and access.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Retention Policy */}
        <Card>
          <CardHeader>
            <CardTitle>Data Retention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="retention" className="text-sm font-medium text-surface-200">
                Retention Period (Days)
              </label>
              <input
                id="retention"
                type="number"
                value={retentionDays}
                onChange={(e) => setRetentionDays(Number(e.target.value))}
                className="flex h-10 w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <p className="text-xs text-surface-500">
                Replays and snapshots older than {retentionDays} days will be permanently deleted.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* SSO Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Single Sign-On (SSO)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-surface-200">Enable SSO</span>
              <button
                type="button"
                onClick={() => setSsoEnabled(!ssoEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 focus:ring-offset-surface-900 ${
                  ssoEnabled ? 'bg-brand-500' : 'bg-surface-700'
                }`}
                role="switch"
                aria-checked={ssoEnabled}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    ssoEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {ssoEnabled && (
              <div className="flex flex-col gap-2 pt-2">
                <label htmlFor="provider" className="text-sm font-medium text-surface-200">
                  Identity Provider
                </label>
                <select
                  id="provider"
                  value={ssoProvider || ''}
                  onChange={(e) => setSsoProvider(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="" disabled>Select provider...</option>
                  <option value="okta">Okta</option>
                  <option value="azure">Azure AD</option>
                  <option value="google">Google Workspace</option>
                </select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Audit Export Placeholder */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Audit Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-surface-400 mb-4">
              Export comprehensive access, sharing, and administration logs.
            </p>
            <button className="bg-surface-800 hover:bg-surface-700 text-surface-50 px-4 py-2 rounded-md text-sm font-medium transition-colors">
              Export CSV (Last 30 Days)
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
