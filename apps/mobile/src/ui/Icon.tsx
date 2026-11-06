// The app's icons, one fixed set, so screens cannot drift to different glyphs for the
// same idea. Icons are always beside a word, never alone, so they are hidden from
// screen readers; the word carries the meaning.

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { colors } from '../theme';

const GLYPHS = {
  offline: 'cloud-off-outline',
  synced: 'cloud-check-outline',
  sending: 'cloud-upload-outline',
  attention: 'alert-circle-outline',
  checkIn: 'map-marker-check-outline',
  register: 'account-group-outline',
  report: 'clipboard-text-outline',
  materials: 'package-variant-closed',
  next: 'arrow-right',
  help: 'help-circle-outline',
} as const;

export type IconName = keyof typeof GLYPHS;

export function Icon({ name, size = 20, color = colors.ink }: { name: IconName; size?: number; color?: string }) {
  return (
    <MaterialCommunityIcons
      name={GLYPHS[name]}
      size={size}
      color={color}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
