// The fields of a mark editor: status, overtime and note. Shared by the day register and the
// worker month screen. Owner: Attendance (Manish). Issue #234.

import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ENTRY_STATUSES, type EntryStatus } from '../attendance/register';
import { colors, radius } from '../theme';

export const STATUS_LABEL: Record<EntryStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half day',
  leave: 'Leave',
};

export interface MarkFieldsProps {
  status: EntryStatus;
  onStatus: (status: EntryStatus) => void;
  overtime: string;
  onOvertime: (overtime: string) => void;
  note: string;
  onNote: (note: string) => void;
}

export function MarkFields({ status, onStatus, overtime, onOvertime, note, onNote }: MarkFieldsProps) {
  return (
    <>
      <View style={fieldStyles.row}>
        {ENTRY_STATUSES.map((s) => (
          <Pressable
            key={s}
            accessibilityRole="button"
            accessibilityLabel={STATUS_LABEL[s]}
            accessibilityState={{ selected: status === s }}
            onPress={() => onStatus(s)}
            style={[fieldStyles.chip, status === s && fieldStyles.chipOn]}
          >
            <Text style={status === s ? fieldStyles.chipTextOn : fieldStyles.chipText}>{STATUS_LABEL[s]}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="Overtime hours"
        style={fieldStyles.input}
        value={overtime}
        onChangeText={onOvertime}
        keyboardType="decimal-pad"
        placeholder="Overtime hours (0 to 8)"
      />
      <TextInput
        accessibilityLabel="Note"
        style={[fieldStyles.input, fieldStyles.tall]}
        value={note}
        onChangeText={onNote}
        maxLength={500}
        multiline
        placeholder="Note (optional)"
      />
    </>
  );
}

export const fieldStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderColor: colors.fieldLine, borderRadius: radius.sm, padding: 10, fontSize: 16, backgroundColor: colors.paper },
  tall: { minHeight: 70, textAlignVertical: 'top' },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.ink },
  chipText: { color: colors.ink, fontSize: 15 },
  chipTextOn: { color: colors.white, fontSize: 15 },
});
