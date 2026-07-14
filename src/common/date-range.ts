/**
 * Build a `[gte, lt)` date range for a given month/year (UTC). Either bound is
 * optional — supplying only `year` yields the whole year. Returns `undefined`
 * when neither is provided so callers can omit the date filter entirely.
 */
export function monthYearRange(
  month?: number,
  year?: number,
): { gte: Date; lt: Date } | undefined {
  if (!year) return undefined;
  if (month) {
    const gte = new Date(Date.UTC(year, month - 1, 1));
    const lt = new Date(Date.UTC(year, month, 1));
    return { gte, lt };
  }
  return {
    gte: new Date(Date.UTC(year, 0, 1)),
    lt: new Date(Date.UTC(year + 1, 0, 1)),
  };
}
