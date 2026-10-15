import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

export default function ReadLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.cobalt }, animation: 'fade', animationDuration: 400, gestureEnabled: false }} />
  );
}
