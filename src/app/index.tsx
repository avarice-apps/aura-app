import { Redirect } from 'expo-router';
import { useStore } from '@/state/store';

export default function Index() {
  const onboarded = useStore((s) => s.onboarded);
  const hasVerdict = useStore((s) => s.verdicts.length > 0);
  if (!onboarded) return <Redirect href="/onboarding" />;
  if (!hasVerdict) return <Redirect href="/read" />;
  return <Redirect href="/(tabs)" />;
}
