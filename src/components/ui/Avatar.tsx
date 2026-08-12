// ============================================================
// TiebaLite React Native - User/Forum Avatar
// Circular shape, initials placeholder, status indicator, level badge
// ============================================================

import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type GestureResponderEvent,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';

import { useThemeColors } from '@/theme/ThemeContext';
import { getAvatarUrl } from '@/utils';

// ---------- Avatar Props ----------
export interface AvatarProps {
  /** Image source URL */
  source?: string;
  /** Fallback initials (e.g. "JD" for John Doe) */
  initials?: string;
  /** Avatar size (default: 40) */
  size?: number;
  /** Whether to show online status dot */
  showOnlineStatus?: boolean;
  /** Online status: 'online', 'offline', 'away' */
  onlineStatus?: 'online' | 'offline' | 'away';
  /** Level number to show as badge */
  level?: number;
  /** Custom background color for initials fallback */
  fallbackColor?: string;
  /** Custom style */
  style?: StyleProp<ViewStyle>;
  /** Accessibility label */
  accessibilityLabel?: string;
  /** Optional tap handler (avatar preview, navigation, etc.) */
  onPress?: (event: GestureResponderEvent) => void;
  /** Optional long-press handler */
  onLongPress?: (event: GestureResponderEvent) => void;
}

// ---------- Avatar Component ----------
export function Avatar({
  source,
  initials,
  size = 40,
  showOnlineStatus = false,
  onlineStatus,
  level,
  fallbackColor,
  style,
  accessibilityLabel,
  onPress,
  onLongPress,
}: AvatarProps) {
  const { colors } = useThemeColors();
  const [imageError, setImageError] = useState(false);

  // Convert portrait ID to full URL (mirrors Kotlin StringUtil.getAvatarUrl)
  const avatarUri = getAvatarUrl(source);
  const showFallback = !avatarUri || imageError;
  const bgColor = fallbackColor ?? colors.primary;
  const fontSize = Math.round(size * 0.38);
  const isPressable = Boolean(onPress || onLongPress);

  // FlashList recycles cells: reset the failed-image state whenever the
  // avatar URL changes so a new user does not inherit the old fallback.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset recycled-cell error state when the avatar URL changes.
    setImageError(false);
  }, [avatarUri]);

  return (
    <Pressable
      style={[styles.wrapper, { width: size, height: size }, style]}
      disabled={!isPressable}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={isPressable ? 'imagebutton' : 'image'}
      accessibilityLabel={
        accessibilityLabel ??
        (initials ? `Avatar for ${initials}` : 'Avatar')
      }
    >
      {/* Main circle */}
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: showFallback ? bgColor : colors.surfaceSecondary,
          },
        ]}
      >
        {showFallback ? (
          <Text
            style={[
              styles.initials,
              {
                fontSize,
                color: colors.textOnPrimary,
              },
            ]}
            allowFontScaling={false}
          >
            {initials?.slice(0, 2).toUpperCase() ?? '?'}
          </Text>
        ) : (
          <Image
            source={{ uri: avatarUri }}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
            }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            // Recycling-safe in FlashList: resets stale content before the new
            // avatar loads (Image.md §recyclingKey).
            recyclingKey={avatarUri}
            onError={() => setImageError(true)}
            accessibilityIgnoresInvertColors
          />
        )}
      </View>

      {/* Online Status Indicator */}
      {showOnlineStatus && onlineStatus && onlineStatus !== 'offline' && (
        <View
          style={[
            styles.statusDot,
            {
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: size * 0.14,
              backgroundColor:
                onlineStatus === 'online' ? colors.success : colors.warning,
              borderColor: colors.background,
              borderWidth: 2,
              right: -1,
              bottom: -1,
            },
          ]}
        />
      )}

      {/* Level Badge */}
      {level !== undefined && level > 0 && (
        <View
          style={[
            styles.levelBadge,
            {
              backgroundColor: colors.accent,
              minWidth: size * 0.42,
              height: size * 0.36,
              borderRadius: size * 0.18,
            },
          ]}
        >
          <Text
            style={[
              styles.levelText,
              { fontSize: Math.max(10, size * 0.22), color: colors.textOnPrimary },
            ]}
            allowFontScaling={false}
            numberOfLines={1}
          >
            Lv.{level}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontWeight: '600',
    textAlign: 'center',
  },
  statusDot: {
    position: 'absolute',
  },
  levelBadge: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  levelText: {
    fontWeight: '700',
    textAlign: 'center',
  },
});

export default Avatar;
