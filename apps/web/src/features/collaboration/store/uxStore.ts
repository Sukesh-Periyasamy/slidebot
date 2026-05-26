import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface Reaction {
  id: string;
  emoji: string;
  userId: string;
  displayName: string;
  timestamp: string;
}

export interface HandRaise {
  userId: string;
  timestamp: string;
}

export interface ActivityEvent {
  id: string;
  type: 'join' | 'leave' | 'reaction' | 'hand_raise' | 'comment';
  userId: string;
  displayName: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface UxState {
  reactions: Reaction[];
  handRaises: Record<string, HandRaise>;
  activityFeed: ActivityEvent[];
  distractionFreeMode: boolean;
  spotlightUserId: string | null;
  slideBookmarks: number[];
  teleprompterVisible: boolean;
  confidenceMonitorVisible: boolean;

  // Actions
  toggleDistractionFreeMode: () => void;
  setSpotlightUserId: (id: string | null) => void;
  toggleSlideBookmark: (slideNumber: number) => void;
  toggleTeleprompter: () => void;
  toggleConfidenceMonitor: () => void;
  addReaction: (reaction: Reaction) => void;
  removeReaction: (id: string) => void;
  addHandRaise: (userId: string, timestamp: string) => void;
  removeHandRaise: (userId: string) => void;
  addActivity: (activity: ActivityEvent) => void;
  clear: () => void;
}

const MAX_ACTIVITY_FEED = 50;

export const useUxStore = create<UxState>()(
  subscribeWithSelector((set) => ({
    reactions: [],
    handRaises: {},
    activityFeed: [],
    distractionFreeMode: false,
    spotlightUserId: null,
    slideBookmarks: [],
    teleprompterVisible: false,
    confidenceMonitorVisible: false,

    addReaction: (reaction) => {
      set((state) => ({
        reactions: [...state.reactions, reaction],
      }));
      // Auto-remove reaction after 3 seconds
      setTimeout(() => {
        set((state) => ({
          reactions: state.reactions.filter((r) => r.id !== reaction.id),
        }));
      }, 3000);
    },

    removeReaction: (id) =>
      set((state) => ({
        reactions: state.reactions.filter((r) => r.id !== id),
      })),

    addHandRaise: (userId, timestamp) =>
      set((state) => ({
        handRaises: {
          ...state.handRaises,
          [userId]: { userId, timestamp },
        },
      })),

    removeHandRaise: (userId) =>
      set((state) => {
        const newHandRaises = { ...state.handRaises };
        delete newHandRaises[userId];
        return { handRaises: newHandRaises };
      }),

    addActivity: (activity) =>
      set((state) => {
        const newFeed = [activity, ...state.activityFeed].slice(0, MAX_ACTIVITY_FEED);
        return { activityFeed: newFeed };
      }),

    toggleDistractionFreeMode: () =>
      set((state) => ({ distractionFreeMode: !state.distractionFreeMode })),

    setSpotlightUserId: (id) =>
      set({ spotlightUserId: id }),

    toggleSlideBookmark: (slideNumber) =>
      set((state) => {
        const exists = state.slideBookmarks.includes(slideNumber);
        return {
          slideBookmarks: exists
            ? state.slideBookmarks.filter((n) => n !== slideNumber)
            : [...state.slideBookmarks, slideNumber].sort((a, b) => a - b),
        };
      }),

    toggleTeleprompter: () =>
      set((state) => ({ teleprompterVisible: !state.teleprompterVisible })),

    toggleConfidenceMonitor: () =>
      set((state) => ({ confidenceMonitorVisible: !state.confidenceMonitorVisible })),

    clear: () => set({ 
      reactions: [], 
      handRaises: {}, 
      activityFeed: [], 
      distractionFreeMode: false, 
      spotlightUserId: null, 
      slideBookmarks: [] 
    }),
  }))
);
