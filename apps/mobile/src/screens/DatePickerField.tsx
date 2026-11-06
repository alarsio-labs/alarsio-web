// A date button that opens the phone's own date picker, in place of typing
// "YYYY-MM-DD". Future days are not offered. Works offline: no network.

import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { dayToPickerDate, pickerDateToDay, pickerDayLabel } from '../lib/day-picker';
import { colors, minTarget, type } from '../theme';

/** How a picker is opened. Tests pass their own; the default is the native one. */
export type OpenDatePicker = (options: { value: Date; maximumDate: Date; onPick: (picked: Date) => void }) => void;

const openNativePicker: OpenDatePicker = ({ value, maximumDate, onPick }) => {
  DateTimePickerAndroid.open({
    value,
    maximumDate,
    mode: 'date',
    onChange: (event: DateTimePickerEvent, picked?: Date) => {
      if (event.type === 'set' && picked) onPick(picked);
    },
  });
};

export interface DatePickerFieldProps {
  /** The chosen day, "YYYY-MM-DD". */
  value: string;
  /** The latest day that can be chosen, "YYYY-MM-DD": today. */
  max: string;
  onChange: (day: string) => void;
  openPicker?: OpenDatePicker;
}

export function DatePickerField({ value, max, onChange, openPicker }: DatePickerFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const useInline = !openPicker && Platform.OS !== 'android';

  const pick = (picked: Date) => {
    const day = pickerDateToDay(picked);
    if (day <= max) onChange(day); // a future day is never accepted
  };

  const onPress = () => {
    if (useInline) setIosOpen((open) => !open);
    else (openPicker ?? openNativePicker)({ value: dayToPickerDate(value), maximumDate: dayToPickerDate(max), onPick: pick });
  };

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Date: ${pickerDayLabel(value)}. Opens a calendar`}
        onPress={onPress}
        style={styles.button}
      >
        <Text style={styles.text}>{`Date: ${pickerDayLabel(value)}`}</Text>
      </Pressable>
      {useInline && iosOpen && (
        <DateTimePicker
          value={dayToPickerDate(value)}
          maximumDate={dayToPickerDate(max)}
          mode="date"
          onChange={(_event, picked) => picked && pick(picked)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: minTarget,
    borderWidth: 1,
    borderColor: colors.fieldLine,
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  text: { fontSize: type.body, color: colors.ink },
});
