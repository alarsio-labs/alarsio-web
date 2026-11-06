// Help and about: how to reach us, the privacy policy, the app version, and
// sign out. Owner: Identity (Ishant), added for the pilot polish.

import { Linking, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import {
  PRIVACY_URL,
  SUPPORT_EMAIL,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_URL,
} from '../config/support';
import { colors, minTarget, primaryTarget, space, type } from '../theme';
import { useSignOutFlow, type AccountMenuProps } from './AccountMenu';

export interface AboutScreenProps extends AccountMenuProps {
  appVersion: string;
}

export function AboutScreen({ appVersion, user, unsentCounts, signOut }: AboutScreenProps) {
  const onSignOut = useSignOutFlow({ user, unsentCounts, signOut });
  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Help and about
      </Text>
      <Text style={styles.text}>{`Need help? Write to ${SUPPORT_EMAIL} or WhatsApp ${SUPPORT_WHATSAPP_DISPLAY}.`}</Text>
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
        accessibilityRole="link"
        accessibilityLabel="Privacy policy"
        onPress={() => open(PRIVACY_URL)}
        style={styles.link}
      >
        <Text style={styles.linkText}>Privacy policy</Text>
      </Pressable>
      <Text style={styles.small}>{`Version ${appVersion}`}</Text>
      <Text style={styles.small}>{`Signed in as ${user.email}`}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        onPress={() => void onSignOut()}
        style={[styles.button, styles.buttonSecondary]}
      >
        <Text style={styles.buttonTextSecondary}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { padding: space.lg, gap: space.md },
  title: { fontSize: type.title, fontWeight: '600', color: colors.ink },
  text: { fontSize: type.body, color: colors.ink },
  small: { fontSize: type.small, color: colors.muted },
  button: {
    minHeight: primaryTarget,
    borderRadius: 8,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonSecondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.ink },
  buttonText: { color: colors.white, fontSize: type.body },
  buttonTextSecondary: { color: colors.ink, fontSize: type.body },
  link: { minHeight: minTarget, justifyContent: 'center' },
  linkText: { color: colors.ink, fontSize: type.body, textDecorationLine: 'underline' },
});
