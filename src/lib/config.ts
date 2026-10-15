// Set EXPO_PUBLIC_API_URL to the deployed server. Unset = offline demo mode (canned conversation with real voices).
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? '';
export const OFFLINE = !API_URL;
