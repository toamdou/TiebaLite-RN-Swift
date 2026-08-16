import { apiGet, apiPost } from '../client';
import { setAuthCredentials } from '../interceptors';
import { assertProtoSuccess, extractData, type TiebaRes } from './helpers';
import { protoGetUserInfo } from '../protoClient';
import { setTbs } from '../authState';
import type { Account, UserInfo } from '@/types';
// ============================================================
// Auth — 对齐 Kotlin OfficialTiebaApi (POST, form-encoded)
// ============================================================
// Kotlin:
//   loginFlow:    POST /c/s/login           (force_login, COOKIE: ka=open)
//   initNickName: POST /c/s/initNickname    (COOKIE: ka=open, NO_COMMON_PARAMS: BDUSS)
//   getUserInfo:  POST /c/u/user/getuserinfo?cmd=303024 (protobuf, v12)
//   tbs:          仿 aiotieba client.__login — 用 BDUSS 调 /c/s/login 解析 anti.tbs

export async function login(bduss: string, sToken: string): Promise<Account> {
  setAuthCredentials(bduss, sToken);
  // Kotlin: bdusstoken = "${AccountUtil.getBduss()!!}|null" → "actual_bduss|null"
  const response = await apiPost<TiebaRes<Account>>('/c/s/login', {
    bdusstoken: `${bduss}|null`,
    stoken: sToken,
    user_id: '',
    channel_id: '',
    channel_uid: '',
    authsid: 'null',
  });
  const data = extractData(response).data;
  // 登录响应即含 anti.tbs（对齐 aiotieba login.parse_body），立即写入持久化；
  // 若无 tbs 再补一次 fetchTbs 兜底。
  const antiTbs = String((response.data as any)?.anti?.tbs ?? '');
  if (antiTbs) {
    setTbs(antiTbs);
  } else {
    await fetchTbs().catch((e) => {
      if (__DEV__) console.warn('[login] fetchTbs failed:', e);
    });
  }
  return data;
}

/**
 * 用当前 BDUSS 调 /c/s/login 获取 anti.tbs，并写入持久化存储。
 * 对齐 aiotieba api/login/_api.py：body = [(_client_version, LATEST_VERSION), (bdusstoken, BDUSS)]。
 */
export async function fetchTbs(): Promise<string> {
  const { getBduss } = await import('../authState');
  const bduss = getBduss();
  if (!bduss) return '';
  const res = await apiPost<any>('/c/s/login', {
    bdusstoken: `${bduss}|null`,
    _client_version: (await import('../config')).CLIENT_VERSION_V12,
    stoken: (await import('./helpers')).getStoken(),
  });
  const body = res.data ?? {};
  const tbs = String(body?.anti?.tbs ?? body?.anti?.['tbs'] ?? '');
  if (tbs) {
    setTbs(tbs);
  } else if (__DEV__) {
    console.warn('[fetchTbs] 响应中无 anti.tbs:', body);
  }
  return tbs;
}

/** 确保写操作前持有有效 tbs；缺省时自动获取一次，仍无则抛错。 */
export async function ensureTbs(): Promise<string> {
  const { getTbsSync } = await import('@/services/storage/AuthSQLiteStorage');
  const current = getTbsSync() || '';
  if (current) return current;
  const tbs = await fetchTbs();
  if (!tbs) {
    const { TiebaApiError } = await import('../interceptors');
    throw new TiebaApiError('缺少 tbs，无法执行此操作，请重新登录', 400, 400);
  }
  return tbs;
}

/** 续期：每次写操作前校验 tbs 是否仍有效（空则重新获取）。 */
export async function refreshTbsIfNeeded(): Promise<string> {
  const { getTbsSync } = await import('@/services/storage/AuthSQLiteStorage');
  const current = getTbsSync() || '';
  if (current) return current;
  return fetchTbs();
}

export async function initNickname(bduss: string, sToken: string): Promise<string> {
  setAuthCredentials(bduss, sToken);
  const response = await apiPost<TiebaRes<{ name: string; name_show: string }>>('/c/s/initNickname', {
    BDUSS: bduss,
    stoken: sToken,
  });
  const data = extractData(response).data;
  return data.name_show ?? data.name;
}

export async function getUserInfo(): Promise<UserInfo> {
  try {
    const decoded = await protoGetUserInfo({ uid: 0 });
    assertProtoSuccess(decoded);
    return (decoded.data?.user ?? {}) as unknown as UserInfo;
  } catch (e) {
    // Fallback to legacy JSON API
    if (__DEV__) console.warn('[getUserInfo] proto failed, fallback:', e);
    const response = await apiGet<TiebaRes<UserInfo>>('/c/s/u', { cmd: 'newuserinfo' });
    return extractData(response).data;
  }
}


