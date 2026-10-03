/**
 * BOM, cut list, cost estimate and CSV export. Pure TS, no UI.
 *
 * `buildBom` and `estimateCost` are called by `src/pipeline`; the rest is for
 * views and downloads. See each file's header for the rules it implements.
 */
export { buildBom, NOT_IN_CATALOG } from './bom'
export { GROUP_ORDER } from './schedule'
export { clampMargin, estimateCost, MAX_MARGIN } from './cost'
export { buildLabor, countOps, LABOR_BUCKETS, type OpCounts } from './labor'
export { bomToCsv, csvCell, partsToCsv, toCsv, type CsvValue } from './csv'
export { formatMoney, roundMoney, sumMoney } from './money'
