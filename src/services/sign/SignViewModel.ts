/**
 * SignViewModel - Zustand state and actions for the foreground one-click
 * sign flow. The store facade in src/stores/signStore.ts re-exports this.
 */

import * as Notifications from 'expo-notifications';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { hapticNotify, NotificationFeedbackType } from '@/utils/haptics';
import { hapticForScene } from '@/theme/hapticsMap';
import { useAuthStore } from '@/stores/authStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { ensureNotificationPermissionAsync } from '@/services/NotificationPoller';
import { setTbsSync } from '@/services/storage/AuthSQLiteStorage';
import { syncBackgroundSnapshot } from '@/services/nativeBackground';
import {
  finishSignLiveActivity,
  startSignLiveActivity,
  updateSignLiveActivity,
} from '@/services/liveActivity';
import { runSignBatch } from '@/services/sign/runSignBatch';
import {
  cancelAutoSign as cancelAutoSignTask,
  checkAutoSignScheduled as checkAutoSignScheduledTask,
  scheduleAutoSign as scheduleAutoSignTask,
  sendSignCompleteNotification,
} from '@/services/sign/BackgroundSignService';
import type { SignProgressItem, SignStatus } from '@/services/sign/signTypes';

export interface SignState {
  isSigning: boolean;
  status: SignStatus;
  totalCount: number;
  successCount: number;
  failCount: number;
  currentIndex: number;
  totalExp: number;
  progressList: SignProgressItem[];
  error: string | null;
  isSheetVisible: boolean;
  isCancelled: boolean;
  _notifId: string | null;
  _liveActivityId: string | null;

  startSign(): Promise<void>;
  cancelSign(): void;
  setSheetVisible(visible: boolean): void;
  reset(): void;
  scheduleAutoSign(time: string): Promise<void>;
  cancelAutoSign(): Promise<void>;
  checkAutoSignScheduled(): Promise<boolean>;
}

