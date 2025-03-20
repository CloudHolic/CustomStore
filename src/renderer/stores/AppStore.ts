import {create} from 'zustand';

// 폴링 상태
interface PollingState {
  status: 'started' | 'stopped' | 'error';
  interval: number;
  lastUpdateTime: string;
}

// 알림 상태
interface NotificationState {
  message: string;
  isVisible: boolean;
  duration: number;
}

// Store 상태
interface AppState {
  // Polling
  polling: PollingState;
  setPollingStatus: (status: 'started' | 'stopped' | 'error') => void;
  setPollingInterval: (interval: number) => void;
  setLastUpdateTime: (time: string) => void;

  // Notification
  notification: NotificationState;
  showNotification: (message: string, duration?: number) => void;
  hideNotification: () => void;

  // Cache
  invalidateCache: () => Promise<void>;
}

// Zustand Store
const useAppStore = create<AppState>((set, get) => ({
  polling: {
    status: 'started',
    interval: 5000,
    lastUpdateTime: '-'
  },

  setPollingStatus: (status) => set((state) => ({
    polling: {...state.polling, status}
  })),

  setPollingInterval: (interval) => set((state) => ({
    polling: {...state.polling, interval}
  })),

  setLastUpdateTime: (time) => set((state) => ({
    polling: {...state.polling, lastUpdateTime: time}
  })),

  notification: {
    message: '',
    isVisible: false,
    duration: 3000
  },

  showNotification: (message, duration = 3000) => set({
    notification: {
      message,
      isVisible: true,
      duration
    }
  }),

  hideNotification: () => set((state) => ({
    notification: {...state.notification, isVisible: false}
  })),

  invalidateCache: async () => {
    try {
      await window.electronAPI.invalidateCache();
    } catch (error) {
      const {showNotification} = get();
      showNotification(`Error invalidating cache: ${error instanceof Error ? error.message : 'Unknown error'}`, 5000);
      throw error;
    }
  }
}));

export default useAppStore;