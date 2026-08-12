// ============================================================
// TiebaLite React Native - Request Signing Utility
// Mirrors the Tieba client SortAndSignInterceptor behavior:
//   1. Sort parameter keys alphabetically
//   2. Concatenate key=value pairs
//   3. Append secret key "tiebaclient!!!"
//   4. MD5 hash the result
// ============================================================

import { SIGN_SECRET } from './config';

// ============================================================
// Pure TypeScript MD5 Implementation (RFC 1321)
// ============================================================

/**
 * Left-rotate a 32-bit integer by `n` bits.
 */
function rol(n: number): (x: number) => number {
  return (x: number) => (x << n) | (x >>> (32 - n));
}

/**
 * Unsigned 32-bit integer addition with overflow.
 */
function add32(a: number, b: number): number {
  return (a + b) & 0xffffffff;
}

/**
 * Convert a string to a little-endian uint32 array (padded per MD5 spec).
 */
function stringToUint32Array(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i) & 0xff);
  }

  const bitLen = bytes.length * 8;
  // Append 0x80 (padding)
  bytes.push(0x80);
  // Pad with zeros until length % 64 === 56
  while (bytes.length % 64 !== 56) {
    bytes.push(0);
  }
  // Append original length in bits as 64-bit little-endian
  for (let i = 0; i < 8; i++) {
    bytes.push((bitLen >>> (i * 8)) & 0xff);
  }

  // Convert bytes to 32-bit words (little-endian)
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words.push(
      bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)
    );
  }
  return words;
}

/**
 * Convert a 128-bit MD5 digest (4x uint32) to a hex string.
 */
function digestToHex(digest: number[]): string {
  const hexChars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < digest.length; i++) {
    result += hexChars.charAt((digest[i] >>> 0) & 0x0f);
    result += hexChars.charAt((digest[i] >>> 4) & 0x0f);
    result += hexChars.charAt((digest[i] >>> 8) & 0x0f);
    result += hexChars.charAt((digest[i] >>> 12) & 0x0f);
    result += hexChars.charAt((digest[i] >>> 16) & 0x0f);
    result += hexChars.charAt((digest[i] >>> 20) & 0x0f);
    result += hexChars.charAt((digest[i] >>> 24) & 0x0f);
    result += hexChars.charAt((digest[i] >>> 28) & 0x0f);
  }
  return result;
}

/** Precomputed sine table for MD5 rounds */
const MD5_SIN_TABLE: number[] = (() => {
  const T: number[] = [];
  for (let i = 1; i <= 64; i++) {
    T[i] = (Math.floor(Math.abs(Math.sin(i)) * 4294967296)) >>> 0;
  }
  return T;
})();

/**
 * Pure JS MD5 hash returning a 32-character lowercase hex string.
 */
