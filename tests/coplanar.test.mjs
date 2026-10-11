import test from 'node:test';
import assert from 'node:assert/strict';
import {vec3, GeometryError, classifyCoplanarTriangleContact3} from '../dist/index.js';

const v=vec3;
const a=[v(0,0,0),v(2,0,0),v(0,2,0)];
const overlap=[v(.25,.25,0),v(1.25,.25,0),v(.25,1.25,0)];
const touchingEdge=[v(.5,0,0),v(1.5,0,0),v(1,-1,0)];
const touchingCorner=[v(2,0,0),v(3,0,0),v(2,-1,0)];
const touchingPointOnEdge=[v(1,0,0),v(2,-1,0),v(0,-1,0)];
const separated=[v(3,3,0),v(4,3,0),v(3,4,0)];
const sharedEdgeSameSide=[v(.5,0,0),v(1.5,0,0),v(1,.5,0)];
const shiftZ=(tri,z)=>tri.map(p=>v(p.x,p.y,p.z+z));
const classify=(b,first=a,tolerance)=>classifyCoplanarTriangleContact3(first,b,tolerance);

test('exactly coplanar disjoint triangles are disjoint',()=>{
  assert.deepEqual(classify(separated),{kind:'disjoint',exactlyCoplanar:true});
});
test('strictly overlapping interiors are area-overlap',()=>{
  assert.deepEqual(classify(overlap),{kind:'area-overlap',exactlyCoplanar:true});
});
test('equal triangles and boundary-overlapping same-side triangles have positive area',()=>{
  assert.equal(classify(a).kind,'area-overlap');
  assert.equal(classify(sharedEdgeSameSide).kind,'area-overlap');
});
test('shared boundary with triangles on opposite sides is edge-contact, not area overlap',()=>{
  assert.deepEqual(classify(touchingEdge),{kind:'edge-contact',exactlyCoplanar:true});
});
test('vertex-to-vertex touch classifies as point-contact',()=>{
  assert.deepEqual(classify(touchingCorner),{kind:'point-contact',exactlyCoplanar:true});
});
test('vertex landing in middle of edge is a point-contact',()=>{
  assert.equal(classify(touchingPointOnEdge).kind,'point-contact');
});
test('small positive overlap remains distinguishable from tangent contact',()=>{
  const e=2**-18;
  const tiny=[v(2-e,0,0),v(2+e,0,0),v(2-e,e,0)];
  assert.equal(classify(tiny).kind,'area-overlap');
});
test('reversing winding and permutations preserve contact classification',()=>{
  const permutations=[
    [0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0],
  ];
  for(const [b,expected] of [
    [overlap,'area-overlap'],[touchingEdge,'edge-contact'],
    [touchingCorner,'point-contact'],[separated,'disjoint'],
  ]){
    for(const ap of permutations)for(const bp of permutations){
      const result=classifyCoplanarTriangleContact3(
        ap.map(i=>a[i]),bp.map(i=>b[i]));
      assert.equal(result.kind,expected,`${expected}: ${ap},${bp}`);
    }
  }
});
test('exactly coplanar triangles in a tilted plane retain their classification',()=>{
  const tilt=tri=>tri.map(p=>v(p.x,p.y,p.x/2+p.y/4));
  for(const [b,expected] of [
    [overlap,'area-overlap'],[touchingEdge,'edge-contact'],
    [touchingCorner,'point-contact'],[separated,'disjoint'],
  ])assert.equal(classifyCoplanarTriangleContact3(tilt(a),tilt(b)).kind,expected);
});
test('near-coplanar triangles are conservatively indeterminate',()=>{
  assert.deepEqual(classify(shiftZ(overlap,1e-10)),{
    kind:'indeterminate',exactlyCoplanar:false,reason:'near-coplanar',
  });
});
test('noncoplanar triangles are explicitly out of the supported classification domain',()=>{
  assert.deepEqual(classify(shiftZ(overlap,1e-4)),{
    kind:'indeterminate',exactlyCoplanar:false,reason:'noncoplanar',
  });
});
test('tolerance changes reported uncertainty without inventing contact geometry',()=>{
  const pair=shiftZ(touchingEdge,1e-10);
  assert.equal(classify(pair,a,1e-9).reason,'near-coplanar');
  assert.equal(classify(pair,a,1e-12).reason,'noncoplanar');
});
test('malformed triangles and degenerate input fail explicitly',()=>{
  const fail=(fn,code)=>assert.throws(fn,e=>e instanceof GeometryError&&e.code===code);
  fail(()=>classify([v(0,0,0),v(1,0,0)]),'INVALID_DIMENSION');
  fail(()=>classify([null,v(1,0,0),v(0,1,0)]),'INVALID_DIMENSION');
  fail(()=>classify([v(0,0,0),v(1,0,0),v(2,0,0)]),'DEGENERATE_GEOMETRY');
  fail(()=>classify(overlap,a,0),'INVALID_DIMENSION');
  fail(()=>classify(overlap,a,Infinity),'INVALID_NUMBER');
  fail(()=>classify([v(0,0,0),v(Infinity,0,0),v(0,1,0)]),'INVALID_NUMBER');
});
