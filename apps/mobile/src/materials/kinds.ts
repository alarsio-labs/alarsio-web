// The four kinds of material movement the server accepts (ADR-015). Owner: Materials (Nikhil).

export const MATERIAL_KINDS = ['opening', 'receipt', 'usage', 'adjustment'] as const;

export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** What the supervisor sees on the buttons. */
export const KIND_LABELS: Record<MaterialKind, string> = {
  opening: 'Opening stock',
  receipt: 'Received',
  usage: 'Used',
  adjustment: 'Adjustment',
};
