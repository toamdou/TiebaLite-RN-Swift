import { requireOptionalNativeModule } from 'expo';

export interface ProtoPostRequest {
  url: string;
  headers: Record<string, string>;
  formFields: [string, string][];
  protoDataBase64: string;
  skipSign: boolean;
  responseType: string;
  requestId: string;
  timeoutMs?: number;
}

export interface TiebaNativeModule {
  isAvailable(): boolean;
  protoInitialize(json: string): void;
  protoEncode(typePath: string, payload: Record<string, unknown>): string;
  protoEncodeAsync(
    typePath: string,
    payload: Record<string, unknown>
  ): Promise<string>;
  protoDecode(typePath: string, base64: string): Record<string, any>;
  protoPost(
    url: string,
    headers: Record<string, string>,
    formFields: [string, string][],
    protoDataBase64: string,
    skipSign: boolean,
    responseType: string,
    requestId: string,
    timeoutMs?: number
  ): Promise<Record<string, any>>;
  cancelProtoRequest(requestId: string): void;
  signParams(params: Record<string, string>): string;
  signFields(fields: [string, string][]): string;
  makeThumbnail(
    sourceUri: string,
    width: number,
    height: number,
    cacheKey: string,
    referer?: string,
    targetWidth?: number
  ): Promise<string>;
  applyWatermark(sourceUri: string, text: string): Promise<string>;
  clearThumbnailCache(): void;
  isLiveActivitySupported(): boolean;
  areLiveActivitiesEnabled(): boolean;
  startLiveActivity(state: Record<string, unknown>): Promise<string | null>;
  updateLiveActivity(
    activityId: string,
    state: Record<string, unknown>
  ): Promise<void>;
  endLiveActivity(
    activityId: string,
    state: Record<string, unknown>,
    dismissalPolicy: string
  ): Promise<void>;
  endAllLiveActivities(
    state: Record<string, unknown>,
    dismissalPolicy: string
  ): Promise<void>;
  saveBackgroundSnapshot(payload: Record<string, unknown>): void;
  clearBackgroundSnapshot(): void;
  registerNotificationSync(minutes: number): void;
  cancelNotificationSync(): void;
  setNotificationCounts(
    uid: string,
    reply: number,
    at: number,
    agree: number,
    total: number
  ): void;
  getNotificationCounts(uid: string): {
    reply: number;
    at: number;
    agree: number;
    total: number;
  } | null;
  clearNotificationCounts(uid: string): void;
  registerAutoSign(hour: number, minute: number): void;
  cancelAutoSign(): void;
  cancelAllBackgroundTasks(): void;
  isAutoSignRegistered(): boolean;
  scheduleSignReminder(hour: number, minute: number): void;
  cancelSignReminder(): void;
}

// Raw native surface: protoPost crosses the bridge as a JSON *string*
// (flat strings are far cheaper to bridge than deeply nested dictionaries).
type RawTiebaNativeModule = Omit<TiebaNativeModule, 'protoPost'> & {
  protoPost: (
    url: string,
    headers: Record<string, string>,
    formFields: [string, string][],
    protoDataBase64: string,
    skipSign: boolean,
    responseType: string,
    requestId: string,
    timeoutMs?: number
  ) => Promise<string>;
};

function requireTiebaNative(): RawTiebaNativeModule {
  const module = requireOptionalNativeModule<RawTiebaNativeModule>('TiebaNative');
  if (!module) {
    throw new Error(
      'TiebaNative is not linked. Build an iOS dev client with modules/tieba-native enabled.'
    );
  }
  return module;
}

/**
 * Public module surface. Signature is identical to the legacy contract
 * (protoPost returns a parsed object), so existing JS callers are unaffected.
 */
export const TiebaNative: TiebaNativeModule = (() => {
  const native = requireTiebaNative();
  return {
    ...native,
    protoPost: async (
      url,
      headers,
      formFields,
      protoDataBase64,
      skipSign,
      responseType,
      requestId,
      timeoutMs,
    ) =>
      JSON.parse(
        await native.protoPost(
          url,
          headers,
          formFields,
          protoDataBase64,
          skipSign,
          responseType,
          requestId,
          timeoutMs,
        ),
      ),
  };
})();
