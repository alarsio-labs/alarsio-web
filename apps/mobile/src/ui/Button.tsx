// The app's button (docs/DESIGN.md section 5): at least 48 dp tall.
// primary: the one main action on a screen (orange). secondary: a normal action. ghost: a quiet one.

import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, primaryTarget, radius, space } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonKind = 'primary' | 'secondary' | 'ghost';

const LOOK: Record<ButtonKind, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.action, fg: colors.text, border: colors.action },
  secondary: { bg: colors.card, fg: colors.text, border: colors.field },
  ghost: { bg: 'transparent', fg: colors.actionText, border: 'transparent' },
};

export interface ButtonProps {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  /** Read by screen readers instead of the label, when the label alone is not enough. */
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  accessibilityLabel,
  accessibilityRole = 'button',
  disabled = false,
  busy = false,
  style,
}: ButtonProps) {
  const base = LOOK[kind];
  const look = disabled
    ? { bg: kind === 'ghost' ? 'transparent' : colors.disabled, fg: kind === 'ghost' ? colors.muted : colors.white, border: kind === 'ghost' ? 'transparent' : colors.disabled }
    : base;
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
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
          <Text bold color={look.fg} style={styles.label}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: primaryTarget,
    paddingHorizontal: space.xl,
    paddingVertical: space.sm,
    borderRadius: radius.button,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  label: { textAlign: 'center', flexShrink: 1 },
  pressed: { opacity: 0.85 },
  busy: { opacity: 0.7 },
});
