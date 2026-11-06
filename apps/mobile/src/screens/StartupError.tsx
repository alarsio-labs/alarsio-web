// What a user sees when the app cannot start: plain words and a way to reach
// us. The raw error sits behind "Show details" so support can ask for it.

import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
} from '../config/support';
import { colors, primaryTarget, radius, space, type } from '../theme';

export function StartupError({ detail }: { detail: string }) {
  const [showDetails, setShowDetails] = useState(false);
  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

  return (
    <ScrollView contentContainerStyle={styles.box}>
      <Text style={styles.text}>
        {`The app could not start. Close it and open it again. If this keeps happening, contact support: ${SUPPORT_EMAIL} or WhatsApp ${SUPPORT_WHATSAPP_DISPLAY}.`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Email support"
        onPress={() => open(`mailto:${SUPPORT_EMAIL}`)}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Email support</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="WhatsApp support"
        onPress={() => open(SUPPORT_WHATSAPP_URL)}
        style={styles.button}
      >
        <Text style={styles.buttonText}>WhatsApp support</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={showDetails ? 'Hide details' : 'Show details'}
        onPress={() => setShowDetails((v) => !v)}
        style={styles.link}
      >
        <Text style={styles.linkText}>{showDetails ? 'Hide details' : 'Show details'}</Text>
      </Pressable>
      {showDetails && (
        <View>
          <Text selectable style={styles.detail}>
            {detail}
          </Text>
          {__DEV__ && (
            <Text style={styles.detail}>Developers: add missing settings to apps/mobile/.env.local and restart Expo.</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  box: { padding: space.xl, gap: space.md, alignItems: 'stretch', justifyContent: 'center', flexGrow: 1 },
  text: { fontSize: type.body, color: colors.ink },
  button: {
    minHeight: primaryTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonText: { color: colors.white, fontSize: type.body },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.ink, fontSize: type.small, textDecorationLine: 'underline' },
  detail: { fontSize: type.small, color: colors.muted },
});
