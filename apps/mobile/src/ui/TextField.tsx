// A labelled input: label above, white box, an `attention` border and message on error.

import type { Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, maxFontScale, radius, space, tone, type, lineHeight } from '../theme';
import { Text, useFontStyle } from './Text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  ref?: Ref<TextInput>;
}

export function TextField({ label, error, ...rest }: TextFieldProps) {
  const font = useFontStyle();
  return (
    <View style={styles.wrap}>
      <Text variant="small" bold color={colors.muted}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.field}
        maxFontSizeMultiplier={maxFontScale}
        {...rest}
        style={[styles.input, font, rest.multiline ? styles.multiline : null, error ? styles.invalid : null]}
      />
      {error ? (
        <Text variant="small" color={tone.attention.text} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  input: {
    minHeight: 48,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.card,
    borderColor: colors.field,
    borderWidth: 1,
    borderRadius: radius.input,
    color: colors.text,
    fontSize: type.body,
    lineHeight: lineHeight(type.body),
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  invalid: { borderColor: tone.attention.text, borderWidth: 2 },
});
