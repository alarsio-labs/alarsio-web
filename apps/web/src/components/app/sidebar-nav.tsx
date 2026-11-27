import Link from "next/link";
import { groupBySection, SECTION_LABEL, type OrgLink, type Section } from "@/lib/dashboard/links";
import { Icon, type IconName } from "./nav-icon";

// The navigation for the user's role in this organisation (docs/DESIGN.md section 5):
// the phone's four tabs, Today, Sites, Reports and More, only those the role has pages
// in (lib/dashboard/links.ts). A tab opens the first page of its section. The same tabs
// sit in the header on a wide screen and at the bottom on a phone; CSS shows one.
// `PageStrip` lists the pages of the current section.

const SECTION_ICON: Record<Section, IconName> = { today: "calendar", sites: "sites", reports: "reports", more: "more" };

export function SectionTabs({ links, current, className }: { links: readonly OrgLink[]; current: string | null; className: string }) {
  const groups = groupBySection(links);
  if (groups.length === 0) return null;
  const here = links.find((l) => l.path === current)?.section;
  return (
    <nav className={className} aria-label="Sections">
      <ul>
        {groups.map(({ section, links: pages }) => (
          <li key={section}>
            <Link href={pages[0]?.path ?? "/dashboard"} className="cx-tab" aria-current={section === here ? "page" : undefined}>
              <Icon name={SECTION_ICON[section]} size={20} />
              <span>{SECTION_LABEL[section]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The pages of the current section. Nothing when it holds only one page. */
export function PageStrip({ links, current }: { links: readonly OrgLink[]; current: string | null }) {
  const section = links.find((l) => l.path === current)?.section;
  const pages = links.filter((l) => l.section === section);
  if (pages.length < 2) return null;
  return (
    <nav className="cx-strip" aria-label={`${section ? SECTION_LABEL[section] : ""} pages`}>
      <ul>
        {pages.map((l) => (
          <li key={l.path}>
            <Link href={l.path} aria-current={l.path === current ? "page" : undefined}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
