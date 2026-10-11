import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeometryError, vec3, inspectNearCoplanarTriangles3,
  classifyCoplanarTriangleContact3,
} from '../dist/index.js';

const V=vec3;
const base=[V(0,0,0),V(2,0,0),V(0,2,0)];
const overlap=[V(.25,.25,0),V(1.25,.25,0),V(.25,1.25,0)];
const edge=[V(.5,0,0),V(1.5,0,0),V(1,-1,0)];
const corner=[V(2,0,0),V(3,0,0),V(2,-1,0)];
const apart=[V(3,3,0),V(4,3,0),V(3,4,0)];
const lift=(tri,height)=>tri.map(p=>V(p.x,p.y,p.z+height));
const tilt=(tri)=>tri.map(p=>V(p.x,p.y,p.x/2+p.y/4));
const fail=(fn,code)=>assert.throws(fn,e=>e instanceof GeometryError&&e.code===code);
const near=(a,b,tolerance=1e-12)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);

test('exact coplanarity preserves all 4 previous classification categories',()=>{
  for(const [tri,category] of [
    [overlap,'area-overlap'],[edge,'edge-contact'],
    [corner,'point-contact'],[apart,'disjoint'],
  ]){
    const result=inspectNearCoplanarTriangles3(base,tri);
    assert.equal(result.status,'coplanar');
    assert.equal(result.exactlyCoplanar,true);
    assert.equal(result.projectedContact,category);
    assert.equal(result.maxPlaneDistance,0);
    assert.equal(result.normalAngleRadians,0);
    assert.equal(classifyCoplanarTriangleContact3(base,tri).kind,category);
  }
});
test('small nonzero plane offset is near, never exactly coplanar or a certified 3D collision',()=>{
  const gap=1e-7;
  const result=inspectNearCoplanarTriangles3(base,lift(overlap,gap));
  assert.equal(result.status,'near-coplanar');
  assert.equal(result.exactlyCoplanar,false);
  assert.equal(result.projectedContact,'area-overlap');
  near(result.maxPlaneDistance,gap);
  near(result.normalAngleRadians,0);
});
test('near-parallel triangles can have projected EDGE or POINT contacts without any 3D contact',()=>{
  for(const [tri,expected] of [[edge,'edge-contact'],[corner,'point-contact'],[apart,'disjoint']]){
    const result=inspectNearCoplanarTriangles3(base,lift(tri,3e-7));
    assert.equal(result.status,'near-coplanar');
    assert.equal(result.projectedContact,expected);
    assert.equal(result.exactlyCoplanar,false);
  }
});
test('distance above domain limit produces explicit refusal, not false projection success',()=>{
  const result=inspectNearCoplanarTriangles3(base,lift(overlap,3e-5));
  assert.equal(result.status,'outside-domain');
  assert.equal(result.reason,'plane-distance');
  assert.equal(result.exactlyCoplanar,false);
  assert.ok(result.maxPlaneDistance>1e-6);
});
test('varying gap tolerance changes supported domain but never exact coplanarity',()=>{
  const b=lift(overlap,3e-7);
  assert.equal(inspectNearCoplanarTriangles3(base,b,
    {distanceTolerance:1e-7}).status,'outside-domain');
  const result=inspectNearCoplanarTriangles3(base,b,{distanceTolerance:1e-6});
  assert.equal(result.status,'near-coplanar');
  assert.equal(result.exactlyCoplanar,false);
});
test('tilted near-parallel surfaces are diagnosed with angular deviation and projected overlap',()=>{
  const b=overlap.map(p=>V(p.x,p.y,3e-8+p.x*2e-7));
  const result=inspectNearCoplanarTriangles3(base,b);
  assert.equal(result.status,'near-coplanar');
  assert.equal(result.projectedContact,'area-overlap');
  assert.ok(result.normalAngleRadians>=0 && result.normalAngleRadians<1e-5);
  assert.ok(result.maxPlaneDistance>0 && result.maxPlaneDistance<1e-6);
});
test('strongly tilted planes are outside domain even if they share a point',()=>{
  const rotated=[V(.25,.25,0),V(1.25,.25,.2),V(.25,1.25,0)];
  const result=inspectNearCoplanarTriangles3(base,rotated);
  assert.equal(result.status,'outside-domain');
  assert.equal(result.reason,'angular-difference');
  assert.ok(result.normalAngleRadians>.01);
});
test('swapping order and winding preserves near-coplanar footprint categories',()=>{
  for(const tri of [overlap,edge,corner,apart]){
    const raised=lift(tri,1e-7);
    const forward=inspectNearCoplanarTriangles3(base,raised);
    const reverse=inspectNearCoplanarTriangles3(
      [...raised].reverse(),[...base].reverse());
    assert.equal(forward.status,'near-coplanar');
    assert.equal(reverse.status,'near-coplanar');
    assert.equal(reverse.projectedContact,forward.projectedContact);
    near(forward.maxPlaneDistance,reverse.maxPlaneDistance,1e-12);
  }
});
test('exactly coplanar tilted surface is supported in full 3D coordinate space',()=>{
  const first=tilt(base),second=tilt(overlap);
  const result=inspectNearCoplanarTriangles3(first,second);
  assert.equal(result.status,'coplanar');
  assert.equal(result.projectedContact,'area-overlap');
  assert.equal(result.maxPlaneDistance,0);
});
test('a small positive 2D overlap remains visible after near-plane displacement',()=>{
  const epsilon=2**-18;
  const tiny=[V(2-epsilon,0,0),V(2+epsilon,0,0),V(2-epsilon,epsilon,0)];
  const result=inspectNearCoplanarTriangles3(base,lift(tiny,1e-7));
  assert.equal(result.status,'near-coplanar');
  assert.equal(result.projectedContact,'area-overlap');
});
test('invalid options, nonfinite points and degenerate triangles are rejected',()=>{
  fail(()=>inspectNearCoplanarTriangles3(base,overlap,null),'INVALID_DIMENSION');
  fail(()=>inspectNearCoplanarTriangles3(base,overlap,{distanceTolerance:0}),'INVALID_DIMENSION');
  fail(()=>inspectNearCoplanarTriangles3(base,overlap,{maxAngleRadians:0}),'INVALID_DIMENSION');
  fail(()=>inspectNearCoplanarTriangles3(base,overlap,{maxAngleRadians:1}),'INVALID_DIMENSION');
  fail(()=>inspectNearCoplanarTriangles3(base,overlap,{distanceTolerance:Infinity}),'INVALID_NUMBER');
  fail(()=>inspectNearCoplanarTriangles3(base,[V(0,0,0),V(1,0,0)]),'INVALID_DIMENSION');
  fail(()=>inspectNearCoplanarTriangles3(base,[V(0,0,0),V(1,0,0),V(2,0,0)]),
    'DEGENERATE_GEOMETRY');
  fail(()=>inspectNearCoplanarTriangles3(base,[V(0,0,0),{x:NaN,y:0,z:0},V(0,1,0)]),
    'INVALID_NUMBER');
});
