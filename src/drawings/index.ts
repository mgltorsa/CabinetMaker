/**
 * Drawings: build/nest → neutral `Drawing` model → SVG string / PDF plan book.
 * Generators are pure: they read parts (cabinet space) and return mm shapes
 * with +Y up. `renderSvg` and the PDF renderer draw the same model.
 */
export { frontElevation } from './front-elevation'
export { sideElevation } from './side-elevation'
export { panelDetail, type PanelDetailOptions } from './panel-detail'
export { sheetLayout, type SheetLayoutOptions } from './sheet-layout'
export { renderSvg, escapeXml, type SvgOptions } from './svg'
