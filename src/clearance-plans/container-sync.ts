import { Prisma } from '@prisma/client';
import { ContainerDto } from './dto/container.dto';

type Tx = Pick<Prisma.TransactionClient, 'clearancePlan'>;

/** Maps a container DTO to the ClearancePlan column data (excluding job/id). */
function toData(c: ContainerDto) {
  return {
    container: c.container,
    blNumber: c.blNumber || null,
    size: c.size || null,
    containerType: c.containerType || null,
    commodity: c.commodity || null,
    seal: c.seal || null,
    port: c.port || null,
    consignee: c.consignee || null,
    clearanceDate: c.clearanceDate ? new Date(c.clearanceDate) : null,
    notes: c.notes || null,
  };
}

const normalizeContainer = (c: string) => c.trim().toLowerCase();

/**
 * Syncs a job's container rows (ClearancePlan) to match `containers`. The sync is
 * idempotent and scoped to the job: each incoming row is resolved to an existing
 * row by its `id` (only when that id belongs to this job) or, failing that, by a
 * case-insensitive match on its container number. Resolved rows are updated,
 * unresolved ones are created, and existing rows no longer referenced are deleted.
 * Unchanged rows keep their `status` and history (unlike a delete-all + recreate).
 *
 * Because container numbers are the per-row key, incoming rows are de-duplicated by
 * number (last one wins) and a new row whose number already exists reuses that row
 * — so a stale/foreign id can't 500 (no `update` on a missing id) and re-saves
 * can't spawn duplicate plans. Must run inside a transaction — pass the tx client.
 * Rows with a blank container number are skipped so empty trailing form rows don't
 * persist.
 */
export async function syncJobContainers(
  tx: Tx,
  clearanceJobId: string,
  containers: ContainerDto[],
  userId: string,
): Promise<void> {
  // De-duplicate the payload by container number (last occurrence wins).
  const byNumber = new Map<string, ContainerDto>();
  for (const c of containers) {
    if (c.container?.trim()) byNumber.set(normalizeContainer(c.container), c);
  }
  const rows = [...byNumber.values()];

  const existing = await tx.clearancePlan.findMany({
    where: { clearanceJobId },
    select: { id: true, container: true },
  });
  const validIds = new Set(existing.map((e) => e.id));
  const idByContainer = new Map(
    existing.map((e) => [normalizeContainer(e.container), e.id]),
  );

  // Resolve each incoming row to the existing row it should update (if any).
  const keepIds = new Set<string>();
  const resolved = rows.map((c) => {
    const targetId =
      (c.id && validIds.has(c.id) ? c.id : undefined) ??
      idByContainer.get(normalizeContainer(c.container));
    if (targetId) keepIds.add(targetId);
    return { c, targetId };
  });

  const toDelete = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);
  if (toDelete.length) {
    await tx.clearancePlan.deleteMany({ where: { id: { in: toDelete } } });
  }

  for (const { c, targetId } of resolved) {
    if (targetId) {
      await tx.clearancePlan.update({
        where: { id: targetId },
        data: toData(c),
      });
    } else {
      await tx.clearancePlan.create({
        data: { clearanceJobId, createdBy: userId, ...toData(c) },
      });
    }
  }
}
