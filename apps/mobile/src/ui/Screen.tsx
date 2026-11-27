// The page frame every signed-in screen shares: grey ground, side and bottom safe areas (the header
// owns the top one), the keyboard kept off the fields, and taps that still reach buttons while a
// field has focus. `scroll={false}` is for screens that hold their own list.

import type { ReactElement, ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { colors, space } from '../theme';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  /** Safe-area edges to pad. Default: all but the top, which the header covers. */
  edges?: Edge[];
  contentStyle?: StyleProp<ViewStyle>;
  /** Pull-to-refresh, for a scrolling screen. */
  refreshControl?: ReactElement<RefreshControlProps>;
}

const NO_TOP: Edge[] = ['left', 'right', 'bottom'];

export function Screen({ children, scroll = true, edges = NO_TOP, contentStyle, refreshControl }: ScreenProps) {
  return (
    <SafeAreaView edges={edges} style={styles.fill}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
            contentContainerStyle={[styles.content, contentStyle]}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.content, contentStyle]}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.ground },
  content: { padding: space.lg, gap: space.md },
});
