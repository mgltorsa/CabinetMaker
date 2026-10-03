import { readFile } from 'node:fs/promises'
import { expect, type Page } from '@playwright/test'

export type JsonProject = {
  name: string
  schemaVersion: number
  cabinets: unknown[]
  tools: { stepDown: number }[]
  hardware: { id: string; kind: string; props: Record<string, number> }[]
}

/** Open a numbered sidebar section ("Cabinet", "Build Options", "Drawings & BOM", "CAM / CNC"). */
export async function openSection(page: Page, title: string): Promise<void> {
  const trigger = page.getByRole('button', { name: new RegExp(`^\\d\\d ${title.replace(/[/&]/g, (c) => `\\${c}`)}$`) })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

/** Open a numbered card (e.g. "Drawers") if it is closed. */
export async function openCard(page: Page, title: string): Promise<void> {
  const trigger = page.getByRole('button', { name: new RegExp(`^\\d\\d·\\d ${title} `) })
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

export async function projectMenu(page: Page, item: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Project menu' }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** The current project, via Project menu → Export JSON. */
export async function exportedProject(page: Page): Promise<{ project: JsonProject; filename: string }> {
  const downloadPromise = page.waitForEvent('download')
  await projectMenu(page, 'Export JSON')
  const download = await downloadPromise
  return { project: JSON.parse(await readFile(await download.path(), 'utf8')) as JsonProject, filename: download.suggestedFilename() }
}

export async function importProject(page: Page, project: JsonProject | Record<string, unknown>, name = 'project.json'): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
}