export function createSignViewModel(): UseBoundStore<StoreApi<SignState>> {
  return create<SignState>((set, get) => {
    async function finishSign(
      cancelled: boolean,
      liveActivityId: string | null,
      progressNotifId: string | null,
    ): Promise<void> {
      const state = get();

      if (liveActivityId) {
        await finishSignLiveActivity(liveActivityId, {
          success: state.successCount,
          fail: state.failCount,
          exp: state.totalExp,
          phase: cancelled ? 'cancelled' : 'completed',
        });
      }

      if (progressNotifId) {
        try {
          await Notifications.dismissNotificationAsync(progressNotifId);
        } catch {}
      }

      set({
        status: 'completed',
        isSigning: false,
        _liveActivityId: null,
        _notifId: null,
      });

      if (state.failCount === 0 && state.successCount > 0) {
        await hapticForScene('action-success');
      } else if (state.successCount > 0) {
        await hapticNotify(NotificationFeedbackType.Warning);
      } else {
        await hapticForScene('action-fail');
      }

      if (state.successCount > 0 || state.failCount > 0) {
        await sendSignCompleteNotification(
          state.successCount,
          state.failCount,
          state.totalExp,
        );
      }

      try {
        const { useForumStore } = await import('@/stores/forumStore');
        const forumStore = useForumStore.getState();
        const progressList = state.progressList;

        const updatedForums = forumStore.followedForums.map((forum) => {
          const progress = progressList.find((p) => p.forumId === forum.forumId);
          if (progress && progress.status === 'success') {
            return { ...forum, isSign: true };
          }
          return forum;
        });

        useForumStore.setState({ followedForums: updatedForums });

        for (const progress of progressList) {
          if (progress.status === 'success') {
            forumStore.markForumSigned(progress.forumId, progress.exp ?? 0);
          }
        }
      } catch {
        // Forum store may not be loaded - that's fine
      }
    }

    return {
      isSigning: false,
      status: 'idle',
      totalCount: 0,
      successCount: 0,
      failCount: 0,
      currentIndex: 0,
      totalExp: 0,
      progressList: [],
      error: null,
      isSheetVisible: false,
      isCancelled: false,
      _notifId: null,
      _liveActivityId: null,

      startSign: async () => {
        if (get().isSigning) return;

        set({
          isSigning: true,
          status: 'loading',
          isSheetVisible: false,
          isCancelled: false,
          successCount: 0,
          failCount: 0,
          currentIndex: 0,
          totalExp: 0,
          progressList: [],
          error: null,
          _liveActivityId: null,
          _notifId: null,
        });

        try {
          const account = useAuthStore.getState().account;
          if (!account || !account.tbs) {
            set({
              status: 'error',
              error: '未登录或登录信息已过期，请重新登录',
              isSigning: false,
            });
            return;
          }

          const tbs = account.tbs;
          setTbsSync(tbs, account.uid);
          syncBackgroundSnapshot();

          // 显示位置二选一（设置项）：灵动岛 Live Activity / 通知栏横幅。
          const prefs = usePreferencesStore.getState().preferences;
          const useIsland = prefs.signDisplayMode !== 'notification' && prefs.liveActivitySignEnabled;
          const useBanner = prefs.signDisplayMode === 'notification';
          const silent = prefs.signSilent ?? false;

          const result = await runSignBatch({
            tbs,
            isBackground: false,
            shouldCancel: () => get().isCancelled,
            onProgress: async (snapshot) => {
              set({
                status: 'signing',
                totalCount: snapshot.totalCount,
                successCount: snapshot.successCount,
                failCount: snapshot.failCount,
                currentIndex: snapshot.currentIndex,
                totalExp: snapshot.totalExp,
                progressList: snapshot.progressList,
              });
            },
            progressNotif: useBanner
              ? {
                  start: async (total) => {
                    const notifId = `sign-progress-${Date.now()}`;
                    if (await ensureNotificationPermissionAsync(false)) {
                      try {
                        await Notifications.scheduleNotificationAsync({
                          identifier: notifId,
                          content: {
                            title: '正在签到',
                            body: `0 / ${total} 个吧`,
                            sound: undefined,
                            badge: 0,
                            interruptionLevel: silent ? 'passive' : 'active',
                            data: { type: 'sign_progress' },
                          },
                          trigger: null,
                        });
                        set({ _notifId: notifId });
                        return notifId;
                      } catch {}
                    }
                    return null;
                  },
                  update: async (notifId, done, total) => {
                    if (!notifId) return;
                    if (!(await ensureNotificationPermissionAsync(false))) return;
                    try {
                      await Notifications.dismissNotificationAsync(notifId);
                      await Notifications.scheduleNotificationAsync({
                        identifier: notifId,
                        content: {
                          title: '正在签到',
                          body: `${done} / ${total} 个吧`,
                          sound: undefined,
                          badge: 0,
                          interruptionLevel: silent ? 'passive' : 'active',
                          data: { type: 'sign_progress' },
                        },
                        trigger: null,
                      });
                    } catch {}
                  },
                }
              : undefined,
            liveActivity: useIsland
              ? {
                  start: async (total) => {
                    const id = await startSignLiveActivity({
                      done: 0,
                      total,
                      currentForumName: '',
                      success: 0,
                      fail: 0,
                      exp: 0,
                    });
                    set({ _liveActivityId: id });
                    return id;
                  },
                  update: async (id, snapshot) => {
                    await updateSignLiveActivity(
                      id,
                      {
                        done: snapshot.successCount + snapshot.failCount,
                        total: snapshot.totalCount,
                        currentForumName: snapshot.currentForumName,
                        success: snapshot.successCount,
                        fail: snapshot.failCount,
                        exp: snapshot.totalExp,
                      },
                      false,
                    );
                  },
                }
              : undefined,
          });

          if (result.allAlreadySigned) {
            if (await ensureNotificationPermissionAsync(false)) {
              await Notifications.scheduleNotificationAsync({
                content: {
                  title: '一键签到',
                  body: '今天所有吧都已签到过了',
                  sound: usePreferencesStore.getState().preferences.signSilent ? undefined : 'default',
                  interruptionLevel: usePreferencesStore.getState().preferences.signSilent ? 'passive' : 'active',
                },
                trigger: null,
              });
            }
            await Notifications.setBadgeCountAsync(0);
            await hapticForScene('action-success');
            set({
              status: 'completed',
              isSigning: false,
              totalCount: 0,
              successCount: 0,
              failCount: 0,
              _liveActivityId: null,
              _notifId: null,
            });
            return;
          }

          await finishSign(result.cancelled, result.liveActivityId, result.progressNotifId);
        } catch (e: any) {
          const liveActivityId = get()._liveActivityId;
          if (liveActivityId) {
            await finishSignLiveActivity(liveActivityId, {
              success: get().successCount,
              fail: get().failCount,
              exp: get().totalExp,
              phase: 'error',
            });
          }
          const notifId = get()._notifId;
          if (notifId) {
            try {
              await Notifications.dismissNotificationAsync(notifId);
            } catch {}
          }
          set({
            status: 'error',
            error: e?.message ?? '签到过程中出现未知错误',
            isSigning: false,
            _liveActivityId: null,
            _notifId: null,
          });
        }
      },

      cancelSign: () => {
        set({ isCancelled: true });
      },

      setSheetVisible: (visible: boolean) => {
        set({ isSheetVisible: visible });
      },

      reset: () => {
        set({
          isSigning: false,
          status: 'idle',
          totalCount: 0,
          successCount: 0,
          failCount: 0,
          currentIndex: 0,
          totalExp: 0,
          progressList: [],
          error: null,
          isSheetVisible: false,
          isCancelled: false,
          _notifId: null,
          _liveActivityId: null,
        });
      },

      scheduleAutoSign: async (time: string) => {
        await scheduleAutoSignTask(time);
      },

      cancelAutoSign: async () => {
        await cancelAutoSignTask();
      },

      checkAutoSignScheduled: async () => {
        return checkAutoSignScheduledTask();
      },
    };
  });
}
