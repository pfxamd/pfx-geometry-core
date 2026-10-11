# PFx Geometry Core

**Status:** alpha `0.2.0` — tested geometry/math foundations, not a general-purpose CAD engine.

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

**Not implemented yet:** arbitrary CAD solids, constraints solver, NURBS, SDF, Boolean operations, renderer adapter, material simulation, organic modeling, semantic identification of objects. A mathematically valid mesh does not prove it represents an intended real-world object. `validateMesh` is a basic validator, not a manifold/watertightness proof.

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

## Next milestone

Separate renderer adapter and automated browser visual checks; later extend with precisely scoped revolution/sweep operations and geometric constraints.

## License

MIT. See [LICENSE](LICENSE).
