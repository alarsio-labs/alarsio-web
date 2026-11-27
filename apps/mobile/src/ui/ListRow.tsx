// A row in a card list: a title, one hint line, a trailing slot, and a chevron when it opens
// something. At least 56 dp tall; it grows with the text, so Hindi and large fonts fit.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius, space } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

export interface ListRowProps {
  title: string;
  hint?: string;
  trailing?: ReactNode;
  /** Makes the row a button and shows the chevron. */
  onPress?: () => void;
  accessibilityLabel?: string;
}

export function ListRow({ title, hint, trailing, onPress, accessibilityLabel }: ListRowProps) {
  const body = (
    <>
      <View style={styles.text}>
        <Text bold>{title}</Text>
        {hint ? (
          <Text variant="small" color={colors.muted}>
            {hint}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress ? <Icon name="chevron" size={24} color={colors.muted} /> : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (hint ? `${title}, ${hint}` : title)}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  text: { flex: 1, gap: 2 },
  pressed: { backgroundColor: colors.ground },
});
