// Newest date first; within a day, flagged first, then unreviewed before
// reviewed; then id, so the order is the same on every render.
export type SortableReport = {
  id: string;
  report_date: string;
  flagged: boolean;
  status: "submitted" | "reviewed";
};

export function sortReports<T extends SortableReport>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.report_date !== b.report_date) return a.report_date < b.report_date ? 1 : -1;
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    if (a.status !== b.status) return a.status === "submitted" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
