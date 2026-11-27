// The one text component. It picks the font for the language (system for English, bundled Noto
// Sans Devanagari for Hindi), sets a line height that does not clip Devanagari, and caps font
// scaling so a large system setting does not break a row.

import { useTranslation } from 'react-i18next';
import { Text as RNText, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts, lineHeight, maxFontScale, type } from '../theme';

export type TextVariant = keyof typeof type;

/** Font for the current language. TextInput uses it too, so typed text matches. */
export function useFontStyle(bold = false): TextStyle {
  const { i18n } = useTranslation();
  if (i18n.language === 'hi') return { fontFamily: bold ? fonts.hindiBold : fonts.hindi };
  return bold ? { fontWeight: '700' } : {};
}

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  bold?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
}

export function Text({ variant = 'body', bold = false, color = colors.text, style, ...rest }: AppTextProps) {
  const size = type[variant];
  return (
    <RNText
      maxFontSizeMultiplier={maxFontScale}
      {...rest}
      style={[{ color, fontSize: size, lineHeight: lineHeight(size) }, useFontStyle(bold), style]}
    />
  );
}
