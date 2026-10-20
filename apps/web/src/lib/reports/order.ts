// Newest date first; within a day, flagged first, then waiting for review,
// then sent back, then reviewed; then id, so the order is the same on every render.
export type SortableReport = {
  id: string;
  report_date: string;
  flagged: boolean;
  status: "submitted" | "rejected" | "reviewed";
};

const STATUS_RANK: Record<SortableReport["status"], number> = { submitted: 0, rejected: 1, reviewed: 2 };

export function sortReports<T extends SortableReport>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.report_date !== b.report_date) return a.report_date < b.report_date ? 1 : -1;
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    if (a.status !== b.status) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
