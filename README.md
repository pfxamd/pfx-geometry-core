# PFx Geometry Core

**Status:** alpha `0.9.0` — tested geometry/math foundations, not a general-purpose CAD engine.

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
- Topological surface analysis after configurable coordinate welding: boundaries, orientation conflicts, over-subscribed edges, pinched vertices and connected components.
- Controlled circular-profile sweeps following open 3D polylines (bounded turning angles, explicit radius and planar end caps).
- Bounded triangle-pair geometric intersection diagnostics, including crossing, coplanar area overlap, isolated point contact and indeterminate edge-plane cases.
- A deterministic median-split 3D bounding-volume hierarchy (BVH) for conservative triangle candidate enumeration, cross-checked against sweep-and-prune.
- Adaptive-precision orientation predicates for 2D and 3D, integrated into triangle plane-side checks and projected inside/clip checks.
- An opt-in, conservative estimator for noncoplanar transverse triangle intersection segments with explicit indeterminate outcomes.
- Seeded adversarial tests and reproducible benchmark reports comparing BVH and sweep-and-prune.

**Not implemented yet:** arbitrary CAD solids, arbitrary-profile/curved-path sweeps, concave/holed extrusions, constraint solver, NURBS, SDF, Boolean operations, physically based material simulation in core, organic modeling, semantic identification of objects. A mathematically valid mesh does not prove it represents an intended real-world object. `validateMesh` is a basic validator, not a manifold/watertightness proof.

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

## Topology analysis and polyline tube sweep · 0.5.0

`analyzeMeshTopology(mesh, { weldTolerance?: number })` evaluates triangle
connectivity after **analysis-only coordinate welding**. The default tolerance
is an **absolute** `1e-9` in the mesh's own units. It reports boundary edges,
edges incident to more than two triangles, inconsistent winding, triangles
collapsed by welding, disconnected vertex fans (pinched vertices), unused
vertices and connected surface components. `assertClosedOriented2Manifold`
raises `GeometryError('INVALID_MESH')` for nonconforming topology.

**Important limitation:** `isClosedOriented2Manifold=true` certifies only a
*combinatorial* property at the chosen weld tolerance. It is **not proof of
geometric watertightness, absence of self-intersections, suitable volume for
manufacture, or true real-world dimensions**. Loose tolerances can conceal
gaps; highly different geometry scales may require explicit scaling. Multiple
disconnected closed shells may still pass and are reported separately.

`sweepCircularTube(path, { radius, radialSegments, capEnds? })` creates a
circular tube around an **open polyline of 2 to 64 3D waypoints**. The segment
tangents and transported cross-sectional frames are computed numerically.
Each bend must be at most 60 degrees, `radius` must not exceed 45% of the
shortest segment, and `radialSegments` must be an integer in 6..256.
End caps are enabled by default, and duplicate render vertices do not affect
topology analysis. Paths with too-sharp bends or zero-length segments fail
explicitly.

```js
import {
  vec3, sweepCircularTube, assertClosedOriented2Manifold,
} from '@pfxamd/geometry-core';

const mesh = sweepCircularTube([
  vec3(0, 0, 0),
  vec3(0, 1, 0),
  vec3(0.35, 2, 0.2),
], { radius: 0.2, radialSegments: 32 });
const report = assertClosedOriented2Manifold(mesh);
// The report verifies topology only, not solid self-intersection freedom.
```

**Diagnostic:** after `npm install && npm run build`, serve the repository
root using `python3 -m http.server 8000`, then open
`http://localhost:8000/examples/tube-preview.html`. The browser test
`npm run test:browser` also records initial/orbited images of the tube.

## Triangle-pair geometric diagnostics · 0.6.0

`analyzeMeshSelfIntersections(mesh, options?)` supplements the combinatorial
topology checker with **coordinate-space geometry tests**. It uses an
axis-aligned bounding-box broad phase, triangle-plane edge intersections,
and planar polygon clipping. The report classifies pairs as:

- `crossing`: noncoplanar intersection detected along a line segment.
- `coplanar-overlap`: overlapping coplanar triangles with positive area
  greater than the conservative tolerance-based area threshold.
- `point-contact`: isolated noncoplanar point contact.
- `uncertain`: edge-on-plane configuration where a reliable classification
  was not established.

