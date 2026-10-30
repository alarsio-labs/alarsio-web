import type { StatusTone } from "@/lib/app/status";
import type { SiteRecord } from "./rows";

// A site's status as a tag (docs/DESIGN.md section 4): a site that is running or done
// is ink; one not started, paused or archived is muted. None of them asks a manager
// to act, so none is red-deep.
const TONE: Record<SiteRecord["status"], StatusTone> = {
  active: "ink",
  completed: "ink",
  planned: "muted",
  paused: "muted",
  archived: "muted"
};

const WORD: Record<SiteRecord["status"], string> = {
  active: "Active",
  completed: "Completed",
  planned: "Planned",
  paused: "Paused",
  archived: "Archived"
};

export function siteTag(status: SiteRecord["status"]): { word: string; tone: StatusTone } {
  return { word: WORD[status], tone: TONE[status] };
}
