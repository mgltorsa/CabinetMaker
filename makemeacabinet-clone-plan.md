# Cabinet design app plan (inspired by Make Me a Cabinet)

Date: 3 Oct 2026. Sources: live walk of https://www.makemeacabinet.com/ (home, about, designer, CAM, login) plus public posts (Tormach, Reddit/Festool indexes). This is a product plan for a new app with the same *capabilities*. It is not a copy of their code, geometry rules, or file formats.

## What they actually are

Free browser cabinet tool. No download. Designer works without an account. Login is only for saving projects and machine settings across sessions. About page says core design/fabrication stays free; project/production management might later be paid; support via Patreon/Ko-fi and hardware affiliate links.

Author (public): Tormach user Colin_Kingsbury, amateur woodworker and software entrepreneur. No company, price list, or public GitHub found.

## Tech we could see

Confirmed from the live site:

- Next.js / React (`/_next/static/chunks`, app layout, webpack).
- Hosted with Vercel (`/_vercel/insights/script.js`).
- Product analytics: PostHog, served from their `/kerf/` path (surveys + session recorder, PostHog 1.434.0 assets).
- 3D viewer is WebGL (GPU / ReadPixels in the console). Library (Three.js vs raw WebGL) was **not** confirmed. Do not assume Three.js.
- 2D shop drawings are SVG (attribute warnings in console), not a canvas at the moment we looked.
- App routes seen: marketing home, `/about`, `/workspace/stack` (designer), `/login`.
- `app.makemeacabinet.com` resolves but returned HTTP 500 on `/` during a fetch. The working app is on the apex domain.

Not found, so do not treat as fact: OpenCascade or any B-rep kernel, a named nesting library, a named PDF library, a named CAM kernel. Public behavior looks like a **construction rules engine** (parts, joints, hardware) plus SVG drawings plus a light router CAM layer, not Cabinet Vision / Mozaik class machine posts.

## Feature inventory (seen in the designer)

### Design

Cabinet starts: bookshelf, dresser, nightstand, media console, drawer box; base, pantry/tall, floating, pencil drawer; wall, tower, blind corner, lazy susan, easy-reach; sink, oven, microwave, cooking center; closet towers, wardrobes, shoe/cubby/drawer/shelf mixes.

Sizing: metric or imperial; width, height, depth, floor height; presets and custom; toe kick none / panel / full with setback.

Openings: drawers, doors, shelves, mixed; dividers; shelf, drawer, and door counts; captured back.

Style: face frame, slab, full overlay; stile and rail sizes; pull style and finish.

Live: reveals, gaps, joints, and offsets recompute as you type. Toggles for dimensions, top, doors, doors-open, drawer faces, drawers, back.

Materials seen: 3/4 in / 18 mm carcass, 1/4 in / 6 mm back, 1/2 in / 12 mm drawer boxes; grain direction; finished bottom; System 32 / balanced panels.

Hardware: undermount or side-mount slides (Blum lengths); drawer-box corners free, dowel, Domino, or dado; door hinge inset; shelf-pin inset, spacing, diameter, depth.

### Views

- Orbit / pan / zoom WebGL 3D with dimensions.
- Front, side, and joinery views (face frame, carcass, side).
- Countertop top-down.
- Dimensioned panel details.
- Marketing also shows a room: walls, doors, windows, cabinets snapped to walls, Plan / Elev / 3D. That room UI was on the marketing page and was **not** a separate route we could open. Treat room layout as claimed, not fully verified in-app.

### Build

Carcass and back thickness, countertop or finished top, countertop thickness and overhang, stretcher height, extra front stretchers, rear nailers, separate kick base.

Joinery: Domino, dado/groove, dowel, or free. Offsets calculated.

Outputs in this area: cutting plan, panel details, panel schedule, BOM, PDF plan set, countertop plan.

Cutting plan: sheets grouped by thickness; sheet count, panel count, cut count, yield; 4×8 layouts; kerf, tolerance, breakdown and squaring cuts; grain/rotation; linear stock for face frames.

### Manufacture

Sections: toolpaths, G-code, machine and tooling, sheet layout.

Toolpath kinds shown: dado, profile cut, pinned joint. Stock groups 18 / 12 / 6 mm.

Tool library example: T1 1/4 in (6.35 mm) and T2 3/16 in (4.76 mm) end mills, with diameter, RPM, plunge feed, cut feed.

Tabs: on/off, spacing, width, thickness; onion-skin if tabs are off.

Machine: table X/Y, kerf, edge inset, home / tool-change / park, safe Z, program-safe Z, rapid clearance. Metric G21 works; inch G20 marked coming soon. Manual or automatic M6.

Export: one `.nc` per sheet or all sheets (example `untitled-cabinet-sheet-1.nc`).

Author has said early CAM was naive, fixed feeds, inspect before cycle start. Marketing still badges some CNC as preview. Do not treat their G-code as production-proven.

### Estimate

BOM: doors, drawer faces and boxes, hinges and runners with manufacturer part numbers, pull counts.

Cost: sheet goods, hardware, face-frame linear stock, labor for cutting, joinery, drilling, assembly, hardware install, shop rate, margin, sell price. A demo showed materials, labor, subtotal, 20% margin, and a final price.

