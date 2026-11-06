// The app's button (docs/DESIGN.md, phone app v2.1): a rounded pill at least 48 px tall.
// red: the one main action on a screen (ink text on red, 4.86:1). ink: a normal action.
// line: a second action. cream: an action on a loam ground.

import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, primaryTarget, radius, space } from '../theme';
import { Icon, type IconName } from './Icon';

export type PillKind = 'red' | 'ink' | 'line' | 'cream';

const LOOK: Record<PillKind, { bg: string; fg: string; border: string }> = {
  red: { bg: colors.red, fg: colors.ink, border: colors.red },
  ink: { bg: colors.ink, fg: colors.white, border: colors.ink },
  line: { bg: 'transparent', fg: colors.ink, border: colors.ink },
  cream: { bg: colors.cream, fg: colors.ink, border: colors.cream },
};

export interface PillProps {
  label: string;
  onPress: () => void;
  kind?: PillKind;
  icon?: IconName;
  /** Read by screen readers instead of the label, when the label alone is not enough. */
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Pill({
  label,
  onPress,
  kind = 'ink',
  icon,
  accessibilityLabel,
  accessibilityRole = 'button',
  disabled = false,
  busy = false,
  style,
}: PillProps) {
  const look = disabled ? { bg: colors.disabled, fg: colors.white, border: colors.disabled } : LOOK[kind];
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: look.bg, borderColor: look.border },
        pressed && styles.pressed,
        busy && styles.busy,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <View style={styles.inner}>
          {icon && <Icon name={icon} color={look.fg} size={20} />}
          <Text style={[styles.text, { color: look.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: primaryTarget,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  text: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  busy: { opacity: 0.7 },
});
