import { expect, test, type Locator, type Page } from '@playwright/test'
import { openCard, openSection } from './helpers'

const HINGE = 'Concealed hinge 110°, full overlay'

/** `$1,234.56` → 123456 (integer cents, so sums are exact). */
function cents(text: string): number {
  const value = Number(text.replace(/[^0-9.-]/g, ''))
  expect(Number.isFinite(value), `"${text}" is an amount`).toBe(true)
  return Math.round(value * 100)
}

/** The amount next to a label in the Estimate "Totals" card. */
function totalsValue(page: Page, label: RegExp): Locator {
  return page.locator('dl > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd')
}

async function totalCents(page: Page, label: RegExp): Promise<number> {
  return cents(await totalsValue(page, label).innerText())
}

/** Cells of the first table row whose text matches `name`. */
function rowCells(page: Page, name: string | RegExp): Locator {
  return page.getByRole('row', { name }).first().getByRole('cell')
}

async function showEstimate(page: Page): Promise<void> {
  await openSection(page, 'Drawings & BOM')
  await page.getByRole('tab', { name: 'Estimate' }).click()
  await expect(page.getByRole('heading', { name: 'Totals' })).toBeVisible()
}

async function commit(field: Locator, value: string): Promise<void> {
  await field.fill(value)
  await field.press('Enter')
  await expect(field).toHaveValue(value)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('tablist', { name: 'Views' })).toBeVisible()
  // The front elevation is far cheaper to redraw on every edit than the WebGL view.
  await page.getByRole('tab', { name: 'Front', exact: true }).click()
})

test('hinge cost, an extra charge and tax flow into the estimate totals', async ({ page }) => {
  test.setTimeout(90_000)
  // Baseline hinge line.
  await showEstimate(page)
  const hingeCells = rowCells(page, new RegExp(`^${HINGE}`))
  const qty = Number((await hingeCells.nth(2).innerText()).replace(/[^0-9.]/g, ''))
  expect(qty).toBeGreaterThan(0)
  await expect(hingeCells.nth(3)).toHaveText('$6.50')
  const hardwareBefore = await totalCents(page, /^Hardware$/)

  // 02·5 Hardware catalog: the hinge now costs 10.
  await openSection(page, 'Build Options')
  await openCard(page, 'Hardware catalog')
  await page.getByRole('button', { name: new RegExp(`^${HINGE}`) }).click()
  await commit(page.getByRole('group', { name: HINGE }).getByLabel('Unit cost'), '10')
  await expect(page.getByRole('button', { name: new RegExp(`^${HINGE}.*\\$10\\.00`) })).toBeVisible()

  await showEstimate(page)
  await expect(hingeCells.nth(3)).toHaveText('$10.00')
  expect(cents(await hingeCells.nth(4).innerText())).toBe(qty * 1000)
  expect(await totalCents(page, /^Hardware$/)).toBe(hardwareBefore + qty * 350)

  // 03·3 Estimate: 10 % tax and an "Installation" charge of 3 h × 50.
  await openCard(page, 'Estimate')
  await page.getByRole('button', { name: /^03·3 Estimate/ }).locator('..').getByRole('button', { name: 'Advanced' }).click()
  await commit(page.getByLabel('Tax rate'), '10')
  await page.getByRole('button', { name: 'Add charge' }).click()
  await commit(page.getByRole('group', { name: /^Extra charge: / }).last().getByLabel('Description'), 'Installation')
  const charge = page.getByRole('group', { name: 'Extra charge: Installation' })
  await commit(charge.getByLabel('Qty'), '3')
  await charge.getByLabel('Unit', { exact: true }).selectOption('h')
  await commit(charge.getByLabel('Unit cost'), '50')

  // The estimate shows the charge line and the totals add up from the displayed lines.
  await expect(page.getByRole('button', { name: /^03·3 Estimate .* incl\. tax/ })).toBeVisible()
  const extraCells = rowCells(page, /^Installation/)
  await expect(extraCells.nth(1)).toHaveText('3 h')
  await expect(extraCells.nth(2)).toHaveText('$50.00')
  await expect(extraCells.nth(3)).toHaveText('$150.00')

  const materials = await totalCents(page, /^Materials$/)
  const hardware = await totalCents(page, /^Hardware$/)
  const labor = await totalCents(page, /^Labor$/)
  const extras = await totalCents(page, /^Extra charges$/)
  expect(extras).toBe(15_000)
  const subtotal = materials + hardware + labor + extras
  // Default margin 20 % on price: price = subtotal / 0.8 = subtotal × 5/4 (exact in integer cents).
  const price = Math.round((subtotal * 5) / 4)
  const tax = Math.round(price / 10)

  expect(await totalCents(page, /^Subtotal$/)).toBe(subtotal)
  expect(await totalCents(page, /^Margin \(20 %\)$/)).toBe(price - subtotal)
  expect(await totalCents(page, /^Price \(excl\. tax\)$/)).toBe(price)
  expect(await totalCents(page, /^Tax \(10 %\)$/)).toBe(tax)
  expect(await totalCents(page, /^Total$/)).toBe(price + tax)
})
