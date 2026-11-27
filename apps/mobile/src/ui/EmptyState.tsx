// What is missing, in one sentence, and the one action that fills it.

import { StyleSheet, View } from 'react-native';

import { colors, space } from '../theme';
import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

export interface EmptyStateProps {
  title: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Icon name="empty" size={40} color={colors.muted} />
      <Text variant="heading" bold style={styles.center}>
        {title}
      </Text>
      {hint ? (
        <Text color={colors.muted} style={styles.center}>
          {hint}
        </Text>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space.md, padding: space.xl },
  center: { textAlign: 'center' },
});
