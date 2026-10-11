import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeometryError, createBox, createBezierPatchMesh, revolveProfile,
  extrudeConvexPolygon, sweepCircularTube, vec3,
  analyzeMeshTopology, analyzeMeshSelfIntersections,
  assertNoDetectedSelfIntersections,
} from '../dist/index.js';

const point = (x,y,z)=>[x,y,z];
const base = [
  point(0,0,0),point(2,0,0),point(0,2,0),
];
const crossing = [
  point(.5,.5,-1),point(.5,.5,1),point(1.5,.5,0),
];
const planarOverlap = [
  point(.5,.2,0),point(1.5,.2,0),point(.5,1.3,0),
];
const pointContact = [
  point(.5,.5,0),point(.5,.5,1),point(.5,1,1),
];
const coplanarBoundary = [
  point(2,0,0),point(3,0,0),point(2,1,0),
];
const nearlyAlignedEdge = [
  point(.5,.5,0),point(1,.5,0),point(.5,1,1),
];
function triangles(...sets){
  return {
    positions:sets.flat(2),
    indices:sets.flatMap((_,i)=>[3*i,3*i+1,3*i+2]),
    normals:sets.flatMap(()=>[0,0,1,0,0,1,0,0,1]),
  };
}
function join(a,b){
  const offset=a.positions.length/3;
  return {positions:[...a.positions,...b.positions],
    normals:[...a.normals,...b.normals],
    indices:[...a.indices,...b.indices.map(i=>i+offset)]};
}
function move(mesh,x,y,z){
  return {...mesh,positions:mesh.positions.map((v,i)=>v+[x,y,z][i%3])};
}
const fails=(fn,code)=>assert.throws(fn,e=>e instanceof GeometryError&&e.code===code);

test('separate triangles crossing through each other have one confirmed intersection',()=>{
  const mesh=triangles(base,crossing);
  const report=analyzeMeshSelfIntersections(mesh);
  assert.equal(report.crossings,1);
  assert.equal(report.coplanarOverlaps,0);
  assert.equal(report.uncertainPairs,0);
  assert.equal(report.totalFindings,1);
  assert.deepEqual(report.findings,[{firstTriangle:0,secondTriangle:1,kind:'crossing'}]);
  fails(()=>assertNoDetectedSelfIntersections(mesh),'INVALID_MESH');
});
test('coplanar triangles with positive overlap area are detected',()=>{
  const report=analyzeMeshSelfIntersections(triangles(base,planarOverlap));
  assert.equal(report.coplanarOverlaps,1);
  assert.equal(report.crossings,0);
  assert.equal(report.findings[0].kind,'coplanar-overlap');
});
test('one isolated point of intersection is classified as contact',()=>{
  const report=analyzeMeshSelfIntersections(triangles(base,pointContact));
  assert.equal(report.pointContacts,1);
  assert.equal(report.totalFindings,1);
});
test('coplanar boundary-only contact is not a positive-area overlap',()=>{
  const r=analyzeMeshSelfIntersections(triangles(base,coplanarBoundary));
  assert.equal(r.coplanarOverlaps,0);
  assert.equal(r.noDetectedIntersections,true);
});
test('coplanar edge embedded in a noncoplanar triangle is conservative uncertainty',()=>{
  const r=analyzeMeshSelfIntersections(triangles(base,nearlyAlignedEdge));
  assert.equal(r.uncertainPairs,1);
  assert.equal(r.noDetectedIntersections,false);
});
test('separated triangles are rejected in broad phase without false findings',()=>{
  const lifted=base.map(p=>[p[0],p[1],5]);
  const r=analyzeMeshSelfIntersections(triangles(base,lifted));
  assert.equal(r.broadPhasePairs,0);
  assert.equal(r.totalFindings,0);
  assert.equal(r.noDetectedIntersections,true);
});
test('existing closed solid builders have no detected self-intersections',()=>{
  const cylinder=revolveProfile([{radius:1,height:0},{radius:1,height:2}],
    {radialSegments:24});
  const prism=extrudeConvexPolygon([
    {x:0,y:0},{x:2,y:0},{x:2,y:1},{x:0,y:1}],2);
  const tube=sweepCircularTube([
    vec3(0,0,0),vec3(0,2,0),vec3(.35,3,.2)
  ],{radius:.2,radialSegments:20});
  for(const mesh of [createBox(2,2,2),cylinder,prism,tube]){
    const r=assertNoDetectedSelfIntersections(mesh);
    assert.equal(r.totalFindings,0);
    assert.ok(r.excludedAdjacentPairs>0);
    assert.equal(analyzeMeshTopology(mesh).boundaryEdges,0);
  }
});
test('lathe caps with touching triangular wedges are NOT area overlap (regression)',()=>{
  for (const segments of [12,24,32,64]) {
    const mesh=revolveProfile([{radius:1,height:0},{radius:1,height:2}],
      {radialSegments:segments});
    const report=analyzeMeshSelfIntersections(mesh);
    assert.equal(report.totalFindings,0,
      `segments=${segments}: ${JSON.stringify(report.findings)}`);
  }
});
test('interpenetrating offset box surfaces trigger geometric findings',()=>{
  const combined=join(createBox(2,2,2),move(createBox(2,2,2),.7,.4,.2));
  const r=analyzeMeshSelfIntersections(combined);
  assert.ok(r.crossings+r.coplanarOverlaps+r.uncertainPairs>0);
  fails(()=>assertNoDetectedSelfIntersections(combined),'INVALID_MESH');
});
test('3 coplanar overlapping triangles count all pairs while truncating stored findings',()=>{
  const r=analyzeMeshSelfIntersections(triangles(base,base,base),{maxFindings:1});
  assert.equal(r.totalFindings,3);
  assert.equal(r.coplanarOverlaps,3);
  assert.equal(r.findings.length,1);
  assert.equal(r.truncated,true);
});
test('the diagnostic exposes excluded noncoplanar adjacency rather than claiming exact proof',()=>{
  const r=analyzeMeshSelfIntersections(createBox(2,2,2));
  assert.equal(r.noDetectedIntersections,true);
  assert.ok(r.excludedAdjacentPairs>0);
  assert.ok(r.testedPairs>=0);
});
test('invalid options and excessive triangle counts fail explicitly',()=>{
  const mesh=triangles(base,crossing);
  fails(()=>analyzeMeshSelfIntersections(mesh,null),'INVALID_DIMENSION');
  fails(()=>analyzeMeshSelfIntersections(mesh,{tolerance:0}),'INVALID_DIMENSION');
  fails(()=>analyzeMeshSelfIntersections(mesh,{tolerance:Infinity}),'INVALID_NUMBER');
  fails(()=>analyzeMeshSelfIntersections(mesh,{maxTriangles:1}),'INVALID_DIMENSION');
  fails(()=>analyzeMeshSelfIntersections(mesh,{maxTriangles:1501}),'INVALID_DIMENSION');
  fails(()=>analyzeMeshSelfIntersections(mesh,{maxFindings:0}),'INVALID_DIMENSION');
  fails(()=>analyzeMeshSelfIntersections(triangles(base,base,base),
    {maxTriangles:2}),'INVALID_DIMENSION');
});
