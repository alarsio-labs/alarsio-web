// Sign in on the phone. Owner: Identity (Ishant). Issue #14.

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SignInResult } from '../auth/auth-client';

export interface SignInScreenProps {
  signIn: (email: string, password: string) => Promise<SignInResult>;
}

export function SignInScreen({ signIn }: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await signIn(email, password);
    // On success the session change swaps this screen out; nothing to do here.
    if (!result.ok) {
      setError(result.message);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
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
          style={styles.input}
        />
        <TextInput
          accessibilityLabel="Password"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          onSubmitEditing={submit}
          style={styles.input}
        />
        {error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          onPress={submit}
          style={[styles.button, busy && styles.buttonBusy]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
        <Text style={styles.hint}>New to Alarsio? Open the invite link your manager sent you to create your account.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 24 },
  form: { gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16 },
  error: { color: '#b00020', fontSize: 15 },
  button: { backgroundColor: '#111', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  buttonBusy: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: '#555', fontSize: 14, marginTop: 8 },
});
