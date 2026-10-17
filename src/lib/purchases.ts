import { Platform } from 'react-native';
import { useStore } from '@/state/store';
import { RC_IOS_KEY, TEST_UNLOCK } from './config';
import { track, setPlanProperty } from './analytics';
import type { Tier } from './plan';
import { refreshAccount } from './session';
import { devPlan } from './api';

/**
 * RevenueCat. Entitlements: "plus" and "black". Products (App Store Connect, one subscription group "Kleos"):
 *   kleos_plus_weekly   $6.99 / week, 3-day free trial
 *   kleos_plus_annual   $49.99 / year
 *   kleos_black_monthly $19.99 / month
 *   kleos_black_annual  $129.99 / year
 * All four go in the RevenueCat "default" offering.
 */
let Purchases: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Purchases = require('react-native-purchases').default;
} catch {}

let ready = false;

export type Product = { id: string; tier: Exclude<Tier, 'free'>; period: 'week' | 'month' | 'year'; price: string; perWeek?: string; trial?: string; pkg?: any };

// Shown when the store can't be reached (no key yet, Expo Go, offline). Prices match the plan above.
export const FALLBACK: Product[] = [
  { id: 'kleos_plus_weekly', tier: 'plus', period: 'week', price: '$6.99', trial: '3 days free' },
  { id: 'kleos_plus_annual', tier: 'plus', period: 'year', price: '$49.99', perWeek: '$0.96' },
  { id: 'kleos_black_monthly', tier: 'black', period: 'month', price: '$19.99' },
  { id: 'kleos_black_annual', tier: 'black', period: 'year', price: '$129.99', perWeek: '$2.50' },
];

export const purchasesLive = () => Boolean(Purchases && RC_IOS_KEY && Platform.OS === 'ios');

let userId = '';

function apply(info: any) {
  const a = info?.entitlements?.active ?? {};
  const plan: Tier = a.black ? 'black' : a.plus ? 'plus' : 'free';
  const before = useStore.getState().plan;
  useStore.getState().set({ plan });
  setPlanProperty(plan);
  // The server enforces plans; when the phone sees a change, ask it to check RevenueCat now instead of waiting
  // for the webhook.
  if (plan !== before) refreshAccount(true).catch(() => {});
}

/** RevenueCat's app user id is the Kleos account id, so a purchase belongs to the account, not the phone. */
export async function initPurchases(appUserId: string) {
  if (!purchasesLive() || !appUserId) return;
  try {
    if (!ready) {
      Purchases.configure({ apiKey: RC_IOS_KEY, appUserID: appUserId });
      ready = true;
      userId = appUserId;
      Purchases.addCustomerInfoUpdateListener(apply);
      apply(await Purchases.getCustomerInfo());
    } else if (appUserId !== userId) {
      // Signed in to a saved account on this phone: move RevenueCat to it.
      userId = appUserId;
      const r = await Purchases.logIn(appUserId);
      apply(r?.customerInfo);
    }
  } catch (e) {
    console.warn('RevenueCat init failed', e);
  }
}

export async function loadProducts(): Promise<Product[]> {
  if (!ready) return FALLBACK;
  try {
    const o = await Purchases.getOfferings();
    const pkgs: any[] = o?.current?.availablePackages ?? [];
    // Only promise a free trial to people Apple will actually give one to.
    let eligible: Record<string, any> = {};
    try {
      eligible = await Purchases.checkTrialOrIntroductoryPriceEligibility(pkgs.map((p) => p.product.identifier));
    } catch {}
    const ELIGIBLE = 2; // INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
    const out = FALLBACK.map((f) => {
      const pkg = pkgs.find((p) => p.product?.identifier === f.id);
      if (!pkg) return null;
      const prod = pkg.product;
      const intro = prod.introPrice;
      const canTrial = intro && intro.price === 0 && eligible[f.id]?.status === ELIGIBLE;
      const unit = String(intro?.periodUnit ?? '').toLowerCase();
      const trial = canTrial ? `${intro.periodNumberOfUnits} ${unit}${intro.periodNumberOfUnits > 1 ? 's' : ''} free` : undefined;
      let perWeek: string | undefined;
      if (f.period !== 'week' && typeof prod.price === 'number' && prod.currencyCode) {
        const weeks = f.period === 'year' ? 52 : 4.33;
        try {
          perWeek = new Intl.NumberFormat(undefined, { style: 'currency', currency: prod.currencyCode }).format(prod.price / weeks);
        } catch {}
      }
      return { ...f, price: prod.priceString, trial, perWeek, pkg } as Product;
    }).filter(Boolean) as Product[];
    return out.length ? out : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** Returns true when the purchase went through, false when the user cancelled. Throws on real errors. */
export async function buy(p: Product): Promise<boolean> {
  track('purchase_started', { product: p.id });
  if (!ready || !p.pkg) {
    if (__DEV__ || TEST_UNLOCK) {
      // Development and phone-test builds without RevenueCat: unlock locally so every screen can be tested,
      // and ask the server to match (it only does while its dev switch is on).
      useStore.getState().set({ plan: p.tier });
      await devPlan(p.tier);
      await refreshAccount().catch(() => null);
      if (useStore.getState().account && useStore.getState().plan !== p.tier) useStore.getState().set({ plan: p.tier });
      track('purchase_dev_unlock', { product: p.id });
      return true;
    }
    throw new Error('The App Store isn’t reachable right now. Try again in a minute.');
  }
  try {
    const r = await Purchases.purchasePackage(p.pkg);
    apply(r.customerInfo);
    await refreshAccount(true).catch(() => null);
    track('purchase_completed', { product: p.id });
    return true;
  } catch (e: any) {
    if (e?.userCancelled) {
      track('purchase_cancelled', { product: p.id });
      return false;
    }
    throw new Error(e?.message ?? 'The purchase didn’t go through.');
  }
}

export async function restore(): Promise<Tier> {
  if (!ready) return useStore.getState().plan;
  const info = await Purchases.restorePurchases();
  apply(info);
  await refreshAccount(true).catch(() => null);
  return useStore.getState().plan;
}
