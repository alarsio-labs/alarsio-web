// The four kinds of material movement the server accepts (ADR-015). Owner: Materials (Nikhil).

import i18n from '../i18n';

export const MATERIAL_KINDS = ['opening', 'receipt', 'usage', 'adjustment'] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** What the supervisor sees on the buttons, in the app's language. */
export function kindLabel(kind: MaterialKind): string {
  return i18n.t(`siteMaterials.kind.${kind}`);
}
