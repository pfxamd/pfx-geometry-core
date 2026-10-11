import { GeometryError, positive } from './errors.js';
import { type TriangleMesh, validateMesh } from './mesh.js';
import {
  inspectNearCoplanarTriangles3,
  type NearCoplanarOptions, type ProjectedTriangleContact,
} from './near-coplanar.js';
import { scanTriangleAABBPairs, type BroadPhaseStrategy, type TriangleAABB } from './broadphase.js';
import { type Triangle3 } from './segment.js';
import { type Vec3 } from './vector.js';

export interface MeshNearCoplanarOptions extends NearCoplanarOptions {
  /** BVH by default; sweep is retained as an independent parity reference. */
  readonly broadPhase?: BroadPhaseStrategy;
  /** Hard per-mesh triangle limit: 2..20000, default 12000. */
  readonly maxTriangles?: number;
  /** Hard candidate-pair limit: 1..2000000, default 250000. */
  readonly maxCandidatePairs?: number;
  /** Retained findings: 1..1000, default 64. All counters remain complete. */
  readonly maxFindings?: number;
  /** Include planar edge/point contacts in findings (default false). */
  readonly includeBoundaryContacts?: boolean;
}

export interface MeshNearCoplanarFinding {
  readonly firstTriangle: number;
  readonly secondTriangle: number;
  readonly status: 'coplanar' | 'near-coplanar';
  /** This refers ONLY to the projected footprint, not a 3D collision. */
  readonly projectedContact: Exclude<ProjectedTriangleContact,'disjoint'>;
  readonly exactlyCoplanar: boolean;
  readonly maxPlaneDistance: number;
  readonly normalAngleRadians: number;
}

export interface MeshNearCoplanarReport {
  readonly triangles: number;
  readonly broadPhase: BroadPhaseStrategy;
  readonly candidatePairs: number;
  readonly examinedPairs: number;
  readonly outsideDomainPairs: number;
  readonly projectedDisjointPairs: number;
  readonly coplanarAreaPairs: number;
  readonly nearCoplanarAreaPairs: number;
  readonly coplanarBoundaryPairs: number;
  readonly nearCoplanarBoundaryPairs: number;
  readonly reportedPairs: number;
  readonly includeBoundaryContacts: boolean;
  readonly findings: ReadonlyArray<MeshNearCoplanarFinding>;
  readonly truncated: boolean;
  /** Means zero reported candidates; not a collision/watertightness proof. */
  readonly noReportedProximity: boolean;
}

function triangle(mesh:TriangleMesh, index:number):Triangle3 {
  const output:Vec3[]=[];
  for(let j=0;j<3;j++){
    const vertex=mesh.indices[index*3+j]!*3;
    output.push({
      x:mesh.positions[vertex]!,
      y:mesh.positions[vertex+1]!,
      z:mesh.positions[vertex+2]!,
    });
  }
  return output as unknown as Triangle3;
}
function aabb(t:Triangle3):TriangleAABB {
  return {
    min:[Math.min(...t.map(p=>p.x)),Math.min(...t.map(p=>p.y)),
      Math.min(...t.map(p=>p.z))],
    max:[Math.max(...t.map(p=>p.x)),Math.max(...t.map(p=>p.y)),
      Math.max(...t.map(p=>p.z))],
  };
}

/**
 * Bounded, deterministic mesh-level survey of (near-)coplanar triangle pairs.
 *
 * Broad phase uses AABBs expanded by 4x absolute plane-distance tolerance,
 * then calls the independent two-triangle diagnostic for every candidate.
 *
 * Projected area overlap is NEVER asserted to be physical 3D penetration.
 * Even zero reported pairs is NOT proof of geometric clearance: floating
 * tolerances, representable coordinates and candidate pruning impose limits.
 * The older full-mesh intersection analyzer remains unchanged.
 */
