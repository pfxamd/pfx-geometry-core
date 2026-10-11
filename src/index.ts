export { EPSILON, GeometryError, type GeometryErrorCode } from './errors.js';
export {
  vec3, add3, subtract3, scale3, dot3, cross3, length3, distance3, normalize3, angleBetween3,
  type Vec3,
} from './vector.js';
export {
  mat4, identity4, multiply4, translation4, scaling4, rotationX4, rotationY4, rotationZ4,
  transformPoint4, transformDirection4, lookAt4, type Mat4,
} from './matrix.js';
export {
  perspective4, perspectiveCamera, projectPoint,
  type PerspectiveOptions, type ProjectedPoint, type Camera,
} from './camera.js';
export {
  createBox, validateMesh, boundsOfMesh, convertLength,
  type TriangleMesh, type MeshBounds, type LengthUnit,
} from './mesh.js';

export {
  cubicBezier3, cubicBezierDerivative3, sampleCubicBezier3,
  type CubicBezierControls,
} from './bezier.js';
export {
  evaluateBezierPatch3, createBezierPatchMesh,
  type BezierPatchControls, type BezierPatchEvaluation, type PatchSegments,
} from './surface.js';
