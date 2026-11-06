// Who is signed in, and sign-out, in the screen header (which handles the
// status bar and notch). Owner: Identity (Ishant). Issue #56.
// Sign-out warns about unsent records but never blocks (ADR-020).

import { useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SignedInUser } from '../auth/auth-client';
import { signOutWarning, type UnsentCounts } from '../auth/sign-out-warning';
import { colors } from '../theme';

export interface AccountMenuProps {
  user: SignedInUser;
  /** This user's unsent records, split by whether they will resend. */
  unsentCounts: (userId: string) => Promise<UnsentCounts>;
  signOut: () => Promise<void>;
  /** Opens Help and about. Absent where the screen has no router (the "use the web" screen). */
  onOpenAbout?: () => void;
}

/** Sign-out with the unsent-records warning; never blocks (ADR-020). Shared by the header and the About screen. */
export function useSignOutFlow({ user, unsentCounts, signOut }: AccountMenuProps): () => Promise<void> {
  const busy = useRef(false);

  const doSignOut = async () => {
    try {
      await signOut();
    } catch {
      Alert.alert('Sign out failed', 'Close the app and open it again, then try once more.');
    } finally {
      busy.current = false;
    }
  };

  return async () => {
    if (busy.current) return;
    busy.current = true;
    const counts = await unsentCounts(user.id).catch(() => null);
    const warning = signOutWarning(counts);
    if (!warning) {
      await doSignOut();
      return;
    }
    Alert.alert('Sign out?', warning, [
      { text: 'Stay signed in', style: 'cancel', onPress: () => { busy.current = false; } },
      { text: 'Sign out', style: 'destructive', onPress: () => void doSignOut() },
    ]);
  };
}

export function AccountMenu({ user, unsentCounts, signOut, onOpenAbout }: AccountMenuProps) {
  const onSignOut = useSignOutFlow({ user, unsentCounts, signOut });

  return (
    <View style={styles.row}>
      <Text style={styles.email} numberOfLines={1}>
        {user.email}
      </Text>
      {onOpenAbout && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Help and about"
          hitSlop={8}
          onPress={onOpenAbout}
          style={styles.target}
        >
          <Text style={styles.link}>Help</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sign out ${user.email}`}
        hitSlop={12}
        onPress={() => void onSignOut()}
        style={styles.target}
      >
        <Text style={styles.link}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 300 },
  email: { flexShrink: 1, color: colors.muted, fontSize: 13 },
  target: { minHeight: 44, minWidth: 44, justifyContent: 'center' },
  link: { color: colors.ink, fontSize: 15, textDecorationLine: 'underline' },
});
