// The More tab: help and about, the language switch, how to reach us, the privacy
// policy, the app version, and sign out. Owner: Identity (Ishant).

import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import {
  PRIVACY_URL,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
} from '../config/support';
import type { Language } from '../i18n';
import { colors, space } from '../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Screen } from '../ui/Screen';
import { Text } from '../ui/Text';
import { useSignOutFlow, type AccountMenuProps } from './AccountMenu';

export interface AboutScreenProps extends AccountMenuProps {
  appVersion: string;
  /** Opens the tutorial again ("How Alarsio works"). Without it, the link is not shown. */
  onOpenTutorial?: () => void;
  /** Saves the language choice. Without it, the switch is not shown. */
  onChangeLanguage?: (language: Language) => void;
}

const LANGUAGES: Language[] = ['en', 'hi'];

export function AboutScreen({ appVersion, user, unsentCounts, signOut, onOpenTutorial, onChangeLanguage }: AboutScreenProps) {
  const { t, i18n } = useTranslation();
  const onSignOut = useSignOutFlow({ user, unsentCounts, signOut });
  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

  return (
    <Screen>
      <Card>
        <Text variant="heading" bold accessibilityRole="header">
          {t('about.title')}
        </Text>
        <Text>{t('about.needHelp', { email: SUPPORT_EMAIL, whatsapp: SUPPORT_WHATSAPP_DISPLAY })}</Text>
        <Button kind="secondary" label={t('startup.emailSupport')} onPress={() => open(`mailto:${SUPPORT_EMAIL}`)} />
        <Button kind="secondary" label={t('startup.whatsappSupport')} onPress={() => open(SUPPORT_WHATSAPP_URL)} />
        {onOpenTutorial && <Button kind="ghost" label={t('about.howItWorks')} onPress={onOpenTutorial} />}
        <Button kind="ghost" accessibilityRole="link" label={t('about.privacy')} onPress={() => open(PRIVACY_URL)} />
      </Card>

      {onChangeLanguage && (
        <Card>
          <Text bold accessibilityRole="header">
            {t('language.title')}
          </Text>
          <View style={styles.languages}>
            {LANGUAGES.map((code) => (
              <Button
                key={code}
                kind={i18n.language === code ? 'primary' : 'secondary'}
                label={t(`language.${code}`)}
                onPress={() => onChangeLanguage(code)}
                style={styles.language}
              />
            ))}
          </View>
        </Card>
      )}

      <Text variant="small" color={colors.muted}>{t('about.version', { version: appVersion })}</Text>
      <Text variant="small" color={colors.muted}>{t('about.signedInAs', { email: user.email })}</Text>
      <Button kind="secondary" label={t('common.signOut')} onPress={() => void onSignOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  languages: { flexDirection: 'row', gap: space.sm },
  language: { flex: 1 },
});
