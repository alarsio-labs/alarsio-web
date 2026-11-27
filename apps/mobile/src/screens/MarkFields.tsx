// The fields of a mark editor: status, overtime and note. Shared by the day register and the
// worker month screen. Owner: Attendance (Manish). Issue #234.

import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { statusLabel } from '../attendance/labels';
import { ENTRY_STATUSES, type EntryStatus } from '../attendance/register';
import { colors, minTarget, radius, space } from '../theme';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { TextField } from '../ui/TextField';

export interface MarkFieldsProps {
  status: EntryStatus;
  onStatus: (status: EntryStatus) => void;
  overtime: string;
  onOvertime: (overtime: string) => void;
  note: string;
  onNote: (note: string) => void;
}

export function MarkFields({ status, onStatus, overtime, onOvertime, note, onNote }: MarkFieldsProps) {
  const { t } = useTranslation();
  return (
    <>
      <View style={styles.row}>
        {ENTRY_STATUSES.map((s) => {
          const on = status === s;
          return (
            <Pressable
              key={s}
              accessibilityRole="button"
              accessibilityLabel={statusLabel(s)}
              accessibilityState={{ selected: on }}
              onPress={() => onStatus(s)}
              style={[styles.chip, on && styles.chipOn]}
            >
              {on && <Icon name="ok" size={18} color={colors.white} />}
              <Text bold={on} color={on ? colors.white : colors.text}>
                {statusLabel(s)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextField
        label={t('fields.overtimeLabel')}
        placeholder={t('fields.overtimePlaceholder')}
        value={overtime}
        onChangeText={onOvertime}
        keyboardType="decimal-pad"
      />
      <TextField
        label={t('fields.noteLabel')}
        placeholder={t('fields.notePlaceholder')}
        value={note}
        onChangeText={onNote}
        maxLength={500}
        multiline
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    minHeight: minTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.lg,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.field,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.header, borderColor: colors.header },
});
