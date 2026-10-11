import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeMeshSelfIntersections,estimateTransverseTriangleIntersection,vec3,
  orientation2D,orientation3D} from '../dist/index.js';

function seeded(seed) {
  let state=seed>>>0;
  return ()=>{ state^=state<<13;state^=state>>>17;state^=state<<5;
    return (state>>>0)/4294967296; };
}
const rnd=seeded(0x9e3779b9);
const v=vec3;
function meshOf(tris){
  return {positions:tris.flatMap(t=>t.flatMap(p=>[p.x,p.y,p.z])),
    normals:tris.flatMap(()=>[0,0,1,0,0,1,0,0,1]),
    indices:tris.flatMap((t,i)=>[i*3,i*3+1,i*3+2])};
}
const a=[v(0,0,0),v(2,0,0),v(0,2,0)];
const b=[v(.4,.5,-1),v(1.6,.5,-1),v(1,.5,1)];
test('64 seeded separated triangle-pairs have exactly 64 independent transverse crossings',()=>{
  const triangles=[];
  for(let i=0;i<64;i++){
    const dx=i*8+rnd()*.1,dy=rnd()*.1,dz=rnd()*.1;
    const place=tri=>tri.map(p=>v(p.x+dx,p.y+dy,p.z+dz));
    triangles.push(place(a),place(b));
  }
  const mesh=meshOf(triangles);
  const x=analyzeMeshSelfIntersections(mesh,{broadPhase:'bvh'});
  const y=analyzeMeshSelfIntersections(mesh,{broadPhase:'sweep'});
  assert.equal(x.crossings,64);
  assert.equal(x.totalFindings,64);
  assert.equal(x.broadPhasePairs,64);
  assert.deepEqual(x.findings,y.findings);
  assert.equal(x.broadPhasePairs,y.broadPhasePairs);
});
test('64 seeded separated pairs do not generate candidates or accidental contacts',()=>{
  const triangles=[];
  for(let i=0;i<64;i++){
    const x=i*8+rnd()*.1,y=rnd()*.1,z=rnd()*.1;
    const place=(tri,offset)=>tri.map(p=>v(p.x+x,p.y+y,p.z+z+offset));
    triangles.push(place(a,0),place(b,5));
  }
  const report=analyzeMeshSelfIntersections(meshOf(triangles));
  assert.equal(report.broadPhasePairs,0);
  assert.equal(report.totalFindings,0);
});
test('seeded rigid translations preserve measured segment in its local frame',()=>{
  for(let i=0;i<64;i++){
    const x=(rnd()-.5)*2000,y=(rnd()-.5)*2000,z=(rnd()-.5)*2000;
    const moved=tri=>tri.map(p=>v(p.x+x,p.y+y,p.z+z));
    const result=estimateTransverseTriangleIntersection(moved(a),moved(b),1e-8);
    assert.equal(result.status,'crossing',`seed case ${i}: ${JSON.stringify(result)}`);
    const p=[result.start,result.end].sort((a,b)=>a.x-b.x);
    assert.ok(Math.abs(p[0].x-x-.7)<1e-8);
    assert.ok(Math.abs(p[1].x-x-1.3)<1e-8);
    assert.ok(Math.abs(p[0].y-y-.5)<1e-8);
    assert.ok(Math.abs(p[1].z-z)<1e-8);
  }
});
test('adaptive orientation is antisymmetric under vertex swapping for adversarial near collinearity',()=>{
  for(let i=0;i<64;i++){
    const m=2**27+i*2;
    const first=orientation2D([0,0],[m,m+1],[m+1,m+2]);
    const reverse=orientation2D([0,0],[m+1,m+2],[m,m+1]);
    assert.equal(first,-reverse);
    assert.notEqual(first,0);
  }
});
test('adaptive 3D orientation behaves consistently under permutations of slanted planes',()=>{
  for(let i=0;i<64;i++){
    const d=rnd()+.01;
    const u=v(0,0,0),w=v(2,0,.2),x=v(0,3,.3),p=v(.5,.5,d);
    const s=orientation3D(u,w,x,p);
    assert.equal(s,-orientation3D(u,x,w,p));
    assert.notEqual(s,0);
  }
});
