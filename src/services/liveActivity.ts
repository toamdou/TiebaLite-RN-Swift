// ============================================================
// TiebaLite Live Activity bridge (iOS only)
//
// Wraps the native TiebaLiveActivity ActivityKit module with a narrow,
// sign-specific API and throttles updates so the widget never over-uses
// the ActivityKit budget. All methods are safe no-ops off-iOS.
// ============================================================

import { Platform } from 'react-native';
import { kvRemove, kvSet } from '@/services/storage/unifiedDb';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { TiebaNative } from '../../modules/tieba-native/src/TiebaNative';

const STORAGE_KEY = 'tiebalite_sign_live_activity_id';
const ACTIVITY_NAME = 'TiebaLiteSign';
const TINT_COLOR = '#3B82F6';
const ESTIMATED_MS_PER_SIGN = 3800;
const UPDATE_THROTTLE_MS = 4000;

let lastUpdateAt = 0;

export type SignLiveActivityPhase = 'signing' | 'completed' | 'error' | 'cancelled';

export interface SignLiveActivitySnapshot {
  done: number;
  total: number;
  currentForumName?: string;
  success: number;
  fail: number;
  exp: number;
  phase: SignLiveActivityPhase;
}

export function isLiveActivityAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    if (!TiebaNative.isLiveActivitySupported()) return false;
    return TiebaNative.areLiveActivitiesEnabled();
  } catch {
    return false;
  }
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function buildState(snapshot: SignLiveActivitySnapshot): Record<string, unknown> {
  const ratio = snapshot.total > 0
    ? clampProgress(snapshot.done / snapshot.total)
    : 1;
  const remaining = Math.max(snapshot.total - snapshot.done, 0);
  const estimatedEnd = Date.now() + Math.min(
    Math.max(remaining * ESTIMATED_MS_PER_SIGN, 6000),
    30 * 60 * 1000,
  );
  const signing = snapshot.phase === 'signing';
  const completed = snapshot.phase === 'completed';

  const subtitle = signing
    ? snapshot.currentForumName
      ? `正在签到 ${snapshot.currentForumName}`
      : '正在准备签到'
    : completed
      ? `成功 ${snapshot.success} 个${snapshot.fail > 0 ? `，失败 ${snapshot.fail} 个` : ''}`
      : '签到进程已停止';

  const body = signing
    ? `已完成 ${snapshot.done}/${snapshot.total} · 成功 ${snapshot.success} · 失败 ${snapshot.fail}`
    : completed && snapshot.exp > 0
      ? `获得 ${snapshot.exp} 经验`
      : undefined;

  return {
    title: signing ? '一键签到' : completed ? '签到完成' : '签到已中断',
    subtitle,
    body,
    currentForum: snapshot.currentForumName ?? '',
    status: signing ? `${snapshot.done}/${snapshot.total}` : completed ? '完成' : '中断',
    progress: ratio,
    date: signing ? estimatedEnd : undefined,
    imageName: signing
      ? 'checkmark.circle.fill'
      : completed
        ? 'checkmark.seal.fill'
        : 'xmark.circle.fill',
    tintColorHex: TINT_COLOR,
    leading: signing ? '签到' : undefined,
    trailing: signing ? `${snapshot.done}/${snapshot.total}` : undefined,
    extra: signing
      ? {
          currentForum: snapshot.currentForumName ?? '',
          success: String(snapshot.success),
          fail: String(snapshot.fail),
          exp: String(snapshot.exp),
        }
      : undefined,
  };
}

async function clearStoredActivityId(): Promise<void> {
  try {
    await kvRemove(STORAGE_KEY);
  } catch {}
}

export async function startSignLiveActivity(
  snapshot: Omit<SignLiveActivitySnapshot, 'phase'>,
): Promise<string | null> {
  if (!isLiveActivityAvailable()) return null;
  if (!usePreferencesStore.getState().preferences.liveActivitySignEnabled) return null;
  try {
    const activityId = await TiebaNative.startLiveActivity({
      name: ACTIVITY_NAME,
      ...buildState({ ...snapshot, phase: 'signing' }),
    });
    if (!activityId) return null;
    try {
      await kvSet(STORAGE_KEY, activityId);
    } catch {}
    lastUpdateAt = Date.now();
    return activityId;
  } catch {
    return null;
  }
}

export async function updateSignLiveActivity(
  activityId: string | null,
  snapshot: Omit<SignLiveActivitySnapshot, 'phase'>,
  force = false,
): Promise<void> {
  if (!activityId || !isLiveActivityAvailable()) return;
  const now = Date.now();
  if (!force && now - lastUpdateAt < UPDATE_THROTTLE_MS) return;
  try {
    await TiebaNative.updateLiveActivity(
      activityId,
      buildState({ ...snapshot, phase: 'signing' }),
    );
    lastUpdateAt = now;
  } catch {}
}

export async function finishSignLiveActivity(
  activityId: string | null,
  snapshot: Pick<SignLiveActivitySnapshot, 'success' | 'fail' | 'exp' | 'phase'>,
): Promise<void> {
  if (!activityId) {
    await clearStoredActivityId();
    return;
  }
  try {
    await TiebaNative.endLiveActivity(
      activityId,
      buildState({
        done: snapshot.success + snapshot.fail,
        total: Math.max(snapshot.success + snapshot.fail, 1),
        success: snapshot.success,
        fail: snapshot.fail,
        exp: snapshot.exp,
        phase: snapshot.phase,
      }),
      'default',
    );
  } catch {}
  await clearStoredActivityId();
}

/** End any orphaned sign activity after a killed process or failed launch. */
export async function recoverStaleSignLiveActivities(): Promise<void> {
  if (isLiveActivityAvailable()) {
    try {
      await TiebaNative.endAllLiveActivities(
        buildState({
          done: 0,
          total: 1,
          success: 0,
          fail: 0,
          exp: 0,
          phase: 'cancelled',
        }),
        'immediate',
      );
    } catch {}
  }
  await clearStoredActivityId();
}