export function analyzeMeshNearCoplanarPairs(
  mesh:TriangleMesh,
  options:MeshNearCoplanarOptions={},
):MeshNearCoplanarReport{
  validateMesh(mesh);
  if(!options||typeof options!=='object')
    throw new GeometryError('INVALID_DIMENSION','options must be an object');
  const distanceTolerance=positive(options.distanceTolerance??1e-6,'distanceTolerance');
  const maxAngleRadians=positive(options.maxAngleRadians??0.01,'maxAngleRadians');
  if(maxAngleRadians>Math.PI/4)
    throw new GeometryError('INVALID_DIMENSION','maxAngleRadians cannot exceed PI/4');
  const padding=distanceTolerance*4;
  if(!Number.isFinite(padding))
    throw new GeometryError('INVALID_DIMENSION','distanceTolerance too large for broad phase');
  const broadPhase=options.broadPhase??'bvh';
  const maxTriangles=options.maxTriangles??12000;
  const maxCandidatePairs=options.maxCandidatePairs??250000;
  const maxFindings=options.maxFindings??64;
  const includeBoundaryContacts=options.includeBoundaryContacts??false;
  if((broadPhase!=='bvh'&&broadPhase!=='sweep')||
    !Number.isSafeInteger(maxTriangles)||maxTriangles<2||maxTriangles>20000||
    !Number.isSafeInteger(maxCandidatePairs)||maxCandidatePairs<1||maxCandidatePairs>2000000||
    !Number.isSafeInteger(maxFindings)||maxFindings<1||maxFindings>1000||
    typeof includeBoundaryContacts!=='boolean'){
    throw new GeometryError('INVALID_DIMENSION','invalid mesh proximity limits or options');
  }
  const count=mesh.indices.length/3;
  if(count>maxTriangles){
    throw new GeometryError('INVALID_DIMENSION',
      `Mesh contains ${count} triangles, maxTriangles is ${maxTriangles}`);
  }
  const triangles=Array.from({length:count},(_,i)=>triangle(mesh,i));
  const bounds=triangles.map(aabb);
  const findings:MeshNearCoplanarFinding[]=[];
  let candidatePairs=0,examinedPairs=0,outsideDomainPairs=0,projectedDisjointPairs=0,
    coplanarAreaPairs=0,nearCoplanarAreaPairs=0,coplanarBoundaryPairs=0,
    nearCoplanarBoundaryPairs=0,reportedPairs=0;

  // Bounded max-heap retaining the smallest triangle-index pairs independent
  // of BVH visitation order. Storage O(maxFindings), never O(all candidates).
  const compare=(a:MeshNearCoplanarFinding,b:MeshNearCoplanarFinding):number=>
    a.firstTriangle-b.firstTriangle||a.secondTriangle-b.secondTriangle;
  const offer=(entry:MeshNearCoplanarFinding):void=>{
    if(findings.length<maxFindings){
      let i=findings.push(entry)-1;
      while(i>0){
        const parent=Math.floor((i-1)/2);
        if(compare(findings[parent]!,findings[i]!)>=0)break;
        [findings[parent],findings[i]]=[findings[i]!,findings[parent]!];
        i=parent;
      }
    }else if(compare(entry,findings[0]!)<0){
      findings[0]=entry;
      let i=0;
      while(true){
        const left=2*i+1,right=left+1;let largest=i;
        if(left<findings.length&&compare(findings[left]!,findings[largest]!)>0)
          largest=left;
        if(right<findings.length&&compare(findings[right]!,findings[largest]!)>0)
          largest=right;
        if(largest===i)break;
        [findings[i],findings[largest]]=[findings[largest]!,findings[i]!];
        i=largest;
      }
    }
  };

  scanTriangleAABBPairs(bounds,padding,broadPhase,(firstTriangle,secondTriangle)=>{
    candidatePairs++;
    if(candidatePairs>maxCandidatePairs)
      throw new GeometryError('INVALID_DIMENSION',
        `Candidate budget ${maxCandidatePairs} exceeded; no partial result returned`);
    examinedPairs++;
    const result=inspectNearCoplanarTriangles3(
      triangles[firstTriangle]!,triangles[secondTriangle]!,
      {distanceTolerance,maxAngleRadians},
    );
    if(result.status==='outside-domain'){outsideDomainPairs++;return;}
    if(result.projectedContact==='disjoint'){projectedDisjointPairs++;return;}
    const isArea=result.projectedContact==='area-overlap';
    if(isArea){
      if(result.status==='coplanar')coplanarAreaPairs++;
      else nearCoplanarAreaPairs++;
    }else{
      if(result.status==='coplanar')coplanarBoundaryPairs++;
      else nearCoplanarBoundaryPairs++;
    }
    if(!isArea&&!includeBoundaryContacts)return;
    reportedPairs++;
    offer(Object.freeze({
      firstTriangle,secondTriangle,status:result.status,
      projectedContact:result.projectedContact,
      exactlyCoplanar:result.exactlyCoplanar,
      maxPlaneDistance:result.maxPlaneDistance,
      normalAngleRadians:result.normalAngleRadians,
    }));
  });
  findings.sort(compare);
  return Object.freeze({
    triangles:count,broadPhase,candidatePairs,examinedPairs,
    outsideDomainPairs,projectedDisjointPairs,
    coplanarAreaPairs,nearCoplanarAreaPairs,coplanarBoundaryPairs,nearCoplanarBoundaryPairs,
    reportedPairs,includeBoundaryContacts,
    findings:Object.freeze(findings),truncated:reportedPairs>findings.length,
    noReportedProximity:reportedPairs===0,
  });
}
