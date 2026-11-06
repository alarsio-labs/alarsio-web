import { StyleSheet, Text } from 'react-native';

import { colors, fonts } from '../theme';

/** "ALARSIO" with "SIO" in red, as on alarsio.com. One word to a screen reader. */
export function Wordmark({ size = 28, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <Text accessibilityLabel="Alarsio" style={[styles.mark, { fontSize: size, color: onDark ? colors.cream : colors.ink }]}>
      ALAR<Text style={styles.red}>SIO</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  mark: { fontFamily: fonts.display, letterSpacing: -0.5 },
  red: { color: colors.red },
});
