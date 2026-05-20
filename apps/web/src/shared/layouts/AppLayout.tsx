import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Settings, LogOut, Presentation, ChevronRight } from 'lucide-react';

import { useAuth } from '@/features/auth/hooks/useAuth';

// ─────────────────────────────────────────────────────────────────────────────
// AppLayout — sidebar + main content area for protected pages
// ─────────────────────────────────────────────────────────────────────────────

export function AppLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-surface-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar
// ─────────────────────────────────────────────────────────────────────────────

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function Sidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full w-[220px] flex-col border-r border-surface-800 bg-surface-900/50 backdrop-blur-sm"
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

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
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
                <Icon size={16} strokeWidth={isActive ? 2 : 1.5} />
                {label}
                {isActive && <ChevronRight size={14} className="ml-auto text-brand-400" />}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User profile + sign out */}
      <div className="p-3 border-t border-surface-800/50">
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
            onClick={handleSignOut}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-surface-500 hover:text-red-400"
            title="Sign out"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </motion.aside>
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
