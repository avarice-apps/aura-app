import { Redirect } from 'expo-router';

/** Folded into the four tabs (Today · Play · Poise · You). Kept so old links and notifications still land. */
export default function Moved() {
  return <Redirect href="/(tabs)/you" />;
}
