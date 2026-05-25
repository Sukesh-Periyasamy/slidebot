import { useAuthStore } from '@/features/auth/store/authStore';
import type { Workspace } from '../store/workspaceStore';

export async function listWorkspaces(): Promise<Workspace[]> {
  const token = useAuthStore.getState().session?.access_token;
  if (!token) throw new Error('Unauthenticated');

  const res = await fetch('/api/v1/workspaces', {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!res.ok) {
    throw new Error('Failed to fetch workspaces');
  }
  
  return res.json();
}
