// A white card on the grey ground: 1 px border, no shadow (docs/DESIGN.md section 5).

import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { colors, radius, space } from '../theme';

export function Card({ style, ...rest }: ViewProps & { style?: StyleProp<ViewStyle> }) {
  return <View {...rest} style={[styles.card, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space.lg,
    gap: space.sm,
  },
});
