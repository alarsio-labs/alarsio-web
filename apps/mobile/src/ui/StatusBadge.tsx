// A status chip: tint, icon and a word. Colour is never the only signal (docs/DESIGN.md section 5).

import { StyleSheet, View } from 'react-native';

import { radius, space, tone, type Tone } from '../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

const ICON: Record<Tone, IconName> = { ok: 'ok', wait: 'wait', attention: 'attention', neutral: 'register' };

export function StatusBadge({ tone: kind, label, icon }: { tone: Tone; label: string; icon?: IconName }) {
  const { tint, text } = tone[kind];
  return (
    <View accessible accessibilityLabel={label} style={[styles.badge, { backgroundColor: tint }]}>
      <Icon name={icon ?? ICON[kind]} size={16} color={text} />
      <Text variant="small" bold color={text} style={styles.label}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.chip,
  },
  label: { flexShrink: 1 },
});
