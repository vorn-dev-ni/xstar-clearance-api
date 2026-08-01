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

/**
 * Syncs a job's container rows (ClearancePlan) to match `containers`:
 * rows with an `id` are updated, rows without one are created, and existing
 * rows whose id is absent from the payload are deleted. Unchanged rows keep
 * their `status` and history (unlike a delete-all + recreate). Must run inside
 * a transaction — pass the tx client. Rows with a blank container number are
 * skipped so empty trailing form rows don't persist.
 */
export async function syncJobContainers(
  tx: Tx,
  clearanceJobId: string,
  containers: ContainerDto[],
  userId: string,
): Promise<void> {
  const rows = containers.filter((c) => c.container?.trim());

  const existing = await tx.clearancePlan.findMany({
    where: { clearanceJobId },
    select: { id: true },
  });
  const keepIds = new Set(rows.map((c) => c.id).filter(Boolean));
  const toDelete = existing.filter((e) => !keepIds.has(e.id)).map((e) => e.id);

  if (toDelete.length) {
    await tx.clearancePlan.deleteMany({ where: { id: { in: toDelete } } });
  }

  for (const c of rows) {
    if (c.id) {
      await tx.clearancePlan.update({
        where: { id: c.id },
        data: toData(c),
      });
    } else {
      await tx.clearancePlan.create({
        data: { clearanceJobId, createdBy: userId, ...toData(c) },
      });
    }
  }
}
