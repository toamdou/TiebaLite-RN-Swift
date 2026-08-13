/**
 * Copy Text Page — mirrors Kotlin CopyDialogPage
 *
 * Full-screen page with selectable text for free copy.
 * User can select portions or tap "Copy All" to copy entire text.
 */

import { useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, ScrollView, Alert,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView } from '@/components/ui/SymbolView';
import * as Clipboard from 'expo-clipboard';
import { hapticForScene } from '@/theme/hapticsMap';
import { useThemeColors } from '@/theme/ThemeContext';
import { Radius, Spacing, typographyStyles } from '@/theme';

export default function CopyPage() {
  const { text } = useLocalSearchParams<{ text: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();

  // decodeURIComponent 对非法 % 序列会抛 URIError，非法参数导致整页白屏；
  // try/catch 兜底，失败时保留原文。
  let decodedText = text || '';
  try {
    decodedText = decodeURIComponent(decodedText);
  } catch {
    // 保留原文
  }

  const handleCopyAll = useCallback(async () => {
    hapticForScene('press');
    await Clipboard.setStringAsync(decodedText);
    hapticForScene('action-success');
    Alert.alert('已复制', '全部内容已复制到剪贴板');
  }, [decodedText]);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.dismiss();
    }
  }, [router]);

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: '复制',
          headerRight: () => (
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              style={s.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="关闭"
            >
              <SymbolView name="xmark.circle.fill" size={22} tintColor={colors.textTertiary} />
            </Pressable>
          ),
        }}
      />

      {/* Tip text */}
      <View style={[s.tipBar, { backgroundColor: colors.surfaceSecondary }]}>
        <SymbolView name="hand.point.up.left" size={14} tintColor={colors.textSecondary} />
        <Text style={[s.tipText, { color: colors.textSecondary }]}>
          长按文字可自由选择复制，或点击下方按钮复制全部
        </Text>
      </View>

      {/* Selectable text area */}
      <ScrollView
        style={s.scrollArea}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator
      >
        {/* D4: RN Text selection preserves the raw string, but exact
            rich-text/emoticon fidelity would require a native
            UITextView + NSAttributedString implementation in the Swift
            prototype. */}
        <Text style={[s.bodyText, { color: colors.text }]} selectable selectionColor={colors.primary}>
          {decodedText}
        </Text>
      </ScrollView>

      {/* Bottom actions */}
      <View style={[s.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.divider, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          onPress={handleCopyAll}
          accessibilityRole="button"
          accessibilityLabel="复制全部"
          style={({ pressed }) => [
            s.copyAllBtn,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.8 },
          ]}
        >
          <SymbolView name="doc.on.doc" size={16} tintColor={colors.textOnPrimary} />
          <Text style={[s.copyAllText, { color: colors.textOnPrimary }]}>复制全部</Text>
        </Pressable>
        <Pressable
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="关闭"
          style={({ pressed }) => [
            s.closeActionBtn,
            { backgroundColor: colors.surfaceSecondary },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={[s.closeActionText, { color: colors.text }]}>关闭</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: { padding: Spacing.xs },
  tipBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.input,
  },
  tipText: { ...typographyStyles.footnote, flex: 1 },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  bodyText: { fontSize: 16, lineHeight: 26 },
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  copyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 14,
    borderRadius: Radius.input,
  },
  copyAllText: typographyStyles.calloutBold,
  closeActionBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: Radius.input,
  },
  closeActionText: { fontSize: 16, fontWeight: '500' },
});
