import { syncJobContainers } from './container-sync';
import { ContainerDto } from './dto/container.dto';

/** Minimal mock of the tx.clearancePlan delegate used by syncJobContainers. */
function makeTx(existing: { id: string; container: string }[]) {
  const clearancePlan = {
    findMany: jest.fn().mockResolvedValue(existing),
    update: jest.fn().mockResolvedValue(undefined),
    create: jest.fn().mockResolvedValue(undefined),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  return { tx: { clearancePlan } as never, clearancePlan };
}

const row = (c: Partial<ContainerDto> & { container: string }): ContainerDto =>
  c as ContainerDto;

describe('syncJobContainers', () => {
  it('updates a row by container match when its id is stale (no P2025)', async () => {
    const { tx, clearancePlan } = makeTx([{ id: 'real-1', container: 'ABC123' }]);

    await syncJobContainers(
      tx,
      'job-1',
      [row({ id: 'stale-999', container: 'ABC123', seal: 'S1' })],
      'user-1',
    );

    // Resolves to the existing row by container number instead of updating a
    // non-existent id.
    expect(clearancePlan.update).toHaveBeenCalledTimes(1);
    expect(clearancePlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'real-1' } }),
    );
    expect(clearancePlan.create).not.toHaveBeenCalled();
    expect(clearancePlan.deleteMany).not.toHaveBeenCalled();
  });

  it('collapses duplicate container numbers in the payload to a single write', async () => {
    const { tx, clearancePlan } = makeTx([]);

    await syncJobContainers(
      tx,
      'job-1',
      [
        row({ container: 'DUP1', seal: 'first' }),
        row({ container: 'dup1', seal: 'second' }),
      ],
      'user-1',
    );

    expect(clearancePlan.create).toHaveBeenCalledTimes(1);
    // Last occurrence wins.
    expect(clearancePlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ container: 'dup1', seal: 'second' }),
      }),
    );
  });

  it('reuses an existing row for a new (id-less) row with a known container', async () => {
    const { tx, clearancePlan } = makeTx([{ id: 'real-1', container: 'ABC123' }]);

    await syncJobContainers(
      tx,
      'job-1',
      [row({ container: 'ABC123', seal: 'S2' })],
      'user-1',
    );

    expect(clearancePlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'real-1' } }),
    );
    expect(clearancePlan.create).not.toHaveBeenCalled();
  });

  it('deletes existing rows no longer present in the payload', async () => {
    const { tx, clearancePlan } = makeTx([
      { id: 'keep', container: 'KEEP1' },
      { id: 'drop', container: 'DROP1' },
    ]);

    await syncJobContainers(
      tx,
      'job-1',
      [row({ id: 'keep', container: 'KEEP1' })],
      'user-1',
    );

    expect(clearancePlan.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['drop'] } },
    });
  });

  it('skips rows with a blank container number', async () => {
    const { tx, clearancePlan } = makeTx([]);

    await syncJobContainers(
      tx,
      'job-1',
      [row({ container: '   ' })],
      'user-1',
    );

    expect(clearancePlan.create).not.toHaveBeenCalled();
    expect(clearancePlan.update).not.toHaveBeenCalled();
  });
});
