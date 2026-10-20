import { Field, buttonClass, inputClass } from "@/components/form";
import type { SiteRecord } from "@/lib/sites/rows";

// The five details of a site, shared by "New site" and "Edit". The hints say
// each rule; the server checks them again and the database CHECKs are the
// boundary. There is no status field: a new site is planned, and status moves
// on the site's own page.
export function SiteForm({
  action,
  org,
  site,
  submitLabel
}: {
  action: (form: FormData) => Promise<void>;
  org: string;
  site?: SiteRecord;
  submitLabel: string;
}) {
  return (
    <form action={action} className="mt-3 space-y-4">
      <input type="hidden" name="org_id" value={org} />
      {site && <input type="hidden" name="site_id" value={site.id} />}
      <Field label="Name">
        <input name="name" required maxLength={120} defaultValue={site?.name ?? ""} className={inputClass} />
        <span className="mt-1 block text-xs text-neutral-500">
          1 to 120 characters. Each name is used once per organisation, upper or lower case, and archived sites keep theirs.
        </span>
      </Field>
      <Field label="Address">
        <textarea name="address" required maxLength={500} rows={2} defaultValue={site?.address ?? ""} className={inputClass} />
        <span className="mt-1 block text-xs text-neutral-500">1 to 500 characters.</span>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Latitude">
          <input
            name="latitude"
            required
            inputMode="decimal"
            placeholder="18.5204"
            defaultValue={site ? String(site.latitude) : ""}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-neutral-500">A decimal from -90 to 90.</span>
        </Field>
        <Field label="Longitude">
          <input
            name="longitude"
            required
            inputMode="decimal"
            placeholder="73.8567"
            defaultValue={site ? String(site.longitude) : ""}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-neutral-500">A decimal from -180 to 180.</span>
        </Field>
      </div>
      <Field label="Geofence radius (metres)">
        <input
          name="radius"
          required
          inputMode="numeric"
          defaultValue={String(site?.geofence_radius_m ?? 200)}
          className={inputClass}
        />
        <span className="mt-1 block text-xs text-neutral-500">
          A whole number from 50 to 2000. A check-in counts as on site within this distance of the pin.
        </span>
      </Field>
      <button type="submit" className={buttonClass}>{submitLabel}</button>
    </form>
  );
}
