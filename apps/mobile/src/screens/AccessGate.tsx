// Decides, once the user is signed in, whether they get the capture app (the
// children) or the "use alarsio.com" screen. Reads the cached answer first, so
// it never waits on the network to open the capture app (ADR-020).

import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { SignedInUser } from '../auth/auth-client';
import type { AccessStore, CaptureAccess } from '../auth/role';
import { useCaptureAccess } from '../auth/use-capture-access';
import { colors } from '../theme';
import type { AccountMenuProps } from './AccountMenu';
import { UseWebScreen } from './UseWebScreen';

export interface AccessGateProps {
  user: SignedInUser;
  fetchAccess: (userId: string) => Promise<CaptureAccess>;
  store: AccessStore;
  unsentCounts: AccountMenuProps['unsentCounts'];
  signOut: AccountMenuProps['signOut'];
  children: ReactNode;
}

export function AccessGate({ user, fetchAccess, store, unsentCounts, signOut, children }: AccessGateProps) {
  const access = useCaptureAccess(user.id, fetchAccess, store);

  if (access === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
        <ActivityIndicator accessibilityLabel="Loading" />
      </View>
    );
  }
  if (access === 'capture') return <>{children}</>;
  return <UseWebScreen kind={access} user={user} unsentCounts={unsentCounts} signOut={signOut} />;
}
