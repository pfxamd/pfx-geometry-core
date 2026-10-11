import { GeometryError } from './errors.js';
import { bezierInternal, type CubicBezierControls } from './bezier.js';
import { type TriangleMesh, validateMesh } from './mesh.js';
import { cross3, normalize3, type Vec3 } from './vector.js';

/** Row index is v, column index is u. Exactly four rows of four controls. */
export type BezierPatchControls = ReadonlyArray<ReadonlyArray<Vec3>>;
export interface BezierPatchEvaluation {
  readonly position: Vec3;
  readonly tangentU: Vec3;
  readonly tangentV: Vec3;
  /** Unit normal is cross(dP/du, dP/dv). */
  readonly normal: Vec3;
}
export interface PatchSegments {
  readonly uSegments: number;
  readonly vSegments: number;
}
function validatePatchControls(controls: BezierPatchControls): void {
  if (!Array.isArray(controls) || controls.length !== 4)
    throw new GeometryError('INVALID_DIMENSION', 'Bezier patch requires exactly four rows');
  for (const row of controls) bezierInternal.checkControls(row);
}
function evaluateValidated(controls: BezierPatchControls, u: number, v: number): BezierPatchEvaluation {
  const rows = controls as readonly CubicBezierControls[];
  const positions: CubicBezierControls = [
    bezierInternal.pointAt(rows[0]!,u),
    bezierInternal.pointAt(rows[1]!,u),
    bezierInternal.pointAt(rows[2]!,u),
    bezierInternal.pointAt(rows[3]!,u),
  ];
  const derivativesU: CubicBezierControls = [
    bezierInternal.derivativeAt(rows[0]!,u),
    bezierInternal.derivativeAt(rows[1]!,u),
    bezierInternal.derivativeAt(rows[2]!,u),
    bezierInternal.derivativeAt(rows[3]!,u),
  ];
  const position = bezierInternal.pointAt(positions,v);
  const tangentU = bezierInternal.pointAt(derivativesU,v);
  const tangentV = bezierInternal.derivativeAt(positions,v);
  const normal = normalize3(cross3(tangentU,tangentV));
  return Object.freeze({position,tangentU,tangentV,normal});
}
/** Bicubic tensor-product Bezier patch with analytic tangents and normals. */
export function evaluateBezierPatch3(controls: BezierPatchControls,u: number,v: number): BezierPatchEvaluation {
  validatePatchControls(controls);
  bezierInternal.parameter(u,'u');
  bezierInternal.parameter(v,'v');
  return evaluateValidated(controls,u,v);
}
function validateSegments(segments: PatchSegments): void {
  if (segments === null || typeof segments !== 'object')
    throw new GeometryError('INVALID_DIMENSION', 'Patch segments must be specified');
  for (const [key,value] of [['uSegments',segments.uSegments],['vSegments',segments.vSegments]] as const)
    if (!Number.isSafeInteger(value) || value < 1 || value > 128)
      throw new GeometryError('INVALID_DIMENSION', `${key} must be an integer in [1, 128]`);
}
/**
 * Indexed open bicubic patch. No automatic caps, stitching or
 * self-intersection checking. Winding follows the ordered control grid.
 */
export function createBezierPatchMesh(controls: BezierPatchControls,segments: PatchSegments): TriangleMesh {
  validatePatchControls(controls);
  validateSegments(segments);
  const {uSegments,vSegments}=segments;
  const positions: number[] = [], normals: number[] = [], indices: number[] = [];
  for(let j=0;j<=vSegments;j++){
    for(let i=0;i<=uSegments;i++){
      const result=evaluateValidated(controls,i/uSegments,j/vSegments);
      const {position,normal}=result;
      positions.push(position.x,position.y,position.z);
      normals.push(normal.x,normal.y,normal.z);
    }
  }
  const rowWidth=uSegments+1;
  for(let j=0;j<vSegments;j++){
    for(let i=0;i<uSegments;i++){
      const a=j*rowWidth+i,b=a+1,d=a+rowWidth,c=d+1;
      indices.push(a,b,c,a,c,d);
    }
  }
  const mesh: TriangleMesh=Object.freeze({
    positions:Object.freeze(positions),
    normals:Object.freeze(normals),
    indices:Object.freeze(indices),
  });
  validateMesh(mesh);
  return mesh;
}
