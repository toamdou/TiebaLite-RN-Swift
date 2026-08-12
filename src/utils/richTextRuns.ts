import type { TiebaRichTextRun } from '../../modules/tieba-native/src/TiebaRichText';

/**
 * Convert mapped post content segments into native attributed-string runs.
 * Block media (image/video/audio/poll) is intentionally omitted here and
 * rendered by the surrounding RN layout.
 */
export function contentToRichTextRuns(content: any[]): TiebaRichTextRun[] {
  const runs: TiebaRichTextRun[] = [];
  for (const segment of content ?? []) {
    switch (segment?.type) {
      case 'text':
        runs.push({ kind: 'text', text: segment.text ?? '' });
        break;
      case 'emoji':
        runs.push({ kind: 'emoji', text: segment.text ?? '' });
        break;
      case 'emoticon':
        runs.push({ kind: 'emoticon', text: segment.text ?? '', src: segment.src ?? '' });
        break;
      case 'linebreak':
        runs.push({ kind: 'linebreak' });
        break;
      case 'link':
        runs.push({ kind: 'link', text: segment.text ?? segment.url ?? '', url: segment.url ?? '' });
        break;
      case 'at':
        runs.push({ kind: 'at', text: segment.text ?? '', uid: String(segment.uid ?? '') });
        break;
      case 'topic':
        runs.push({
          kind: 'topic',
          text: segment.text ?? '',
          topicId: String(segment.topicId ?? ''),
        });
        break;
      default:
        break;
    }
  }
  return runs;
}
