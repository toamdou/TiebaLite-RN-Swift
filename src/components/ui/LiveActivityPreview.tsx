import { StyleSheet, Text, View } from 'react-native';
import type { SignStatus } from '@/stores/signStore';

interface LiveActivityPreviewProps {
  active: boolean;
  enabled?: boolean;
  done: number;
  total: number;
  currentForumName?: string;
  success: number;
  fail: number;
  exp: number;
  status: SignStatus;
}

function formatCountdown(remaining: number): string {
  const seconds = Math.max(Math.ceil(remaining * 3.2), 8);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LiveActivityPreview({
  active,
  enabled = true,
  done,
  total,
  currentForumName,
  success,
  fail,
  exp,
  status,
}: LiveActivityPreviewProps) {
  const previewTotal = total > 0 ? total : 12;
  const previewDone = total > 0 ? Math.min(done, total) : 6;
  const progress = previewTotal > 0 ? previewDone / previewTotal : 0;
  const title = status === 'completed' ? '签到完成' : status === 'error' ? '签到已中断' : '一键签到';
  const subtitle =
    status === 'completed'
      ? `成功 ${success} 个${fail > 0 ? `，失败 ${fail} 个` : ''}`
      : status === 'error'
        ? '签到进程已停止'
        : currentForumName
          ? `正在签到 ${currentForumName}`
          : '正在准备签到';
  const meta =
    status === 'completed'
      ? exp > 0
        ? `获得 ${exp} 经验`
        : '今日签到已完成'
      : status === 'error'
        ? '稍后可在设置中重试'
        : `已完成 ${previewDone}/${previewTotal} · 成功 ${success} · 失败 ${fail}`;
  // 系统组件仿真（Live Activity / 灵动岛）：iOS 的灵动岛锁定屏本身是固定
  // 纯黑 + 系统语义色，不跟随 App 主题，故此处硬编码色系保留（设计契约）。
  const accent = status === 'error' ? '#FF6B5E' : status === 'completed' ? '#30D158' : '#60A5FA';
  const pill = active || status === 'completed' || status === 'error'
    ? `${previewDone}/${previewTotal}`
    : '6/12';

  return (
    <View style={[styles.container, !enabled && styles.containerDisabled]}>
      {!enabled && (
        <View style={styles.disabledNotice}>
          <Text style={styles.disabledNoticeText}>灵动岛已关闭</Text>
        </View>
      )}
      <View style={styles.lockCard}>
        <View style={styles.lockRow}>
          <View style={[styles.iconBadge, { borderColor: accent, backgroundColor: `${accent}22` }]}>
            <Text style={[styles.iconText, { color: accent }]}>✓</Text>
          </View>
          <View style={styles.lockText}>
            <Text style={styles.lockTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.lockSubtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: `${accent}22` }]}>
            <Text style={[styles.pillText, { color: accent }]}>{pill}</Text>
          </View>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
        </View>
        <View style={styles.lockFooter}>
          <Text style={styles.lockMeta} numberOfLines={1}>{meta}</Text>
          {active && (
            <Text style={[styles.lockCountdown, { color: accent }]}>
              预计 {formatCountdown(previewTotal - previewDone)}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.islandColumn}>
        <View style={styles.islandCompact}>
          <View style={[styles.islandCompactIcon, { borderColor: accent }]}>
            <Text style={[styles.islandCompactIconText, { color: accent }]}>✓</Text>
          </View>
          <View style={styles.islandCompactText}>
            <Text style={styles.islandCompactTitle}>签到</Text>
            <Text style={[styles.islandCompactMeta, { color: accent }]}>{pill}</Text>
          </View>
          <View style={[styles.islandRing, { borderColor: `${accent}44` }]}>
            <View
              style={[
                styles.islandRingFill,
                {
                  borderTopColor: accent,
                  borderRightColor: accent,
                  transform: [{ rotate: `${progress * 360}deg` }],
                },
              ]}
            />
          </View>
        </View>

        <View style={styles.islandExpanded}>
          <View style={styles.expandedTop}>
            <Text style={styles.expandedTitle} numberOfLines={1}>{title}</Text>
            <Text style={[styles.expandedStatus, { color: accent }]}>{pill}</Text>
          </View>
          <Text style={styles.expandedSubtitle} numberOfLines={1}>{subtitle}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  containerDisabled: {
    opacity: 0.45,
  },
  disabledNotice: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  disabledNoticeText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '600',
  },
  lockCard: {
    backgroundColor: '#101623',
    borderRadius: 22,
    padding: 16,
    gap: 12,
  },
  lockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 17,
    fontWeight: '700',
  },
  lockText: {
    flex: 1,
    gap: 2,
  },
  lockTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  lockSubtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  lockFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  lockMeta: {
    flex: 1,
    color: 'rgba(255,255,255,0.52)',
    fontSize: 11,
  },
  lockCountdown: {
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  islandColumn: {
    gap: 8,
  },
  islandCompact: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderColor: '#2B2B2E',
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    minWidth: 132,
  },
  islandCompactIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandCompactIconText: {
    fontSize: 11,
    fontWeight: '700',
  },
  islandCompactText: {
    flex: 1,
  },
  islandCompactTitle: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  islandCompactMeta: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  islandRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  islandRingFill: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },
  islandExpanded: {
    backgroundColor: '#000000',
    borderColor: '#2B2B2E',
    borderWidth: 1,
    borderRadius: 34,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 6,
  },
  expandedTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  expandedTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  expandedStatus: {
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  expandedSubtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 11,
  },
});
