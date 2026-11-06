// Shown to owners and accountants (and to accounts with no company yet): the
// phone is the site capture app; their work is on the web. Owner: Identity.

import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SignedInUser } from '../auth/auth-client';
import { WEB_URL } from '../config/support';
import { AccountMenu, type AccountMenuProps } from './AccountMenu';
import { colors, primaryTarget, space, type } from '../theme';

export interface UseWebScreenProps {
  kind: 'web' | 'none';
  user: SignedInUser;
  unsentCounts: AccountMenuProps['unsentCounts'];
  signOut: AccountMenuProps['signOut'];
}

export function UseWebScreen({ kind, user, unsentCounts, signOut }: UseWebScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Alarsio
      </Text>
      {kind === 'web' ? (
        <>
          <Text style={styles.text}>Approvals, wages and the overview are on the web at alarsio.com.</Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open alarsio.com"
            onPress={() => void Linking.openURL(WEB_URL).catch(() => undefined)}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Open alarsio.com</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.text}>Your account is not part of a company yet. Ask your manager for an invite link.</Text>
      )}
      <View style={styles.signOut}>
        <AccountMenu user={user} unsentCounts={unsentCounts} signOut={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center', padding: space.xl, gap: space.lg },
  title: { fontSize: type.title, fontWeight: '600', color: colors.ink },
  text: { fontSize: type.body, color: colors.ink },
  button: {
    minHeight: primaryTarget,
    borderRadius: 8,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.white, fontSize: type.body },
  signOut: { alignItems: 'flex-start' },
});
