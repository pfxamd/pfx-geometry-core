# PFx Geometry Core

**Status:** alpha `0.4.0` — tested geometry/math foundations, not a general-purpose CAD engine.

A small, deterministic, renderer-independent 3D geometry foundation for building measured and verifiable objects. No AI models, cloud requirements, random geometry generation, or UI framework dependencies.

## Current capabilities

- Immutable 3D vectors, angles and distances.
- Immutable column-major 4x4 matrices, matrix composition, translation, scale and axis rotations.
- Right-handed camera view and WebGL-compatible perspective projection.
- Point projection to screen coordinates (top-left origin), depth and clip visibility.
- A centered, flat-shaded triangle-mesh box with verified dimensions, winding and array layout.
- Mesh bounds, non-degenerate-triangle checks and explicit meter/centimeter/millimeter conversions.
- Structured failures via `GeometryError` and a stable export surface.
- Cubic Bézier curves with analytic derivatives and bounded deterministic sampling.
- Bicubic Bézier surfaces from 4×4 control grids, analytic normals and indexed meshes.
- Optional, separate Three.js renderer adapter for triangle meshes and perspective cameras.
- Browser rendering regression check with a real WebGL 2 scene and orbit interaction.
- Full-turn revolution of positive-radius profiles with optional flat end discs.
- Straight +Z extrusion of strictly convex CCW polygons, including front/back and side faces.

**Not implemented yet:** arbitrary CAD solids, arbitrary-path sweeps, concave/holed extrusions, constraint solver, NURBS, SDF, Boolean operations, physically based material simulation in core, organic modeling, semantic identification of objects. A mathematically valid mesh does not prove it represents an intended real-world object. `validateMesh` is a basic validator, not a manifold/watertightness proof.

## Conventions

- Right-handed world: **+X right, +Y up, +Z toward the viewer**; camera looks down **−Z**.
- Coordinate values are unitless unless an application explicitly defines units; use **meters** as the project's canonical real-world unit.
- Angles are **radians**.
- Matrices are **column-major**, multiplied against column vectors. `multiply4(A, B)` applies **B first**, then **A**.
- WebGL clip-space depth is **[-1, +1]**. Screen pixels start at the **top-left**. Depth output is **[0,1]** only for points within near/far planes.
- The CPU geometry uses JavaScript **64-bit floating-point** numbers. GPU adapters may downcast values and lose precision.
- Degenerate vectors/triangles are rejected using a fixed numerical tolerance. Very small-scale geometry should be scaled to an appropriate unit before validation.

## Development

Requires Node.js >=20 and npm.

```sh
npm install
npm run check
node examples/first-scene.mjs
```

## Usage

```js
import {
  vec3, createBox, boundsOfMesh, perspectiveCamera, projectPoint,
} from '@pfxamd/geometry-core';

const mesh = createBox(2, 1, 0.5);
console.log(boundsOfMesh(mesh).size); // { x: 2, y: 1, z: 0.5 }

const camera = perspectiveCamera({
  eye: vec3(3, 2, 5), target: vec3(0, 0, 0),
  fovYRadians: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 100,
});
console.log(projectPoint(vec3(0, 0, 0), camera, { width: 1280, height: 720 }));
```

This package has not been published to npm. Import it from a local checkout or via a configured Git dependency after building it.

## Design boundary

`src/` contains only math, geometry, validation and camera-projection code. Display frameworks (Three.js/WebGL/WebGPU) are **adapters**, not geometry authorities. Geometry algorithms will be added as independently tested modules; changes must not silently change axes, units, winding or clip conventions.

## Curves and surfaces · 0.2.0

- `cubicBezier3(controls,t)` evaluates a four-control cubic Bézier curve for `0 <= t <= 1`.
- `cubicBezierDerivative3(controls,t)` returns the **unnormalized** analytic derivative.
- `sampleCubicBezier3(controls,segments)` includes endpoints; 1–4096 segments.
- `evaluateBezierPatch3(grid,u,v)` evaluates 4 rows (v) × 4 columns (u) and analytic `dP/du`, `dP/dv` and their unit cross-product normal.
- `createBezierPatchMesh(grid,{uSegments,vSegments})` samples an **open** surface with 1–128 subdivisions on each axis.

These functions require explicitly authored control points. They **do not infer object identity**, cap a surface, join patches, guarantee absence of self-intersections, or establish a watertight solid. Degenerate inputs fail explicitly. The fixed triangle-area tolerance is scale-dependent.

## Visual diagnostic

