/**
 * README.txt for the Blender bundle: what is inside, how to turn it into a
 * library, and what has (and has not) been tested.
 */
import { BLENDER_SCRIPT_NAME } from './blenderScript'
import type { BundleManifest } from './manifest'

export const README_NAME = 'README.txt'

const HR = '-'.repeat(72)

export function readmeText(manifest: BundleManifest): string {
  const cabinets = manifest.cabinets.map((c) => `  ${c.slug}.glb${c.thumbnail ? ` + ${c.slug}.png` : ''}  ${c.name} (${c.widthMm} x ${c.heightMm} x ${c.depthMm} mm)`)
  const skipped = manifest.skipped.map((s) => `  Not exported: ${s.name} (${s.reason})`)
  const assets = manifest.sceneAssets
    ? [
        '',
        `  ${manifest.sceneAssets.glb}  ${manifest.sceneAssets.assets.length} placed design asset(s) (furniture,`,
        '                           appliances, lights, decor) in room space, simple meshes:',
        '                           origin at the back-left floor corner, metres. Import it',
        '                           with File > Import > glTF 2.0; the library script skips it.',
      ]
    : []
  return [
    `CabinetMaker - Blender / Home Builder bundle`,
    `Project: ${manifest.project.name}`,
    HR,
    '',
    'CONTENTS',
    '',
    '  cabinets/<name>.glb      One glTF 2.0 model per cabinet. Metres, one object per',
    '                           part (named like "Left side"), closed doors and drawers.',
    '  cabinets/<name>.png      Front-elevation thumbnail (when the browser could draw it).',
    '  manifest.json            Cabinets, sizes, materials and hardware with SKUs.',
    `  ${BLENDER_SCRIPT_NAME}  Blender script that builds the asset library.`,
    '',
    ...cabinets,
    ...skipped,
    ...assets,
    '',
    'MAKE THE LIBRARY (Blender 4.x)',
    '',
    '1. Unzip this bundle into a folder, e.g. ~/CabinetMaker/bundle.',
    '2. Either run, from a terminal:',
    '',
    `     blender --background --python ${BLENDER_SCRIPT_NAME} -- <bundle dir> <library dir>`,
    '',
    `   or open ${BLENDER_SCRIPT_NAME} in Blender's Scripting tab, set BUNDLE_DIR`,
    '   and LIBRARY_DIR at the top of the script, and press Run Script.',
    '   With no library folder given, it writes to <bundle dir>/library.',
    '3. The library folder then holds, per cabinet, <name>.blend (one collection',
    '   named after the cabinet, marked as an asset, with the cabinet data in its',
    '   custom properties) and <name>.png (same-name thumbnail).',
    '',
    'ADD THE LIBRARY TO BLENDER / HOME BUILDER 5',
    '',
    '  Blender: Edit > Preferences > File Paths > Asset Libraries, press "+" and',
    '  choose the library folder. The cabinets then appear in the Asset Browser;',
    '  drag one into the scene (Import Method "Append" gives editable objects).',
    '',
    '  Home Builder 5 works from Blender asset libraries and library folders of',
    '  .blend files with same-name .png thumbnails, which is the layout written',
    "  here. Add the folder as an asset library as above, or copy the .blend/.png",
    "  pairs into the library folder Home Builder's settings point to. Folder names",
    '  and menus differ between Home Builder releases; check its documentation.',
    '',
    'GEOMETRY NOTES',
    '',
    '  - Each part is a plain box at its true size: no holes, grooves, hardware',
    '    or edge banding. Part data (size, material, grain, op count) is in each',
    "    object's custom properties.",
    '  - The cabinet origin is its left / floor / back corner. glTF is Y-up; the',
    "    Blender importer converts to Z-up, so the cabinet front faces Blender's",
    '    -Y (the Front view). Wall cabinets keep their mounting height.',
    '  - Materials are named after the project materials; colours match the',
    "    CabinetMaker 3D view. Replace them with your own in Blender.",
    '',
    'HOW THIS WAS TESTED',
    '',
    '  The .glb files are checked by automated tests (structure, alignment,',
    '  accessor counts and bounds, node names and positions). The Blender script',
    '  has NOT been run inside Blender: it was checked by review against the',
    '  Blender 4.x Python API, a Python syntax check, and a dry run against a',
    '  stand-in for the bpy module. Please report problems with the script, and',
    '  keep a backup of any library folder you point it at.',
    '',
  ].join('\n')
}
