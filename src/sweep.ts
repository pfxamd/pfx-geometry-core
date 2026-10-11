import { EPSILON, GeometryError, positive } from './errors.js';
import { type TriangleMesh, validateMesh } from './mesh.js';
import {
  vec3, type Vec3, add3, subtract3, scale3, dot3, cross3, normalize3, distance3,
} from './vector.js';

export interface TubeSweepOptions {
  readonly radius: number;
  /** Angular samples, 6..256. */
  readonly radialSegments: number;
  /** Whether to add planar end caps (default true). */
  readonly capEnds?: boolean;
}

/**
 * Deterministic circular sweep over an OPEN 3D polyline. Ring normals are
 * miter-bisector tangents, with a stable transported cross-sectional frame.
 * This is NOT an arbitrary-profile sweep or a smooth interpolation of a curve.
 *
 * Safety domain: 2..64 points; turns <= 60 degrees; radius <= 0.45 times
 * the shortest segment length. No global self-intersection test.
 */
export function sweepCircularTube(
  path: ReadonlyArray<Vec3>,
  options: TubeSweepOptions,
): TriangleMesh {
  if(!Array.isArray(path)||path.length<2||path.length>64){
    throw new GeometryError('INVALID_DIMENSION','path must have 2 to 64 distinct points');
  }
  if(options===null||typeof options!=='object'||
    !Number.isSafeInteger(options.radialSegments)||options.radialSegments<6||
    options.radialSegments>256||
    (options.capEnds!==undefined&&typeof options.capEnds!=='boolean')){
    throw new GeometryError('INVALID_DIMENSION','radialSegments must be 6..256 and capEnds boolean');
  }
  const radius=positive(options.radius,'radius');
  if(radius<=EPSILON)throw new GeometryError('DEGENERATE_GEOMETRY','radius is numerically degenerate');
  const points=path.map((p,i)=>{
    if(!p||typeof p!=='object'){
      throw new GeometryError('INVALID_DIMENSION',`path[${i}] must be a 3D point`);
    }
    return vec3(p.x,p.y,p.z);
  });
  const segments:Vec3[]=[];
  let shortest=Infinity;
  for(let i=0;i<points.length-1;i++){
    const distance=distance3(points[i]!,points[i+1]!);
    if(!Number.isFinite(distance)||distance<=EPSILON){
      throw new GeometryError('DEGENERATE_GEOMETRY','path contains a repeated or tiny segment');
    }
    shortest=Math.min(shortest,distance);
    segments.push(normalize3(subtract3(points[i+1]!,points[i]!)));
  }
  if(radius>0.45*shortest){
    throw new GeometryError('INVALID_DIMENSION','radius exceeds 45% of shortest path segment');
  }
  const tangents:Vec3[]=[];
  for(let i=0;i<points.length;i++){
    if(i===0)tangents.push(segments[0]!);
    else if(i===points.length-1)tangents.push(segments[segments.length-1]!);
    else{
      const before=segments[i-1]!,after=segments[i]!;
      if(dot3(before,after)<0.5){
        throw new GeometryError('INVALID_DIMENSION','path turn exceeds 60 degrees');
      }
      tangents.push(normalize3(add3(before,after)));
    }
  }
  // The frame's U is projected onto each successive tangent plane.
  // Avoid choosing a nearly parallel reference for the first U.
  const initial=tangents[0]!;
  const reference=Math.abs(initial.x)<0.85?vec3(1,0,0):vec3(0,1,0);
  let u=normalize3(subtract3(reference,scale3(initial,dot3(reference,initial))));
  const axes:Vec3[][]=[];
  for(const tangent of tangents){
    u=normalize3(subtract3(u,scale3(tangent,dot3(u,tangent))));
    const v=normalize3(cross3(tangent,u));
    axes.push([u,v]);
  }

  const positions:number[]=[],normals:number[]=[],indices:number[]=[];
  const push=(p:Vec3,n:Vec3):number=>{
    const id=positions.length/3;
    positions.push(p.x,p.y,p.z);
    normals.push(n.x,n.y,n.z);
    return id;
  };
  const N=options.radialSegments, ringSize=N+1;
  const around=(i:number,k:number):{point:Vec3;normal:Vec3}=>{
    const theta=2*Math.PI*k/N;
    const [a,b]=axes[i]!;const n=add3(scale3(a!,Math.cos(theta)),scale3(b!,Math.sin(theta)));
    return {point:add3(points[i]!,scale3(n,radius)),normal:n};
  };
  for(let i=0;i<points.length;i++){
    for(let k=0;k<=N;k++){
      const {point,normal}=around(i,k);
      push(point,normal);
    }
  }
  // Outward winding for (tangent, u, v) right-handed ring frames.
  for(let i=0;i<points.length-1;i++)for(let k=0;k<N;k++){
    const a=i*ringSize+k,b=(i+1)*ringSize+k,
      c=b+1,d=a+1;
    indices.push(a,d,c,a,c,b);
  }

  if(options.capEnds!==false){
    for(const end of [0,1] as const){
      const j=end===0?0:points.length-1;
      const n=scale3(tangents[j]!,end===0?-1:1);
      const center=push(points[j]!,n);
      const start=positions.length/3;
      for(let k=0;k<=N;k++)push(around(j,k).point,n);
      for(let k=0;k<N;k++){
        if(end===0)indices.push(center,start+k+1,start+k);
        else indices.push(center,start+k,start+k+1);
      }
    }
  }
  const mesh:TriangleMesh=Object.freeze({
    positions:Object.freeze(positions),normals:Object.freeze(normals),
    indices:Object.freeze(indices),
  });
  validateMesh(mesh);
  return mesh;
}
