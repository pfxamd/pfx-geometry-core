import { orient3d, orient2d } from 'robust-predicates';
import { EPSILON, finite, GeometryError, positive } from './errors.js';
import { vec3, type Vec3 } from './vector.js';

/** Three measured triangle vertices. No topology/adjacency assumptions. */
export type Triangle3 = readonly [Vec3, Vec3, Vec3];
export type SegmentEstimate =
  | { readonly status: 'crossing'; readonly start: Vec3; readonly end: Vec3; readonly approximate: true }
  | { readonly status: 'none' }
  | { readonly status: 'indeterminate'; readonly reason: string };

type V = readonly [number, number, number];
const minus=(a:V,b:V):V=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:V,b:V):V=>[
  a[1]*b[2]-a[2]*b[1],
  a[2]*b[0]-a[0]*b[2],
  a[0]*b[1]-a[1]*b[0],
];
const length=(a:V):number=>Math.hypot(...a);
function coordinates(triangle:Triangle3,name:string):readonly [V,V,V] {
  if(!Array.isArray(triangle)||triangle.length!==3)
    throw new GeometryError('INVALID_DIMENSION',`${name} must contain three points`);
  return triangle.map((p,i)=>{
    if(!p||typeof p!=='object')
      throw new GeometryError('INVALID_DIMENSION',`${name}[${i}] must be a point`);
    return [finite(p.x,`${name} x`),finite(p.y,`${name} y`),
      finite(p.z,`${name} z`)] as V;
  }) as [V,V,V];
}
function normal(t:readonly [V,V,V]):{unit:V;area2:number}{
  const raw=cross(minus(t[1],t[0]),minus(t[2],t[0]));
  const area2=length(raw);
  if(!Number.isFinite(area2)||area2<=EPSILON)
    throw new GeometryError('DEGENERATE_GEOMETRY','Triangle area too small for stable intersection');
  return {unit:[raw[0]/area2,raw[1]/area2,raw[2]/area2],area2};
}
/** Signed distance to a plane using robust orientation for its determinant. */
function planeDistances(src:readonly [V,V,V],target:readonly [V,V,V],area2:number):number[]{
  const [a,b,c]=target;
  return src.map(p=>{
    const d=orient3d(a[0],a[1],a[2],b[0],b[1],b[2],
      c[0],c[1],c[2],p[0],p[1],p[2])/area2;
    if(!Number.isFinite(d))throw new GeometryError('INVALID_NUMBER','Plane distance overflow');
    return d;
  });
}
function planeCut(t:readonly [V,V,V],d:readonly number[],tolerance:number):readonly [V,V]|null{
  // Only accept strict transverse crossings. Tangencies and on-plane vertices
  // remain indeterminate, not guessed.
  if(d.some(v=>Math.abs(v)<=tolerance))return null;
  const output:V[]=[];
  for(let i=0;i<3;i++){
    const j=(i+1)%3,a=d[i]!,b=d[j]!;
    if((a<0)===(b<0))continue;
    const blend=a/(a-b);
    const start=t[i]!,end=t[j]!;
    const p:V=[
      start[0]+blend*(end[0]-start[0]),
      start[1]+blend*(end[1]-start[1]),
      start[2]+blend*(end[2]-start[2]),
    ];
    if(p.some(v=>!Number.isFinite(v)))return null;
    output.push(p);
  }
  return output.length===2?[output[0]!,output[1]!]:null;
}
function strictlyStraddles(d:readonly number[],epsilon:number):boolean{
  return d.some(v=>v>epsilon)&&d.some(v=>v< -epsilon);
}
function projectedPointInside(p:V,t:readonly [V,V,V],axis:number,epsilon:number):boolean{
  const pair=(v:V):readonly [number,number]=>axis===0?[v[1],v[2]]:
    axis===1?[v[0],v[2]]:[v[0],v[1]];
  const a=pair(t[0]),b=pair(t[1]),c=pair(t[2]),q=pair(p);
  const orientation=orient2d(...a,...b,...c);
  if(orientation===0)return false;
  const sense=orientation>0?1:-1;
  for(const [v,w] of [[a,b],[b,c],[c,a]] as const){
    const side=orient2d(...v,...w,...q)*sense;
    const edge=Math.hypot(w[0]-v[0],w[1]-v[1]);
    if(side< -epsilon*edge)return false;
  }
  return true;
}
/**
 * Computes approximate endpoints ONLY for a well-conditioned, transverse
 * noncoplanar triangle intersection. No global mesh analysis or tessellation.
 *
 * Adaptive orientation decides plane sidedness; segment interpolation still
 * uses IEEE-754 doubles. "indeterminate" explicitly marks tangencies, nearly
 * coplanar triangles, small intersection lengths and unsafe coordinates.
 * It must not be treated as "none".
 */
