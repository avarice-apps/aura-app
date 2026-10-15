// Set EXPO_PUBLIC_API_URL to the deployed server. Unset = offline demo mode (canned conversation with real voices).
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? '';
export const OFFLINE = !API_URL;

// Revenue and analytics. Both are optional: without keys the app runs, purchases unlock locally in dev builds only,
// and analytics are a no-op. Set these in eas.json (production) or a local .env (development).
export const RC_IOS_KEY: string = process.env.EXPO_PUBLIC_RC_IOS_KEY ?? '';
export const POSTHOG_KEY: string = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
export const POSTHOG_HOST: string = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';
export const LEGAL_URL: string = process.env.EXPO_PUBLIC_LEGAL_URL ?? (API_URL ? API_URL : 'https://kleos.app');