After `npm run build`, serve the repository root with `python3 -m http.server 8000` and open `http://localhost:8000/examples/bezier-preview.html`.

This diagnostic draws mathematically projected surface and control curves using Canvas 2D. It is not a Three.js renderer. Unit tests, not visual appearance, verify the analytic formulas.

## Three.js adapter · 0.3.0

This is a separate module: `adapters/three/index.mjs`. **The geometry engine never imports Three.js.** The adapter is an optional renderer dependency, implemented with the official `three` library; no code or dependency of Three.js is vendored into the math engine.

```js
import { createBox, vec3, perspectiveCamera } from '@pfxamd/geometry-core';
import { toThreeBufferGeometry, toThreePerspectiveCamera } from '@pfxamd/geometry-core/three';
import * as THREE from 'three';

const geometry = toThreeBufferGeometry(createBox(2, 1, 0.5));
const camera = toThreePerspectiveCamera(perspectiveCamera({
  eye: vec3(3, 2, 5), target: vec3(0, 0, 0),
  fovYRadians: Math.PI / 3, aspect: 16 / 9, near: 0.1, far: 100,
}));
const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({color: 0xaac0c8}));
const scene = new THREE.Scene();
scene.add(mesh);
// Supply your own WebGLRenderer, lights, canvas and render lifecycle.
// Dispose of geometry and material when the scene is no longer needed.
```

The GPU adapter retains source triangle indices, winding and normals. It checks for **Float32 overflow and triangle collapse**, rejecting geometry that loses basic triangle validity when converted to GPU buffers. It does not guarantee accurate micrometer-scale details on large world coordinates or preserve all CPU double precision. The camera adapter copies the core view/projection matrices and creates a mutable Three.js camera usable with controls. After changing the viewport aspect, the application must update the camera projection explicitly.

**Install:** `npm install`, then `npm run check`. Three.js is an optional peer dependency in the published package; applications must install a compatible version when using `/three`. The package has not been published to npm yet.

**Browser test:** `npm run test:browser` requires a local Google Chrome executable. CI runs an actual WebGL 2 frame plus a drag-to-orbit comparison and uploads the initial and orbited screenshots.

**Preview:** After `npm install && npm run build`, serve the repository root using `python3 -m http.server 8000`, then open `http://localhost:8000/examples/three-preview.html`. The local `node_modules/three` is mapped using a browser import map; no CDN is needed.

## Measured solid builders · 0.4.0

`revolveProfile(profile, {radialSegments, capEnds?})` revolves a polyline of
`{radius, height}` pairs by 360° around **Y**. Heights must be strictly
ascending and radii strictly positive. Radial segmentation is an integer
between 3 and 256. `capEnds` defaults to `true`; flat end discs are
created as separate faces with outward normals. Open ends are supported
via `capEnds:false`.

`extrudeConvexPolygon(polygon, depth)` extrudes **strictly convex CCW**
`{x,y}` points along **+Z**, from `z=0` to `z=depth`. This is a
**straight-line extrusion**, not a general 3D sweep. Both end caps and
flat-shaded side faces are included. Convexity, order, non-degeneracy,
finite inputs and output triangle buffers are checked.

```js
import {revolveProfile, extrudeConvexPolygon} from '@pfxamd/geometry-core';

const turned = revolveProfile([
  {radius:0.5,height:0},
  {radius:1,height:1},
  {radius:0.75,height:2},
], {radialSegments:64});

const extruded = extrudeConvexPolygon([
  {x:0,y:0},{x:2,y:0},{x:2,y:1},{x:0,y:1},
], 0.5);
```

The meshes preserve input dimensions and outward face winding. Capped
surfaces are spatially closed, but their flat-shaded/seam vertices
are duplicated: **no topological welding, manifold or watertight
proof** is asserted. A mathematical profile can also self-intersect
under certain conditions; the current validator does not rule this out.
CPU precision, mesh validation tolerance, and GPU Float32 conversion
limitations from earlier versions still apply.

**Visual test:** after `npm install && npm run build`, serve the repository
root using `python3 -m http.server 8000` and open
`http://localhost:8000/examples/solid-builders.html`.
`npm run test:browser` captures evidence for this new example as well as
the existing Three.js adapter example.

## Next milestone

Add topological adjacency/watertightness verification and more controlled
geometry operations (e.g. sweeps along defined paths), each with mathematical
tests, explicit domain constraints and visual diagnostics. Never substitute
random primitives or generated geometry for a specific unsupported object.

## License

MIT. See [LICENSE](LICENSE).
