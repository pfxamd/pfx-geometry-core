# PFx Geometry Core

**Status:** alpha `0.1.0` — tested geometry/math foundations, not a general-purpose CAD engine.

A small, deterministic, renderer-independent 3D geometry foundation for building measured and verifiable objects. No AI models, cloud requirements, random geometry generation, or UI framework dependencies.

## Current capabilities

- Immutable 3D vectors, angles and distances.
- Immutable column-major 4x4 matrices, matrix composition, translation, scale and axis rotations.
- Right-handed camera view and WebGL-compatible perspective projection.
- Point projection to screen coordinates (top-left origin), depth and clip visibility.
- A centered, flat-shaded triangle-mesh box with verified dimensions, winding and array layout.
- Mesh bounds, non-degenerate-triangle checks and explicit meter/centimeter/millimeter conversions.
- Structured failures via `GeometryError` and a stable export surface.

**Not implemented yet:** arbitrary CAD solids, constraints solver, curves, SDF, Boolean operations, renderer adapter, material simulation, organic modeling, semantic identification of objects. A mathematically valid mesh does not prove it represents an intended real-world object. `validateMesh` is a basic validator, not a manifold/watertightness proof.

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

## Next milestone

Add a geometry-to-renderer adapter and browser visual regression tests without making the core dependent on a renderer. Then add parameterized curves and surfaces. New algorithms are accepted only with mathematical and regression tests.

## License

MIT. See [LICENSE](LICENSE).
