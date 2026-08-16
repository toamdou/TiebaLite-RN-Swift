import { requireNativeViewManager } from 'expo-modules-core';
import type { StyleProp, ViewStyle } from 'react-native';

export type TiebaRichTextRun =
  | { kind: 'text'; text: string; fontWeight?: TiebaFontWeight }
  | { kind: 'emoji'; text: string; fontWeight?: TiebaFontWeight }
  | { kind: 'emoticon'; text: string; src: string }
  | { kind: 'linebreak' }
  | { kind: 'link'; text: string; url: string; fontWeight?: TiebaFontWeight }
  | { kind: 'at'; text: string; uid: string; fontWeight?: TiebaFontWeight }
  | { kind: 'topic'; text: string; topicId: string; fontWeight?: TiebaFontWeight };

/** Font weight tokens understood by the native TiebaRichTextView run builder.
 *  Optional — callers that omit it (e.g. contentToRichTextRuns) keep rendering
 *  at regular weight. */
export type TiebaFontWeight = '300' | '400' | '500' | '600' | '700' | '800' | 'bold';

export interface TiebaRichTextProps {
  runs: TiebaRichTextRun[];
  contentWidth?: number;
  fontSize?: number;
  lineHeight?: number;
  textColor?: string;
  linkColor?: string;
  style?: StyleProp<ViewStyle>;
  onLinkPress?: (url: string) => void;
  onUserPress?: (uid: string) => void;
  onTopicPress?: (topicId: string, topicName: string) => void;
}

const NativeTiebaRichText = requireNativeViewManager('TiebaNative', 'TiebaRichTextView');

function unwrap<T>(event: any): T {
  return (event?.nativeEvent ?? event) as T;
}

export function TiebaRichText(props: TiebaRichTextProps) {
  const { style, runs, onLinkPress, onUserPress, onTopicPress, ...rest } = props;
  return (
    <NativeTiebaRichText
      style={style}
      runs={runs}
      {...rest}
      onLinkPress={(event: any) => {
        const payload = unwrap<{ url: string }>(event);
        onLinkPress?.(payload.url);
      }}
      onUserPress={(event: any) => {
        const payload = unwrap<{ uid: string }>(event);
        onUserPress?.(payload.uid);
      }}
      onTopicPress={(event: any) => {
        const payload = unwrap<{ topicId: string; topicName: string }>(event);
        onTopicPress?.(payload.topicId, payload.topicName);
      }}
    />
  );
}
