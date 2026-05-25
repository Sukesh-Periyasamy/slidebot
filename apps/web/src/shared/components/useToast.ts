import { create } from 'zustand';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
}

interface NotificationStore {
  notifications: AppNotification[];
  addNotification: (notification: Omit<AppNotification, 'id'>) => void;
  removeNotification: (id: string) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (notification) => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id }],
    }));
    
    if (notification.duration !== 0) {
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, notification.duration || 4000);
    }
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));

export function useToast() {
  const addNotification = useNotificationStore((s) => s.addNotification);
  
  return {
    toast: (props: Omit<AppNotification, 'id'>) => addNotification(props),
    success: (title: string, message?: string) => addNotification({ type: 'success', title, message }),
    error: (title: string, message?: string) => addNotification({ type: 'error', title, message }),
    info: (title: string, message?: string) => addNotification({ type: 'info', title, message }),
    warning: (title: string, message?: string) => addNotification({ type: 'warning', title, message }),
  };
}
