/**
 * Shared types for the sign view model and background sign service.
 */

export type SignStatus = 'idle' | 'loading' | 'signing' | 'completed' | 'error';

export interface SignProgressItem {
  forumId: string;
  forumName: string;
  status: 'pending' | 'signing' | 'success' | 'failed';
  exp?: number;
  signRank?: number;
  errorMsg?: string;
}

export interface SignBatchProgress {
  totalCount: number;
  successCount: number;
  failCount: number;
  currentIndex: number;
  totalExp: number;
  progressList: SignProgressItem[];
  currentForumName?: string;
}

export interface RunSignBatchOptions {
  tbs: string;
  isBackground: boolean;
  deadline?: number;
  shouldCancel?: () => boolean;
  onProgress?: (snapshot: SignBatchProgress) => void | Promise<void>;
  progressNotif?: {
    start(total: number): Promise<string | null>;
    update(notifId: string | null, done: number, total: number): Promise<void>;
  };
  liveActivity?: {
    start(total: number): Promise<string | null>;
    update(activityId: string | null, snapshot: SignBatchProgress): Promise<void>;
  };
}

export interface RunSignBatchResult {
  successCount: number;
  failCount: number;
  totalExp: number;
  progressList: SignProgressItem[];
  totalCount: number;
  cancelled: boolean;
  allAlreadySigned: boolean;
  liveActivityId: string | null;
  progressNotifId: string | null;
}

/** Official mSign batch is preferred unless the user explicitly disables it. */
export const DEFAULT_USE_OFFICIAL_SIGN = true;
