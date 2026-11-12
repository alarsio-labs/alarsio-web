// What a screen shows when it cannot read the phone's own records: the fixed sentence the
// screen always showed (never the error's text, ADR-029), and a way out. Before this, each
// "Could not read…" was a dead end until the app was closed (phone review, 12 Nov 2026).

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, primaryTarget, radius, space, type } from '../theme';

export function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Text style={styles.error}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      <Text style={styles.hint}>If it keeps happening, close the app and open it again. Nothing you saved is lost.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.md, paddingVertical: space.sm },
  error: { fontSize: type.body, color: colors.redDeep },
  button: {
    minHeight: primaryTarget,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
  },
  pressed: { opacity: 0.8 },
  buttonText: { color: colors.white, fontSize: type.body, fontWeight: '600' },
  hint: { fontSize: type.small, color: colors.muted },
});
