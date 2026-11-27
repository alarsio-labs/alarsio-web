// What a user sees when the app cannot start: plain words and a way to reach
// us. The raw error sits behind "Show details" so support can ask for it.

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import {
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
} from '../config/support';
import { colors, space } from '../theme';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';

export function StartupError({ detail, onRetry }: { detail: string; onRetry?: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const [showDetails, setShowDetails] = useState(false);
  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);
  const what = onRetry ? t('startup.wentWrong') : t('startup.couldNotStart');
  const contact = t('startup.contact', { email: SUPPORT_EMAIL, whatsapp: SUPPORT_WHATSAPP_DISPLAY });

  return (
    <ScrollView contentContainerStyle={styles.box}>
      <Text>{`${what} ${contact}`}</Text>
      {onRetry && (
        <Button label={t('common.retry')} onPress={() => void Promise.resolve(onRetry()).catch(() => undefined)} />
      )}
      <Button kind="secondary" label={t('startup.emailSupport')} onPress={() => open(`mailto:${SUPPORT_EMAIL}`)} />
      <Button kind="secondary" label={t('startup.whatsappSupport')} onPress={() => open(SUPPORT_WHATSAPP_URL)} />
      <Button
        kind="ghost"
        label={showDetails ? t('startup.hideDetails') : t('startup.showDetails')}
        onPress={() => setShowDetails((v) => !v)}
      />
      {showDetails && (
        <View style={styles.details}>
          <Text variant="small" color={colors.muted} selectable>
            {detail}
          </Text>
          {__DEV__ && (
            <Text variant="small" color={colors.muted}>
              {t('startup.developers')}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { padding: space.xl, gap: space.md, alignItems: 'stretch', justifyContent: 'center', flexGrow: 1, backgroundColor: colors.ground },
  details: { gap: space.sm },
});
