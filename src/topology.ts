import { GeometryError, positive } from './errors.js';
import { type TriangleMesh, validateMesh } from './mesh.js';

export interface TopologyOptions { readonly weldTolerance?: number; }
export interface TopologyReport {
  readonly originalVertices: number;
  readonly weldedVertices: number;
  readonly triangles: number;
  readonly uniqueEdges: number;
  readonly boundaryEdges: number;
  readonly nonManifoldEdges: number;
  readonly orientationConflicts: number;
  readonly collapsedTriangles: number;
  readonly nonManifoldVertices: number;
  readonly unusedVertices: number;
  readonly connectedComponents: number;
  /** Combinatorial property after coordinate welding; NOT a geometric sealing proof. */
  readonly isClosedOriented2Manifold: boolean;
}
type Edge = {a:number;b:number; triangles:number[]; directions:number[]};

class DisjointSet {
  readonly parents:number[];
  constructor(count:number){this.parents=Array.from({length:count},(_,i)=>i);}
  find(v:number):number{
    let root=v;
    while(this.parents[root]!==root)root=this.parents[root]!;
    while(this.parents[v]!==v){const next=this.parents[v]!;this.parents[v]=root;v=next;}
    return root;
  }
  union(a:number,b:number):void{const x=this.find(a),y=this.find(b);if(x!==y)this.parents[y]=x;}
}

/**
 * Classify combinatorial surface topology. Vertex welding is ANALYSIS-ONLY:
 * it does not modify positions/normals or prove freedom from intersections.
 * Results depend on absolute weldTolerance, which may hide real tiny gaps.
 */
export function analyzeMeshTopology(mesh:TriangleMesh,options:TopologyOptions={}):TopologyReport{
  validateMesh(mesh);
  if(options===null||typeof options!=='object'){
    throw new GeometryError('INVALID_DIMENSION','topology options must be an object');
  }
  const tol=positive(options.weldTolerance??1e-9,'weldTolerance');
  const representatives:number[][]=[];
  const buckets=new Map<string,number[]>();
  const welded:number[]=[];
  const cell=(x:number):number=>{
    const scaled=x/tol;
    if(!Number.isFinite(scaled)||Math.abs(scaled)>1e14)
      throw new GeometryError('INVALID_DIMENSION','coordinate/tolerance ratio too large for reliable welding');
    return Math.floor(scaled);
  };
  const key=(a:number,b:number,c:number):string=>`${a},${b},${c}`;
  for(let i=0;i<mesh.positions.length;i+=3){
    const x=mesh.positions[i]!,y=mesh.positions[i+1]!,z=mesh.positions[i+2]!;
    const [cx,cy,cz]=[cell(x),cell(y),cell(z)];
    let match=-1,best=tol*tol;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const neighbors=buckets.get(key(cx+dx,cy+dy,cz+dz))??[];
      for(const id of neighbors){
        const p=representatives[id]!;
        const distance=(x-p[0]!)**2+(y-p[1]!)**2+(z-p[2]!)**2;
        if(distance<=best&&(distance<best||match<0||id<match)){
          best=distance;match=id;
        }
      }
    }
    if(match<0){
      match=representatives.length;representatives.push([x,y,z]);
      const hash=key(cx,cy,cz),bucket=buckets.get(hash);
      if(bucket)bucket.push(match);else buckets.set(hash,[match]);
    }
    welded.push(match);
  }
  const count=mesh.indices.length/3, edges=new Map<string,Edge>();
  const incident=Array.from({length:representatives.length},()=>[] as number[]);
  const connected=new DisjointSet(count);
  const valid=Array<boolean>(count).fill(true);
  let collapsedTriangles=0;
  for(let t=0;t<count;t++){
    const a=welded[mesh.indices[t*3]!]!,b=welded[mesh.indices[t*3+1]!]!,
      c=welded[mesh.indices[t*3+2]!]!;
    if(a===b||b===c||a===c){collapsedTriangles++;valid[t]=false;continue;}
    for(const v of [a,b,c])incident[v]!.push(t);
    for(const [u,v] of [[a,b],[b,c],[c,a]]){
      const lo=Math.min(u!,v!),hi=Math.max(u!,v!),hash=`${lo}:${hi}`;
      let edge=edges.get(hash);
      if(!edge){edge={a:lo,b:hi,triangles:[],directions:[]};edges.set(hash,edge);}
      edge.triangles.push(t);
      edge.directions.push(u===lo?1:-1);
    }
  }
  const fans=incident.map(ids=>new Map<number,number[]>(ids.map(t=>[t,[]])));
  const boundaryAtVertex=Array<number>(representatives.length).fill(0);
  let boundaryEdges=0,nonManifoldEdges=0,orientationConflicts=0;
  for(const e of edges.values()){
    if(e.triangles.length===1){
      boundaryEdges++;boundaryAtVertex[e.a]!++;boundaryAtVertex[e.b]!++;
    }else if(e.triangles.length===2){
      const [t0,t1]=e.triangles as [number,number];
      if(e.directions[0]===e.directions[1])orientationConflicts++;
      connected.union(t0,t1);
      for(const v of [e.a,e.b]){fans[v]!.get(t0)!.push(t1);fans[v]!.get(t1)!.push(t0);}
    }else{
      nonManifoldEdges++;
      for(let i=1;i<e.triangles.length;i++)connected.union(e.triangles[0]!,e.triangles[i]!);
    }
  }
  let unusedVertices=0,nonManifoldVertices=0;
  for(let v=0;v<fans.length;v++){
    const graph=fans[v]!;
    if(!graph.size){unusedVertices++;continue;}
    const remaining=new Set(graph.keys());let fanCount=0;
    while(remaining.size){
      fanCount++;
      const first=remaining.values().next().value as number,stack=[first];
      remaining.delete(first);
      while(stack.length){
        for(const adjacent of graph.get(stack.pop()!)!){
          if(remaining.delete(adjacent))stack.push(adjacent);
        }
      }
    }
    if(fanCount!==1||(boundaryAtVertex[v]!==0&&boundaryAtVertex[v]!==2))nonManifoldVertices++;
  }
  const components=new Set<number>();
  for(let t=0;t<count;t++)if(valid[t])components.add(connected.find(t));
  return Object.freeze({
    originalVertices:mesh.positions.length/3,weldedVertices:representatives.length,
    triangles:count,uniqueEdges:edges.size,boundaryEdges,nonManifoldEdges,
    orientationConflicts,collapsedTriangles,nonManifoldVertices,
    unusedVertices,connectedComponents:components.size,
    isClosedOriented2Manifold:count>0&&collapsedTriangles===0&&boundaryEdges===0&&
      nonManifoldEdges===0&&orientationConflicts===0&&nonManifoldVertices===0&&unusedVertices===0,
  });
}

export function assertClosedOriented2Manifold(
  mesh:TriangleMesh,options?:TopologyOptions,
):TopologyReport{
  const report=analyzeMeshTopology(mesh,options);
  if(!report.isClosedOriented2Manifold){
    throw new GeometryError('INVALID_MESH',`Mesh topology is not a closed oriented 2-manifold: ${JSON.stringify(report)}`);
  }
  return report;
}
