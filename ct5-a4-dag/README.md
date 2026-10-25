# CT5.A4.DAG

A local, browser-based test GUI for building and inspecting an image-processing
node graph ("DAG") for an animated shot. Renders the graph in WebGL via
[three.js](https://threejs.org) (vendored locally — nothing is fetched off
the internet at runtime).

## Running it

No install, no server, no build step. Just open `index.html` in a modern
desktop browser (Chrome, Edge, or Firefox):

- Double-click `index.html`, **or**
- Drag it into a browser window, **or**
- From a terminal: `open index.html` (macOS) / `start index.html` (Windows) / `xdg-open index.html` (Linux)

Everything (three.js, app code, default node types, default filters) is a
local file next to `index.html`, so it works entirely offline.

If you'd rather serve it over `http://` (e.g. to test in a browser
extension context), any static file server works — e.g. `python3 -m
http.server` from this folder — but it is not required.

## Using the app

- **New Scene / Load Scene…** — if the current scene has unsaved changes,
  you'll be prompted to save, discard, or cancel first.
- **Save Scene / Save As…** — downloads the scene as a `.json` file through
  your browser's normal download flow (check your Downloads folder, or
  enable "Ask where to save each file" in your browser settings for a
  native Save dialog).
- **Node palette** (left) — click a node type to add an instance of it to
  the graph.
- **Graph canvas** (center, WebGL) —
  - Click a node or link to select it (its details appear on the right).
  - Drag a node to move it.
  - Drag from an output port (right-hand outlined circle) to an input port
    (left-hand outlined circle) to connect them — an arrow shows the
    direction. Drag from an input port to search for a source instead.
  - Scroll to zoom (centered on the cursor).
  - Drag empty canvas, or hold Shift and scroll, to pan.
  - Delete/Backspace removes the selected node or link.
  - "Fit View" frames the whole graph.
- **Properties / Scene JSON / Python Preview** (right) — tabs for editing
  the selected node's (or the scene's) attributes, viewing the live scene
  file as it will be saved, and previewing the python command each node
  would generate on the server (see "Python command preview" below).
- **Timeline** (bottom) — shows the whole start→end frame range at once
  (scaled to fit, no scrolling). Drag on the ruler to scrub, or use the
  step/play/stop transport buttons.

## Scene file format

A saved scene (`.json`) is a single, readable, hand-editable document
containing everything needed to reproduce the graph:

```jsonc
{
  "formatVersion": "1.0",
  "name": "Shot010_Comp",
  "startFrame": 1001, "endFrame": 1048, "fps": 25,
  "currentFrame": 1001,
  "resolution": { "x": 3840, "y": 2160 },
  "proxyResolution": { "x": 960, "y": 540 },
  "nodeTypes": [ /* the node-type definitions used by this scene, copied in
                    so the file is self-contained -- see below */ ],
  "filters": [ /* the convolution filter library used by this scene */ ],
  "nodes": [
    { "id": "<uuid>", "typeId": "image_input", "name": "Image_001",
      "x": 0, "y": 0, "active": true, "attributes": { "filepath": "" } }
  ],
  "links": [
    { "id": "<uuid>",
      "from": { "node": "<node id>", "port": "out" },
      "to":   { "node": "<node id>", "port": "in" } }
  ]
}
```

Node types and filters are embedded **inside** every saved scene (not just
referenced by path), so a scene file is fully self-contained and portable —
opening it later reproduces exactly the node types and filters it was built
with, even if the shared default library has since changed.

### Why links are stored as a flat top-level list

Each link is `{ from: {node, port}, to: {node, port} }`, referencing nodes
by their UUID and ports by name — a normal edge list for a directed graph.
This (rather than, say, nesting connections inside each node) keeps nodes
and topology independent: nodes can be reordered, ports renamed on the type
without breaking IDs, and the whole graph is trivial to topologically sort
(which is exactly what the python-preview generator does) or hand-edit.

## Node types: `data/node_types.default.json`

This is the "default file" new scenes start from. It's a template you can
edit or extend — copy it, add your own node type definitions, and load the
result into a scene with **Load Node Types…** (or start a new scene, then
load your file). Each entry looks like:

```jsonc
{
  "typeId": "convolution",        // stable id referenced by node instances
  "namePrefix": "Convolve",       // node instances are named Convolve_001, _002, ...
  "label": "Convolution",         // display label
  "category": "process",          // groups the palette: input | process | output
  "shape": "octagon",             // rectangle | rounded_rect | circle | diamond
                                   // | triangle | pentagon | hexagon | octagon
  "color": "#c9963d",             // node body tint
  "defaultActive": true,
  "inputs":  [ { "name": "in",  "portType": "image", "label": "in" } ],
  "outputs": [ { "name": "out", "portType": "image", "label": "out" } ],
  "attributes": [
    { "name": "filterType", "type": "filterRef", "label": "Filter", "default": "identity" }
  ],
  "pythonTemplate": "convolve_image.py --in \"{in.in}\" --filter {attr.filterType} --out \"{out.out}\""
}
```

Attribute `type`s understood by the inspector: `float`, `int`, `string`,
`path`, `color4` (RGBA, 0–1), `enum` (with an `options` list), and
`filterRef` (a dropdown of the scene's filter library).

Port `portType`s: `image`, `color`, `channel`, and `image_or_color` (an
input that accepts either an image or a constant color — used by *Split
RGBA*). An output port is only backed by a generated working file if its
type needs real pixel data (`image`/`channel`); a `color` output is treated
as a lightweight literal value, not a file.

The shipped defaults cover every node type in the spec: **Color** and
**Image** and **Image Sequence** inputs, a generic 1-in/1-out **Process**
(e.g. negate), **Convolution** (with a selectable filter), **Split RGBA**
(1 → 4), **Assemble RGBA** (4 → 1), **Composite** (2 → 1), plus a **Write
Output** node so a graph has somewhere to terminate.

## Filters: `data/filters.default.json`

The convolution filter library — each filter is a 2D array of floating
point numbers in row × column order (usually 5×5, but any size works),
plus a `normalize` flag (divide by the kernel's sum before applying).
Ships with `identity`, `blur` (box blur), `gaussian_blur`, `sharpen`, and
`edge_detect`. Edit this file (or **Load Filters…** a new one) to add your
own; any convolution node's Filter dropdown reflects whatever filters are
in the current scene.

## Python command preview

Nothing here actually executes anything — the **Python Preview** tab shows
what a server-side executor *might* run for each node, in dependency
(topological) order, for the current frame or the whole frame range. Each
node type's `pythonTemplate` is filled in with:

- `{attr.<name>}` — that node's attribute values
- `{in.<port>}` / `{out.<port>}` — the resolved working-directory filename
  feeding/leaving that port (or an inline literal for a `color`-typed port,
  or `<UNCONNECTED>` if nothing's wired up)
- `{frame}` / `{frame4}` — the current frame number, plain and zero-padded
- `{scene.resX}` / `{scene.resY}` / `{scene.proxyResX}` / `{scene.proxyResY}`
  / `{scene.fps}` / `{scene.name}`

Working files are named `work/<NodeName>[.<port>].<frame4><ext>` (the port
suffix only appears when a node has more than one output). This naming and
the actual python commands are placeholders for now — the real commands
this preview stands in for will be defined separately.

## `window.DAG_DEBUG`

Since this is itself a *test* GUI, the running app exposes a small
read-only debug handle in the browser console: `DAG_DEBUG.getScene()`,
`DAG_DEBUG.isDirty()`, `DAG_DEBUG.graph3d` (`.fitView()`,
`.portScreenPos(nodeId, side, portName)`, `.nodeScreenPos(nodeId)`, current
selection getters), and `DAG_DEBUG.timeline`. Handy for driving the app
from an automated test harness or just poking at state while debugging.

## Regenerating built-in defaults after editing the JSON templates

`js/defaults-data.js` is what "New Scene" actually loads from — it's a
generated copy of `data/node_types.default.json` and
`data/filters.default.json`, embedded as plain JS instead of being
`fetch()`-ed. This is only because browsers refuse to `fetch()` local files
over `file://`, which would otherwise break "just double-click index.html"
with no server. If you edit either JSON file and want **New Scene** to pick
up the changes (as opposed to loading your edited file into just the
current scene via the Load buttons, which always works), regenerate it:

```
node tools/build-defaults.js
```

(Requires Node.js only for this one optional step — the app itself needs
no build step and no Node.js to run.)

## Known simplifications

- The python commands are preview-only text, not executed.
- Save/Load use your browser's normal file-download and file-picker
  dialogs rather than a native "Save As" path chooser (no filesystem
  permission APIs are relied on, so this works in any browser, including
  when opened directly from disk).
- There's no undo/redo yet.
