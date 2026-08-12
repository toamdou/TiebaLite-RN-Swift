/**
 * Shared helpers for forum user teams/members and grouped list rows.
 */

export interface FlattenedForumUser {
  userId: string;
  userName: string;
  nameShow: string;
  portrait: string;
  userLevel: number;
  levelName: string;
  roleName?: string;
}

export function parseForumUser(raw: any, fallbackRole = ''): FlattenedForumUser {
  return {
    userId: String(raw?.user_id ?? raw?.userId ?? ''),
    userName: String(raw?.user_name ?? raw?.userName ?? ''),
    nameShow: String(raw?.name_show ?? raw?.nameShow ?? ''),
    portrait: String(raw?.portrait ?? ''),
    userLevel: Number(raw?.user_level ?? raw?.userLevel ?? 0),
    levelName: String(raw?.level_name ?? raw?.levelName ?? ''),
    roleName: String(raw?.role_name ?? raw?.roleName ?? fallbackRole),
  };
}

export type GroupedRow<T> =
  | { kind: 'header'; key: string; title: string; count: number }
  | { kind: 'item'; key: string; item: T }
  | { kind: 'grid'; key: string; items: T[] };

export interface GroupedList<T> {
  title: string;
  count?: number;
  items: T[];
}

/** Flatten grouped lists into header + item/grid rows for FlashList. */
export function flattenGroupRows<T>(
  groups: GroupedList<T>[],
  itemKey: (item: T, index: number) => string,
  chunkSize = 1,
  groupPrefix = 'g',
): GroupedRow<T>[] {
  const out: GroupedRow<T>[] = [];
  groups.forEach((group, gi) => {
    out.push({
      kind: 'header',
      key: `h-${groupPrefix}-${gi}`,
      title: group.title,
      count: group.count ?? group.items.length,
    });
    if (chunkSize > 1) {
      for (let i = 0; i < group.items.length; i += chunkSize) {
        out.push({
          kind: 'grid',
          key: `r-${groupPrefix}-${gi}-${i}`,
          items: group.items.slice(i, i + chunkSize),
        });
      }
    } else {
      group.items.forEach((item, index) => {
        out.push({
          kind: 'item',
          key: `i-${groupPrefix}-${gi}-${itemKey(item, index)}`,
          item,
        });
      });
    }
  });
  return out;
}
