/**
 * ┌──────────────────────────────────────────────┐
 * │                                              │
 * │  PFxamd                                      │
 * │  Ahmed                                       │
 * │                                              │
 * └──────────────────────────────────────────────┘
 *
 * @project     PFx Geometry Core
 * @author      Ahmed
 * @brand       PFxamd
 * @website     https://www.pfxamd.com
 * @repository  https://github.com/pfxamd/pfx-geometry-core
 * @license     MIT
 */

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

export {
  revolveProfile,
  type RevolutionProfilePoint,
  type RevolutionOptions,
} from './revolve.js';
export {
  extrudeConvexPolygon,
  type Point2,
} from './extrude.js';
export {
  analyzeMeshTopology, assertClosedOriented2Manifold,
  type TopologyOptions, type TopologyReport,
} from './topology.js';
export {
  sweepCircularTube, type TubeSweepOptions,
} from './sweep.js';

export {
  analyzeMeshSelfIntersections, assertNoDetectedSelfIntersections,
  type IntersectionOptions, type IntersectionKind,
  type TriangleIntersectionFinding, type TriangleIntersectionReport,
} from './intersections.js';
export { type BroadPhaseStrategy } from './broadphase.js';
export { orientation2D, orientation3D, type OrientationSign, type Point2D } from './predicates.js';
export { estimateTransverseTriangleIntersection, type Triangle3, type SegmentEstimate } from './segment.js';
export { classifyCoplanarTriangleContact3, type CoplanarContactKind, type CoplanarContactResult } from './coplanar.js';
export {
  inspectNearCoplanarTriangles3,
  type NearCoplanarOptions, type NearCoplanarResult, type ProjectedTriangleContact,
} from './near-coplanar.js';

export {
  analyzeMeshNearCoplanarPairs,
  type MeshNearCoplanarOptions,
  type MeshNearCoplanarFinding,
  type MeshNearCoplanarReport,
} from './mesh-proximity.js';
