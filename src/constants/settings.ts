/**
 * Shared settings-page option lists.
 */

export const DEFAULT_SORT_OPTIONS = [
  { label: '按回复时间', value: '0' },
  { label: '按发贴时间', value: '1' },
];

export const FORUM_FAB_OPTIONS = [
  { label: '刷新', value: 'refresh' },
  { label: '回到顶部', value: 'back_to_top' },
  { label: '隐藏', value: 'hide' },
];

export const IMAGE_LOAD_TYPE_LABELS: Record<string, string> = {
  smart_load: '智能加载',
  original: '全部原图',
  wifi_only: '仅WiFi加载',
};

export const IMAGE_WATERMARK_LABELS: Record<string, string> = {
  none: '不添加',
  username: '用户名',
  forum_name: '吧名',
};

export const DEFAULT_START_TAB_LABELS: Record<string, string> = {
  home: '关注',
  explore: '动态',
  notifications: '消息',
  profile: '我的',
};
