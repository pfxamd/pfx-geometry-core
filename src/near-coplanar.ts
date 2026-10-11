import { orient3d } from 'robust-predicates';
import { EPSILON, finite, GeometryError, positive } from './errors.js';
import { orientation3D, type Point2D } from './predicates.js';
import {
  classifyProjectedTriangleContact2D, type CoplanarContactKind,
} from './coplanar.js';
import { type Triangle3 } from './segment.js';
import { type Vec3 } from './vector.js';

export type ProjectedTriangleContact =
  Exclude<CoplanarContactKind, 'indeterminate'>;

export interface NearCoplanarOptions {
  /** Maximum point-to-opposite-plane distance, model units. Default 1e-6. */
  readonly distanceTolerance?: number;
  /** Maximum unoriented plane-normal angle in radians. Default 0.01. */
  readonly maxAngleRadians?: number;
}

export type NearCoplanarResult =
  | {
      readonly status: 'coplanar' | 'near-coplanar';
      /** Contact of 2D coordinate-drop projections, NOT 3D contact. */
      readonly projectedContact: ProjectedTriangleContact;
      readonly maxPlaneDistance: number;
      readonly normalAngleRadians: number;
      readonly exactlyCoplanar: boolean;
    }
  | {
      readonly status: 'outside-domain';
      readonly reason: 'angular-difference' | 'plane-distance';
      readonly maxPlaneDistance: number;
      readonly normalAngleRadians: number;
      readonly exactlyCoplanar: false;
    };

type V3 = readonly [number,number,number];
type ValidTriangle = readonly [Vec3,Vec3,Vec3];

function validateTriangle(value: Triangle3, label: string): ValidTriangle {
  if (!Array.isArray(value) || value.length!==3)
    throw new GeometryError('INVALID_DIMENSION',`${label} needs exactly three vertices`);
  for (let i=0;i<3;i++) {
    const p=value[i];
    if (!p || typeof p!=='object')
      throw new GeometryError('INVALID_DIMENSION',`${label} has an invalid vertex`);
    finite(p.x,`${label}[${i}].x`);
    finite(p.y,`${label}[${i}].y`);
    finite(p.z,`${label}[${i}].z`);
  }
  return value;
}
function normalOf(t:ValidTriangle):{unit:V3; area2:number} {
  const a=t[0],b=t[1],c=t[2];
  const ux=b.x-a.x, uy=b.y-a.y, uz=b.z-a.z;
  const vx=c.x-a.x, vy=c.y-a.y, vz=c.z-a.z;
  const x=uy*vz-uz*vy, y=uz*vx-ux*vz, z=ux*vy-uy*vx;
  const area2=Math.hypot(x,y,z);
  if (!Number.isFinite(area2) || area2<=EPSILON)
    throw new GeometryError('DEGENERATE_GEOMETRY','triangle is numerically degenerate');
  return {unit:[x/area2,y/area2,z/area2],area2};
}
/** Exact adaptive determinant / floating-point triangle area (model units).
 * Nonzero sign is robust for represented inputs; distance is approximate.
 */
function planeDistance(p:Vec3,tri:ValidTriangle,area2:number):number {
  const [a,b,c]=tri;
  const determinant=orient3d(
    a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,p.x,p.y,p.z,
  );
  const result=Math.abs(determinant/area2);
  if (!Number.isFinite(result))
    throw new GeometryError('INVALID_NUMBER','triangle plane distance outside numeric range');
  return result;
}
/**
 * Diagnostic for nearly coplanar triangles, without pretending they physically
 * contact. Returns the footprint relationship after dropping the strongest
 * axis of the first triangle's normal.
 *
 * In particular, an 'area-overlap' footprint may correspond to TWO PARALLEL
 * but DISJOINT 3D triangles. Near-coplanar != coplanar.
 * No vertices, source data or topology are modified.
 */
export function inspectNearCoplanarTriangles3(
  first:Triangle3,
  second:Triangle3,
  options:NearCoplanarOptions = {},
):NearCoplanarResult {
  if (!options || typeof options!=='object')
    throw new GeometryError('INVALID_DIMENSION','options must be an object');
  const distanceTolerance=positive(options.distanceTolerance??1e-6,'distanceTolerance');
  const maxAngleRadians=positive(options.maxAngleRadians??0.01,'maxAngleRadians');
  if (maxAngleRadians>Math.PI/4)
    throw new GeometryError('INVALID_DIMENSION','maxAngleRadians cannot exceed PI/4');

  const a=validateTriangle(first,'first'), b=validateTriangle(second,'second');
  const na=normalOf(a),nb=normalOf(b);
  const cos=Math.abs(
    na.unit[0]*nb.unit[0]+na.unit[1]*nb.unit[1]+na.unit[2]*nb.unit[2]);
  const normalAngleRadians=Math.acos(Math.max(-1,Math.min(1,cos)));
  if (!Number.isFinite(normalAngleRadians))
    throw new GeometryError('INVALID_NUMBER','invalid normal angle');

  const distances=[
    ...b.map(point=>planeDistance(point,a,na.area2)),
    ...a.map(point=>planeDistance(point,b,nb.area2)),
  ];
  const maxPlaneDistance=Math.max(...distances);
  // Exact coplanarity is established with adaptive signs for represented
  // doubles, never by comparing computed distances to a loose tolerance.
  const exactlyCoplanar=b.every(p=>orientation3D(a[0],a[1],a[2],p)===0) &&
    a.every(p=>orientation3D(b[0],b[1],b[2],p)===0);

  if (!exactlyCoplanar && normalAngleRadians>maxAngleRadians)
    return Object.freeze({status:'outside-domain',reason:'angular-difference',
      maxPlaneDistance,normalAngleRadians,exactlyCoplanar:false});
  if (!exactlyCoplanar && maxPlaneDistance>distanceTolerance)
    return Object.freeze({status:'outside-domain',reason:'plane-distance',
      maxPlaneDistance,normalAngleRadians,exactlyCoplanar:false});

  let axis=0;
  if (Math.abs(na.unit[1])>Math.abs(na.unit[axis]!))axis=1;
  if (Math.abs(na.unit[2])>Math.abs(na.unit[axis]!))axis=2;
  const project=(p:Vec3):Point2D=>axis===0?[p.y,p.z]:
    axis===1?[p.x,p.z]:[p.x,p.y];
  const pa=a.map(project) as [Point2D,Point2D,Point2D];
  const pb=b.map(project) as [Point2D,Point2D,Point2D];

  const projectedContact=classifyProjectedTriangleContact2D(pa,pb);
  return Object.freeze({
    status:exactlyCoplanar?'coplanar':'near-coplanar',
    projectedContact,
    maxPlaneDistance,
    normalAngleRadians,
    exactlyCoplanar,
  });
}
