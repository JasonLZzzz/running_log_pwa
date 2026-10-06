import type { Backup, Goal, RunRecord, Snapshot } from '../domain/types';
import { validateRecord } from './schema';
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
export function planMerge(local: Snapshot, backup: Backup): MergePlan {
  const goals = mergeItems<Goal>(local.goals, backup.goals, (g) => g.goal_id);
  const records = mergeItems<RunRecord>(
    local.records,
    backup.records,
    (r) => r.record_id,
  );
  for (const record of records.items) validateRecord(record, goals.items);
  const counts = emptyCounts();
  for (const key of ['added', 'updated', 'skipped', 'errors'] as const)
    counts[key] = goals.counts[key] + records.counts[key];
  return {
    records: records.items,
    goals: goals.items,
    counts,
    recordCounts: records.counts,
    goalCounts: goals.counts,
  };
}