PDF: elevations, panel details, cutting plans; marketing says a multi-page plan book.

## What we should build (same jobs, our own rules)

Split the product the way this category always splits. Do not start from a general CAD kernel.

1. **Project / room** (phase 2). Walls, openings, cabinet run, snap, gap flags, plan / elevation / 3D. Their room screen was not confirmed live; still in scope because you asked for it.
2. **Cabinet model.** A construction method (frameless, face frame, inset, overlay) plus parameters. Changing width regenerates parts and holes. This is the product.
3. **Parts and operations.** Each panel: size, grain, material, ops (dado, Domino/dowel, hinge cup, shelf pins, slide holes).
4. **Docs.** Elevations, panel details, schedule, BOM, one PDF.
5. **Nest.** Sheets by thickness, kerf, grain, yield. Router nest, not a beam-saw optimizer, unless you later want one.
6. **CAM.** Tool table, tabs or onion skin, safe Z, tool change, G21 first. Preview toolpaths. Download `.nc`. Simulation before anyone runs a machine.
7. **Estimate.** Material + hardware + labor + margin. Not a full invoicing/ERP unless you add it later (they have not).

### Suggested stack (ours, not theirs)

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js (React) + TypeScript | Matches a browser shop tool; you already work in this world |
| 3D | React Three Fiber (Three.js) | WebGL cabinet viewer, orbit, section toggles. Pick this ourselves; theirs is only "WebGL" |
| 2D | SVG | Elevations, nests, panel details, print |
| Rules | TypeScript construction engine, pure functions, no UI | Author described a UI bug as "between the UI and the construction engine." Keep that boundary |
| PDF | Server or client PDF from the same SVG/parts model | Plan book |
| CAM | Our own 2.5D profile/dado generator | Not a 5-axis kernel. Posts are machine-specific later |
| Accounts | Later. Local project first | They work with no login |
| Analytics | Optional, not part of the product | They use PostHog |

Geometry stays 2.5D boxes and holes. OpenCascade is unnecessary until you need freeform parts.

### Data model (minimum)

- `ConstructionMethod`: thicknesses, reveals, joinery type, System 32, toe kick, face-frame sizes.
- `Cabinet`: type, W/H/D, openings (drawer | door | shelf | divider), hardware ids.
- `Part`: name, L×W×T, material, grain, ops[].
- `Op`: kind (profile, dado, hole, mortise), tool id, depth, path in panel space.
- `Sheet`: material, size, kerf, placements[].
- `Machine`: envelope, Z heights, tool table, tool-change mode.
- `Estimate`: unit costs, hours by operation, rate, margin.

One cabinet document should be enough to regenerate drawings, BOM, nest, and G-code. Do not store those as the source of truth.

### Phases

**P0. One frameless box.** Width/height/depth, 18/6 mm, shelves. 3D + front/side SVG with dimensions. Panel list. No CNC.

**P1. Openings and hardware.** Drawers, doors, 35 mm cup hinges, undermount slides, shelf pins, Domino/dado/dowel as *operations on parts*, not just pictures. BOM with part numbers you maintain.

**P2. Face frame, toe kick, stretchers, nailers, countertop.** Styles they expose: slab, overlay, face frame, inset.

**P3. Nest and PDF.** 4×8 by thickness, grain, kerf, yield, multi-page PDF (elevations, panels, cuts, BOM).

**P4. CAM preview.** Tool table, profile and dado toolpaths drawn on the sheet, tabs, G21 `.nc` download, on-screen warning that code must be simulated. Inch G20 after metric is solid.

**P5. Estimate.** Sheets, hardware, linear stock, labor buckets, shop rate, margin.

**P6. Room.** Wall sketch, place cabinets, plan/elev/3D, then "open this cabinet."

**P7. Accounts.** Save/load. Optional. Do not block P0–P5 on it.

**P8. More cabinet types.** Corners, sink, oven, closet. Each type is a preset over the same engine, not a new app.

### Out of scope for a first clone of *their* depth

Factory posts (Homag, Biesse drill blocks), barcodes, ERP, edgebander control, photoreal client renders, quoting/invoicing. Millwork.app and Manufacture.app sell those; this product does not, on what we saw.

### Risks

- **G-code.** Their author told users not to run early code uninspected. Ship preview and a simulator. Do not imply a file is safe for a specific machine.
- **Their IP.** Rebuild rules from cabinet standards you choose (Blum docs, System 32, your joinery). Do not extract their JS bundles to copy algorithms.
- **Room and "optimized nest"** are partly marketing. Verify each in a prototype instead of assuming their nesting is a true optimizer.
- **Hardware catalogs** go stale. Store manufacturer + SKU and let the shop override cost.

### How to know a phase is done

- P0: change width, every part and both elevations update, no manual redraw.
- P1: a 3-drawer cabinet emits 3 boxes, 3 fronts, correct slide length, hinge or pin ops on the side panels.
- P3: PDF page count and sheet yield match the part list (same bug class they hit: UI and cut list disagreed).
- P4: toolpath preview and `.nc` describe the same polylines; a dry-run in a simulator matches the preview.

## Screens from the live app (3 Oct 2026)

Captured during the walk: marketing home, about, designer start, 3D cabinet, panel details, CAM toolpaths. Paths are local to the research session; the written inventory above is the record.