export function md5(input: string): string {
  const words = stringToUint32Array(input);
  const T = MD5_SIN_TABLE;

  // Initial hash values
  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  // F, G, H, I auxiliary functions
  const F = (x: number, y: number, z: number): number => (x & y) | (~x & z);
  const G = (x: number, y: number, z: number): number => (x & z) | (y & ~z);
  const H = (x: number, y: number, z: number): number => x ^ y ^ z;
  const I = (x: number, y: number, z: number): number => y ^ (x | ~z);

  const FF = (aa: number, bb: number, cc: number, dd: number, x: number, s: number, t: number): number =>
    (bb + rol(s)(add32(add32(aa, F(bb, cc, dd)), add32(x, t)))) >>> 0;

  const GG = (aa: number, bb: number, cc: number, dd: number, x: number, s: number, t: number): number =>
    (bb + rol(s)(add32(add32(aa, G(bb, cc, dd)), add32(x, t)))) >>> 0;

  const HH = (aa: number, bb: number, cc: number, dd: number, x: number, s: number, t: number): number =>
    (bb + rol(s)(add32(add32(aa, H(bb, cc, dd)), add32(x, t)))) >>> 0;

  const II = (aa: number, bb: number, cc: number, dd: number, x: number, s: number, t: number): number =>
    (bb + rol(s)(add32(add32(aa, I(bb, cc, dd)), add32(x, t)))) >>> 0;

  // Process each 512-bit block (16 words)
  for (let k = 0; k < words.length; k += 16) {
    let A = a, B = b, C = c, D = d;

    // Round 1
    A = FF(A, B, C, D, words[k + 0], 7, T[1]);
    D = FF(D, A, B, C, words[k + 1], 12, T[2]);
    C = FF(C, D, A, B, words[k + 2], 17, T[3]);
    B = FF(B, C, D, A, words[k + 3], 22, T[4]);
    A = FF(A, B, C, D, words[k + 4], 7, T[5]);
    D = FF(D, A, B, C, words[k + 5], 12, T[6]);
    C = FF(C, D, A, B, words[k + 6], 17, T[7]);
    B = FF(B, C, D, A, words[k + 7], 22, T[8]);
    A = FF(A, B, C, D, words[k + 8], 7, T[9]);
    D = FF(D, A, B, C, words[k + 9], 12, T[10]);
    C = FF(C, D, A, B, words[k + 10], 17, T[11]);
    B = FF(B, C, D, A, words[k + 11], 22, T[12]);
    A = FF(A, B, C, D, words[k + 12], 7, T[13]);
    D = FF(D, A, B, C, words[k + 13], 12, T[14]);
    C = FF(C, D, A, B, words[k + 14], 17, T[15]);
    B = FF(B, C, D, A, words[k + 15], 22, T[16]);

    // Round 2
    A = GG(A, B, C, D, words[k + 1], 5, T[17]);
    D = GG(D, A, B, C, words[k + 6], 9, T[18]);
    C = GG(C, D, A, B, words[k + 11], 14, T[19]);
    B = GG(B, C, D, A, words[k + 0], 20, T[20]);
    A = GG(A, B, C, D, words[k + 5], 5, T[21]);
    D = GG(D, A, B, C, words[k + 10], 9, T[22]);
    C = GG(C, D, A, B, words[k + 15], 14, T[23]);
    B = GG(B, C, D, A, words[k + 4], 20, T[24]);
    A = GG(A, B, C, D, words[k + 9], 5, T[25]);
    D = GG(D, A, B, C, words[k + 14], 9, T[26]);
    C = GG(C, D, A, B, words[k + 3], 14, T[27]);
    B = GG(B, C, D, A, words[k + 8], 20, T[28]);
    A = GG(A, B, C, D, words[k + 13], 5, T[29]);
    D = GG(D, A, B, C, words[k + 2], 9, T[30]);
    C = GG(C, D, A, B, words[k + 7], 14, T[31]);
    B = GG(B, C, D, A, words[k + 12], 20, T[32]);

    // Round 3
    A = HH(A, B, C, D, words[k + 5], 4, T[33]);
    D = HH(D, A, B, C, words[k + 8], 11, T[34]);
    C = HH(C, D, A, B, words[k + 11], 16, T[35]);
    B = HH(B, C, D, A, words[k + 1], 23, T[36]);
    A = HH(A, B, C, D, words[k + 14], 4, T[37]);
    D = HH(D, A, B, C, words[k + 4], 11, T[38]);
    C = HH(C, D, A, B, words[k + 7], 16, T[39]);
    B = HH(B, C, D, A, words[k + 0], 23, T[40]);
    A = HH(A, B, C, D, words[k + 12], 4, T[41]);
    D = HH(D, A, B, C, words[k + 15], 11, T[42]);
    C = HH(C, D, A, B, words[k + 2], 16, T[43]);
    B = HH(B, C, D, A, words[k + 9], 23, T[44]);
    A = HH(A, B, C, D, words[k + 13], 4, T[45]);
    D = HH(D, A, B, C, words[k + 7], 11, T[46]);
    C = HH(C, D, A, B, words[k + 6], 16, T[47]);
    B = HH(B, C, D, A, words[k + 3], 23, T[48]);

    // Round 4
    A = II(A, B, C, D, words[k + 0], 6, T[49]);
    D = II(D, A, B, C, words[k + 7], 10, T[50]);
    C = II(C, D, A, B, words[k + 14], 15, T[51]);
    B = II(B, C, D, A, words[k + 5], 21, T[52]);
    A = II(A, B, C, D, words[k + 12], 6, T[53]);
    D = II(D, A, B, C, words[k + 3], 10, T[54]);
    C = II(C, D, A, B, words[k + 10], 15, T[55]);
    B = II(B, C, D, A, words[k + 1], 21, T[56]);
    A = II(A, B, C, D, words[k + 8], 6, T[57]);
    D = II(D, A, B, C, words[k + 15], 10, T[58]);
    C = II(C, D, A, B, words[k + 6], 15, T[59]);
    B = II(B, C, D, A, words[k + 13], 21, T[60]);
    A = II(A, B, C, D, words[k + 4], 6, T[61]);
    D = II(D, A, B, C, words[k + 11], 10, T[62]);
    C = II(C, D, A, B, words[k + 2], 15, T[63]);
    B = II(B, C, D, A, words[k + 9], 21, T[64]);

    a = add32(a, A);
    b = add32(b, B);
    c = add32(c, C);
    d = add32(d, D);
  }

  return digestToHex([a, b, c, d]);
}

// ============================================================
// Tieba Request Signing
// ============================================================

/**
 * Sort parameter keys alphabetically and return key=value pairs as a string.
 * Follows the Baidu Tieba client's SortAndSignInterceptor behavior.
 *
 * @param params - The request parameters (query or body) to sign.
 * @param secret - The secret key to append before hashing.
 * @returns The MD5 sign hex string (lowercase, 32 chars).
 */
export function signParams(
  params: Record<string, string | number | boolean | undefined>,
  secret: string = SIGN_SECRET
): string {
  // Filter out undefined values and convert all to strings
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      entries.push([key, String(value)]);
    }
  }

  // Sort alphabetically by key
  entries.sort(([a], [b]) => a.localeCompare(b));

  // Build query string: key1=value1&key2=value2...
  const queryString = entries.map(([k, v]) => `${k}=${v}`).join('&');

  // Append secret and hash
  const signInput = queryString + secret;

  return md5(signInput).toLowerCase();
}

/**
 * Generate the sign parameter for a set of request params
 * and return the sign key-value pair to append.
 *
 * @param params - Request parameters to sign.
 * @param secret - Optional override secret key.
 * @returns An object { sign: '...' } ready to be merged into query params.
 */
export function generateSign(
  params: Record<string, string | number | boolean | undefined>,
  secret?: string
): { sign: string } {
  return { sign: signParams(params, secret) };
}

/**
 * Sort and sign an explicit field list without a separator between pairs.
 * Mirrors Kotlin MyMultipartBody's SortAndSignInterceptor behavior.
 */
export function signFields(
  fields: [string, string][],
  secret: string = SIGN_SECRET,
): string {
  const sorted = [...fields].sort(([a], [b]) => a.localeCompare(b));
  const raw = sorted.map(([k, v]) => `${k}=${v}`).join('');
  return md5(raw + secret).toLowerCase();
}
