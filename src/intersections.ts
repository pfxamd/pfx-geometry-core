import { GeometryError, positive } from './errors.js';
import { orient2d, orient3d } from 'robust-predicates';
import { type TriangleMesh, validateMesh } from './mesh.js';
import { scanTriangleAABBPairs, type BroadPhaseStrategy } from './broadphase.js';

type V3 = readonly [number, number, number];
type V2 = readonly [number, number];
type Triangle = readonly [V3, V3, V3];
type TriangleData = {
  readonly points: Triangle;
  readonly normal: V3;
  readonly normalMagnitude: number;
  readonly min: V3;
  readonly max: V3;
};

export interface IntersectionOptions {
  /** Absolute distance tolerance in mesh coordinate units; default 1e-9. */
  readonly tolerance?: number;
  /** Upper bound on mesh triangles, default 12000, hard maximum 20000. */
  readonly maxTriangles?: number;
  /** Maximum AABB-overlapping candidate pairs. Exceeding it fails explicitly. */
  readonly maxCandidatePairs?: number;
  /** Hierarchical BVH (default), or sweep-and-prune reference implementation. */
  readonly broadPhase?: BroadPhaseStrategy;
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
  /** Noncoplanar pairs sharing a complete coordinate-identical edge are excluded. */
  readonly excludedAdjacentPairs: number;
  /** Single shared-vertex point contacts ignored as expected mesh adjacency. */
  readonly ignoredSharedVertexContacts: number;
  /** Shared-vertex ambiguity skipped; these pairs are NOT certified clear. */
  readonly skippedSharedVertexAmbiguities: number;
  readonly broadPhase: BroadPhaseStrategy;
  readonly candidatePairBudget: number;
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
const robustSide2 = (a: V2, b: V2, p: V2): number =>
  orient2d(a[0], a[1], b[0], b[1], p[0], p[1]);

/**
 * Plane sidedness uses Shewchuk's adaptive orientation determinant,
 * divided by the triangle's double-area to express distance in mesh units.
 * The tolerance below is geometric, NOT a claim of exact coplanarity.
 */
function robustPlaneDistances(source: Triangle, target: TriangleData): number[] {
  const [a,b,c]=target.points;
  return source.map(p=>{
    const volume6=orient3d(
      a[0],a[1],a[2],b[0],b[1],b[2],c[0],c[1],c[2],
      p[0],p[1],p[2],
    );
    const value=volume6 / target.normalMagnitude;
    if (!Number.isFinite(value)) {
      throw new GeometryError('INVALID_NUMBER',
        'Robust orientation distance outside supported numeric range');
    }
    return value;
  });
}

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
  return { points: coordinates, normal, normalMagnitude: length, min, max };
}

function aabbOverlap(a: TriangleData, b: TriangleData, epsilon: number): boolean {
  for (let axis = 0; axis < 3; axis++) {
    if (a.max[axis]! + epsilon < b.min[axis]! ||
        b.max[axis]! + epsilon < a.min[axis]!) return false;
  }
  return true;
}

function sharedCoordinateCount(a: Triangle, b: Triangle, epsilon: number): number {
  let matches=0;
  const used=new Set<number>();
  for(const p of a){
    for(let i=0;i<3;i++){
      if(!used.has(i)&&distance(p,b[i]!)<=epsilon){
        used.add(i);matches++;break;
      }
    }
  }
  return matches;
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
  const direction = robustSide2(clip[0]!, clip[1]!, clip[2]!) >= 0 ? 1 : -1;
  for (let edge = 0; edge < 3; edge++) {
    const v = clip[edge]!, w = clip[(edge + 1) % 3]!;
    const side = (p: V2): number =>
      direction * robustSide2(v, w, p);
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
  const direction = robustSide2(vertices[0]!, vertices[1]!, vertices[2]!) >= 0 ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    const a = vertices[i]!, b = vertices[(i + 1) % 3]!;
    const span = subtract2(b, a);
    const side = direction * robustSide2(a, b, p2);
    if (side < -epsilon * Math.hypot(...span)) return false;
  }
  return true;
}

function strictlyInsideTriangle(p:V3,triangle:Triangle,normal:V3,epsilon:number):boolean{
  const axis=dominantAxis(normal);
  const q=projected(p,axis),vertices=triangle.map(v=>projected(v,axis));
  const direction=robustSide2(vertices[0]!,vertices[1]!,vertices[2]!)>=0?1:-1;
  for(let i=0;i<3;i++){
    const a=vertices[i]!,b=vertices[(i+1)%3]!;
    const span=subtract2(b,a);
    const side=direction*robustSide2(a,b,q);
    if(side<=epsilon*Math.hypot(...span))return false;
  }
  return true;
}