```js
import { createBox, analyzeMeshSelfIntersections } from '@pfxamd/geometry-core';

const report = analyzeMeshSelfIntersections(createBox(1, 2, 3));
console.log(report.totalFindings, report.excludedAdjacentPairs);
```

The options are `tolerance` (default `1e-9`, absolute coordinate units),
`maxTriangles` (default 12000; hard maximum 20000), `maxCandidatePairs`
(default 250000; maximum 2000000), `broadPhase` (`'bvh'` by default,
`'sweep'` for comparison) and `maxFindings` (default 64; maximum
1000; counts remain complete even when retained findings are truncated). Meshes exceeding the budget fail explicitly, not by silently
returning a partial "all clear." `assertNoDetectedSelfIntersections` throws
when a finding is returned.

**Critical limits:**

- Noncoplanar pairs sharing an entire coordinate-identical edge are skipped
  as expected adjacency (counted in `excludedAdjacentPairs`).
- Noncoplanar pairs with only one shared coordinate-identified vertex are
  checked for interior line-segment crossings. Expected shared point contacts
  and numerically ambiguous shared-vertex cases are skipped and counted
  separately in `ignoredSharedVertexContacts` and
  `skippedSharedVertexAmbiguities`. These are **not certified clear**.
- Coplanar contacts with **zero positive overlap area** are not reported.
- Tiny overlap area can fall beneath the configurable numerical tolerance.
- This is a bounded floating-point diagnostic, **not** a robust exact-predicate
  geometry kernel. It cannot guarantee absence of all self-intersections,
  distinguish overlapping interiors everywhere, or detect enclosed shells
  that do not intersect at their boundaries.
- `noDetectedIntersections` indicates zero reported findings under these
  limitations. It is **not a mathematical proof of intersection-free solid
  geometry**; topology and geometric diagnostics must be treated separately.

**Visual evidence:** serve the built repo root after `npm install && npm run
build` and open `http://localhost:8000/examples/intersections-preview.html`.
It shows two overlapping measured solids, a separate reference solid and
highlighted triangle-pair findings. `npm run test:browser` verifies actual
WebGL rendering, report consistency and mouse-orbit changes.

## Spatial acceleration and adjacency · 0.7.0

The default `broadPhase:'bvh'` organizes triangle axis-aligned bounding
boxes into a deterministic binary hierarchy. A recursive same-tree pair
traversal emits each overlapping unordered triangle pair exactly once. It
avoids enumerating quadratically many pairs for spatially separated geometry;
**dense overlapping meshes remain potentially quadratic** and fail
explicitly when `maxCandidatePairs` is reached. The older
`broadPhase:'sweep'` method remains available as an independent
reference for regression parity.

Both broad phases retain the same narrow-phase geometric formulas. The
saved `findings` list contains the smallest lexicographic triangle-index
pairs regardless of traversal order, so truncation is deterministic and
repeatable. The report includes `broadPhasePairs`, `testedPairs`,
`excludedAdjacentPairs`, `ignoredSharedVertexContacts`, and
`skippedSharedVertexAmbiguities`.

**Tested examples:** the BVH and sweep modes have matching collision counts
and retained findings on overlapping solids, triangular fixtures, and
measured tubes. A 4096-triangle fixture with separated positions generates
zero candidate pairs. This is evidence of correct candidate pruning for
those fixtures, **not a measured guarantee about all input distributions**.

**Numerical limits remain:** near-coplanarity, very large world positions,
finite-precision projection, tangent contacts, and skipped shared-vertex
ambiguities can hide intersections. For exact geometric predicates, see
Shewchuk's adaptive arithmetic research and publicly available robust
orientation implementations; that upgrade has **not** been implemented yet.

## Adaptive orientation predicates · 0.8.0

The core now has `orientation2D(a,b,c)` and `orientation3D(a,b,c,d)`
returning `-1`, `0` or `1`. Both follow the core's +Y-up,
right-handed convention. Their signs are computed using the
`robust-predicates@3.0.3` open-source dependency, a JavaScript port
of Shewchuk's adaptive precision predicates. Its license is **Unlicense**.
The dependency is small, has no runtime dependencies, and contains
**no AI models**.

