// Sign in on the phone. Owner: Identity (Ishant). Issue #56.

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SignInResult } from '../auth/auth-client';
import { RESET_PASSWORD_URL } from '../config/support';
import type { Language } from '../i18n';
import { brand, colors, fonts, lineHeight, maxFontScale, radius, space, tone } from '../theme';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';
import { Wordmark } from '../ui/Wordmark';

export interface SignInScreenProps {
  signIn: (email: string, password: string) => Promise<SignInResult>;
  /** Opens the tutorial again. Without it, the link is not shown. */
  onShowTutorial?: () => void;
  /** Shows the English / हिन्दी switch, so Hindi can be chosen before signing in. */
  onChangeLanguage?: (language: Language) => void;
}

const TITLE_SIZE = 40;

export function SignInScreen({ signIn, onShowTutorial, onChangeLanguage }: SignInScreenProps) {
  const { t, i18n } = useTranslation();
  const hindi = i18n.language === 'hi';
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
            <Text
              variant="small"
              color={brand.creamMuted}
              style={[styles.bandLine, hindi ? null : styles.spaced]}
            >
              {t('signIn.tagline')}
            </Text>
          </View>
          <View style={styles.form}>
            <Text variant="small" bold color={colors.actionText} style={hindi ? null : styles.eyebrow}>
              {t('signIn.welcome')}
            </Text>
            <RNText
              accessibilityRole="header"
              maxFontSizeMultiplier={maxFontScale}
              style={[
                styles.title,
                // Anton has no Devanagari glyphs, so Hindi uses the bundled Noto bold.
                hindi ? { fontFamily: fonts.hindiBold, lineHeight: lineHeight(TITLE_SIZE) } : null,
              ]}
            >
              {t('signIn.title')}
            </RNText>
            <TextField
              label={t('signIn.email')}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <TextField
              ref={passwordRef}
              label={t('signIn.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
            />
            <Button
              kind="ghost"
              accessibilityRole="link"
              label={t('signIn.forgot')}
              accessibilityLabel={t('signIn.forgotLabel')}
              onPress={() => void Linking.openURL(RESET_PASSWORD_URL).catch(() => undefined)}
              style={styles.start}
            />
            {error && (
              <Text accessibilityRole="alert" color={tone.attention.text}>
                {error}
              </Text>
            )}
            <Button
              label={t('signIn.submit')}
              accessibilityLabel={busy ? t('signIn.signingIn') : t('signIn.submit')}
              busy={busy}
              onPress={() => void submit()}
            />
            <Text variant="small" color={colors.muted}>
              {t('signIn.newHint')}
            </Text>
            {onShowTutorial && (
              <Button kind="ghost" icon="help" label={t('signIn.tour')} onPress={onShowTutorial} style={styles.start} />
            )}
            {onChangeLanguage && (
              <View style={styles.languages}>
                <Button kind="ghost" label={t('language.en')} onPress={() => onChangeLanguage('en')} />
                <Button kind="ghost" label={t('language.hi')} onPress={() => onChangeLanguage('hi')} />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.loam },
  fill: { flex: 1, backgroundColor: colors.ground },
  scroll: { flexGrow: 1 },
  band: { backgroundColor: brand.loam, alignItems: 'center', paddingTop: space.xl, paddingBottom: space.xl * 1.5, gap: space.sm },
  logo: { width: 72, height: 72 },
  bandLine: { textAlign: 'center', paddingHorizontal: space.xl },
  spaced: { letterSpacing: 1.5, textTransform: 'uppercase' },
  form: {
    flex: 1,
    gap: space.md,
    padding: space.xl,
    marginTop: -space.lg,
    backgroundColor: colors.ground,
    borderTopLeftRadius: radius.card * 1.5,
    borderTopRightRadius: radius.card * 1.5,
  },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  title: { fontFamily: fonts.display, fontSize: TITLE_SIZE, color: brand.ink, textTransform: 'uppercase', marginBottom: space.sm },
  start: { alignSelf: 'flex-start', paddingHorizontal: 0 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
