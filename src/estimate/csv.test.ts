import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import type { Bom, Estimate, Project } from '@/core/types'
import { bomToCsv, csvCell, partsToCsv, toCsv } from './csv'

const CRLF = '\r\n'

function lines(csv: string): string[] {
  expect(csv.endsWith(CRLF)).toBe(true)
  return csv.slice(0, -CRLF.length).split(CRLF)
}

describe('csvCell', () => {
  it('leaves plain text and numbers alone', () => {
    expect(csvCell('Side left')).toBe('Side left')
    expect(csvCell(12.5)).toBe('12.5')
    expect(csvCell(-3)).toBe('-3')
  })

  it('quotes cells containing comma, quote, CR or LF (RFC 4180)', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell('two\r\nlines')).toBe('"two\r\nlines"')
  })

  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tcmd', "'\tcmd"],
    ['＝1+1', "'＝1+1"],
  ])('neutralises formula-looking text %j', (input, expected) => {
    expect(csvCell(input)).toBe(expected)
  })

  it('neutralises then quotes a formula containing special characters', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"')
    expect(csvCell('\r=1')).toBe('"\'\r=1"')
  })

  it('renders non-finite numbers as empty cells', () => {
    expect(csvCell(Number.NaN)).toBe('')
    expect(csvCell(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('toCsv', () => {
  it('joins records with CRLF and ends with CRLF', () => {
    expect(toCsv([['a', 1], ['b,c', 2]])).toBe(`a,1${CRLF}"b,c",2${CRLF}`)
  })

  it('returns an empty string for no rows', () => {
    expect(toCsv([])).toBe('')
  })
})

function scheduleBom(): Bom {
  return {
    parts: [
      { partId: 'cab_1:side-left', cabinetId: 'cab_1', name: 'Side left', materialId: 'ply-18', length: 720, width: 560, thickness: 18, grain: 'length', opCount: 12 },
      { partId: 'cab_1:stile', cabinetId: 'cab_1', name: 'Stile, left', materialId: 'maple-19x63', length: 600.25, width: 38, thickness: 19, grain: 'length', opCount: 0 },
      { partId: 'cab_x:mystery', cabinetId: 'cab_x', name: 'Mystery', materialId: 'unobtainium', length: 100, width: 50, thickness: 6, grain: 'none', opCount: 1 },
    ],
    lines: [],
  }
}

describe('partsToCsv', () => {
  it('writes a metric cut list with cabinet and material names', () => {
    const csv = partsToCsv(scheduleBom(), fixtureProject())
    expect(lines(csv)).toEqual([
      'Cabinet,Part,Material,Length (mm),Width (mm),Thickness (mm),Grain,Ops',
      'Base cabinet,Side left,18 mm plywood,720,560,18,length,12',
      'Base cabinet,"Stile, left",Maple 19 × 63 mm (face frames),600.3,38,19,length,0',
      'cab_x,Mystery,unobtainium,100,50,6,none,1',
    ])
  })

  it('writes imperial lengths as fractional inches with quotes escaped', () => {
    const project: Project = { ...fixtureProject(), units: 'imperial' }
    const rows = lines(partsToCsv(scheduleBom(), project))
    expect(rows[0]).toBe('Cabinet,Part,Material,Length (in),Width (in),Thickness (in),Grain,Ops')
    expect(rows[1]).toBe('Base cabinet,Side left,18 mm plywood,"28 3/8""","22 1/16""","11/16""",length,12')
  })

  it('neutralises formula injection in user-entered names', () => {
    const base = fixtureProject()
    const project: Project = {
      ...base,
      cabinets: base.cabinets.map((c) => ({ ...c, name: '=cmd|"/c calc"!A1' })),
      materials: base.materials.map((m) => (m.id === 'ply-18' ? { ...m, name: '@evil' } : m)),
    }
    const bom: Bom = { ...scheduleBom(), parts: [{ ...scheduleBom().parts[0]!, name: '+Part' }] }
    const row = lines(partsToCsv(bom, project))[1]
    expect(row).toBe(`"'=cmd|""/c calc""!A1",'+Part,'@evil,720,560,18,length,12`)
  })

  it('writes only the header for an empty schedule', () => {
    expect(lines(partsToCsv({ parts: [], lines: [] }, fixtureProject()))).toHaveLength(1)
  })
})

function linesBom(): Bom {
  return {
    parts: [],
    lines: [
      { category: 'sheet', refId: 'ply-18', description: '18 mm plywood (2440 × 1220 mm)', qty: 2, unit: 'sheet', unitCost: 85, total: 170 },
      { category: 'linear', refId: 'maple-19x63', description: 'Maple, 1 board', qty: 1.955, unit: 'm', unitCost: 12, total: 23.46 },
      { category: 'hardware', refId: 'blum-cliptop-110', description: 'Hinge', manufacturer: 'Blum', sku: 'CLIP top 71B3550', qty: 4, unit: 'pcs', unitCost: 6.5, total: 26 },
      { category: 'hardware', refId: 'x', description: '-x (not in catalog)', qty: 1, unit: 'pcs', unitCost: 0, total: 0 },
    ],
  }
}

describe('bomToCsv', () => {
  it('writes every line with money to two decimals and a total row', () => {
    expect(lines(bomToCsv(linesBom(), 'USD'))).toEqual([
      'Category,Description,Manufacturer,SKU,Qty,Unit,Unit cost (USD),Total (USD)',
      'sheet,18 mm plywood (2440 × 1220 mm),,,2,sheet,85.00,170.00',
      'linear,"Maple, 1 board",,,1.955,m,12.00,23.46',
      'hardware,Hinge,Blum,CLIP top 71B3550,4,pcs,6.50,26.00',
      "hardware,'-x (not in catalog),,,1,pcs,0.00,0.00",
      'Total,,,,,,,219.46',
    ])
  })

  it('neutralises a malicious currency code in the header', () => {
    const header = lines(bomToCsv({ parts: [], lines: [] }, '=1,2'))[0]
    expect(header).toBe('Category,Description,Manufacturer,SKU,Qty,Unit,"Unit cost (=1,2)","Total (=1,2)"')
  })

  it('writes a zero total for an empty BOM', () => {
    expect(lines(bomToCsv({ parts: [], lines: [] }, 'EUR'))).toEqual([
      'Category,Description,Manufacturer,SKU,Qty,Unit,Unit cost (EUR),Total (EUR)',
      'Total,,,,,,,0.00',
    ])
  })

  it('appends extra charges and the estimate summary through tax and total when given an estimate', () => {
    const bom = linesBom()
    const estimate: Estimate = {
      currency: 'USD',
      materials: bom.lines.slice(0, 2),
      hardware: bom.lines.slice(2),
      labor: [{ bucket: 'cutting', minutes: 60, cost: 65 }],
      materialCost: 193.46,
      hardwareCost: 26,
      laborCost: 65,
      extras: [{ category: 'extra', refId: 'x1', description: '=Installation', qty: 3, unit: 'h', unitCost: 50, total: 150 }],
      extrasCost: 150,
      materialMarkupAmount: 19.35,
      hardwareMarkupAmount: 0,
      markupAmount: 19.35,
      subtotal: 453.81,
      marginAmount: 113.45,
      minimumChargeAdjustment: 32.74,
      price: 600,
      taxRate: 0.075,
      tax: 45,
      total: 645,
    }
    expect(lines(bomToCsv(bom, 'USD', estimate)).slice(5)).toEqual([
      "extra,'=Installation,,,3,h,50.00,150.00",
      'Materials,,,,,,,193.46',
      'Hardware,,,,,,,26.00',
      'Labor,,,,,,,65.00',
      'Extra charges,,,,,,,150.00',
      'Markup,,,,,,,19.35',
      'Subtotal,,,,,,,453.81',
      'Margin,,,,,,,113.45',
      'Minimum charge adjustment,,,,,,,32.74',
      'Price (excl. tax),,,,,,,600.00',
      'Tax (7.5 %),,,,,,,45.00',
      'Total,,,,,,,645.00',
    ])
  })
})
