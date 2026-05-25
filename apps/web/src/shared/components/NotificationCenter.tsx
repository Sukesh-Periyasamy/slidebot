import { useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Mock persistent notifications for now
export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: '1', title: 'Welcome to SlideBot', message: 'Upload your first PDF to get started.', read: false, time: 'Just now' },
    { id: '2', title: 'New Feature: Workspaces', message: 'You can now collaborate with your team in Workspaces.', read: false, time: '2 hours ago' }
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex items-center justify-center h-8 w-8 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-surface-900" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="absolute left-10 bottom-0 mb-8 w-80 bg-surface-900 border border-surface-800 shadow-panel rounded-xl z-50 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800 bg-surface-950/50">
                <h3 className="text-sm font-semibold text-surface-50">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
                    <Check size={12} /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto p-2">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-sm text-surface-500">
                    No new notifications
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {notifications.map(n => (
                      <li key={n.id} className={`p-3 rounded-lg flex items-start gap-3 group transition-colors ${n.read ? 'opacity-70' : 'bg-surface-800/50'}`}>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${n.read ? 'text-surface-300' : 'text-surface-100 font-medium'}`}>{n.title}</p>
                          <p className="text-xs text-surface-400 mt-1 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-surface-500 mt-2">{n.time}</p>
                        </div>
                        <button 
                          onClick={() => removeNotification(n.id)}
                          className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-surface-300 p-1 rounded transition-opacity"
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
