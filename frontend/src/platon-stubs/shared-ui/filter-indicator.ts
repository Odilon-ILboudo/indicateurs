export interface FilterIndicator<T = unknown> {
  match: (filters: T) => boolean
  remove: (filters: T) => T
  describe(filters: T): string | Promise<string>
}

export const PeriodFilterMatcher: FilterIndicator<{ period?: number }> = {
  match: (filters) => filters.period != null && filters.period !== 0,
  remove: (filters) => ({ ...filters, period: undefined }),
  describe: (filters) => {
    const labels: Record<number, string> = { 1: '1 jour', 7: '1 semaine', 31: '1 mois', 180: '6 mois', 365: '1 an' }
    return `Modifié dans la période : ${labels[filters.period ?? 0] ?? `${filters.period} jours`}`
  },
}
