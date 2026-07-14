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

/** Build the `{ total, page, limit, pages }` envelope used across list endpoints. */
export function paginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  return { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

/** Convert `page`/`limit` into Prisma `skip`/`take`. */
export function toSkipTake(
  page: number,
  limit: number,
): {
  skip: number;
  take: number;
} {
  return { skip: (page - 1) * limit, take: limit };
}
