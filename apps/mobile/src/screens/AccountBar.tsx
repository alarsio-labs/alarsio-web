// Who is signed in, and sign-out. Owner: Identity (Ishant). Issue #14.
// Sign-out warns about unsent records but never blocks (ADR-020).

import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SignedInUser } from '../auth/auth-client';
import { signOutWarning } from '../auth/sign-out-warning';

export interface AccountBarProps {
  user: SignedInUser;
  /** This user's records the server has not accepted yet. */
  countUnsent: (userId: string) => Promise<number>;
  signOut: () => Promise<void>;
}

export function AccountBar({ user, countUnsent, signOut }: AccountBarProps) {
  const onSignOut = async () => {
    const unsent = await countUnsent(user.id).catch(() => 0);
    const warning = signOutWarning(unsent);
    if (!warning) {
      await signOut();
      return;
    }
    Alert.alert('Sign out?', warning, [
      { text: 'Stay signed in', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <View style={styles.bar}>
      <Text style={styles.email} numberOfLines={1}>
        {user.email}
      </Text>
      <Pressable accessibilityRole="button" onPress={onSignOut}>
        <Text style={styles.link}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
  },
  email: { flex: 1, color: '#333', fontSize: 14, marginRight: 12 },
  link: { color: '#111', fontSize: 14, textDecorationLine: 'underline' },
});
