import { inputClass } from "@/components/form";
import { MAX_REASON } from "@/lib/attendance/review";

const approveClass = "rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700";
const rejectClass = "rounded-md border border-neutral-900 px-4 py-2 font-medium text-neutral-900 hover:bg-neutral-100";

// One decision form. The reason is optional for Approve and needed for Reject; the
// action and the database enforce that, so the box carries no `required`.
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
      <label className="block text-sm font-medium text-neutral-700">
        {label}
        <textarea name="reason" maxLength={MAX_REASON} rows={2} className={`${inputClass} mt-1`} />
      </label>
      <div className="flex gap-2">
        <button type="submit" name="decision" value="approve" className={approveClass}>Approve</button>
        <button type="submit" name="decision" value="reject" className={rejectClass}>Reject</button>
      </div>
    </form>
  );
}
