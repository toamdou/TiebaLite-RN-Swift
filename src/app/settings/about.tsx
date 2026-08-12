import { useCallback } from 'react';
import { Form, Section, Button, Text, Image } from '@expo/ui/swift-ui';
import { font, foregroundStyle } from '@expo/ui/swift-ui/modifiers';
import { hapticImpact, ImpactFeedbackStyle } from '@/utils/haptics';
import { APP_VERSION, APP_NAME } from '@/constants/app';
import { openLink } from '@/utils/linkOpener';
import { useThemeColors } from '@/theme/ThemeContext';
import { ThemedHost } from '@/components/ui/ThemedHost';

export default function AboutPage() {
  const { colors } = useThemeColors();
  const openGitHub = useCallback(() => {
    hapticImpact(ImpactFeedbackStyle.Light);
    openLink('https://github.com/HuanChengFly/TiebaLite');
  }, []);

  const openLicense = useCallback(() => {
    hapticImpact(ImpactFeedbackStyle.Light);
    openLink('https://www.apache.org/licenses/LICENSE-2.0');
  }, []);

  return (
    <ThemedHost style={{ flex: 1 }}>
      <Form>
        <Section>
          <Image systemName="bubble.left.and.bubble.right.fill" size={56} color={colors.primary} />
          <Text modifiers={[font({ textStyle: 'title', weight: 'bold' })]}>{APP_NAME}</Text>
          <Text modifiers={[font({ textStyle: 'subheadline' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
            Version {APP_VERSION}
          </Text>
          <Text modifiers={[font({ textStyle: 'caption' }), foregroundStyle({ type: 'hierarchical', style: 'tertiary' })]}>
            基于 HuanChengFly/TiebaLite 迁移至 React Native
          </Text>
        </Section>

        <Section title="信息">
          <Button label="开源仓库" systemImage="chevron.left.forwardslash.chevron.right" onPress={openGitHub} />
          <Button label="开源许可 (Apache 2.0)" systemImage="doc.text.fill" onPress={openLicense} />
          <Button label="作者: HuanChengFly" systemImage="person.fill" />
        </Section>

        <Section title="技术栈">
          <Button label="React Native" systemImage="atom" />
          <Button label="Expo SDK 57" systemImage="cube.box.fill" />
          <Button label="iOS 液态玻璃 & SwiftUI" systemImage="circle.lefthalf.filled" />
        </Section>

        <Section footer="感谢原项目 HuanChengFly/TiebaLite 的开源贡献。本应用为非官方贴吧客户端，仅供学习交流使用。">
          <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle({ type: 'hierarchical', style: 'tertiary' })]}>
            {'©'} {new Date().getFullYear()} TiebaLite contributors
          </Text>
        </Section>
      </Form>
    </ThemedHost>
  );
}
