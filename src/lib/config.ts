// Set EXPO_PUBLIC_API_URL to the deployed server. Unset = offline demo mode (canned conversation with real voices).
const real = (v?: string) => (v && !v.includes('REPLACE') ? v : '');
export const API_URL: string = real(process.env.EXPO_PUBLIC_API_URL);
export const OFFLINE = !API_URL;

// Revenue and analytics. Both are optional: without keys the app runs, purchases unlock locally in dev builds only,
// and analytics are a no-op. Set these in eas.json (production) or a local .env (development).
export const RC_IOS_KEY: string = real(process.env.EXPO_PUBLIC_RC_IOS_KEY);
export const POSTHOG_KEY: string = real(process.env.EXPO_PUBLIC_POSTHOG_KEY);
export const POSTHOG_HOST: string = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
// Phone test builds (npm run phone) unlock tiers locally. Never applies once a RevenueCat key is set, so store builds can't.
export const TEST_UNLOCK: boolean = process.env.EXPO_PUBLIC_TEST_UNLOCK === '1' && !RC_IOS_KEY;
export const LEGAL_URL: string = process.env.EXPO_PUBLIC_LEGAL_URL ?? (API_URL ? API_URL : 'https://kleos.app');
