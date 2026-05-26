import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Settings, LogOut, Presentation, ChevronRight } from 'lucide-react';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { useWorkspaceStore } from '@/features/workspaces/store/workspaceStore';
import { listWorkspaces } from '@/features/workspaces/api/workspaceApi';
import { useEffect, useState } from 'react';
import { NotificationCenter } from '@/shared/components/NotificationCenter';
import { KeyboardShortcutsModal } from '@/shared/components/KeyboardShortcutsModal';
import { CommandPalette } from '@/shared/components/CommandPalette';
import { Menu, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// AppLayout — sidebar + main content area for protected pages
// ─────────────────────────────────────────────────────────────────────────────

export function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface-950">
      {/* Mobile Menu Button */}
      <div className="md:hidden absolute top-4 left-4 z-50">
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 bg-surface-900 border border-surface-800 rounded-lg text-surface-200 shadow-sm"
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      <CommandPalette />
      <KeyboardShortcutsModal isOpen={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────────

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/account', icon: Settings, label: 'Account' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean, setIsOpen: (open: boolean) => void }) {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { workspaces, activeWorkspaceId, setActiveWorkspace, setWorkspaces } = useWorkspaceStore();

  useEffect(() => {
    listWorkspaces().then(setWorkspaces).catch(console.error);
  }, [setWorkspaces]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      <motion.aside
        initial={false}
        animate={{ x: isOpen ? 0 : -280 }}
        className={`fixed md:relative z-40 flex h-full w-64 flex-col border-r border-surface-800/50 bg-surface-900/50 backdrop-blur-xl transition-transform duration-300 md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-surface-800/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 flex-shrink-0">
          <SlideBotIcon />
        </div>
        <span className="font-semibold text-surface-50 text-sm">SlideBot</span>
        <span className="ml-auto text-[10px] font-medium bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded-full">
          Beta
        </span>
      </div>

      {/* Workspace Switcher */}
      <div className="px-3 pt-3 pb-2 border-b border-surface-800/50">
        <div className="relative">
          <select 
            value={activeWorkspaceId || ''}
            onChange={(e) => setActiveWorkspace(e.target.value)}
            className="w-full bg-surface-800 border border-surface-700 text-surface-200 text-sm rounded-lg px-3 py-2 appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {workspaces.map(ws => (
              <option key={ws.id} value={ws.id}>{ws.name}</option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-surface-400">
            <svg className="h-4 w-4 fill-current" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all ${
                isActive
                  ? 'bg-brand-500/15 text-brand-300 font-medium'
                  : 'text-surface-400 hover:bg-surface-800 hover:text-surface-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                {item.label}
                {isActive && <ChevronRight size={14} className="ml-auto text-brand-400" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User profile + sign out */}
      <div className="mt-auto p-3 border-t border-surface-800/50 flex flex-col gap-2">
        <div className="flex items-center justify-between px-2">
          <NotificationCenter />
        </div>
        
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-surface-800 transition-colors group">
          {/* Avatar */}
          <div className="h-7 w-7 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0 text-xs font-semibold text-brand-300">
            {user?.displayName?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-surface-200 truncate">{user?.displayName}</p>
            <p className="text-[10px] text-surface-500 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => {
              signOut();
              navigate('/login');
            }}
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 ml-auto flex h-7 w-7 items-center justify-center rounded-md text-surface-500 hover:bg-surface-700 hover:text-surface-200 transition-all focus-visible:ring-2 focus-visible:ring-brand-500"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </motion.aside>
    </>
  );
}

function SlideBotIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="14" rx="2" fill="white" fillOpacity="0.9" />
      <rect x="6" y="8" width="8" height="1.5" rx="0.75" fill="#6173F2" />
      <rect x="6" y="11" width="12" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.6" />
      <rect x="6" y="14" width="6" height="1.5" rx="0.75" fill="#6173F2" fillOpacity="0.4" />
    </svg>
  );
}
