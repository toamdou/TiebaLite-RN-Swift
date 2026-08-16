/**
 * User Forums Page - Redirects to user profile (forums tab).
 * The user profile page handles posts/replies/forums via SegmentedControl tabs.
 */

import { Redirect, useLocalSearchParams } from 'expo-router';

export default function UserForumsPage() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  return <Redirect href={{ pathname: '/user/[uid]', params: { uid } }} />;
}
