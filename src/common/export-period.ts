/** Human period line for list exports driven by list-filter DTOs. */
export function listPeriodLabel(query: {
  dateFrom?: string;
  dateTo?: string;
  month?: number;
  year?: number;
}): string {
  if (query.dateFrom || query.dateTo) {
    return `Period: ${query.dateFrom ?? '…'} to ${query.dateTo ?? '…'}`;
  }
  if (query.month && query.year) {
    const name = new Date(
      Date.UTC(query.year, query.month - 1, 1),
    ).toLocaleString('en', { month: 'long', timeZone: 'UTC' });
    return `Period: ${name} ${query.year}`;
  }
  if (query.year) return `Period: ${query.year}`;
  return 'Period: All time';
}
