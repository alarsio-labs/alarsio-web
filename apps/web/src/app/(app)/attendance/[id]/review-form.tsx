import { inputClass } from "@/components/form";
import { Button } from "@/components/app/button";
import { MAX_REASON } from "@/lib/attendance/review";

// One decision form. The reason is optional for Approve and needed for Reject; the
// action and the database enforce that, so the box carries no `required`. Approve is
// the primary button and Reject the outline one: the working screens have no red button.
export function ReviewForm({
  action,
  fields,
  label
}: {
  action: (form: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
}) {
  return (
    <form action={action} className="mt-3 space-y-3">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <label className="au-field-row">
        <span className="ax-eyebrow">{label}</span>
        <textarea name="reason" maxLength={MAX_REASON} rows={2} className={inputClass} />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve">Approve</Button>
        <Button type="submit" name="decision" value="reject" variant="secondary">Reject</Button>
      </div>
    </form>
  );
}
