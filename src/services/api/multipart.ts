/**
 * Build the form-field list for Tieba protobuf requests.
 * The multipart body itself is constructed natively by TiebaNative.
 */
export function buildProtobufFormFields(
  commonParams: Record<string, string>,
): [string, string][] {
  // Keys to exclude (matches Kotlin defaultCommonParamInterceptor minus OS version).
  const EXCLUDE_KEYS = new Set(['_os_version']);

  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(commonParams)) {
    if (EXCLUDE_KEYS.has(key)) continue;
    if (value !== undefined && value !== null) {
      entries.push([key, value]);
    }
  }
  return entries;
}
