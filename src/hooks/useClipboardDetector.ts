// ============================================================
// useClipboardDetector — Detect tieba links in clipboard
//
// Mirrors Kotlin: ClipBoardLinkDetector
// Registered as ActivityLifecycleCallbacks, checks clipboard
// on activity start (app foreground), compares hash to avoid
// duplicate prompts, extracts tieba URLs and returns parsed link.
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  isThreadUrl,
  isForumUrl,
  extractThreadId,
  extractForumName,
} from '@/utils';

// ---------- Types ----------

export interface DetectedThreadLink {
  type: 'thread';
  url: string;
  threadId: string;
}

export interface DetectedForumLink {
  type: 'forum';
  url: string;
  forumName: string;
}

export type DetectedLink = DetectedThreadLink | DetectedForumLink;

// ---------- URL Regex (from Kotlin) ----------

const URL_REGEX =
  /((http|https):\/\/)(([a-zA-Z0-9._-]+\.[a-zA-Z]{2,6})|([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}))(:[0-9]{1,4})*(\/[a-zA-Z0-9&%_./-~-]*)?/;

// ---------- Hook ----------

export function useClipboardDetector(): {
  detectedLink: DetectedLink | null;
  clearDetectedLink: () => void;
} {
  const [detectedLink, setDetectedLink] = useState<DetectedLink | null>(null);

  // Clipboard hash to avoid re-prompting for the same content
  // Kotlin: uses clipBoardTimestamp; we use content string hash
  const lastHash = useRef<string>('');

  // Throttle: avoid rapid re-checks (Kotlin: 10s throttle)
  const lastCheck = useRef<number>(0);

  const detectLink = useCallback(async () => {
    // Throttle checks to max once per 3 seconds
    const now = Date.now();
    if (now - lastCheck.current < 3000) return;
    lastCheck.current = now;

    try {
      const text = await Clipboard.getStringAsync();
      if (!text || text === lastHash.current) return;

      lastHash.current = text;

      // Extract URL from clipboard (Kotlin: regex match)
      const match = text.match(URL_REGEX);
      if (!match) return;

      const url = match[0];

      // Parse link (Kotlin: parseLink → ClipBoardThreadLink / ClipBoardForumLink)
      if (isThreadUrl(url)) {
        const threadId = extractThreadId(url);
        if (threadId) {
          setDetectedLink({ type: 'thread', url, threadId });
          return;
        }
      }

      if (isForumUrl(url)) {
        const forumName = extractForumName(url);
        if (forumName) {
          setDetectedLink({ type: 'forum', url, forumName });
        }
      }
    } catch {
      // Clipboard access denied or empty — silently skip
    }
  }, []);

  const clearDetectedLink = useCallback(() => {
    setDetectedLink(null);
  }, []);

  useEffect(() => {
    // Check on mount (Kotlin: onCreate → checkIntent)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clipboard read is async; detected-link state only updates after getStringAsync resolves.
    detectLink();

    // Native clipboard-change event (iOS). Primary trigger.
    const clipboardSub = Clipboard.addClipboardListener((event) => {
      const hasText =
        event.contentTypes.includes(Clipboard.ContentType.PLAIN_TEXT) ||
        event.contentTypes.includes(Clipboard.ContentType.URL);
      if (hasText) detectLink();
    });

    return () => {
      clipboardSub.remove();
    };
  }, [detectLink]);

  return { detectedLink, clearDetectedLink };
}
