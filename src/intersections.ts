import { finite, GeometryError, positive } from './errors.js';
import { type TriangleMesh, validateMesh } from './mesh.js';

type V3 = readonly [number, number, number];
type V2 = readonly [number, number];
type Triangle = readonly [V3, V3, V3];
type TriangleData = {
  readonly points: Triangle;
  readonly normal: V3;
  readonly min: V3;
  readonly max: V3;
};

export interface IntersectionOptions {
  /** Absolute distance tolerance in mesh coordinate units; default 1e-9. */
  readonly tolerance?: number;
  /** Hard computational budget; default/max 1500 triangles. */
  readonly maxTriangles?: number;
  /** Maximum number of findings retained (counts remain complete); default 64. */
  readonly maxFindings?: number;
}

export type IntersectionKind =
  | 'crossing'
  | 'coplanar-overlap'
  | 'point-contact'
  | 'uncertain';

export interface TriangleIntersectionFinding {
  readonly firstTriangle: number;
  readonly secondTriangle: number;
  readonly kind: IntersectionKind;
}

export interface TriangleIntersectionReport {
  readonly triangles: number;
  readonly broadPhasePairs: number;
  readonly testedPairs: number;
  /** Noncoplanar pairs sharing a coordinate-identified vertex are excluded. */
  readonly excludedAdjacentPairs: number;
  readonly crossings: number;
  readonly coplanarOverlaps: number;
  readonly pointContacts: number;
  readonly uncertainPairs: number;
  readonly totalFindings: number;
  readonly findings: ReadonlyArray<TriangleIntersectionFinding>;
  readonly truncated: boolean;
  /**
   * Only says no findings within this bounded numerical test. NOT a proof
   * of globally intersection-free geometry or a valid solid.
   */
  readonly noDetectedIntersections: boolean;
}

const subtract = (a: V3, b: V3): V3 =>
  [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const distance = (a: V3, b: V3): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const cross2 = (a: V2, b: V2): number => a[0] * b[1] - a[1] * b[0];
const subtract2 = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];

function triangleData(mesh: TriangleMesh, index: number): TriangleData {
  const coordinates = [0, 1, 2].map(k => {
    const i = mesh.indices[index * 3 + k]! * 3;
    return [mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!] as V3;
  }) as unknown as Triangle;
  const n = cross(subtract(coordinates[1], coordinates[0]),
                  subtract(coordinates[2], coordinates[0]));
  const length = Math.hypot(...n);
  if (!Number.isFinite(length) || length <= 0) {
    throw new GeometryError('DEGENERATE_GEOMETRY', 'Unstable triangle normal');
  }
  const normal: V3 = [n[0] / length, n[1] / length, n[2] / length];
  const min: V3 = [
    Math.min(...coordinates.map(p => p[0])),
    Math.min(...coordinates.map(p => p[1])),
    Math.min(...coordinates.map(p => p[2])),
  ];
  const max: V3 = [
    Math.max(...coordinates.map(p => p[0])),
    Math.max(...coordinates.map(p => p[1])),
    Math.max(...coordinates.map(p => p[2])),
  ];
  return { points: coordinates, normal, min, max };
}

function aabbOverlap(a: TriangleData, b: TriangleData, epsilon: number): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (a.max[axis]! + epsilon < b.min[axis]! ||
        b.max[axis]! + epsilon < a.min[axis]!) return false;
  }
  return true;
}

function sharedCoordinate(a: Triangle, b: Triangle, epsilon: number): boolean {
  for (const p of a) for (const q of b) {
    if (distance(p, q) <= epsilon) return true;
  }
  return false;
}

function projected(p: V3, droppedAxis: number): V2 {
  switch (droppedAxis) {
    case 0: return [p[1], p[2]];
    case 1: return [p[0], p[2]];
    default: return [p[0], p[1]];
  }
}
function dominantAxis(normal: V3): number {
  const a = normal.map(Math.abs);
  return a[0]! >= a[1]! && a[0]! >= a[2]! ? 0 :
         a[1]! >= a[2]! ? 1 : 2;
}
function signedArea(poly: ReadonlyArray<V2>): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    sum += cross2(a, b);
  }
  return sum / 2;
}

