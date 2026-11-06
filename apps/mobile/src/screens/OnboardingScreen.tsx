// The first-open tutorial: four slides, swiped sideways, with the main action fixed at the
// bottom. Before sign-in the action is "Sign in"; opened again from Help it is "Done".

import { useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SLIDES } from '../onboarding/slides';
import { colors, fonts, minTarget, radius, space } from '../theme';
import { Icon } from '../ui/Icon';
import { Pill } from '../ui/Pill';
import { Wordmark } from '../ui/Wordmark';

export interface OnboardingScreenProps {
  /** Leaves the tutorial: to Sign in before sign-in, back to Help after. */
  onDone: () => void;
  /** The main button's words: "Sign in" or "Done". */
  doneLabel?: string;
}

export function OnboardingScreen({ onDone, doneLabel = 'Sign in' }: OnboardingScreenProps) {
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
          accessibilityLabel="Skip the tutorial"
          onPress={onDone}
          style={styles.skip}
        >
          <Text style={styles.skipText}>Skip</Text>
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
        {SLIDES.map((s, i) => (
          <View
            key={s.title}
            style={[styles.slide, { width }]}
            accessible
            accessibilityLabel={`${i + 1} of ${SLIDES.length}. ${s.title}. ${s.body}`}
          >
            <View style={styles.badge}>
              <Icon name={s.icon} size={64} color={colors.ink} />
            </View>
            <Text style={styles.step}>{`${String(i + 1).padStart(2, '0')} / ${String(SLIDES.length).padStart(2, '0')}`}</Text>
            <Text style={styles.title}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.bar}>
        <Pill label={doneLabel} kind="red" onPress={onDone} style={styles.main} />
        {page < last && (
          <Pill label="Next" kind="cream" icon="next" accessibilityLabel="Next slide" onPress={() => goTo(page + 1)} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.loam },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.xl, paddingTop: space.sm },
  skip: { minHeight: minTarget, minWidth: minTarget, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { color: colors.cream, fontSize: 16, textDecorationLine: 'underline' },
  pages: { flex: 1 },
  slide: { flex: 1, justifyContent: 'center', paddingHorizontal: space.xl * 1.5, gap: space.md },
  badge: {
    width: 128,
    height: 128,
    borderRadius: radius.pill,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  step: { color: colors.red, fontSize: 14, letterSpacing: 2 },
  title: { color: colors.cream, fontFamily: fonts.display, fontSize: 40, lineHeight: 44, textTransform: 'uppercase' },
  body: { color: colors.creamMuted, fontSize: 18, lineHeight: 27 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: space.sm, paddingVertical: space.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(231, 226, 216, 0.3)' },
  dotOn: { width: 24, backgroundColor: colors.red },
  bar: { flexDirection: 'row', gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.xl },
  main: { flex: 1 },
});
