import { inputClass } from "@/components/form";
import { Button } from "@/components/app/button";
import { Card } from "@/components/app/card";
import { Notice } from "@/components/app/notice";
import {
  HISTORY_LIMIT,
  eligibleSupervisors,
  memberLabel,
  utcDate,
  type AssignmentRecord,
  type MemberName
} from "@/lib/sites/assignments";
import { assignSupervisor, removeSupervisor } from "../actions";

type Props = {
  org: string;
  siteId: string;
  archived: boolean;
  /** null when the member names could not be read: rows then show "Unknown member". */
  members: MemberName[] | null;
  open: AssignmentRecord[];
  closed: AssignmentRecord[];
  capped: boolean;
};

const roleOf = (members: readonly MemberName[], userId: string) => members.find((m) => m.user_id === userId)?.role;

export function Supervisors({ org, siteId, archived, members, open, closed, capped }: Props) {
  const known = members ?? [];
  const who = (userId: string) => memberLabel(known, userId);
  const eligible = members && !archived ? eligibleSupervisors(members, open) : [];

  return (
    <Card title="Supervisors" id="si-supervisors">

      {members === null && (
        <div className="mt-3">
          <Notice kind="error">Member names could not be loaded, so people show as unknown and nobody can be assigned. Reload to try again.</Notice>
        </div>
      )}

      {open.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600">Nobody is assigned to this site.</p>
      ) : (
        <ul className="ov-todo mt-3">
          {open.map((a) => (
            <li key={a.id}>
              <span>
                <span className="font-medium">{who(a.user_id)}</span>
                {roleOf(known, a.user_id) && <span className="text-neutral-500"> · {roleOf(known, a.user_id)}</span>}
                <span className="mt-0.5 block text-neutral-600">
                  Assigned {utcDate(a.assigned_at)} by {who(a.assigned_by)}
                </span>
              </span>
              {!archived && (
                <form action={removeSupervisor}>
                  <input type="hidden" name="org_id" value={org} />
                  <input type="hidden" name="site_id" value={siteId} />
                  <input type="hidden" name="assignment_id" value={a.id} />
                  <Button type="submit" variant="secondary" aria-label={`Remove ${who(a.user_id)}`}>Remove</Button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {!archived && eligible.length > 0 && (
        <form action={assignSupervisor} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="org_id" value={org} />
          <input type="hidden" name="site_id" value={siteId} />
          <label className="au-field-row min-w-0 flex-1">
            <span className="ax-eyebrow">Assign a supervisor</span>
            <select name="user_id" required defaultValue="" className={inputClass}>
              <option value="" disabled>Choose a supervisor</option>
              {eligible.map((m) => (
                <option key={m.user_id} value={m.user_id}>{memberLabel(known, m.user_id)}</option>
              ))}
            </select>
          </label>
          <Button type="submit">Assign</Button>
        </form>
      )}
      {!archived && members !== null && eligible.length === 0 && (
        <p className="mt-3 text-xs text-neutral-500">
          Every supervisor of this organisation is already assigned, or there are none yet. Invite one from the team page.
        </p>
      )}

      {closed.length > 0 && (
        <>
          <h3 className="mt-6 ax-eyebrow">History</h3>
          <ul className="ov-todo mt-2">
            {closed.map((a) => (
              <li key={a.id} className="block">
                <span className="font-medium">{who(a.user_id)}</span>
                {roleOf(known, a.user_id) && <span className="text-neutral-500"> · {roleOf(known, a.user_id)}</span>}
                <span className="mt-0.5 block text-neutral-600">
                  Assigned {utcDate(a.assigned_at)} by {who(a.assigned_by)}. Removed {utcDate(a.unassigned_at ?? "")} by{" "}
                  {who(a.unassigned_by ?? "")}.
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {capped && (
        <p className="mt-2 text-xs text-neutral-500">Showing the newest {HISTORY_LIMIT} assignments. Older ones are not shown.</p>
      )}
      <p className="mt-2 ax-empty">Dates are in UTC.</p>
    </Card>
  );
}
