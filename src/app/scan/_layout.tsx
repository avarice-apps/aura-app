import { Stack } from 'expo-router';
import { useTheme } from '@/theme';

export default function ScanLayout() {
  const t = useTheme();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'fade' }} />;
}
