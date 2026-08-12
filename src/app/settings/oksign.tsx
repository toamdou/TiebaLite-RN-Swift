/**
 * OKSign Settings Page (一键签到设置)
 *
 * Mirrors Kotlin TiebaLite OKSignSettingsPage:
 * - One-click sign button with progress display
 * - Auto sign scheduling (daily)
 * - Slow mode / fail-auto-stop / official batch sign toggles
 *
 * Preferences are read/written directly through usePreferencesStore so the
 * page never holds local copies of auto-sign settings.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import {
  Button,
  DatePicker,
  Form,
  HStack,
  ProgressView,
  RNHostView,
  Section,
  Spacer,
  Text,
  Toggle,
} from '@expo/ui/swift-ui';
import {
  buttonStyle,
  controlSize,
  disabled,
  font,
  foregroundStyle,
  progressViewStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Stack } from 'expo-router';
import { hapticImpact, ImpactFeedbackStyle } from '@/utils/haptics';
import { useSignStore } from '@/stores/signStore';
import { useAuthStore } from '@/stores/authStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useThemeColors } from '@/theme/ThemeContext';
import type { SignProgressItem } from '@/stores/signStore';
import { LiveActivityPreview } from '@/components/ui/LiveActivityPreview';
import { recoverStaleSignLiveActivities } from '@/services/liveActivity';
import { ThemedHost } from '@/components/ui/ThemedHost';

function parseTimeToDate(time: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(
    Number.isFinite(hours) ? hours : 8,
    Number.isFinite(minutes) ? minutes : 0,
    0,
    0,
  );
  return date;
}

export default function OKSignSettingsPage() {
  const { colors } = useThemeColors();
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn);

  // Sign store state
  const isSigning = useSignStore((s) => s.isSigning);
  const status = useSignStore((s) => s.status);
  const totalCount = useSignStore((s) => s.totalCount);
  const successCount = useSignStore((s) => s.successCount);
  const failCount = useSignStore((s) => s.failCount);
  const currentIndex = useSignStore((s) => s.currentIndex);
  const totalExp = useSignStore((s) => s.totalExp);
  const progressList = useSignStore((s) => s.progressList);
  const signError = useSignStore((s) => s.error);

  const startSign = useSignStore((s) => s.startSign);
  const cancelSign = useSignStore((s) => s.cancelSign);
  const reset = useSignStore((s) => s.reset);
  const scheduleAutoSign = useSignStore((s) => s.scheduleAutoSign);
  const cancelAutoSign = useSignStore((s) => s.cancelAutoSign);
  const checkAutoSignScheduled = useSignStore((s) => s.checkAutoSignScheduled);

  // Preferences are subscribed directly from the shared store.
  const hasHydrated = usePreferencesStore((s) => s.hasHydrated);
  const autoSign = usePreferencesStore((s) => s.preferences.autoSign);
  const autoSignTime = usePreferencesStore((s) => s.preferences.autoSignTime);
  const slowSignMode = usePreferencesStore((s) => s.preferences.slowSignMode);
  const failAutoStop = usePreferencesStore((s) => s.preferences.failAutoStop);
  const useOfficialSign = usePreferencesStore((s) => s.preferences.useOfficialSign);
  const liveActivitySignEnabled = usePreferencesStore((s) => s.preferences.liveActivitySignEnabled);
  const setPreference = usePreferencesStore((s) => s.setPreference);

  const [isScheduled, setIsScheduled] = useState(false);

  useEffect(() => {
    checkAutoSignScheduled()
      .then(setIsScheduled)
      .catch(() => setIsScheduled(false));
  }, [checkAutoSignScheduled]);

  // ---------- Handlers ----------

  const handleManualSign = useCallback(async () => {
    if (!isLoggedIn) {
      Alert.alert('提示', '请先登录后再使用一键签到');
      return;
    }
    if (isSigning) return;

    try {
      hapticImpact(ImpactFeedbackStyle.Medium).catch(() => {});
      await startSign();
    } catch (e: any) {
      Alert.alert('签到失败', e?.message || '签到过程中出现未知错误');
    }
  }, [isLoggedIn, isSigning, startSign]);

  const handleCancelSign = useCallback(() => {
    cancelSign();
  }, [cancelSign]);

  const handleAutoSignToggle = useCallback(
    async (value: boolean) => {
      hapticImpact(ImpactFeedbackStyle.Light).catch(() => {});
      setPreference('autoSign', value);
      try {
        if (value) {
          await scheduleAutoSign(autoSignTime);
          setIsScheduled(true);
        } else {
          await cancelAutoSign();
          setIsScheduled(false);
        }
      } catch {
        setPreference('autoSign', !value);
        setIsScheduled(false);
        Alert.alert('错误', '设置自动签到失败');
      }
    },
    [autoSignTime, scheduleAutoSign, cancelAutoSign, setPreference],
  );

  const handleSlowModeToggle = useCallback(
    (value: boolean) => {
      hapticImpact(ImpactFeedbackStyle.Light).catch(() => {});
      setPreference('slowSignMode', value);
    },
    [setPreference],
  );

  const handleFailAutoStopToggle = useCallback(
    (value: boolean) => {
      hapticImpact(ImpactFeedbackStyle.Light).catch(() => {});
      setPreference('failAutoStop', value);
    },
    [setPreference],
  );

  const handleOfficialSignToggle = useCallback(
    (value: boolean) => {
      hapticImpact(ImpactFeedbackStyle.Light).catch(() => {});
      setPreference('useOfficialSign', value);
    },
    [setPreference],
  );

  const handleLiveActivityToggle = useCallback(
    (value: boolean) => {
      hapticImpact(ImpactFeedbackStyle.Light).catch(() => {});
      setPreference('liveActivitySignEnabled', value);
      if (!value) {
        recoverStaleSignLiveActivities().catch(() => {});
      }
    },
    [setPreference],
  );

  const handleTimeChange = useCallback(
    (date: Date) => {
      const next = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      setPreference('autoSignTime', next);
      if (autoSign) {
        scheduleAutoSign(next)
          .then(() => setIsScheduled(true))
          .catch(() => Alert.alert('错误', '更新签到时间失败'));
      }
    },
    [autoSign, scheduleAutoSign, setPreference],
  );

  if (!hasHydrated) return null;

  const signProgress =
    totalCount > 0 ? Math.min((currentIndex + 1) / totalCount, 1) : 0;
  const previewActive = isSigning || status === 'signing';
  const previewDone =
    previewActive || status === 'error'
      ? successCount + failCount
      : status === 'completed'
        ? totalCount > 0
          ? successCount + failCount
          : 12
        : 6;
  const previewTotal = totalCount > 0 ? totalCount : 12;
  const previewForum = progressList.find((p) => p.status === 'signing')?.forumName;

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Stack.Screen options={{ title: '一键签到' }} />
      <Form>
        <Section title="一键签到">
          <Button
            label={isLoggedIn ? '一键签到' : '请先登录'}
            systemImage="checkmark.circle.fill"
            onPress={handleManualSign}
            modifiers={[
              buttonStyle('borderedProminent'),
              controlSize('large'),
              tint(colors.primary),
              disabled(!isLoggedIn),
            ]}
          />
          <Text
            modifiers={[
              font({ textStyle: 'caption' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}
          >
            点击立即签到所有关注的贴吧
          </Text>
        </Section>

        {isSigning && (
          <Section title="签到进度">
            <Text>正在签到 {currentIndex + 1} / {totalCount}</Text>
            <ProgressView
              value={signProgress}
              modifiers={[progressViewStyle('linear'), tint(colors.primary)]}
            />
            <HStack spacing={14}>
              <Text modifiers={[foregroundStyle(colors.success), font({ weight: 'semibold' })]}>
                ✓ {successCount}
              </Text>
              <Text modifiers={[foregroundStyle(colors.danger), font({ weight: 'semibold' })]}>
                ✗ {failCount}
              </Text>
              {totalExp > 0 && (
                <Text
                  modifiers={[
                    foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                  ]}
                >
                  +{totalExp} 经验
                </Text>
              )}
            </HStack>
            <Button
              label="取消签到"
              systemImage="xmark.circle.fill"
              role="destructive"
              onPress={handleCancelSign}
            />
          </Section>
        )}

        {status === 'completed' && (
          <Section title="签到结果">
            <Text modifiers={[foregroundStyle(colors.success), font({ weight: 'semibold' })]}>
              签到完成
            </Text>
            <Text
              modifiers={[
                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
              ]}
            >
              成功 {successCount} 个
              {failCount > 0 ? `，失败 ${failCount} 个` : ''}
              {totalExp > 0 ? `，获得 ${totalExp} 经验` : ''}
            </Text>
            <Button label="完成" systemImage="checkmark" onPress={reset} />
          </Section>
        )}

        {status === 'error' && signError && (
          <Section title="签到出错">
            <Text modifiers={[foregroundStyle(colors.danger), font({ weight: 'semibold' })]}>
              签到出错
            </Text>
            <Text
              modifiers={[
                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
              ]}
            >
              {signError}
            </Text>
            <Button label="关闭" systemImage="xmark" onPress={reset} />
          </Section>
        )}

        <Section title="实时活动">
          <Toggle isOn={liveActivitySignEnabled} onIsOnChange={handleLiveActivityToggle}>
            <Text>在灵动岛显示签到进度</Text>
            <Text>关闭后签到过程不会创建实时活动</Text>
          </Toggle>
          <RNHostView matchContents>
            <LiveActivityPreview
              active={previewActive}
              enabled={liveActivitySignEnabled}
              done={previewDone}
              total={previewTotal}
              currentForumName={previewForum}
              success={successCount}
              fail={failCount}
              exp={totalExp}
              status={status}
            />
          </RNHostView>
        </Section>

        <Section title="自动签到">
          <Toggle isOn={autoSign} onIsOnChange={handleAutoSignToggle}>
            <Text>每日自动签到</Text>
            <Text>在每天指定时间尝试后台自动签到</Text>
          </Toggle>
          {autoSign && (
            <DatePicker
              title="签到时间"
              selection={parseTimeToDate(autoSignTime)}
              displayedComponents={['hourAndMinute']}
              onDateChange={handleTimeChange}
            />
          )}
          {isScheduled && (
            <Text
              modifiers={[
                font({ textStyle: 'caption' }),
                foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
              ]}
            >
              将在每天 {autoSignTime} 自动签到
            </Text>
          )}
        </Section>

        <Section title="签到行为">
          <Toggle isOn={slowSignMode} onIsOnChange={handleSlowModeToggle}>
            <Text>慢速模式</Text>
            <Text>降低签到速度，减少被限制的风险</Text>
          </Toggle>
          <Toggle isOn={failAutoStop} onIsOnChange={handleFailAutoStopToggle}>
            <Text>失败自动停止</Text>
            <Text>遇到签到失败时立即停止</Text>
          </Toggle>
          <Toggle isOn={useOfficialSign} onIsOnChange={handleOfficialSignToggle}>
            <Text>使用官方批量签到</Text>
            <Text>优先使用贴吧官方批量签到接口</Text>
          </Toggle>
        </Section>

        {progressList.length > 0 && (
          <Section title="进度列表">
            {progressList.map((item: SignProgressItem, index: number) => (
              <HStack
                key={item.forumId || `progress-${index}`}
                spacing={8}
                alignment="center"
              >
                <Text modifiers={[font({ weight: 'medium' })]}>{item.forumName}</Text>
                <Spacer />
                {item.status === 'success' && (
                  <Text modifiers={[foregroundStyle(colors.success), font({ weight: 'semibold' })]}>
                    ✓{item.exp ? ` +${item.exp}` : ''}
                  </Text>
                )}
                {item.status === 'failed' && (
                  <Text modifiers={[foregroundStyle(colors.danger), font({ weight: 'semibold' })]}>
                    ✗
                  </Text>
                )}
                {item.status === 'signing' && (
                  <ProgressView modifiers={[progressViewStyle('circular')]} />
                )}
                {item.status === 'pending' && (
                  <Text
                    modifiers={[
                      foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
                    ]}
                  >
                    等待中
                  </Text>
                )}
              </HStack>
            ))}
          </Section>
        )}

        <Section title="关于一键签到">
          <Text
            modifiers={[
              font({ textStyle: 'caption' }),
              foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
            ]}
          >
            一键签到会依次为您关注的每一个贴吧签到。开启自动签到后，应用会在每天指定时间通过后台任务自动签到。频繁签到可能被贴吧系统临时限制，建议开启慢速模式降低风险。
          </Text>
        </Section>
      </Form>
    </ThemedHost>
  );
}
