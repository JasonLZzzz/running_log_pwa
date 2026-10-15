import type {
  BackupSource,
  Goal,
  RunRecord,
  Shoe,
  Snapshot,
} from '../domain/types';
import { migrateBackup, validateRecord } from './schema';
export type Counts = {
  added: number;
  updated: number;
  skipped: number;
  errors: number;
};
export type MergePlan = Snapshot & {
  counts: Counts;
  recordCounts: Counts;
  goalCounts: Counts;
  shoeCounts: Counts;
  protectedShoeLinks: number;
};
export const emptyCounts = (): Counts => ({
  added: 0,
  updated: 0,
  skipped: 0,
  errors: 0,
});
function mergeItems<T extends { updated_at: string }>(
  local: T[],
  incoming: T[],
  id: (item: T) => string,
) {
  const map = new Map(local.map((item) => [id(item), item]));
  const counts = emptyCounts();
  for (const item of incoming) {
    const existing = map.get(id(item));
    if (!existing) {
      map.set(id(item), item);
      counts.added++;
    } else if (Date.parse(item.updated_at) > Date.parse(existing.updated_at)) {
      map.set(id(item), item);
      counts.updated++;
    } else counts.skipped++;
  }
  return { items: [...map.values()], counts };
}
export function planMerge(local: Snapshot, source: BackupSource): MergePlan {
  const backup = migrateBackup(source.backup_version, source);
  const goals = mergeItems<Goal>(local.goals, backup.goals, (g) => g.goal_id);
  const shoes = mergeItems<Shoe>(
    local.shoes,
    backup.shoes,
    (shoe) => shoe.shoe_id,
  );
  const localRecords = new Map(
    local.records.map((record) => [record.record_id, record]),
  );
  let protectedShoeLinks = 0;
  const incomingRecords = backup.records.map((record) => {
    const existing = localRecords.get(record.record_id);
    if (
      source.backup_version === '1.0.0' &&
      existing?.shoe_id &&
      Date.parse(record.updated_at) > Date.parse(existing.updated_at)
    ) {
      protectedShoeLinks++;
      return { ...record, shoe_id: existing.shoe_id };
    }
    return record;
  });
  const records = mergeItems<RunRecord>(
    local.records,
    incomingRecords,
    (r) => r.record_id,
  );
  for (const record of records.items)
    validateRecord(record, goals.items, shoes.items);
  const counts = emptyCounts();
  for (const key of ['added', 'updated', 'skipped', 'errors'] as const)
    counts[key] = goals.counts[key] + records.counts[key] + shoes.counts[key];
  return {
    records: records.items,
    goals: goals.items,
    shoes: shoes.items,
    counts,
    recordCounts: records.counts,
    goalCounts: goals.counts,
    shoeCounts: shoes.counts,
    protectedShoeLinks,
  };
}
