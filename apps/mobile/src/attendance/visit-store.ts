// Saves and reads a user's site visits through the outbox. Owner: Attendance (Manish).
// Issue #79, ADR-034. The outbox is the only place a visit lives on the phone:
// every write goes there first, under its author, and the screen reads it back.

import type { DeviceDb } from '../db/device-db';
import type { OutboxStatus } from '../sync/entities';
import { enqueue, listRecords, newRecordId } from '../sync/outbox';
import { buildPayload, parsePayload, VisitError, withReason, type Visit } from './visit';

export interface StoredVisit {
  recordId: string;
  visit: Visit;
  status: OutboxStatus;
  reason: string | null;
}

/** This user's visits to a site, newest first. A row that is not a visit is skipped. */
export async function listVisits(db: DeviceDb, userId: string, siteId: string): Promise<StoredVisit[]> {
  const records = await listRecords(db, userId, 'site_visits', { siteId });
  const visits: StoredVisit[] = [];
  for (const r of records) {
    const visit = parsePayload(r.payload);
    if (visit) visits.push({ recordId: r.recordId, visit, status: r.status, reason: r.reason });
  }
  return visits;
}

/** The latest visit of this user at this site that has no check-out yet. */
export async function findOpenVisit(db: DeviceDb, userId: string, siteId: string): Promise<StoredVisit | null> {
  return (await listVisits(db, userId, siteId)).find((v) => v.visit.checkOut === null) ?? null;
}

/** Saves a new visit under a phone-made id and returns the id. Nothing is sent from here. */
export async function saveCheckIn(db: DeviceDb, userId: string, visit: Visit, now: Date = new Date()): Promise<string> {
  const recordId = newRecordId();
  await enqueue(db, { entity: 'site_visits', recordId, authorId: userId, payload: buildPayload(visit) }, now);
  return recordId;
}

async function ownVisit(db: DeviceDb, userId: string, recordId: string): Promise<StoredVisit> {
  // Scoped to the author: another user's record id finds nothing.
  const records = await listRecords(db, userId, 'site_visits');
  const found = records.find((r) => r.recordId === recordId.toLowerCase());
  const visit = found ? parsePayload(found.payload) : null;
  if (!found || !visit) throw new VisitError('not_found');
  return { recordId: found.recordId, visit, status: found.status, reason: found.reason };
}

/** Re-saves the same record with the check-out leg filled in. */
export async function saveCheckOut(
  db: DeviceDb,
  userId: string,
  recordId: string,
  visit: Visit,
  now: Date = new Date(),
): Promise<void> {
  const own = await ownVisit(db, userId, recordId);
  await enqueue(db, { entity: 'site_visits', recordId: own.recordId, authorId: userId, payload: buildPayload(visit) }, now);
}

/**
 * Fixes a refused visit: puts the reason on its latest leg and saves it again under
 * the same record id, which re-queues it (ADR-016). Only a refused visit: a
 * conflict means the server kept its own version, and there is nothing to resend.
 */
export async function resendWithReason(
  db: DeviceDb,
  userId: string,
  recordId: string,
  reason: string,
  now: Date = new Date(),
): Promise<void> {
  const own = await ownVisit(db, userId, recordId);
  const fixed = withReason(own.visit, reason);
  if (own.status !== 'rejected') throw new VisitError('not_refused');
  await enqueue(db, { entity: 'site_visits', recordId: own.recordId, authorId: userId, payload: buildPayload(fixed) }, now);
}
