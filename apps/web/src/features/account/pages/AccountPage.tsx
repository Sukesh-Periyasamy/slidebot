import { useState, useRef } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAuthStore } from '@/features/auth/store/authStore';
import { Clock, Key, Plus, Users, Eye, EyeOff, Check } from 'lucide-react';
import { Button } from '@/shared/components/Button';
import { useWorkspaceStore } from '@/features/workspaces/store/workspaceStore';
import { useToast } from '@/shared/components/useToast';
import { apiClient } from '@/lib/apiClient';
import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Password Management Component
// ─────────────────────────────────────────────────────────────────────────────

function PasswordManagement() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const { success, error: showError } = useToast();

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    if (currentPassword === newPassword) {
      setMessage({ type: 'error', text: 'New password must be different from current password.' });
      return;
    }

    setIsUpdating(true);

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        setMessage({ type: 'error', text: error.message });
        showError('Failed to update password');
      } else {
        setMessage({ type: 'success', text: 'Password updated successfully.' });
        success('Password updated');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch {
      setMessage({ type: 'error', text: 'An unexpected error occurred.' });
      showError('Failed to update password');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-5 bg-surface-800/50 rounded-lg border border-surface-700/50">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 bg-surface-800 rounded-lg">
            <Key className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-surface-100">Change Password</p>
            <p className="text-xs text-surface-500 mt-0.5">Update your account password</p>
          </div>
        </div>

        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {/* Current Password */}
          <div>
            <label htmlFor="currentPassword" className="block text-xs font-medium text-surface-300 mb-1.5">
              Current Password
            </label>
            <div className="relative">
              <input
                id="currentPassword"
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
                required
                className="w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2.5 pr-10 text-sm text-surface-100 placeholder:text-surface-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label htmlFor="newPassword" className="block text-xs font-medium text-surface-300 mb-1.5">
              New Password
            </label>
            <div className="relative">
              <input
                id="newPassword"
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
                minLength={8}
                className="w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2.5 pr-10 text-sm text-surface-100 placeholder:text-surface-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-200"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword.length > 0 && newPassword.length < 8 && (
              <p className="text-xs text-amber-400 mt-1">Must be at least 8 characters</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-medium text-surface-300 mb-1.5">
              Confirm New Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
              minLength={8}
              className="w-full rounded-lg border border-surface-600 bg-surface-900 px-3 py-2.5 text-sm text-surface-100 placeholder:text-surface-500 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none transition-colors"
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
            )}
            {confirmPassword.length > 0 && newPassword === confirmPassword && confirmPassword.length >= 8 && (
              <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                <Check className="w-3 h-3" /> Passwords match
              </p>
            )}
          </div>

          {/* Message */}
          {message && (
            <div className={`rounded-lg px-4 py-3 text-sm ${
              message.type === 'error'
                ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              {message.text}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={isUpdating || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 8}
          >
            {isUpdating ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </div>
    </div>
  );
}

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

            <PasswordManagement />
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
