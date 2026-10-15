import Constants from 'expo-constants';

// Set in app.json "extra" or EAS env. Empty string = offline dev mode with sample verdicts.
export const API_URL: string = (Constants.expoConfig?.extra?.apiUrl as string) ?? process.env.EXPO_PUBLIC_API_URL ?? '';
export const SUPABASE_URL: string = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
export const OFFLINE = !API_URL;
