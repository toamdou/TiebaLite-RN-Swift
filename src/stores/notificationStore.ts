// ============================================================
// notificationStore — 对齐 Kotlin NewTiebaApi
//
// Kotlin:
//   msg():      POST /c/s/msg {bookmark=1}           — 通知数统计
//   replyMe():  POST /c/u/feed/replyme {pn}           — 回复我的
//   atMe():     POST /c/u/feed/atme {pn}              — @我的
//   agreeMe():  POST /c/u/feed/agreeme {pn}           — 赞我的
//
// 全部需要登录 (FORCE_LOGIN: true)
// ============================================================

import { create } from 'zustand';
import { NotificationCount } from '@/types';
import { msg } from '@/services/api/endpoints';

export interface NotificationState {
  counts: NotificationCount;
  activeTab: 'reply' | 'at' | 'agree';

  loadNotificationCounts(): Promise<void>;
  setActiveTab(tab: 'reply' | 'at' | 'agree'): void;
}

const INITIAL_COUNTS: NotificationCount = { reply: 0, at: 0, agree: 0, total: 0 };

export const useNotificationStore = create<NotificationState>((set) => ({
  counts: { ...INITIAL_COUNTS },
  activeTab: 'reply',

  loadNotificationCounts: async () => {
    try {
      const counts = await msg();
      set({ counts });
    } catch (error) {
      console.error('[NotificationStore] Failed to load counts:', error);
    }
  },

  setActiveTab: (tab: 'reply' | 'at' | 'agree') => {
    set({ activeTab: tab });
  },
}));
