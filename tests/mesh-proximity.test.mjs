import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeometryError, vec3, createBox, analyzeMeshNearCoplanarPairs,
  analyzeMeshSelfIntersections,
} from '../dist/index.js';

const V=vec3;
const base=[V(0,0,0),V(2,0,0),V(0,2,0)];
const overlap=[V(.3,.3,0),V(1.3,.3,0),V(.3,1.3,0)];
const edge=[V(.5,0,0),V(1.5,0,0),V(1,-1,0)];
const corner=[V(2,0,0),V(3,0,0),V(2,-1,0)];
const disjointFootprint=[V(1.5,1.5,0),V(1.9,1.5,0),V(1.5,1.9,0)];
const lift=(t,z)=>t.map(p=>V(p.x,p.y,p.z+z));
const make=(sets)=>{
  const positions=[],normals=[],indices=[];
  for(const triangle of sets){
    const i=positions.length/3;
    for(const p of triangle) {
      positions.push(p.x,p.y,p.z);normals.push(0,0,1);
    }
    indices.push(i,i+1,i+2);
  }
  return {positions,normals,indices};
};
const fail=(fn,code)=>assert.throws(fn,e=>e instanceof GeometryError&&e.code===code);

test('mesh-wide near-coplanar pair is diagnosed as projected area, never a 3D collision',()=>{
  const mesh=make([base,lift(overlap,2e-7)]);
  const snapshot=JSON.stringify(mesh);
  const r=analyzeMeshNearCoplanarPairs(mesh);
  assert.equal(r.triangles,2);
  assert.equal(r.candidatePairs,1);
  assert.equal(r.nearCoplanarAreaPairs,1);
  assert.equal(r.coplanarAreaPairs,0);
  assert.equal(r.reportedPairs,1);
  assert.equal(r.findings[0].status,'near-coplanar');
  assert.equal(r.findings[0].exactlyCoplanar,false);
  assert.equal(r.findings[0].projectedContact,'area-overlap');
  assert.ok(Math.abs(r.findings[0].maxPlaneDistance-2e-7)<1e-12);
  assert.equal(JSON.stringify(mesh),snapshot);
  assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.findings));
});
test('exactly coplanar area overlap is distinguished from proximity across a gap',()=>{
  const r=analyzeMeshNearCoplanarPairs(make([base,overlap]));
  assert.equal(r.coplanarAreaPairs,1);
  assert.equal(r.nearCoplanarAreaPairs,0);
  assert.equal(r.findings[0].status,'coplanar');
  assert.equal(r.findings[0].maxPlaneDistance,0);
});
test('boundary-only contacts are counted but not presented as suspicious by default',()=>{
  const mesh=make([base,edge,corner]);
  const r=analyzeMeshNearCoplanarPairs(mesh);
  assert.equal(r.coplanarAreaPairs,0);
  assert.ok(r.coplanarBoundaryPairs>=2);
  assert.equal(r.reportedPairs,0);
  assert.equal(r.noReportedProximity,true);
  const enabled=analyzeMeshNearCoplanarPairs(mesh,{includeBoundaryContacts:true});
  assert.equal(enabled.reportedPairs,enabled.coplanarBoundaryPairs);
  assert.ok(enabled.findings.some(f=>f.projectedContact==='edge-contact'));
  assert.ok(enabled.findings.some(f=>f.projectedContact==='point-contact'));
});
test('near-coplanar edge contact is an optional projected-contact warning only',()=>{
  const mesh=make([base,lift(edge,1e-7)]);
  const r=analyzeMeshNearCoplanarPairs(mesh,{includeBoundaryContacts:true});
  assert.equal(r.nearCoplanarBoundaryPairs,1);
  assert.equal(r.findings[0].projectedContact,'edge-contact');
  assert.equal(r.findings[0].status,'near-coplanar');
});
test('nearby AABBs with disjoint projected triangles do not produce findings',()=>{
  const r=analyzeMeshNearCoplanarPairs(make([base,lift(disjointFootprint,1e-7)]));
  assert.equal(r.candidatePairs,1);
  assert.equal(r.projectedDisjointPairs,1);
  assert.equal(r.reportedPairs,0);
});
test('outside domain due to perpendicular planes is counted rather than projected',()=>{
  const upright=[V(.2,.2,-1),V(.2,.2,1),V(1,.2,0)];
  const r=analyzeMeshNearCoplanarPairs(make([base,upright]));
  assert.equal(r.candidatePairs,1);
  assert.equal(r.outsideDomainPairs,1);
  assert.equal(r.reportedPairs,0);
});
test('triangle pair beyond the AABB distance window never reports proximity',()=>{
  const r=analyzeMeshNearCoplanarPairs(make([base,lift(overlap,.01)]));
  assert.equal(r.candidatePairs,0);
  assert.equal(r.reportedPairs,0);
});
test('a normal measured box has no positive-area near-coplanar overlap',()=>{
  const mesh=createBox(2,2,2);
  const proximity=analyzeMeshNearCoplanarPairs(mesh);
  assert.equal(proximity.reportedPairs,0);
  assert.ok(proximity.coplanarBoundaryPairs>0);
  assert.equal(analyzeMeshSelfIntersections(mesh).noDetectedIntersections,true);
});
test('BVH and sweep agree on counts and stored results for dense repeated triangles',()=>{
  const originals=[];
  for(let i=0;i<4;i++){
    const offset=i*10;
    const place=t=>t.map(p=>V(p.x+offset,p.y,p.z));
    originals.push(place(base),place(overlap),lift(place(overlap),1e-7));
  }
  const mesh=make(originals);
  const modes=['bvh','sweep'].map(broadPhase=>
    analyzeMeshNearCoplanarPairs(mesh,{broadPhase,includeBoundaryContacts:true,maxFindings:4}));
  for(const key of ['candidatePairs','examinedPairs','outsideDomainPairs',
    'projectedDisjointPairs','coplanarAreaPairs','nearCoplanarAreaPairs',
    'coplanarBoundaryPairs','nearCoplanarBoundaryPairs','reportedPairs','truncated']){
    assert.equal(modes[0][key],modes[1][key],key);
  }
  assert.deepEqual(modes[0].findings,modes[1].findings);
  assert.equal(modes[0].findings.length,4);
  assert.equal(modes[0].truncated,true);
  assert.ok(modes[0].findings.every((x,i,a)=>i===0||
    (a[i-1].firstTriangle<x.firstTriangle||
      (a[i-1].firstTriangle===x.firstTriangle&&a[i-1].secondTriangle<x.secondTriangle))));
});
test('4096 spatially separated triangles prune all pairs on both search strategies',()=>{
  const triangles=[];
  for(let i=0;i<4096;i++){
    const x=i*5;
    triangles.push([V(x,0,0),V(x+1,0,0),V(x,1,0)]);
  }
  const mesh=make(triangles);
  for(const broadPhase of ['bvh','sweep']){
    const r=analyzeMeshNearCoplanarPairs(mesh,{broadPhase});
    assert.equal(r.candidatePairs,0);
    assert.equal(r.reportedPairs,0);
  }
});
test('dense candidate budget exceeds safely, no partial all-clear returned',()=>{
  const mesh=make(Array.from({length:20},()=>base));
  for(const broadPhase of ['bvh','sweep']){
    fail(()=>analyzeMeshNearCoplanarPairs(mesh,{broadPhase,maxCandidatePairs:5}),
      'INVALID_DIMENSION');
  }
});
test('invalid options and oversized mesh fail explicitly',()=>{
  const mesh=make([base,overlap]);
  fail(()=>analyzeMeshNearCoplanarPairs(mesh,null),'INVALID_DIMENSION');
  fail(()=>analyzeMeshNearCoplanarPairs(mesh,{distanceTolerance:0}),'INVALID_DIMENSION');
  fail(()=>analyzeMeshNearCoplanarPairs(mesh,{distanceTolerance:Infinity}),'INVALID_NUMBER');
  fail(()=>analyzeMeshNearCoplanarPairs(mesh,{maxAngleRadians:1}),'INVALID_DIMENSION');
  fail(()=>analyzeMeshNearCoplanarPairs(mesh,{maxFindings:0}),'INVALID_DIMENSION');
  fail(()=>analyzeMeshNearCoplanarPairs(mesh,{maxTriangles:1}),'INVALID_DIMENSION');
  fail(()=>analyzeMeshNearCoplanarPairs(mesh,{maxCandidatePairs:0}),'INVALID_DIMENSION');
  fail(()=>analyzeMeshNearCoplanarPairs(mesh,{broadPhase:'other'}),'INVALID_DIMENSION');
  fail(()=>analyzeMeshNearCoplanarPairs(mesh,{includeBoundaryContacts:'yes'}),
    'INVALID_DIMENSION');
  fail(()=>analyzeMeshNearCoplanarPairs(make([base,overlap,edge]),{maxTriangles:2}),
    'INVALID_DIMENSION');
});
