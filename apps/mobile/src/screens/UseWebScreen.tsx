// Shown to owners and accountants (and to accounts with no company yet): the
// phone is the site capture app; their work is on the web. Owner: Identity.

import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import type { SignedInUser } from '../auth/auth-client';
import { WEB_URL } from '../config/support';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { ScreenHeader } from '../ui/ScreenHeader';
import { Text } from '../ui/Text';
import { colors } from '../theme';
import { AccountMenu, type AccountMenuProps } from './AccountMenu';

export interface UseWebScreenProps {
  kind: 'web' | 'none';
  user: SignedInUser;
  unsentCounts: AccountMenuProps['unsentCounts'];
  signOut: AccountMenuProps['signOut'];
}

export function UseWebScreen({ kind, user, unsentCounts, signOut }: UseWebScreenProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.fill}>
      <ScreenHeader title="Alarsio" />
      <Screen>
        <Card>
          <Text>{kind === 'web' ? t('useWeb.onWeb') : t('useWeb.noCompany')}</Text>
          {kind === 'web' && (
            <Button
              accessibilityRole="link"
              label={t('useWeb.open')}
              onPress={() => void Linking.openURL(WEB_URL).catch(() => undefined)}
            />
          )}
        </Card>
        <AccountMenu user={user} unsentCounts={unsentCounts} signOut={signOut} />
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ground },
});