/** Clip one convex triangle to the half-planes of another convex triangle. */
function coplanarOverlapArea(a: Triangle, b: Triangle, normal: V3): number {
  const axis = dominantAxis(normal);
  let subject = a.map(p => projected(p, axis));
  const clip = b.map(p => projected(p, axis));
  const direction = signedArea(clip) >= 0 ? 1 : -1;
  for (let edge = 0; edge < 3; edge++) {
    const v = clip[edge]!, w = clip[(edge + 1) % 3]!;
    const side = (p: V2): number =>
      direction * cross2(subtract2(w, v), subtract2(p, v));
    const output: V2[] = [];
    for (let i = 0; i < subject.length; i++) {
      const current = subject[i]!, previous = subject[(i + subject.length - 1) % subject.length]!;
      const dCur = side(current), dPrev = side(previous);
      const inCur = dCur >= 0, inPrev = dPrev >= 0;
      if (inCur !== inPrev) {
        const denom = dPrev - dCur;
        if (denom !== 0) {
          const t = dPrev / denom;
          output.push([
            previous[0] + t * (current[0] - previous[0]),
            previous[1] + t * (current[1] - previous[1]),
          ]);
        }
      }
      if (inCur) output.push(current);
    }
    subject = output;
    if (subject.length === 0) return 0;
  }
  return Math.abs(signedArea(subject));
}

function insideTriangle(p: V3, triangle: Triangle, normal: V3, epsilon: number): boolean {
  const axis = dominantAxis(normal);
  const p2 = projected(p, axis);
  const vertices = triangle.map(v => projected(v, axis));
  const direction = signedArea(vertices) >= 0 ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    const a = vertices[i]!, b = vertices[(i + 1) % 3]!;
    const span = subtract2(b, a);
    const side = direction * cross2(span, subtract2(p2, a));
    if (side < -epsilon * Math.hypot(...span)) return false;
  }
  return true;
}

function narrowPhase(a: TriangleData, b: TriangleData, epsilon: number): IntersectionKind | null {
  const planeDistances = (source: Triangle, target: TriangleData): number[] =>
    source.map(p => dot(target.normal, subtract(p, target.points[0])));
  const da = planeDistances(a.points, b);
  const db = planeDistances(b.points, a);
  const outside = (values: number[]): boolean =>
    values.every(d => d > epsilon) || values.every(d => d < -epsilon);
  if (outside(da) || outside(db)) return null;

  if (da.every(d => Math.abs(d) <= epsilon) &&
      db.every(d => Math.abs(d) <= epsilon)) {
    // Ignore sub-resolution ribbons that can appear along a shared edge
    // due to floating-point clipping. Threshold has physical AREA units.
    const maxEdge = (triangle: Triangle): number => Math.max(
      distance(triangle[0], triangle[1]),
      distance(triangle[1], triangle[2]),
      distance(triangle[2], triangle[0]),
    );
    const areaTolerance = 16 * epsilon * Math.max(
      epsilon, maxEdge(a.points), maxEdge(b.points),
    );
    return coplanarOverlapArea(a.points, b.points, a.normal) > areaTolerance
      ? 'coplanar-overlap' : null;
  }

  const intersections: V3[] = [];
  let uncertain = false;
  const gather = (source: Triangle, target: TriangleData): void => {
    const d = planeDistances(source, target);
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3, p = source[i]!, q = source[j]!;
      const d0 = d[i]!, d1 = d[j]!;
      if (Math.abs(d0) <= epsilon && Math.abs(d1) <= epsilon) {
        // An edge lies in the target plane: avoid asserting a transverse crossing.
        uncertain = true;
        continue;
      }
      if ((d0 > epsilon && d1 > epsilon) || (d0 < -epsilon && d1 < -epsilon)) continue;
      const denom = d0 - d1;
      if (Math.abs(denom) <= epsilon * 0.1) { uncertain = true; continue; }
      const t = d0 / denom;
      if (t < -1e-12 || t > 1 + 1e-12) continue;
      const point: V3 = [
        p[0] + t * (q[0] - p[0]),
        p[1] + t * (q[1] - p[1]),
        p[2] + t * (q[2] - p[2]),
      ];
      if (!insideTriangle(point, target.points, target.normal, epsilon)) continue;
      if (intersections.every(other => distance(other, point) > epsilon)) intersections.push(point);
    }
  };
  gather(a.points, b);
  gather(b.points, a);
  if (uncertain) return 'uncertain';
  if (intersections.length >= 2) return 'crossing';
  if (intersections.length === 1) return 'point-contact';
  return null;
}

/**
 * Bounded deterministic triangle-pair diagnostic.
 *
 * Detects transverse crossings and area-overlapping coplanar triangles.
 * Also reports point contacts and numerical ambiguities.
 *
 * Limitation: NONCOPLANAR triangle pairs with a shared vertex coordinate are
 * excluded as expected mesh adjacency; their additional intersections are
 * not checked. Coplanar pairs are still checked for area overlap.
 *
 * Not a robust exact-predicate kernel, proof of collision freedom, containment
 * test, manifold test, or comprehensive self-intersection validator.
 */
