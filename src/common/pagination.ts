export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

/** Coerce a possibly-undefined/NaN pagination value to a positive integer. */
function positiveInt(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

/** Build the `{ total, page, limit, pages }` envelope used across list endpoints. */
export function paginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const p = positiveInt(page, 1);
  const l = positiveInt(limit, 20);
  return { total, page: p, limit: l, pages: Math.max(1, Math.ceil(total / l)) };
}

/**
 * Convert `page`/`limit` into Prisma `skip`/`take`. Guards against undefined/NaN
 * inputs (e.g. a bare object cast to a DTO that skipped class-transformer
 * defaults) so Prisma never receives `skip: NaN`.
 */
export function toSkipTake(
  page: number,
  limit: number,
): {
  skip: number;
  take: number;
} {
  const p = positiveInt(page, 1);
  const l = positiveInt(limit, 20);
  return { skip: (p - 1) * l, take: l };
}
