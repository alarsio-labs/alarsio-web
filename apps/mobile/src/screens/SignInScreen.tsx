// Sign in on the phone. Owner: Identity (Ishant). Issue #56.

import { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SignInResult } from '../auth/auth-client';
import { RESET_PASSWORD_URL } from '../config/support';
import { colors, fonts, minTarget, primaryTarget, radius, space } from '../theme';
import { Icon } from '../ui/Icon';
import { Pill } from '../ui/Pill';
import { Wordmark } from '../ui/Wordmark';

export interface SignInScreenProps {
  signIn: (email: string, password: string) => Promise<SignInResult>;
  /** Opens the tutorial again. Without it, the link is not shown. */
  onShowTutorial?: () => void;
}

export function SignInScreen({ signIn, onShowTutorial }: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state, so two fast taps cannot both send.
  const sending = useRef(false);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await signIn(email, password);
      // On success the session change swaps this screen out.
      if (!result.ok) setError(result.message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.band}>
          <Image source={require('../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
          <Wordmark size={34} onDark />
          <Text style={styles.bandLine}>Site records with no signal</Text>
        </View>
        <View style={styles.form}>
          <Text style={styles.eyebrow}>Welcome back</Text>
          <Text style={styles.title} accessibilityRole="header">Sign in</Text>
          <TextInput
            accessibilityLabel="Email"
            placeholder="Email"
            placeholderTextColor={colors.muted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            style={styles.input}
          />
          <TextInput
            ref={passwordRef}
            accessibilityLabel="Password"
            placeholder="Password"
            placeholderTextColor={colors.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Forgot password? Opens the reset page on alarsio.com"
            onPress={() => void Linking.openURL(RESET_PASSWORD_URL).catch(() => undefined)}
            style={styles.forgot}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
          {error && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          )}
          <Pill
            label="Sign in"
            kind="red"
            accessibilityLabel={busy ? 'Signing in' : 'Sign in'}
            busy={busy}
            onPress={() => void submit()}
          />
          <Text style={styles.hint}>New to Alarsio? Open the invite link your manager sent you to create your account.</Text>
          {onShowTutorial && (
            <Pressable accessibilityRole="button" accessibilityLabel="How Alarsio works" onPress={onShowTutorial} style={styles.tour}>
              <Icon name="help" color={colors.ink} />
              <Text style={styles.forgotText}>How Alarsio works</Text>
            </Pressable>
          )}
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.loam },
  fill: { flex: 1, backgroundColor: colors.cream },
  scroll: { flexGrow: 1 },
  band: { backgroundColor: colors.loam, alignItems: 'center', paddingTop: space.xl, paddingBottom: space.xl * 1.5, gap: space.sm },
  logo: { width: 72, height: 72 },
  bandLine: { color: colors.creamMuted, fontSize: 14, letterSpacing: 1.5, textTransform: 'uppercase' },
  form: {
    flex: 1,
    gap: space.md,
    padding: space.xl,
    marginTop: -space.lg,
    backgroundColor: colors.cream,
    borderTopLeftRadius: radius.md * 1.5,
    borderTopRightRadius: radius.md * 1.5,
  },
  eyebrow: { color: colors.redDeep, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' },
  title: { fontFamily: fonts.display, fontSize: 40, color: colors.ink, textTransform: 'uppercase', marginBottom: space.sm },
  input: {
    minHeight: primaryTarget,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: radius.sm,
    backgroundColor: colors.paper,
    paddingHorizontal: space.lg,
    fontSize: 16,
    color: colors.ink,
  },
  error: { color: colors.redDeep, fontSize: 15 },
  forgot: { minHeight: minTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  forgotText: { color: colors.ink, fontSize: 15, textDecorationLine: 'underline' },
  hint: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  tour: { minHeight: minTarget, flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start' },
});