export function analyzeMeshSelfIntersections(
  mesh: TriangleMesh,
  options: IntersectionOptions = {},
): TriangleIntersectionReport {
  validateMesh(mesh);
  if (!options || typeof options !== 'object') {
    throw new GeometryError('INVALID_DIMENSION', 'intersection options must be an object');
  }
  const epsilon = positive(options.tolerance ?? 1e-9, 'tolerance');
  if (!Number.isFinite(epsilon * epsilon)) {
    throw new GeometryError('INVALID_DIMENSION', 'intersection tolerance is too large');
  }
  const maxTriangles = options.maxTriangles ?? 1500;
  const maxFindings = options.maxFindings ?? 64;
  if (!Number.isSafeInteger(maxTriangles) || maxTriangles < 2 || maxTriangles > 1500 ||
      !Number.isSafeInteger(maxFindings) || maxFindings < 1 || maxFindings > 1000) {
    throw new GeometryError('INVALID_DIMENSION', 'maxTriangles must be 2..1500 and maxFindings 1..1000');
  }
  const triangleCount = mesh.indices.length / 3;
  if (triangleCount > maxTriangles) {
    throw new GeometryError('INVALID_DIMENSION',
      `Mesh has ${triangleCount} triangles; maximum for this diagnostic is ${maxTriangles}`);
  }
  const triangles = Array.from({length:triangleCount},(_,i)=>triangleData(mesh,i));
  const order = Array.from({length:triangleCount},(_,i)=>i)
    .sort((a,b)=>triangles[a]!.min[0]-triangles[b]!.min[0]||a-b);
  const findings: TriangleIntersectionFinding[] = [];
  let broadPhasePairs = 0, testedPairs = 0, excludedAdjacentPairs = 0;
  let crossings = 0, coplanarOverlaps = 0, pointContacts = 0, uncertainPairs = 0;
  for (let sortedI = 0; sortedI < order.length; sortedI++) {
    const firstIndex = order[sortedI]!, first = triangles[firstIndex]!;
    for (let sortedJ = sortedI + 1; sortedJ < order.length; sortedJ++) {
      const secondIndex = order[sortedJ]!, second = triangles[secondIndex]!;
      if (second.min[0] > first.max[0] + epsilon) break;
      if (!aabbOverlap(first, second, epsilon)) continue;
      broadPhasePairs++;
      const da = second.points.map(p=>dot(first.normal,subtract(p,first.points[0])));
      const db = first.points.map(p=>dot(second.normal,subtract(p,second.points[0])));
      const coplanar = da.every(d=>Math.abs(d)<=epsilon) &&
                       db.every(d=>Math.abs(d)<=epsilon);
      if (!coplanar && sharedCoordinate(first.points, second.points, epsilon)) {
        excludedAdjacentPairs++;
        continue;
      }
      testedPairs++;
      const kind = narrowPhase(first, second, epsilon);
      if (!kind) continue;
      if (kind === 'crossing') crossings++;
      else if (kind === 'coplanar-overlap') coplanarOverlaps++;
      else if (kind === 'point-contact') pointContacts++;
      else uncertainPairs++;
      if (findings.length < maxFindings) {
        findings.push(Object.freeze({
          firstTriangle: Math.min(firstIndex,secondIndex),
          secondTriangle: Math.max(firstIndex,secondIndex),
          kind,
        }));
      }
    }
  }
  const totalFindings = crossings + coplanarOverlaps + pointContacts + uncertainPairs;
  return Object.freeze({
    triangles:triangleCount,broadPhasePairs,testedPairs,excludedAdjacentPairs,
    crossings,coplanarOverlaps,pointContacts,uncertainPairs,totalFindings,
    findings:Object.freeze(findings),truncated:totalFindings>findings.length,
    noDetectedIntersections:totalFindings===0,
  });
}

export function assertNoDetectedSelfIntersections(
  mesh: TriangleMesh,
  options?: IntersectionOptions,
): TriangleIntersectionReport {
  const report = analyzeMeshSelfIntersections(mesh, options);
  if (!report.noDetectedIntersections) {
    throw new GeometryError('INVALID_MESH',
      `Detected triangle intersections or ambiguous contacts: ${JSON.stringify(report)}`);
  }
  return report;
}
