import { useCallback, useState } from 'react';
import { Form, Section, Toggle, Button, Label, Text, Picker, ConfirmationDialog } from '@expo/ui/swift-ui';
import { foregroundStyle, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { openSettings } from 'expo-linking';
import { hapticForScene } from '@/theme/hapticsMap';
import { Directory, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { clearAuthCredentials } from '@/services/api/interceptors';
import { resetNotificationBaseline, stopNotificationPoller } from '@/services/NotificationPoller';
import { clearAllAuthSync, clearSecureCredentials } from '@/services/storage/AuthSQLiteStorage';
import { clearVisitHistory } from '@/services/storage/visitHistory';
import { clearSearchHistory } from '@/storage/searchHistory';
import { clearAllUnifiedStorage, clearLegacyStorage } from '@/services/storage/unifiedDb';
import { clearBackgroundSnapshot } from '@/services/nativeBackground';
import { useAuthStore } from '@/stores/authStore';
import { BlockManager } from '@/utils/BlockManager';
import { openLink } from '@/utils/linkOpener';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { ThemedHost } from '@/components/ui/ThemedHost';
import {
  IMAGE_LOAD_TYPE_LABELS,
  IMAGE_WATERMARK_LABELS,
} from '@/constants/settings';
import { TiebaNative } from '../../../modules/tieba-native/src/TiebaNative';

export default function MoreSettingsPage() {
  const router = useRouter();
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreference = usePreferencesStore((s) => s.setPreference);
  const resetPreferences = usePreferencesStore((s) => s.resetPreferences);
  const [showClearCache, setShowClearCache] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showClearAll, setShowClearAll] = useState(false);

  const navigateTo = useCallback((route: string) => {
    hapticForScene('press');
    router.push(route as any);
  }, [router]);

  const handleOpenSystemSettings = useCallback(() => {
    hapticForScene('press');
    openSettings().catch(() => {});
  }, []);

  const handleClearCache = useCallback(async () => {
    try {
      try {
        await Image.clearDiskCache();
        await Image.clearMemoryCache();
      } catch {
        // Some platforms/builds expose one of these as unavailable.
      }
      const cacheDirectory = new Directory(Paths.cache);
      try {
        // iOS SQLite is stored under Documents/SQLite and credentials live
        // in Keychain; Paths.cache only contains image/temp media files, so
        // this mirrors Kotlin's clear-picture-cache behavior and never
        // touches login state or the unified database.
        cacheDirectory.delete();
      } catch {
        // Cache directory may already be gone; clearing caches is best-effort.
      }
      try {
        TiebaNative.clearThumbnailCache();
      } catch {
        // Native cache is under Paths.cache too; this is a secondary cleanup.
      }
      hapticForScene('action-success');
    } catch {
      hapticForScene('action-fail');
    }
    setShowClearCache(false);
  }, []);

  const handleReset = useCallback(async () => {
    try {
      await resetPreferences();
      await BlockManager.clearAllBlocked();
      await clearLegacyStorage();
      hapticForScene('action-success');
    } catch {}
    setShowReset(false);
  }, [resetPreferences]);

  const handleClearAll = useCallback(async () => {
    try {
      await resetPreferences();
      await clearAllUnifiedStorage();

      await clearSearchHistory();
      await clearVisitHistory();
      await BlockManager.clearAllBlocked();
      clearAllAuthSync();
      await clearSecureCredentials();
      clearAuthCredentials();
      clearBackgroundSnapshot();
      try {
        TiebaNative.clearThumbnailCache();
      } catch {
        // Best-effort native cache cleanup.
      }
      stopNotificationPoller();
      TiebaNative.cancelAllBackgroundTasks();
      await resetNotificationBaseline();
      useAuthStore.setState({
        isLoggedIn: false,
        account: null,
        error: null,
        isLoading: false,
      });
      hapticForScene('action-success');
    } catch {
      hapticForScene('action-fail');
    }
    setShowClearAll(false);
  }, [resetPreferences]);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section title="通用">
          <Picker
            label="图片加载策略"
            selection={preferences.imageLoadType}
            onSelectionChange={(v: string) => setPreference('imageLoadType', v as never)}
            modifiers={[pickerStyle('menu')]}
          >
            {Object.entries(IMAGE_LOAD_TYPE_LABELS).map(([value, label]) => (
              <Text key={value} modifiers={[tag(value)]}>{label}</Text>
            ))}
          </Picker>
          <Picker
            label="图片水印"
            selection={preferences.imageWatermark}
            onSelectionChange={(v: string) => setPreference('imageWatermark', v as never)}
            modifiers={[pickerStyle('menu')]}
          >
            {Object.entries(IMAGE_WATERMARK_LABELS).map(([value, label]) => (
              <Text key={value} modifiers={[tag(value)]}>{label}</Text>
            ))}
          </Picker>
          <Toggle
            label="图片右下角水印"
            systemImage="signature"
            isOn={preferences.imageWatermarkEnabled}
            onIsOnChange={(v) => setPreference('imageWatermarkEnabled', v)}
          />
          <Toggle
            label="暗色模式下暗化图片"
            systemImage="moon.circle.fill"
            isOn={preferences.imageDarkenWhenNight}
            onIsOnChange={(v) => setPreference('imageDarkenWhenNight', v)}
          />
        </Section>

        {/* 「默认启动页」偏好暂不生效（启动标签页由原生标签栏记忆上次位置），
            整个 Section 隐藏，避免误导用户。 */}
        <Section title="数据">
          <ConfirmationDialog
            title="清除图片缓存"
            isPresented={showClearCache}
            onIsPresentedChange={setShowClearCache}
            titleVisibility="visible"
          >
            <ConfirmationDialog.Trigger>
              <Button
                label="清除图片缓存"
                systemImage="trash.fill"
                onPress={() => setShowClearCache(true)}
              />
            </ConfirmationDialog.Trigger>
            <ConfirmationDialog.Actions>
              <Button label="确定清除" role="destructive" onPress={handleClearCache} />
              <Button label="取消" role="cancel" />
            </ConfirmationDialog.Actions>
            <ConfirmationDialog.Message>
              <Text>登录状态和应用设置不会被清除。</Text>
            </ConfirmationDialog.Message>
          </ConfirmationDialog>

          <ConfirmationDialog
            title="重置所有设置"
            isPresented={showReset}
            onIsPresentedChange={setShowReset}
            titleVisibility="visible"
          >
            <ConfirmationDialog.Trigger>
              <Button
                label="重置所有设置"
                systemImage="arrow.counterclockwise"
                onPress={() => setShowReset(true)}
              />
            </ConfirmationDialog.Trigger>
            <ConfirmationDialog.Actions>
              <Button label="确定重置" role="destructive" onPress={handleReset} />
              <Button label="取消" role="cancel" />
            </ConfirmationDialog.Actions>
            <ConfirmationDialog.Message>
              <Text>这将恢复默认主题、偏好等，请重启应用以生效。</Text>
            </ConfirmationDialog.Message>
          </ConfirmationDialog>

          <ConfirmationDialog
            title="清除全部数据"
            isPresented={showClearAll}
            onIsPresentedChange={setShowClearAll}
            titleVisibility="visible"
          >
            <ConfirmationDialog.Trigger>
              <Button
                label="清除全部数据"
                systemImage="trash.slash"
                onPress={() => setShowClearAll(true)}
              />
            </ConfirmationDialog.Trigger>
            <ConfirmationDialog.Actions>
              <Button label="确定清除" role="destructive" onPress={handleClearAll} />
              <Button label="取消" role="cancel" />
            </ConfirmationDialog.Actions>
            <ConfirmationDialog.Message>
              <Text>将清除登录状态、设置、历史、屏蔽数据与本地凭据，且不可恢复。</Text>
            </ConfirmationDialog.Message>
          </ConfirmationDialog>
        </Section>

        <Section title="外部链接">
          <Button
            label="开源仓库"
            systemImage="chevron.left.forwardslash.chevron.right"
            onPress={() => openLink('https://github.com/HuanChengFly/TiebaLite')}
          />
          <Button
            label="问题反馈"
            systemImage="exclamationmark.bubble.fill"
            onPress={() => openLink('https://github.com/HuanChengFly/TiebaLite/issues')}
          />
        </Section>

        <Section
          title="更多"
          footer={<Text>系统应用设置可管理通知、权限与后台任务。</Text>}
        >
          <Button onPress={() => navigateTo('/settings/about')}>
            <Label title="关于" systemImage="info.circle" modifiers={[foregroundStyle('#8E8E93')]} />
          </Button>
          <Button onPress={handleOpenSystemSettings}>
            <Label title="系统应用设置" systemImage="gear" modifiers={[foregroundStyle('#007AFF')]} />
          </Button>
        </Section>
      </Form>
    </ThemedHost>
  );
}
