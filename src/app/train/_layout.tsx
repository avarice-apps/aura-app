import { Stack } from 'expo-router';
import { color } from '@/theme/tokens';

export default function TrainLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ink }, animation: 'slide_from_bottom' }} />;
}
