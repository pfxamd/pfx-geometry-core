import { orientation2D, orientation3D, type Point2D } from './predicates.js';
import { EPSILON, GeometryError, positive, finite } from './errors.js';
import { type Triangle3 } from './segment.js';
import { type Vec3 } from './vector.js';

export type CoplanarContactKind =
  | 'area-overlap'
  | 'edge-contact'
  | 'point-contact'
  | 'disjoint'
  | 'indeterminate';

export type CoplanarContactResult =
  | { readonly kind: 'area-overlap' | 'edge-contact' | 'point-contact' | 'disjoint';
      readonly exactlyCoplanar: true }
  | { readonly kind: 'indeterminate'; readonly exactlyCoplanar: false;
      readonly reason: 'near-coplanar' | 'noncoplanar' };

/** Non-mutating predicate for two valid triangles on one mathematical plane.
 *
 * Uses adaptive orientation signs on the INPUT doubles for all planar
 * topology decisions. Noncoplanar or near-coplanar pairs are out of domain.
 * This is NOT a complete 3D triangle-triangle intersection routine.
 */
export function classifyCoplanarTriangleContact3(
  first: Triangle3, second: Triangle3, tolerance = 1e-9,
): CoplanarContactResult {
  const tol = positive(tolerance, 'tolerance');
  const a = checkTriangle(first,'first');
  const b = checkTriangle(second,'second');
  const normalA = cross(sub(a[1],a[0]),sub(a[2],a[0]));
  const normalB = cross(sub(b[1],b[0]),sub(b[2],b[0]));
  const magA = Math.hypot(...normalA), magB = Math.hypot(...normalB);
  if (!Number.isFinite(magA) || !Number.isFinite(magB) ||
      magA <= EPSILON || magB <= EPSILON)
    throw new GeometryError('DEGENERATE_GEOMETRY','triangle area is degenerate');

  const onA = b.map(p=>orientation3D(a[0],a[1],a[2],p)===0);
  const onB = a.map(p=>orientation3D(b[0],b[1],b[2],p)===0);
  if (!(onA.every(Boolean) && onB.every(Boolean))) {
    const signed=(p:Vec3,tri:readonly [Vec3,Vec3,Vec3],
      normal:readonly [number,number,number],mag:number):number => {
      const delta=sub(p,tri[0]);
      const value=(delta.x*normal[0]+delta.y*normal[1]+delta.z*normal[2])/mag;
      if (!Number.isFinite(value))
        throw new GeometryError('INVALID_NUMBER','plane separation overflow');
      return Math.abs(value);
    };
    const near=b.every(p=>signed(p,a,normalA,magA)<=tol) &&
      a.every(p=>signed(p,b,normalB,magB)<=tol);
    return Object.freeze({kind:'indeterminate',exactlyCoplanar:false,
      reason:near?'near-coplanar':'noncoplanar'});
  }

  const axis=dominant(normalA);
  const project=(p:Vec3):Point2D => axis===0?[p.y,p.z]:
    axis===1?[p.x,p.z]:[p.x,p.y];
  const p = a.map(project) as [Point2D, Point2D, Point2D];
  const q = b.map(project) as [Point2D, Point2D, Point2D];
  // Six edge normals provide the separating-axis theorem for two
  // nondegenerate convex polygons. Test STRICT interior intersection.
  let areaOverlap=true;
  for(const [one,other] of [[p,q],[q,p]] as const) {
    for(let i=0;i<3;i++){
      const left=one[i]!,right=one[(i+1)%3]!,
        opposite=one[(i+2)%3]!;
      const interiorSign=orientation2D(left,right,opposite);
      if(interiorSign===0)
        throw new GeometryError('DEGENERATE_GEOMETRY','invalid projected triangle');
      const touchesInterior=other.some(point=>
        orientation2D(left,right,point)*interiorSign>0);
      if(!touchesInterior) {
        areaOverlap=false;
        break;
      }
    }
    if(!areaOverlap)break;
  }
  if(areaOverlap)
    return Object.freeze({kind:'area-overlap',exactlyCoplanar:true});

  // A non-area intersection can be an overlapping collinear EDGE,
  // an isolated VERTEX / vertex-on-edge touch, or disjoint.
  let pointTouch=false;
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    const a0=p[i]!,a1=p[(i+1)%3]!;
    const b0=q[j]!,b1=q[(j+1)%3]!;
    const o0=orientation2D(a0,a1,b0),o1=orientation2D(a0,a1,b1);
    const o2=orientation2D(b0,b1,a0),o3=orientation2D(b0,b1,a1);
    if(o0===0&&o1===0) {
      const axis2=Math.abs(a1[0]-a0[0])>=Math.abs(a1[1]-a0[1])?0:1;
      const lo=Math.max(Math.min(a0[axis2],a1[axis2]),
                        Math.min(b0[axis2],b1[axis2]));
      const hi=Math.min(Math.max(a0[axis2],a1[axis2]),
                        Math.max(b0[axis2],b1[axis2]));
      if(hi>lo)return Object.freeze({kind:'edge-contact',exactlyCoplanar:true});
      if(hi===lo)pointTouch=true;
    }else if((o0===0&&onSegment(b0,a0,a1)) ||
       (o1===0&&onSegment(b1,a0,a1)) ||
       (o2===0&&onSegment(a0,b0,b1)) ||
       (o3===0&&onSegment(a1,b0,b1))) {
      pointTouch=true;
    }else if(o0*o1<0&&o2*o3<0) {
      // A transverse 2D crossing implies a positive-area intersection.
      return Object.freeze({kind:'area-overlap',exactlyCoplanar:true});
    }
  }
  return Object.freeze({kind:pointTouch?'point-contact':'disjoint',
    exactlyCoplanar:true});
}

function checkTriangle(input:Triangle3, name:string):readonly [Vec3,Vec3,Vec3]{
  if(!Array.isArray(input)||input.length!==3)
    throw new GeometryError('INVALID_DIMENSION',`${name} needs 3 points`);
  for(let i=0;i<3;i++){
    const v=input[i];
    if(!v||typeof v!=='object')
      throw new GeometryError('INVALID_DIMENSION',`${name} contains invalid point`);
    finite(v.x,`${name}[${i}].x`);
    finite(v.y,`${name}[${i}].y`);
    finite(v.z,`${name}[${i}].z`);
  }
  return input;
}
function sub(a:Vec3,b:Vec3):Vec3{
  return {x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};
}
function cross(a:Vec3,b:Vec3):readonly [number,number,number]{
  return [a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x];
}
function dominant(n:readonly [number,number,number]):number{
  let index=0;
  if(Math.abs(n[1])>Math.abs(n[index]!))index=1;
  if(Math.abs(n[2])>Math.abs(n[index]!))index=2;
  return index;
}
function onSegment(p:Point2D,a:Point2D,b:Point2D):boolean{
  return p[0]>=Math.min(a[0],b[0]) && p[0]<=Math.max(a[0],b[0]) &&
    p[1]>=Math.min(a[1],b[1]) && p[1]<=Math.max(a[1],b[1]);
}
