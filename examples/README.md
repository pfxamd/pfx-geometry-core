# Examples

First compile the core:

```sh
npm install
npm run build
```

For a numeric proof of measured geometry and projected coordinates:

```sh
node examples/first-scene.mjs
```

For a local browser wireframe preview:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/examples/perspective-preview.html`.

The preview draws a 2 × 1 × 0.5 box using `projectPoint` and the Canvas 2D API. It is a geometry/perspective diagnostic, **not** a production renderer or a Three.js adapter. The server must serve the project root after `dist/` is built; `file://` module imports will not work reliably.

## Solid builders (0.4.0)

After the normal install/build steps, open
`http://localhost:8000/examples/solid-builders.html`.
It renders a revolution-built object and a measured convex extrusion
through the existing Three.js adapter. Orbit using the pointer.

The browser regression test saves both initial and orbited screenshots.
The visualization illustrates deterministic geometry construction; its
materials do not establish any additional geometric correctness.

## Topology and path sweep (0.5.0)

Open `http://localhost:8000/examples/tube-preview.html` after building and
serving the repository root. The example renders a tube whose geometry follows
a measured three-dimensional polyline. Topology counts are obtained directly
from the CPU core and orbit interaction is verified in the browser regression
suite. This does not prove geometric intersection-free output.

## Triangle intersections (0.6.0)

Open `http://localhost:8000/examples/intersections-preview.html` after
building and serving the repository root. Overlapping measured boxes are
shown beside an isolated reference solid, with diagnostic triangle edges
highlighted. The scene does **not** portray a calculated intersection
volume or assert universal collision-free geometry. Browser tests record
the initial and rotated scenes.

## BVH and adjacency diagnostics (0.7.0)

The triangle-intersection WebGL preview now shows the selected broad phase
and conservative AABB candidate count. Screenshot tests assert that the BVH
diagnostic really ran. Geometry and rendering stay separate.

## Transverse triangle intersection (0.9.0)

Open `http://localhost:8000/examples/segment-preview.html` after running
`npm install && npm run build` and serving the repository root.
The new example displays two source triangles and the calculated approximate
intersection segment (with marked endpoints), with mouse orbiting.

The visual test asserts the reported segment length (0.6 model units),
the non-exact `approximate` flag, successful WebGL rendering and a changed
frame after orbiting. It is a geometric diagnostic, not a photorealistic
renderer or proof of all triangle intersections.
