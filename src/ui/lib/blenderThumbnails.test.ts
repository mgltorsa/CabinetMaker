import { describe, expect, it } from 'vitest'
import { fixtureProject } from '@/core/fixtures'
import { runPipeline } from '@/pipeline'
import { containRect, THUMBNAIL_PX, thumbnailSvg } from './blenderThumbnails'

describe('thumbnailSvg', () => {
  it("renders the cabinet's front elevation at the thumbnail width", () => {
    const project = fixtureProject()
    const build = runPipeline(project).build.cabinets[0]!
    const svg = thumbnailSvg(project.cabinets[0]!, build, project.units)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain(`width="${THUMBNAIL_PX}"`)
    expect(svg).toContain('Base cabinet - front elevation')
  })
})

describe('containRect', () => {
  it('fits a tall image centred in the square', () => {
    expect(containRect(256, 512, 512)).toEqual({ x: 128, y: 0, w: 256, h: 512 })
  })

  it('fits a wide image centred in the square', () => {
    expect(containRect(800, 400, 512)).toEqual({ x: 0, y: 128, w: 512, h: 256 })
  })

  it('draws nothing for an empty image', () => {
    expect(containRect(0, 0, 512)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})
