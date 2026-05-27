import { create } from 'zustand';

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
}

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  isLoading: boolean;
  error: string | null;
  setWorkspaces: (workspaces: Workspace[]) => void;
  setActiveWorkspace: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  activeWorkspaceId: null,
  isLoading: true,
  error: null,
  setWorkspaces: (workspaces) => set((state) => ({ 
    workspaces,
    activeWorkspaceId: state.activeWorkspaceId || workspaces[0]?.id || null 
  })),
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
