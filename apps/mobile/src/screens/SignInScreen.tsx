// Sign in on the phone. Owner: Identity (Ishant). Issue #56.

import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SignInResult } from '../auth/auth-client';
import { RESET_PASSWORD_URL } from '../config/support';
import { colors, minTarget } from '../theme';

export interface SignInScreenProps {
  signIn: (email: string, password: string) => Promise<SignInResult>;
}

export function SignInScreen({ signIn }: SignInScreenProps) {
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
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <Text style={styles.title}>Sign in</Text>
        <View style={styles.form}>
          <TextInput
            accessibilityLabel="Email"
            placeholder="Email"
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? 'Signing in' : 'Sign in'}
            accessibilityState={{ disabled: busy, busy }}
            onPress={() => void submit()}
            style={[styles.button, busy && styles.buttonBusy]}
          >
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Sign in</Text>}
          </Pressable>
          <Text style={styles.hint}>New to Alarsio? Open the invite link your manager sent you to create your account.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 24 },
  form: { gap: 12 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  error: { color: colors.redDeep, fontSize: 15 },
  button: { backgroundColor: colors.ink, borderRadius: 8, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonBusy: { opacity: 0.6 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  forgot: { minHeight: minTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  forgotText: { color: colors.ink, fontSize: 14, textDecorationLine: 'underline' },
  hint: { color: colors.muted, fontSize: 14, marginTop: 8 },
});
