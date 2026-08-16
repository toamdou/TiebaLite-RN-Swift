/**
 * React Query options for the highest-value list/detail endpoints.
 */

import {
  topicList,
  hotThreadList,
  personalized,
  searchThread,
  pbPage,
} from './endpoints';
import { protoFrsPage } from './protoClient';
import { LoadType } from '@/types';

export const queryKeys = {
  topics: ['topics'] as const,
  hot: (tabCode: string) => ['hot', tabCode] as const,
  feed: (segment: 'personalized' | 'concern', page: number) => ['feed', segment, page] as const,
  forum: (name: string) => ['forum', name] as const,
  thread: (id: string) => ['thread', id] as const,
  search: (keyword: string, page: number) => ['search', keyword, page] as const,
};

export const topicListOptions = {
  queryKey: queryKeys.topics,
  queryFn: topicList,
  staleTime: 60_000,
  gcTime: 120_000,
};

export const hotThreadOptions = (tabCode: string) => ({
  queryKey: queryKeys.hot(tabCode),
  queryFn: () => hotThreadList(tabCode),
  staleTime: 30_000,
});

export const feedOptions = (segment: 'personalized' | 'concern', page: number) => ({
  queryKey: queryKeys.feed(segment, page),
  queryFn: () =>
    personalized(page === 1 ? LoadType.REFRESH : LoadType.LOAD_MORE, page),
  staleTime: 30_000,
});

export const forumOptions = (name: string) => ({
  queryKey: queryKeys.forum(name),
  queryFn: () => protoFrsPage({ kw: name, pn: 1, sortType: 5 }),
  staleTime: 30_000,
});

export const threadOptions = (id: string) => ({
  queryKey: queryKeys.thread(id),
  queryFn: () => pbPage(id, 1),
  staleTime: 30_000,
});

export const searchOptions = (keyword: string, page: number) => ({
  queryKey: queryKeys.search(keyword, page),
  queryFn: () => searchThread(keyword, page),
  staleTime: 30_000,
});