function narrowPhase(a: TriangleData, b: TriangleData, epsilon: number,
  sharedVertices=0): IntersectionKind | null {
  const planeDistances = robustPlaneDistances;
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
  if(sharedVertices===1 && intersections.length>=2){
    for(let i=0;i<intersections.length;i++){
      for(let j=i+1;j<intersections.length;j++){
        const p=intersections[i]!,q=intersections[j]!;
        const mid:V3=[(p[0]+q[0])/2,(p[1]+q[1])/2,(p[2]+q[2])/2];
        if(strictlyInsideTriangle(mid,a.points,a.normal,epsilon)&&
           strictlyInsideTriangle(mid,b.points,b.normal,epsilon))return 'crossing';
      }
    }
    return 'uncertain';
  }
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
 * Limitation: noncoplanar triangles sharing a full coordinate-identical edge
 * are skipped as expected adjacency. Pairs sharing only one vertex are
 * tested for additional crossing; shared point-only contact is ignored.
 * Coplanar pairs are checked for positive-area overlap.
 *
 * Uses robust adaptive orientation signs, but still employs floating-point
 * interpolation, projection and tolerance clipping. Not an exact intersection
 * kernel, proof of collision freedom, containment or manifold validity.
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
  const maxTriangles = options.maxTriangles ?? 12000;
  const maxFindings = options.maxFindings ?? 64;
  const maxCandidatePairs = options.maxCandidatePairs ?? 250000;
  const broadPhase = options.broadPhase ?? 'bvh';
  if (!Number.isSafeInteger(maxTriangles) || maxTriangles < 2 || maxTriangles > 20000 ||
      !Number.isSafeInteger(maxFindings) || maxFindings < 1 || maxFindings > 1000 ||
      !Number.isSafeInteger(maxCandidatePairs) || maxCandidatePairs < 1 ||
      maxCandidatePairs > 2000000 || (broadPhase !== 'bvh' && broadPhase !== 'sweep')) {
    throw new GeometryError('INVALID_DIMENSION',
      'maxTriangles must be 2..20000, maxFindings 1..1000, maxCandidatePairs 1..2000000, broadPhase bvh|sweep');
  }
  const triangleCount = mesh.indices.length / 3;
  if (triangleCount > maxTriangles) {
    throw new GeometryError('INVALID_DIMENSION',
      `Mesh has ${triangleCount} triangles; budget is ${maxTriangles}`);
  }
  const triangles = Array.from({length:triangleCount},(_,i)=>triangleData(mesh,i));
  const findings:TriangleIntersectionFinding[] = [];
  let broadPhasePairs=0, testedPairs=0, excludedAdjacentPairs=0;
  let ignoredSharedVertexContacts=0, skippedSharedVertexAmbiguities=0;
  let crossings=0,coplanarOverlaps=0,pointContacts=0,uncertainPairs=0;
  // Keep the lexicographically smallest maxFindings regardless of BVH visitation order.
  // Max-heap root is the largest kept index pair.
  const compare=(a:TriangleIntersectionFinding,b:TriangleIntersectionFinding):number=>
    a.firstTriangle-b.firstTriangle||a.secondTriangle-b.secondTriangle;
  const offer=(entry:TriangleIntersectionFinding):void=>{
    if(findings.length<maxFindings){
      let i=findings.push(entry)-1;
      while(i>0){
        const parent=Math.floor((i-1)/2);
        if(compare(findings[parent]!,findings[i]!)>=0)break;
        [findings[parent],findings[i]]=[findings[i]!,findings[parent]!];
        i=parent;
      }
    }else if(compare(entry,findings[0]!)<0){
      findings[0]=entry;let i=0;
      while(true){
        const left=2*i+1,right=left+1;let largest=i;
        if(left<findings.length&&compare(findings[left]!,findings[largest]!)>0)largest=left;
        if(right<findings.length&&compare(findings[right]!,findings[largest]!)>0)largest=right;
        if(largest===i)break;
        [findings[i],findings[largest]]=[findings[largest]!,findings[i]!];
        i=largest;
      }
    }
  };
  scanTriangleAABBPairs(triangles,epsilon,broadPhase,(firstIndex,secondIndex)=>{
    broadPhasePairs++;
    if (broadPhasePairs > maxCandidatePairs) {
      throw new GeometryError('INVALID_DIMENSION',
        `Broad-phase candidate count exceeded ${maxCandidatePairs}; no partial result returned`);
    }
    const first=triangles[firstIndex]!,second=triangles[secondIndex]!;
    const da=robustPlaneDistances(second.points,first);
    const db=robustPlaneDistances(first.points,second);
    const coplanar=da.every(d=>Math.abs(d)<=epsilon)&&
                   db.every(d=>Math.abs(d)<=epsilon);
    const shared=sharedCoordinateCount(first.points,second.points,epsilon);
    // Noncoplanar triangles with the SAME edge intersect along that edge
    // in exact geometry. Other contact beyond the shared edge would need
    // coplanarity and is considered separately above.
    if(!coplanar&&shared>=2){
      excludedAdjacentPairs++;
      return;
    }
    testedPairs++;
    const kind=narrowPhase(first,second,epsilon,shared);
    if(!kind)return;
    if(shared===1 && kind==='point-contact'){
      ignoredSharedVertexContacts++;
      return;
    }
    if(shared===1 && kind==='uncertain'){
      // For a common vertex this can be an ordinary corner contact.
      // Not verified clear: track this skipped numerical ambiguity explicitly.
      skippedSharedVertexAmbiguities++;
      return;
    }
    if(kind==='crossing')crossings++;
    else if(kind==='coplanar-overlap')coplanarOverlaps++;
    else if(kind==='point-contact')pointContacts++;
    else uncertainPairs++;
    offer(Object.freeze({firstTriangle:firstIndex,secondTriangle:secondIndex,kind}));
  });
  findings.sort((a,b)=>a.firstTriangle-b.firstTriangle||
    a.secondTriangle-b.secondTriangle||a.kind.localeCompare(b.kind));
  const totalFindings=crossings+coplanarOverlaps+pointContacts+uncertainPairs;
  return Object.freeze({
    triangles:triangleCount,broadPhasePairs,testedPairs,excludedAdjacentPairs,
    ignoredSharedVertexContacts,skippedSharedVertexAmbiguities,
    broadPhase,candidatePairBudget:maxCandidatePairs,
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
