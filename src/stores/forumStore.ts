// ============================================================
// forumStore — 对齐 Kotlin ForumPage + ForumViewModel
//
// API:
//   POST c.tieba.baidu.com/c/f/frs/page  (form-encoded)
//     → 返回 forum info + thread_list + user_list + page + anti + nav_tab_info
//   POST c.tieba.baidu.com/c/c/forum/like  (follow, 需登录 + tbs)
//   POST c.tieba.baidu.com/c/c/forum/unfavolike  (unfollow, 需登录 + tbs + stoken)
//
// Tab 系统:
//   Tab 0/1 — 热门/最新 (isGood=false)
//   Tab 2 — 精品 (isGood=true, goodClassifyId from dropdown)
//   Tab N — 自定义Tab (navTabInfo, TODO: protobuf)
//
// Author mapping: 对齐 Kotlin FrsPageRepository
//   thread_list 每项只有 authorId，从 user_list 按 id 映射 author 信息
// ============================================================

import { create } from 'zustand';
import type { ForumInfo, ForumDetail, ThreadInfo } from '@/types';
import { ForumSortType } from '@/types';
import { protoFrsPage } from '@/services/api/protoClient';
import { assertProtoSuccess, likeForum, unfavolike, mapProtoThread } from '@/services/api/endpoints';
import { getTbsSync, setTbsSync } from '@/services/storage/AuthSQLiteStorage';
import { useAuthStore } from '@/stores/authStore';
import { fetchAllFollowedForums } from '@/services/forumFollowed';
import { syncBackgroundSnapshot } from '@/services/nativeBackground';

/** Keep a hard cap on retained rows so long paging can't grow memory forever. */
const MAX_THREADS_PER_LIST = 200;

function appendBounded<T>(current: T[], next: T[], max: number): T[] {
  return [...current, ...next].slice(-max);
}

let forumLoadSeq = 0;

/** Good classify item (Kotlin ForumPageBean.GoodClassifyBean) */
export interface GoodClassifyItem {
  classId: string;
  className: string;
}

export interface ForumState {
  // ── Followed forums ──
  followedForums: ForumInfo[];
  isLoadingForums: boolean;

  // ── Current forum ──
  currentForum: ForumDetail | null;
  forumSortType: ForumSortType;

  // ── Tab system (对齐 Kotlin HorizontalPager) ──
  /** 0=热门, 1=最新, 2=精品, 3+=navTabInfo tabs */
  currentTab: number;
  goodClassifyId: string | null;
  goodClassify: GoodClassifyItem[];
  /** navTabInfo for general tabs (from API — may be null for JSON API) */
  navTabInfo: any | null;

  // ── Per-tab thread lists ──
  latestThreads: ThreadInfo[];
  goodThreads: ThreadInfo[];
  /** 最新 tab（SEND_TIME 排序）独立缓存桶：与热门（REPLY_TIME）互不冲刷。 */
  newestThreads: ThreadInfo[];
  latestPage: number;
  goodPage: number;
  newestPage: number;
  latestHasMore: boolean;
  goodHasMore: boolean;
  newestHasMore: boolean;

  // ── Actions ──
  loadFollowedForums(): Promise<void>;
  loadForumData(forumName: string, page: number, sortType: ForumSortType, isGood?: boolean): Promise<void>;
  refreshForumData(forumName: string): Promise<void>;
  setForumSortType(sortType: ForumSortType): void;
  setCurrentTab(tab: number): void;
  setGoodClassifyId(id: string | null): void;
  followForum(forumId: string, forumName: string): Promise<void>;
  unfollowForum(forumId: string, forumName: string): Promise<void>;
  markForumSigned(forumId: string, exp: number): void;
}

/** Helper: get tbs from currentForum or auth storage */
function getForumTbs(currentForum: ForumDetail | null): string {
  return currentForum?.tbs || getTbsSync() || '';
}

