import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useNotificationStore, type NotificationType } from './useToast';

const icons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle className="text-emerald-400" size={20} />,
  warning: <AlertTriangle className="text-amber-400" size={20} />,
  info: <Info className="text-brand-400" size={20} />,
  error: <AlertCircle className="text-red-400" size={20} />,
};

export function Toaster() {
  const { notifications, removeNotification } = useNotificationStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {notifications.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="pointer-events-auto flex items-start gap-3 w-80 bg-surface-900 border border-surface-700 shadow-panel rounded-lg p-4"
          >
            <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-50">{toast.title}</p>
              {toast.message && (
                <p className="mt-1 text-xs text-surface-400">{toast.message}</p>
              )}
            </div>
            <button
              onClick={() => removeNotification(toast.id)}
              className="flex-shrink-0 text-surface-500 hover:text-surface-300 transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