```js
import {orientation2D,orientation3D,vec3} from '@pfxamd/geometry-core';

orientation2D([0,0],[1,0],[0,1]); // +1: counterclockwise in +Y-up axes
orientation3D(vec3(0,0,0),vec3(1,0,0),
  vec3(0,1,0),vec3(0,0,1)); // +1: above the plane
```

The intersection diagnostic now evaluates triangle-plane sides through
adaptive `orient3d`, normalized by a triangle's double-area to preserve
the established distance tolerance in model coordinate units. It uses
adaptive `orient2d` for projected point-in-triangle sides and planar
clipping half-planes. Tests include **catastrophic cancellation** fixtures,
where naive floating-point determinants evaluate to zero despite a
nonzero exact sign for the represented IEEE-754 inputs, and a controlled
near-coplanar intersection.

**Crucial limitations:** this is **not** a fully exact triangle-intersection
algorithm. Line-plane intersection coordinates, polygon clipping
intersections, projected area and other arithmetic still use floating point.
Inputs that were already rounded before entering the core cannot be
recovered by robust predicates. Very large or extremely small scales,
coplanar-tolerance decisions, shared-vertex exclusions and self-intersecting
solids remain subject to explicit limits documented in 0.6.0 and 0.7.0.
The old conservative report semantics are preserved. No absolute guarantee
of a collision-free mesh is implied.

## Next milestone

Add independent randomized/adversarial geometric test fixtures and measure
the performance/precision tradeoff. Only then extend to more exact
triangle intersection classification and broad-phase scaling. Keep the
geometry engine separate from rendering and AI.

## Conservative intersection segment estimator · 0.9.0

`estimateTransverseTriangleIntersection(first, second, tolerance?)`
estimates **3D endpoints of one transverse triangle-pair intersection**
when both triangles strictly cross each other's plane and their normals
have a well-conditioned cross product. Both arguments are three ordered
`Vec3` vertices; `tolerance` is a positive *absolute* length in mesh units
(default `1e-9`). This function is independent from the mesh-wide collision
diagnostic and renderer.

```js
import { vec3, estimateTransverseTriangleIntersection } from '@pfxamd/geometry-core';
const a=[vec3(0,0,0),vec3(2,0,0),vec3(0,2,0)];
const b=[vec3(.4,.5,-1),vec3(1.6,.5,-1),vec3(1,.5,1)];
const result=estimateTransverseTriangleIntersection(a,b);
if(result.status==='crossing') {
  console.log(result.start,result.end,result.approximate);
}
```

The result is one of `{status:'none'}`, `{status:'crossing',
start,end,approximate:true}`, or `{status:'indeterminate',reason}`.
Expected boundary tangencies, near-parallel/coplanar triangles, small
segments and numerically unstable results **do not get invented endpoints**.
The estimator evaluates plane sidedness with adaptive orientation predicates,
clips triangle edges to planes with floating-point arithmetic, intersects the
two intervals along their common line, and checks the endpoints against both
triangles and their planes before returning them. This does **not** provide an
exact-predicate intersection segment or prove all other geometry is valid.

### Adversarial tests and performance evidence

`npm test` includes deterministic seeded fixtures (64 isolated crossings,
64 non-collisions, 64 translated segment checks, orientation permutation
checks), as well as known analytic endpoint tests, degenerate inputs and
translation invariance.

`npm run benchmark` prints structured JSON from actual `performance.now()`
measurements for separated triangles (256, 1024, 4096, 8192) and isolated
crossing pairs (128, 512, 1024). Each mode has one warmup and three measured
runs; the middle runtime is reported. The script checks that both broad-phase
algorithms produce identical candidate/collision counts; a mismatch fails.
CI stores the benchmark JSON as a downloadable artifact. These are
**observations**, not universal speed guarantees: environment, JIT warmup,
mesh density and runtime fluctuations strongly affect measurements.
Reported heap usage is JS heap at the end, *not* process peak memory.

Reference research on robust overlapping tests and precise arithmetic:
Philippe Guigue & Olivier Devillers (2003), *Fast and Robust
Triangle-Triangle Overlap Test Using Orientation Predicates*.
The available implementation is intentionally **more limited** than a general
exact geometric kernel.

## License

MIT. See [LICENSE](LICENSE).
