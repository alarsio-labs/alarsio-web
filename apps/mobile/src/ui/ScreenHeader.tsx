// The dark slate header (docs/DESIGN.md section 5). It adds the top safe-area inset itself, so it
// is used as the `header` of the Stack and the Tabs. Back is a 48 dp target.

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { colors, space } from '../theme';
import { Icon } from './Icon';
import { Text } from './Text';

export interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  /** A line under the title row, e.g. the sync status. */
  below?: ReactNode;
}

export function ScreenHeader({ title, onBack, right, below }: ScreenHeaderProps) {
  const { top } = useSafeAreaInsets();
  const { t } = useTranslation();
  return (
    <View style={[styles.bar, { paddingTop: top }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            hitSlop={8}
            onPress={onBack}
            style={styles.back}
          >
            <Icon name="back" size={24} color={colors.white} />
          </Pressable>
        ) : null}
        <Text variant="heading" bold color={colors.white} numberOfLines={1} accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {right}
      </View>
      {below}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.header },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  back: { minWidth: 48, minHeight: 48, marginLeft: -space.md, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
});
