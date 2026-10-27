// Saves a material movement on the phone and reads the site's materials back with an
// estimated balance. Owner: Materials (Nikhil). Issue #82, ADR-015, ADR-020.
//
// A movement is append-only, like the ledger it feeds: there is no edit, only a new
// record with its own id. Every save is under the signed-in user, and every read
// is too, so another user on a shared phone sees none of it.

import type { DeviceDb } from '../db/device-db';
import { enqueue, listRecords, newRecordId } from '../sync/outbox';
import { istDate, mirrorSummary, readMaterials } from '../sync/pull';
import { estimateBalance, type StoredMovement } from './estimate';
import {
  buildMovement,
  buildPayload,
  MovementError,
  parsePayload,
  stockState,
  type Movement,
  type MovementInput,
  type StockState,
} from './movement';

/** Records read back to work out estimates. The outbox keeps synced rows, so this is a cap, not a filter. */
const READ_LIMIT = 2000;
const RECENT_COUNT = 20;

export type MovementDraft = Omit<MovementInput, 'occurredOn'> & {
  /** An Asia/Kolkata day. Today on the phone when left out. */
  occurredOn?: string;
};

/**
 * Validates a movement against what this phone holds, then queues it under the user.
 * Throws MovementError, writing nothing, for anything the rules refuse. A material
 * this user's copy does not hold is refused: a supervisor cannot add one (ADR-015).
 */
export async function saveMovement(
  db: DeviceDb,
  userId: string,
  draft: MovementDraft,
  now: Date = new Date(),
): Promise<{ recordId: string; movement: Movement }> {
  const today = istDate(now.toISOString());
  const movement = buildMovement({ ...draft, occurredOn: draft.occurredOn ?? today }, today);
  const owned = await readMaterials(db, userId);
  if (!owned.some((m) => m.id === movement.materialId.toLowerCase())) throw new MovementError('material_not_found');
  const recordId = newRecordId();
  await enqueue(
    db,
    { entity: 'material_transactions', recordId, authorId: userId, payload: buildPayload(movement) },
    now,
  );
  return { recordId, movement };
}

/**
 * This user's movements of the given materials, newest first. A row that is not
 * a movement is skipped, never allowed to hide the others.
 */
export async function listMovements(
  db: DeviceDb,
  userId: string,
  materialIds: readonly string[],
  limit: number = READ_LIMIT,
): Promise<StoredMovement[]> {
  const wanted = new Set(materialIds.map((id) => id.toLowerCase()));
  const rows = await listRecords(db, userId, 'material_transactions', { limit });
  const stored: StoredMovement[] = [];
  for (const row of rows) {
    const movement = parsePayload(row.payload);
    if (movement === null || !wanted.has(movement.materialId.toLowerCase())) continue;
    stored.push({ recordId: row.recordId, movement, status: row.status, reason: row.reason, updatedAt: row.updatedAt });
  }
  return stored;
}

export interface SiteMaterial {
  id: string;
  name: string;
  unit: string;
  thresholdMilli: number | null;
  serverBalanceMilli: number;
  estimateMilli: number;
  state: StockState;
  /** This user's movements of it that the server has not been told about. */
  unsent: number;
}

export interface RecentMovement extends StoredMovement {
  materialName: string;
  unit: string;
}

export interface SiteMaterials {
  materials: SiteMaterial[];
  /** When the server balance was copied to this phone, ISO 8601. Null when the phone holds nothing for this user. */
  serverAsOf: string | null;
  recent: RecentMovement[];
}

const NOTHING: SiteMaterials = { materials: [], serverAsOf: null, recent: [] };

/** One site's materials with the estimate, and the user's latest movements there. */
export async function loadSiteMaterials(db: DeviceDb, userId: string, siteId: string): Promise<SiteMaterials> {
  const summary = userId ? await mirrorSummary(db, userId) : null;
  if (summary === null) return { ...NOTHING, materials: [], recent: [] };
  const mirrored = await readMaterials(db, userId, siteId);
  const movements = await listMovements(
    db,
    userId,
    mirrored.map((m) => m.id),
  );
  const materials = mirrored.map((m): SiteMaterial => {
    const mine = movements.filter((s) => s.movement.materialId.toLowerCase() === m.id);
    const { estimateMilli, unsent } = estimateBalance(m.balanceMilli, summary.refreshedAt, mine);
    return {
      id: m.id,
      name: m.name,
      unit: m.unit,
      thresholdMilli: m.thresholdMilli,
      serverBalanceMilli: m.balanceMilli,
      estimateMilli,
      state: stockState(estimateMilli, m.thresholdMilli),
      unsent,
    };
  });
  const byId = new Map(mirrored.map((m) => [m.id, m]));
  const recent = movements.slice(0, RECENT_COUNT).map((s): RecentMovement => {
    const material = byId.get(s.movement.materialId.toLowerCase());
    return { ...s, materialName: material?.name ?? '', unit: material?.unit ?? '' };
  });
  return { materials, serverAsOf: summary.refreshedAt, recent };
}
