import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { Monitor, Smartphone, Shield, Key, Plus, Users } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { useWorkspaceStore } from '@/features/workspaces/store/workspaceStore';

export function AccountPage() {
  const { user } = useAuth();
  const { workspaces } = useWorkspaceStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'sessions' | 'security' | 'workspaces'>('profile');

  return (
    <div className="mx-auto w-full max-w-5xl p-6 text-surface-100 flex flex-col md:flex-row gap-8">
      <aside className="w-full md:w-64 flex-shrink-0">
        <h1 className="text-2xl font-semibold mb-6">Account</h1>
        <nav className="flex flex-col gap-1">
          <button 
            onClick={() => setActiveTab('profile')}
            className={`text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-surface-800 text-brand-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'}`}
          >
            Profile
          </button>
          <button 
            onClick={() => setActiveTab('sessions')}
            className={`text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'sessions' ? 'bg-surface-800 text-brand-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'}`}
          >
            Sessions
          </button>
          <button 
            onClick={() => setActiveTab('workspaces')}
            className={`text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'workspaces' ? 'bg-surface-800 text-brand-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'}`}
          >
            Workspaces
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'security' ? 'bg-surface-800 text-brand-400' : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800/50'}`}
          >
            Security
          </button>
        </nav>
      </aside>
      
      <main className="flex-1 bg-surface-900 border border-surface-800 rounded-lg p-6">
        {activeTab === 'profile' && (
          <div>
            <h2 className="text-xl font-medium text-surface-50 mb-6 border-b border-surface-800 pb-4">Profile</h2>
            
            <div className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="h-20 w-20 rounded-full bg-brand-500/20 flex items-center justify-center text-2xl font-semibold text-brand-300">
                  {user?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <div>
                  <Button variant="secondary">Change Avatar</Button>
                </div>
              </div>
              
              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-surface-300 mb-2">Display Name</label>
                <input 
                  id="displayName"
                  type="text" 
                  defaultValue={user?.displayName || ''} 
                  className="w-full max-w-md bg-surface-950 border border-surface-700 rounded-lg px-4 py-2 text-surface-100 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>

              <div>
                <label htmlFor="emailAddress" className="block text-sm font-medium text-surface-300 mb-2">Email Address</label>
                <input 
                  id="emailAddress"
                  type="email" 
                  defaultValue={user?.email || ''} 
                  disabled
                  className="w-full max-w-md bg-surface-800 border border-surface-700 rounded-lg px-4 py-2 text-surface-500 cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-surface-500">Email cannot be changed currently.</p>
              </div>

              <div className="pt-6 border-t border-surface-800">
                <Button>Save Changes</Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div>
            <h2 className="text-xl font-medium text-surface-50 mb-6 border-b border-surface-800 pb-4">Active Sessions</h2>
            <div className="space-y-4">
              <div className="flex items-start justify-between p-4 bg-surface-800/50 rounded-lg border border-surface-700/50">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-surface-800 rounded-lg"><Monitor className="w-5 h-5 text-surface-300" /></div>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Mac OS • Chrome</p>
                    <p className="text-xs text-surface-500 mt-0.5">New York, USA • Current Session</p>
                  </div>
                </div>
                <span className="px-2 py-1 bg-brand-500/20 text-brand-400 text-xs font-medium rounded">Active</span>
              </div>
              
              <div className="flex items-start justify-between p-4 bg-surface-800/50 rounded-lg border border-surface-700/50">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-surface-800 rounded-lg"><Smartphone className="w-5 h-5 text-surface-300" /></div>
                  <div>
                    <p className="text-sm font-medium text-surface-200">iOS • Safari</p>
                    <p className="text-xs text-surface-500 mt-0.5">New York, USA • 2 hours ago</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10">Revoke</Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div>
            <h2 className="text-xl font-medium text-surface-50 mb-6 border-b border-surface-800 pb-4">Security</h2>
            
            <div className="space-y-6">
              <div className="flex items-start justify-between p-4 bg-surface-800/50 rounded-lg border border-surface-700/50">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-surface-800 rounded-lg"><Key className="w-5 h-5 text-surface-300" /></div>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Password</p>
                    <p className="text-xs text-surface-500 mt-0.5">Last changed 3 months ago</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm">Update</Button>
              </div>

              <div className="flex items-start justify-between p-4 bg-surface-800/50 rounded-lg border border-surface-700/50">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-surface-800 rounded-lg"><Shield className="w-5 h-5 text-surface-300" /></div>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Two-Factor Authentication</p>
                    <p className="text-xs text-surface-500 mt-0.5">Not enabled</p>
                  </div>
                </div>
                <Button variant="secondary" size="sm">Enable</Button>
              </div>
            </div>
          </div>
        )}
        {activeTab === 'workspaces' && (
          <div>
            <div className="flex items-center justify-between mb-6 border-b border-surface-800 pb-4">
              <h2 className="text-xl font-medium text-surface-50">Workspaces</h2>
              <Button size="sm" leftIcon={<Plus className="w-4 h-4" />}>New Workspace</Button>
            </div>
            
            <div className="space-y-4">
              {workspaces.map(ws => (
                <div key={ws.id} className="flex items-start justify-between p-4 bg-surface-800/50 rounded-lg border border-surface-700/50">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-surface-800 rounded-lg"><Users className="w-5 h-5 text-surface-300" /></div>
                    <div>
                      <p className="text-sm font-medium text-surface-200">{ws.name}</p>
                      <p className="text-xs text-surface-500 mt-0.5">{ws.ownerId === user?.id ? 'Owner' : 'Member'}</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm">Manage</Button>
                </div>
              ))}
              {workspaces.length === 0 && (
                <div className="text-center py-8 text-surface-400 text-sm">
                  No workspaces found.
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