export function estimateTransverseTriangleIntersection(
  first:Triangle3,second:Triangle3,tolerance=1e-9,
):SegmentEstimate{
  const epsilon=positive(tolerance,'tolerance');
  const a=coordinates(first,'first'),b=coordinates(second,'second');
  const na=normal(a),nb=normal(b);
  const da=planeDistances(a,b,nb.area2),db=planeDistances(b,a,na.area2);
  const separated=(d:readonly number[]):boolean=>
    d.every(v=>v>epsilon)||d.every(v=>v< -epsilon);
  if(separated(da)||separated(db))return Object.freeze({status:'none'});
  const direction=cross(na.unit,nb.unit);
  const strength=length(direction);
  if(!Number.isFinite(strength)||strength<=1e-7)
    return Object.freeze({status:'indeterminate',reason:'parallel-or-near-coplanar'});
  if(!strictlyStraddles(da,epsilon)||!strictlyStraddles(db,epsilon))
    return Object.freeze({status:'indeterminate',reason:'tangent-or-near-plane'});
  const sa=planeCut(a,da,epsilon),sb=planeCut(b,db,epsilon);
  if(!sa||!sb)return Object.freeze({status:'indeterminate',reason:'unstable-plane-cut'});
  let axis=0;
  if(Math.abs(direction[1])>Math.abs(direction[axis]!!))axis=1;
  if(Math.abs(direction[2])>Math.abs(direction[axis]!!))axis=2;
  const amin=Math.min(sa[0][axis]!,sa[1][axis]!),amax=Math.max(sa[0][axis]!,sa[1][axis]!);
  const bmin=Math.min(sb[0][axis]!,sb[1][axis]!),bmax=Math.max(sb[0][axis]!,sb[1][axis]!);
  const lo=Math.max(amin,bmin),hi=Math.min(amax,bmax);
  const spanTolerance=epsilon*Math.abs(direction[axis]!!)/strength;
  if(hi<lo-spanTolerance)return Object.freeze({status:'none'});
  if(hi-lo<=spanTolerance)
    return Object.freeze({status:'indeterminate',reason:'point-contact-or-subresolution'});
  const interpolate=(segment:readonly [V,V],x:number):V|null=>{
    const [p,q]=segment,denom=q[axis]!-p[axis]!;
    if(!Number.isFinite(denom)||Math.abs(denom)<=spanTolerance)return null;
    const t=(x-p[axis]!)/denom;
    if(t< -1e-9||t>1+1e-9)return null;
    const result:V=[p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1]),
      p[2]+t*(q[2]-p[2])];
    return result.every(Number.isFinite)?result:null;
  };
  const endpoint=(x:number):V|null=>{
    const preferred=(Math.abs(x-amin)<Math.abs(x-bmin))?sa:sb;
    return interpolate(preferred,x)??interpolate(preferred===sa?sb:sa,x);
  };
  const p=endpoint(lo),q=endpoint(hi);
  if(!p||!q)return Object.freeze({status:'indeterminate',reason:'unsafe-interpolation'});
  for(const hit of [p,q]){
    if(!projectedPointInside(hit,a,axisOfNormal(na.unit),epsilon*8)||
       !projectedPointInside(hit,b,axisOfNormal(nb.unit),epsilon*8))
      return Object.freeze({status:'indeterminate',reason:'outside-triangle-after-rounding'});
    const residualA=Math.abs(planeDistances([hit,hit,hit],a,na.area2)[0]!);
    const residualB=Math.abs(planeDistances([hit,hit,hit],b,nb.area2)[0]!);
    if(residualA>epsilon*16||residualB>epsilon*16)
      return Object.freeze({status:'indeterminate',reason:'plane-residual'});
  }
  return Object.freeze({status:'crossing',start:vec3(...p),end:vec3(...q),approximate:true});
}
function axisOfNormal(n:V):number{
  let axis=0;
  if(Math.abs(n[1])>Math.abs(n[axis]!))axis=1;
  if(Math.abs(n[2])>Math.abs(n[axis]!))axis=2;
  return axis;
}
