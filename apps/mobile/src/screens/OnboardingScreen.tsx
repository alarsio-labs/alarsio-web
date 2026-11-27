// The first-open tutorial: four slides, swiped sideways, with the main action fixed at the
// bottom. Before sign-in the action is "Sign in"; opened again from Help it is "Done".

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SLIDES } from '../onboarding/slides';
import { brand, fonts, lineHeight, maxFontScale, minTarget, radius, space } from '../theme';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { Wordmark } from '../ui/Wordmark';

export interface OnboardingScreenProps {
  /** Leaves the tutorial: to Sign in before sign-in, back to Help after. */
  onDone: () => void;
  /** The main button's words: "Sign in" or "Done". */
  doneLabel?: string;
}

const TITLE_SIZE = 40;

export function OnboardingScreen({ onDone, doneLabel }: OnboardingScreenProps) {
  const { t, i18n } = useTranslation();
  const hindi = i18n.language === 'hi';
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const last = SLIDES.length - 1;

  const goTo = (i: number) => {
    const next = Math.max(0, Math.min(last, i));
    setPage(next);
    scroller.current?.scrollTo({ x: next * width, animated: true });
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.top}>
        <Wordmark size={24} onDark />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.skipLabel')}
          onPress={onDone}
          style={styles.skip}
        >
          <Text color={brand.cream} style={styles.skipText}>
            {t('onboarding.skip')}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pages}
      >
        {SLIDES.map((s, i) => {
          const title = t(s.titleKey);
          const body = t(s.bodyKey);
          return (
            <View
              key={s.titleKey}
              style={[styles.slide, { width }]}
              accessible
              accessibilityLabel={t('onboarding.slideLabel', { index: i + 1, total: SLIDES.length, title, body })}
            >
              <View style={styles.badge}>
                <Icon name={s.icon} size={64} color={brand.ink} />
              </View>
              <Text color={brand.red} style={styles.step}>{`${String(i + 1).padStart(2, '0')} / ${String(SLIDES.length).padStart(2, '0')}`}</Text>
              <RNText
                maxFontSizeMultiplier={maxFontScale}
                style={[
                  styles.title,
                  // Anton has no Devanagari glyphs, so Hindi uses the bundled Noto bold.
                  hindi ? { fontFamily: fonts.hindiBold, lineHeight: lineHeight(TITLE_SIZE) } : null,
                ]}
              >
                {title}
              </RNText>
              <Text variant="heading" color={brand.creamMuted}>
                {body}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {SLIDES.map((s, i) => (
          <View key={s.titleKey} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.bar}>
        <Button label={doneLabel ?? t('onboarding.signIn')} onPress={onDone} style={styles.main} />
        {page < last && (
          <Button
            label={t('onboarding.next')}
            kind="secondary"
            icon="next"
            accessibilityLabel={t('onboarding.nextLabel')}
            onPress={() => goTo(page + 1)}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: brand.loam },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingTop: space.sm },
  skip: { minHeight: minTarget, minWidth: minTarget, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { textDecorationLine: 'underline' },
  pages: { flex: 1 },
  slide: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl * 1.5, gap: space.md },
  badge: {
    width: 128,
    height: 128,
    borderRadius: radius.pill,
    backgroundColor: brand.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  step: { letterSpacing: 2 },
  title: { color: brand.cream, fontFamily: fonts.display, fontSize: TITLE_SIZE, lineHeight: 44, textTransform: 'uppercase' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, paddingVertical: space.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(231, 226, 216, 0.3)' },
  dotOn: { width: 24, backgroundColor: brand.red },
  bar: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.xl },
  main: { flex: 1 },
});
