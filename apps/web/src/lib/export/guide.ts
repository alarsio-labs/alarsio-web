// Plain words that explain the export file. One list feeds the export page and the
// README.txt inside the ZIP, so the two never disagree.
import { EXPORT_TABLES } from "./tables";

export const READING_NOTES: readonly string[] = [
  "Open a .csv file in Excel with Data, then From Text/CSV, and choose UTF-8, so Hindi names show correctly.",
  "Every row has an id. A column ending in _id, such as worker_id or site_id, points to the id of a row in another file: worker_id matches id in workers.csv, site_id matches id in sites.csv.",
  "Times are in UTC. Add 5 hours 30 minutes for India time. A date with no time, such as attendance_date, is already the calendar day.",
  "Money is in rupees. The one exception is worker_advances.csv, which is in paise (100 paise = ₹1).",
  "An empty cell means there is no value."
];

export function buildReadme(at: Date): string {
  const lines = [
    "ALARSIO DATA EXPORT",
    `Exported on ${at.toISOString().slice(0, 10)}. It holds the records you can see in Alarsio on that day.`,
    "",
    "HOW TO READ THE FILES",
    ...READING_NOTES.map((n) => `- ${n}`),
    "",
    "THE FILES",
    "manifest.csv lists every file below with its row count."
  ];
  let group = "";
  for (const t of EXPORT_TABLES) {
    if (t.group !== group) {
      group = t.group;
      lines.push("", group.toUpperCase());
    }
    lines.push(`${t.table}.csv - ${t.about}`);
  }
  return lines.join("\r\n") + "\r\n";
}
