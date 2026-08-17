import { useCallback } from 'react';
import { Form, Section, Button, Text, Image, Label, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { hapticForScene } from '@/theme/hapticsMap';
import { APP_VERSION, APP_NAME } from '@/constants/app';
import { openLink } from '@/utils/linkOpener';
import { useThemeColors } from '@/theme/ThemeContext';
import { ThemedHost } from '@/components/ui/ThemedHost';
import { Spacing } from '@/theme';

export default function AboutPage() {
  const { colors } = useThemeColors();
  const openGitHub = useCallback(() => {
    hapticForScene('press');
    openLink('https://github.com/HuanChengFly/TiebaLite');
  }, []);

  const openLicense = useCallback(() => {
    hapticForScene('press');
    openLink('https://www.apache.org/licenses/LICENSE-2.0');
  }, []);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section>
          {/* 首区块：图标 + 标题 + 版本 居中排版 */}
          <VStack
            alignment="center"
            spacing={Spacing.xs}
            modifiers={[frame({ maxWidth: 9999 }), padding({ vertical: Spacing.lg })]}
          >
            <Image systemName="bubble.left.and.bubble.right.fill" size={56} color={colors.primary} />
            <Text modifiers={[font({ textStyle: 'title', weight: 'bold' })]}>{APP_NAME}</Text>
            <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
              Version {APP_VERSION}
            </Text>
            <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle({ type: 'hierarchical', style: 'tertiary' })]}>
              基于 HuanChengFly/TiebaLite 迁移至 React Native
            </Text>
          </VStack>
        </Section>

        <Section title="信息">
          <Button label="开源仓库" systemImage="chevron.left.forwardslash.chevron.right" onPress={openGitHub} />
          <Button label="开源许可 (Apache 2.0)" systemImage="doc.text.fill" onPress={openLicense} />
          <Button label="作者: HuanChengFly" systemImage="person.fill" />
        </Section>

        {/* 技术栈：无交互的静态信息行，不渲染为可点击 Button */}
        <Section title="技术栈">
          <Label title="React Native" systemImage="atom" />
          <Label title="Expo SDK 57" systemImage="cube.box.fill" />
          <Label title="iOS 液态玻璃 & SwiftUI" systemImage="circle.lefthalf.filled" />
        </Section>

        <Section footer={<Text>感谢原项目 HuanChengFly/TiebaLite 的开源贡献。本应用为非官方贴吧客户端，仅供学习交流使用。</Text>}>
          <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle({ type: 'hierarchical', style: 'tertiary' })]}>
            {'©'} {new Date().getFullYear()} TiebaLite contributors
          </Text>
        </Section>
      </Form>
    </ThemedHost>
  );
}
