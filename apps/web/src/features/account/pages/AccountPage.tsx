import { useState, useRef } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Clock, Shield, Key, Plus, Users } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { useWorkspaceStore } from '@/features/workspaces/store/workspaceStore';
import { useToast } from '@/shared/components/useToast';
import { apiClient } from '@/lib/apiClient';

export function AccountPage() {
  const { user, session } = useAuth();
  const { workspaces } = useWorkspaceStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'sessions' | 'security' | 'workspaces'>('profile');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { success, error: showError } = useToast();
  const updateDisplayName = useAuthStore((s) => s.updateDisplayName);

  const handleSaveProfile = async () => {
    if (!displayName.trim()) {
      showError('Validation error', 'Display name cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      await apiClient.put('/users/me/profile', { displayName: displayName.trim() });
      updateDisplayName(displayName.trim());
      success('Profile updated', 'Your display name has been saved.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save profile. Please try again.';
      showError('Save failed', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const token = session?.access_token;
    if (!token) {
      showError('Upload failed', 'You must be logged in to change your avatar.');
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetch('/api/v1/users/me/avatar', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to upload avatar');
      }

      const data = await res.json();
      const avatarUrl = data.avatarUrl;

      // Update avatar URL in auth store
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        useAuthStore.setState({
          user: { ...currentUser, avatarUrl },
        });
      }

      success('Avatar updated', 'Your profile picture has been changed.');
    } catch (err) {
      showError('Upload failed', err instanceof Error ? err.message : 'Could not upload avatar. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
      // Reset file input so the same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarChange}
                  />
                  <Button
                    variant="secondary"
                    isLoading={isUploadingAvatar}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change Avatar
                  </Button>
                </div>
              </div>

              <div>
                <label htmlFor="displayName" className="block text-sm font-medium text-surface-300 mb-2">Display Name</label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
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
                <Button onClick={handleSaveProfile} isLoading={isSaving}>Save Changes</Button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div>
            <h2 className="text-xl font-medium text-surface-50 mb-6 border-b border-surface-800 pb-4">Sessions</h2>
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="p-4 bg-surface-800 rounded-full mb-4">
                <Clock className="w-8 h-8 text-surface-400" />
              </div>
              <h3 className="text-lg font-medium text-surface-200 mb-2">Coming Soon</h3>
              <p className="text-sm text-surface-400 max-w-sm">
                Session management is not yet available. You&apos;ll be able to view and manage your active sessions here in a future update.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div>
            <h2 className="text-xl font-medium text-surface-50 mb-6 border-b border-surface-800 pb-4">Security</h2>

            <div className="mb-4 p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg">
              <p className="text-sm text-brand-300 font-medium">Coming Soon</p>
              <p className="text-xs text-surface-400 mt-1">Password management and two-factor authentication features are not yet available.</p>
            </div>

            <div className="space-y-6">
              <div className="flex items-start justify-between p-4 bg-surface-800/50 rounded-lg border border-surface-700/50 opacity-60">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-surface-800 rounded-lg"><Key className="w-5 h-5 text-surface-300" /></div>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Password</p>
                    <p className="text-xs text-surface-500 mt-0.5">Password management coming soon</p>
                  </div>
                </div>
                <div className="relative group">
                  <Button variant="secondary" size="sm" disabled title="This feature is not yet available">Update</Button>
                  <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block px-2 py-1 text-xs text-surface-200 bg-surface-700 rounded shadow-lg whitespace-nowrap z-10">
                    This feature is not yet available
                  </span>
                </div>
              </div>

              <div className="flex items-start justify-between p-4 bg-surface-800/50 rounded-lg border border-surface-700/50 opacity-60">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-surface-800 rounded-lg"><Shield className="w-5 h-5 text-surface-300" /></div>
                  <div>
                    <p className="text-sm font-medium text-surface-200">Two-Factor Authentication</p>
                    <p className="text-xs text-surface-500 mt-0.5">2FA setup coming soon</p>
                  </div>
                </div>
                <div className="relative group">
                  <Button variant="secondary" size="sm" disabled title="This feature is not yet available">Enable</Button>
                  <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block px-2 py-1 text-xs text-surface-200 bg-surface-700 rounded shadow-lg whitespace-nowrap z-10">
                    This feature is not yet available
                  </span>
                </div>
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
