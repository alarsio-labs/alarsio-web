// The brand splash, shown on every cold start right after the native splash: the same
// loam ground and logo, then the wordmark and one line about the app. It moves on by
// itself after a moment, or at once on a tap.

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SPLASH_LINE_KEY } from '../onboarding/slides';
import { brand, space } from '../theme';
import { Text } from '../ui/Text';
import { Wordmark } from '../ui/Wordmark';

export const SPLASH_MS = 1500;

export interface BrandSplashProps {
  onDone: () => void;
  durationMs?: number;
}

export function BrandSplash({ onDone, durationMs = SPLASH_MS }: BrandSplashProps) {
  const { t } = useTranslation();
  const done = useRef(false);
  // The latest onDone, so a parent re-render does not restart the timer.
  const finish = useRef(onDone);
  useEffect(() => {
    finish.current = onDone;
  }, [onDone]);

  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true;
    finish.current();
  }, []);

  useEffect(() => {
    const timer = setTimeout(leave, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, leave]);

  const line = t(SPLASH_LINE_KEY);
  return (
    <SafeAreaView style={styles.safe}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('splash.label', { line })}
        onPress={leave}
        style={styles.fill}
      >
        <Image source={require('../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain" />
        <Wordmark size={44} onDark />
        <Text color={brand.creamMuted} style={styles.line}>
          {line}
        </Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.loam },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg },
  logo: { width: 120, height: 120 },
  line: { textAlign: 'center', maxWidth: 300 },
});
