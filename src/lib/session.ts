import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_URL, OFFLINE, TEST_UNLOCK } from './config';
import { useStore, type Account } from '@/state/store';

/**
 * Who this phone is to the server.
 *
 * On first launch the app quietly creates a guest account and keeps its token in the keychain (it survives a
 * reinstall on iOS). Every request carries it. Saving the account (Apple or an emailed code) attaches an identity
 * to the same account, so the plan, the allowance and the register number follow the person to a new phone and to
 * joinkleos.com. Nothing here is shown to the user unless they open Account.
 */

const KEY = 'kleos.token.v1';
let token: string | null = null;
let pending: Promise<string | null> | null = null;

async function readToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function writeToken(v: string | null) {
  try {
    if (Platform.OS === 'web') {
      if (v) globalThis.localStorage?.setItem(KEY, v);
      else globalThis.localStorage?.removeItem(KEY);
      return;
    }
    if (v) await SecureStore.setItemAsync(KEY, v, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
    else await SecureStore.deleteItemAsync(KEY);
  } catch {}
}

export function applyAccount(a: Account | null | undefined) {
  if (!a) return;
  const st = useStore.getState();
  const u = st.usage ?? { calls: 0, clips: 0, poise: 0, profiles: 0, fits: 0 };
  // From now on, the server's numbers are the base; only uses after this moment are subtracted locally.
  const rank = { free: 0, plus: 1, black: 2 } as const;
  // Phone test builds unlock plans on the phone; keep that unless the server knows of a higher one.
  const plan = TEST_UNLOCK && rank[st.plan] > rank[a.plan] ? st.plan : a.plan;
  const patch: Partial<ReturnType<typeof useStore.getState>> = { account: a, plan, lastSync: { calls: u.calls ?? 0, clips: u.clips ?? 0, poise: u.poise ?? 0, profiles: u.profiles ?? 0, fits: u.fits ?? 0 } };
  if (a.name && !st.name) patch.name = a.name;
  st.set(patch);
}

async function createGuest(): Promise<string | null> {
  try {
    const r = await fetch(`${API_URL}/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subject: useStore.getState().subjectId }) });
    if (!r.ok) return null;
    const j = await r.json();
    await writeToken(j.token);
    applyAccount(j.account);
    return j.token as string;
  } catch {
    return null;
  }
}

/** The token, creating a guest account the first time. Null offline or if the server can't be reached. */
export async function getToken(): Promise<string | null> {
  if (OFFLINE) return null;
  if (token) return token;
  if (!pending) {
    pending = (async () => {
      token = (await readToken()) ?? (await createGuest());
      return token;
    })().finally(() => {
      pending = null;
    });
  }
  return pending;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const t = await getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** The server no longer knows this token (account deleted, or the server lost its data): start a fresh guest. */
export async function dropToken() {
  token = null;
  await writeToken(null);
}

/** After a sign-in: this phone now speaks as that account. */
export async function adopt(newToken: string, a: Account) {
  token = newToken;
  await writeToken(newToken);
  applyAccount(a);
}

/** The account as the server sees it (plan, allowance left, saved identity, register number). */
export async function refreshAccount(refresh = false): Promise<Account | null> {
  if (OFFLINE) return null;
  try {
    const h = await authHeaders();
    let r = await fetch(`${API_URL}/account${refresh ? '?refresh=1' : ''}`, { headers: h });
    if (r.status === 401) {
      await dropToken();
      r = await fetch(`${API_URL}/account`, { headers: await authHeaders() });
    }
    if (!r.ok) return null;
    const a = (await r.json()) as Account;
    applyAccount(a);
    return a;
  } catch {
    return null;
  }
}

export async function signOut() {
  try {
    await fetch(`${API_URL}/auth/logout`, { method: 'POST', headers: await authHeaders() });
  } catch {}
  await dropToken();
  useStore.getState().set({ account: undefined, plan: 'free' });
  await getToken(); // a fresh guest, so the app keeps working
}
