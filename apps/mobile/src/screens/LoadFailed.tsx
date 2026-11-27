// What a screen shows when it cannot read the phone's own records: the fixed sentence the
// screen always showed (never the error's text, ADR-029), and a way out. Before this, each
// "Could not read…" was a dead end until the app was closed (phone review, 12 Nov 2026).

import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { colors, space, tone } from '../theme';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';

export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Text color={tone.attention.text}>{message}</Text>
      <Button kind="secondary" label={t('common.retry')} onPress={onRetry} style={styles.button} />
      <Text variant="small" color={colors.muted}>
        {t('common.loadFailedHint')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.md, paddingVertical: space.sm },
  button: { alignSelf: 'flex-start' },
});
