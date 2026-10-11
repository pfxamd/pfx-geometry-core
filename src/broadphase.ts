/** Renderer-independent broad-phase AABB candidate enumeration.
 * These bounding-volume algorithms produce conservative triangle candidates,
 * not intersection classifications or proofs of watertightness.
 */
export type BroadPhaseStrategy = 'bvh' | 'sweep';
export interface TriangleAABB {
  readonly min: ReadonlyArray<number>;
  readonly max: ReadonlyArray<number>;
}
type Node = {
  readonly min: readonly [number,number,number];
  readonly max: readonly [number,number,number];
  readonly size: number;
  readonly ids?: readonly number[];
  readonly left?: Node;
  readonly right?: Node;
};

function overlaps(a:TriangleAABB,b:TriangleAABB,tol:number):boolean{
  for(let k=0;k<3;k++){
    if(a.max[k]!+tol<b.min[k]! || b.max[k]!+tol<a.min[k]!)return false;
  }
  return true;
}
function mergeBounds(ids:ReadonlyArray<number>,bounds:ReadonlyArray<TriangleAABB>):{
  min:[number,number,number];max:[number,number,number];
}{
  const min:[number,number,number]=[Infinity,Infinity,Infinity];
  const max:[number,number,number]=[-Infinity,-Infinity,-Infinity];
  for(const i of ids){
    const b=bounds[i]!;
    for(let k=0;k<3;k++){
      min[k]=Math.min(min[k]!,b.min[k]!);
      max[k]=Math.max(max[k]!,b.max[k]!);
    }
  }
  return {min,max};
}
function makeBVH(ids:number[],boxes:ReadonlyArray<TriangleAABB>):Node{
  const envelope=mergeBounds(ids,boxes);
  if(ids.length<=8)return {...envelope,size:ids.length,ids};
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(const id of ids){
    const b=boxes[id]!;
    for(let k=0;k<3;k++){
      const center=b.min[k]!/2+b.max[k]!/2;
      low[k]=Math.min(low[k]!,center);
      high[k]=Math.max(high[k]!,center);
    }
  }
  const spread=[0,1,2].map(k=>high[k]!-low[k]!);
  let axis=0;
  if(spread[1]!>spread[axis]!)axis=1;
  if(spread[2]!>spread[axis]!)axis=2;
  ids.sort((a,b)=>{
    const aa=boxes[a]!,bb=boxes[b]!;
    const centerA=aa.min[axis]!/2+aa.max[axis]!/2;
    const centerB=bb.min[axis]!/2+bb.max[axis]!/2;
    return centerA-centerB||a-b;
  });
  const half=Math.floor(ids.length/2);
  return {...envelope,size:ids.length,
    left:makeBVH(ids.slice(0,half),boxes),
    right:makeBVH(ids.slice(half),boxes)};
}

/**
 * Emit unordered distinct AABB-overlapping triangle index pairs exactly once.
 * A hard pair budget causes explicit failure by caller-supplied callback.
 * No array of every candidate is materialized.
 */
export function scanTriangleAABBPairs(
  boxes:ReadonlyArray<TriangleAABB>,
  tolerance:number,
  mode:BroadPhaseStrategy,
  onPair:(a:number,b:number)=>void,
):void{
  if(boxes.length<2)return;
  const emit=(a:number,b:number):void=>{
    if(overlaps(boxes[a]!,boxes[b]!,tolerance)){
      onPair(Math.min(a,b),Math.max(a,b));
    }
  };
  if(mode==='sweep'){
    const order=Array.from({length:boxes.length},(_,i)=>i)
      .sort((a,b)=>boxes[a]!.min[0]!-boxes[b]!.min[0]!||a-b);
    for(let i=0;i<order.length;i++){
      const a=order[i]!,max=boxes[a]!.max[0]!+tolerance;
      for(let j=i+1;j<order.length;j++){
        const b=order[j]!;
        if(boxes[b]!.min[0]!>max)break;
        emit(a,b);
      }
    }
    return;
  }
  const tree=makeBVH(Array.from({length:boxes.length},(_,i)=>i),boxes);
  const between=(a:Node,b:Node):void=>{
    if(!overlaps(a,b,tolerance))return;
    if(a.ids && b.ids){
      for(const i of a.ids)for(const j of b.ids)emit(i,j);
      return;
    }
    if(!a.ids && (b.ids || a.size>=b.size)){
      between(a.left!,b);
      between(a.right!,b);
    }else{
      between(a,b.left!);
      between(a,b.right!);
    }
  };
  const self=(a:Node):void=>{
    if(a.ids){
      for(let i=0;i<a.ids.length;i++)for(let j=i+1;j<a.ids.length;j++){
        emit(a.ids[i]!,a.ids[j]!);
      }
      return;
    }
    self(a.left!);self(a.right!);between(a.left!,a.right!);
  };
  self(tree);
}
