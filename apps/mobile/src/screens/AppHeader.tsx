// The header of every signed-in screen: the slate bar, and under it the sync status line.
// Today leaves the line out because it shows the full sync panel itself.

import { router } from 'expo-router';

import { useSessionUser } from '../auth/session-user';
import { openAppDb } from '../lib/app-db';
import { SyncBar } from '../sync/SyncBar';
import { ScreenHeader } from '../ui/ScreenHeader';

export function AppHeader({ title, onBack, showSync = true }: { title: string; onBack?: () => void; showSync?: boolean }) {
  const user = useSessionUser();
  return (
    <ScreenHeader
      title={title}
      onBack={onBack}
      below={showSync && user ? <SyncBar openDb={openAppDb} userId={user.id} onOpen={() => router.navigate('/')} /> : undefined}
    />
  );
}