export const useForumStore = create<ForumState>((set, get) => ({
  followedForums: [],
  isLoadingForums: false,
  currentForum: null,
  forumSortType: ForumSortType.REPLY_TIME,

  // ── Tab state ──
  currentTab: 0,
  goodClassifyId: null,
  goodClassify: [],
  navTabInfo: null,

  // ── Per-tab data ──
  latestThreads: [],
  goodThreads: [],
  newestThreads: [],
  latestPage: 1,
  goodPage: 1,
  newestPage: 1,
  latestHasMore: true,
  goodHasMore: true,
  newestHasMore: true,

  // ── loadFollowedForums ──
  loadFollowedForums: async () => {
    set({ isLoadingForums: true });
    try {
      const list = await fetchAllFollowedForums();
      set({ followedForums: list, isLoadingForums: false });
    } catch (error) {
      set({ isLoadingForums: false });
      // 不吞错误：首页靠 catch 设置 forumsError 并展示重试入口，
      // 否则网络失败会显示"暂无关注的贴吧"空态。
      console.error('[ForumStore] Failed to load followed forums:', error);
      throw error;
    }
  },

  // ── loadForumData — 对齐 Kotlin FrsPageRepository.frsPage() ──
  // POST /c/f/frs/page?cmd=301001 (protobuf)
  // 返回 forum + thread_list + user_list + page + anti + nav_tab_info
  loadForumData: async (forumName: string, page: number, sortType: ForumSortType, isGood?: boolean) => {
    const seq = ++forumLoadSeq;
    // 对齐 Kotlin v12 frsPage 语义（MixedTiebaApiImpl.frsPage + ForumThreadListViewModel）：
    // - 热门(0)/精品(2)：sort_type = -1 —— 让服务端按该吧默认列表返回。此前硬编码
    //   5(按回复) 会被服务端当成"热门推荐"流，返回混合其他吧的贴子（串吧 bug）。
    // - 最新(1)：sort_type = 用户选择的 5(按回复) / 7(按发帖)。
    // - load_type：首载 1 / 翻页 2（Kotlin LoadMore 语义），不能恒为 0。
    const { goodClassifyId, currentTab } = get();
    // 热门(0)/精品(2) 走 -1（吧内默认列表）；仅"最新"(1) 用用户选择的排序，且 v12
    // frsPage 的 sort_type 是 0(按回复)/1(按发帖)（对齐 Kotlin default_sort_type 偏好
    // 与 getSortType），不是旧 JSON 接口的 5/7。
    const isDefaultList = currentTab === 0 || currentTab === 2 || isGood;
    const sortTypeNum = isDefaultList ? -1 : (sortType === ForumSortType.SEND_TIME ? 1 : 0);
    const loadType = page === 1 ? 1 : 2;

    // Add good classify if selected
    const cidNum = (isGood && goodClassifyId) ? parseInt(goodClassifyId, 10) : undefined;

    try {
      const decoded = await protoFrsPage({
        kw: forumName,
        pn: page,
        sortType: sortTypeNum,
        isGood: !!isGood,
        goodClassifyId: cidNum,
        loadType,
      });
      if (seq !== forumLoadSeq) return;

      try {
        assertProtoSuccess(decoded);
      } catch (error: any) {
        if (seq !== forumLoadSeq) return;
        console.error('[ForumStore] frsPage protobuf error:', error?.errorCode ?? error?.code, error?.message);
        if (page === 1) {
          if (isGood) set({ goodThreads: [] });
          else set(sortType === ForumSortType.SEND_TIME ? { newestThreads: [] } : { latestThreads: [] });
          // 首屏业务错误（吧不存在/权限等）向上抛出，页面才能进 ErrorState；
          // 旧实现吞错会让 UI 显示"暂无帖子"空态而非重试入口。
          throw error;
        }
        return;
      }

      const data = decoded.data;
      if (!data) return;

      const forumData = data.forum;
      const rawThreadList = data.threadList ?? [];
      const userList: any[] = data.userList ?? [];
      const pageData = data.page;

      // ── Parse forum detail (Kotlin ForumPageBean.ForumBean) ──
      if (forumData && page === 1) {
        const signInUser = forumData.signInInfo?.userInfo ?? forumData.sign_in_info?.user_info;
        const detail: ForumDetail = {
          forumId: String(forumData.id ?? ''),
          forumName: forumData.name ?? forumName,
          avatar: forumData.avatar ?? '',
          memberCount: parseInt(String(forumData.memberNum ?? forumData.member_num ?? '0'), 10),
          threadCount: parseInt(String(forumData.threadNum ?? forumData.thread_num ?? '0'), 10),
          intro: forumData.slogan ?? forumData.intro ?? '',
          isLike: forumData.isLike === 1 || forumData.is_like === 1 || forumData.is_like === '1',
          levelId: parseInt(String(forumData.userLevel ?? forumData.levelId ?? forumData.level_id ?? '0'), 10) || undefined,
          levelName: forumData.levelName ?? forumData.level_name,
          curScore: parseFloat(String(forumData.curScore ?? forumData.cur_score ?? '0')),
          levelupScore: parseFloat(String(forumData.levelupScore ?? forumData.levelup_score ?? '1')),
          tbs: data.anti?.tbs ?? forumData.tbs ?? '',
          signInInfo: signInUser ? {
            isSignIn: (signInUser.isSignIn ?? signInUser.is_sign_in) === 1,
            contSignNum: parseInt(String(signInUser.contSignNum ?? signInUser.cont_sign_num ?? '0'), 10),
            userSignRank: parseInt(String(signInUser.userSignRank ?? signInUser.user_sign_rank ?? '0'), 10),
            signBonusPoint: parseInt(String(signInUser.signBonusPoint ?? signInUser.sign_bonus_point ?? '0'), 10),
          } : undefined,
        };

        // anti.tbs 到达时持久化到当前账号，并同步更新 authStore 账号对象。
        if (detail.tbs) {
          const authAccount = useAuthStore.getState().account;
          const targetUid = authAccount?.uid || '';
          setTbsSync(detail.tbs, targetUid || undefined);
          syncBackgroundSnapshot();
          if (authAccount) {
            useAuthStore.setState({
              account: { ...authAccount, tbs: detail.tbs },
            });
          }
        }

        // Parse good classify (Kotlin ForumBean.goodClassify)
        const classifyList: GoodClassifyItem[] = (forumData.goodClassify ?? forumData.good_classify ?? []).map((c: any) => ({
          classId: String(c.classId ?? c.class_id ?? c.id ?? ''),
          className: c.className ?? c.class_name ?? c.name ?? '',
        }));

        set({
          currentForum: detail,
          goodClassify: classifyList,
          navTabInfo: data.navTabInfo ?? null,
        });
      }

      // ── Parse threads with author mapping (Kotlin FrsPageRepository) ──
      const threads: ThreadInfo[] = rawThreadList.map((item: any) =>
        mapProtoThread(item, { userList, forum: forumData, forumName }),
      );

      // Pagination (Kotlin ForumPageBean.PageBean)
      const hasMore = pageData
        ? (pageData.hasMore === 1)
        : (threads.length >= 20);

      // ── Store in per-tab state ──
      const useNewestBucket = !isGood && sortType === ForumSortType.SEND_TIME;
      if (page === 1) {
        if (isGood) {
          set({ goodThreads: threads, goodPage: page, goodHasMore: hasMore });
        } else if (useNewestBucket) {
          set({ newestThreads: threads, newestPage: page, newestHasMore: hasMore });
        } else {
          set({ latestThreads: threads, latestPage: page, latestHasMore: hasMore });
        }
      } else {
        if (isGood) {
          set((s) => ({
            goodThreads: appendBounded(s.goodThreads, threads, MAX_THREADS_PER_LIST),
            goodPage: page,
            goodHasMore: hasMore,
          }));
        } else if (useNewestBucket) {
          set((s) => ({
            newestThreads: appendBounded(s.newestThreads, threads, MAX_THREADS_PER_LIST),
            newestPage: page,
            newestHasMore: hasMore,
          }));
        } else {
          set((s) => ({
            latestThreads: appendBounded(s.latestThreads, threads, MAX_THREADS_PER_LIST),
            latestPage: page,
            latestHasMore: hasMore,
          }));
        }
      }
    } catch (error) {
      if (seq !== forumLoadSeq) return;
      console.error('[ForumStore] frsPage failed:', error);
      if (page === 1) {
        if (isGood) set({ goodThreads: [] });
        else if (sortType === ForumSortType.SEND_TIME) set({ newestThreads: [] });
        else set({ latestThreads: [] });
        // 网络错误同样向上抛出（首屏），让页面显示错误 + 重试。
        throw error;
      }
    }
  },

  refreshForumData: async (forumName: string) => {
    const { forumSortType, currentTab } = get();
    const isGood = currentTab === 2;
    await get().loadForumData(forumName, 1, forumSortType, isGood);
  },

  setForumSortType: (sortType: ForumSortType) => {
    set({ forumSortType: sortType, latestThreads: [], latestPage: 1, goodThreads: [], goodPage: 1, newestThreads: [], newestPage: 1 });
  },

  // ── Tab switching ──
  setCurrentTab: (tab: number) => {
    set({ currentTab: tab });
  },

  setGoodClassifyId: (id: string | null) => {
    set({ goodClassifyId: id, goodThreads: [], goodPage: 1 });
  },

  // ── followForum — 对齐 Kotlin likeForum，必须传 tbs ──
  followForum: async (forumId: string, forumName: string) => {
    const tbs = getForumTbs(get().currentForum);
    if (!tbs) {
      throw new Error('缺少 tbs，无法关注贴吧');
    }
    try {
      await likeForum(forumId, forumName, tbs);
      set((state) => ({
        followedForums: state.followedForums.map((f) =>
          f.forumId === forumId ? { ...f, isLike: true } : f,
        ),
        currentForum:
          state.currentForum?.forumId === forumId
            ? { ...state.currentForum, isLike: true }
            : state.currentForum,
      }));
    } catch (error) {
      console.error('[ForumStore] follow failed:', error);
      throw error;
    }
  },

  // ── unfollowForum — 对齐 Kotlin unlikeForum，必须传 tbs ──
  unfollowForum: async (forumId: string, forumName: string) => {
    const tbs = getForumTbs(get().currentForum);
    if (!tbs) {
      throw new Error('缺少 tbs，无法取消关注');
    }
    try {
      await unfavolike(forumId, forumName, tbs);
      set((state) => ({
        followedForums: state.followedForums.map((f) =>
          f.forumId === forumId ? { ...f, isLike: false } : f,
        ),
        currentForum:
          state.currentForum?.forumId === forumId
            ? { ...state.currentForum, isLike: false }
            : state.currentForum,
      }));
    } catch (error) {
      console.error('[ForumStore] unfollow failed:', error);
      throw error;
    }
  },

  markForumSigned: (forumId: string, exp: number) => {
    set((state) => ({
      followedForums: state.followedForums.map((f) =>
        f.forumId === forumId ? { ...f, isSign: true } : f,
      ),
      currentForum:
        state.currentForum?.forumId === forumId
          ? {
              ...state.currentForum,
              signInInfo: {
                isSignIn: true,
                contSignNum: (state.currentForum.signInInfo?.contSignNum ?? 0) + 1,
                userSignRank: state.currentForum.signInInfo?.userSignRank ?? 0,
                signBonusPoint: (state.currentForum.signInInfo?.signBonusPoint ?? 0) + exp,
              },
            }
          : state.currentForum,
    }));
  },
}));
