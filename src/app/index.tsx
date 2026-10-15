import { Redirect } from 'expo-router';
import { useStore } from '@/state/store';

export default function Index() {
  const onboarded = useStore((s) => s.onboarded);
  return <Redirect href={onboarded ? '/(tabs)' : '/onboarding'} />;
}
