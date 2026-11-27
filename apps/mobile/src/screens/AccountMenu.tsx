// Who is signed in, and sign-out. Owner: Identity (Ishant). Issue #56.
// Sign-out warns about unsent records but never blocks (ADR-020).

import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import type { SignedInUser } from '../auth/auth-client';
import { signOutWarning, type UnsentCounts } from '../auth/sign-out-warning';
import { colors, space } from '../theme';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';

export interface AccountMenuProps {
  user: SignedInUser;
  /** This user's unsent records, split by whether they will resend. */
  unsentCounts: (userId: string) => Promise<UnsentCounts>;
  signOut: () => Promise<void>;
}

/** Sign-out with the unsent-records warning; never blocks (ADR-020). Shared by this menu and the More tab. */
export function useSignOutFlow({ user, unsentCounts, signOut }: AccountMenuProps): () => Promise<void> {
  const { t } = useTranslation();
  const busy = useRef(false);

  const doSignOut = async () => {
    try {
      await signOut();
    } catch {
      Alert.alert(t('account.failedTitle'), t('account.failedBody'));
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
    Alert.alert(t('account.confirmTitle'), warning, [
      { text: t('account.stay'), style: 'cancel', onPress: () => { busy.current = false; } },
      { text: t('common.signOut'), style: 'destructive', onPress: () => void doSignOut() },
    ]);
  };
}

export function AccountMenu({ user, unsentCounts, signOut }: AccountMenuProps) {
  const { t } = useTranslation();
  const onSignOut = useSignOutFlow({ user, unsentCounts, signOut });

  return (
    <View style={styles.row}>
      <Text variant="small" color={colors.muted} numberOfLines={1} style={styles.email}>
        {user.email}
      </Text>
      <Button
        kind="secondary"
        label={t('common.signOut')}
        accessibilityLabel={t('account.signOutLabel', { email: user.email })}
        onPress={() => void onSignOut()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.sm },
  email: { flexShrink: 1 },
});
