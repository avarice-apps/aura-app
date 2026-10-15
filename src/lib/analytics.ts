import { POSTHOG_KEY, POSTHOG_HOST } from './config';

// PostHog, loaded lazily so Expo Go and key-less builds never touch it.
let ph: any = null;

export function initAnalytics(distinctId: string) {
  if (!POSTHOG_KEY || ph) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PostHog = require('posthog-react-native').default;
    ph = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, captureAppLifecycleEvents: true });
    ph.identify(distinctId);
  } catch {
    ph = null;
  }
}

/** Fire-and-forget event. Names are snake_case; keep properties small and never include what the user said. */
export function track(event: string, props?: Record<string, string | number | boolean | null | undefined>) {
  try {
    ph?.capture(event, props);
  } catch {}
}

export function screen(name: string) {
  try {
    ph?.screen(name);
  } catch {}
}

export function setPlanProperty(plan: string) {
  try {
    ph?.register({ plan });
  } catch {}
}
