import test from 'node:test';
import assert from 'node:assert/strict';
import {GeometryError,vec3,orientation2D,orientation3D,createBox,
  analyzeMeshSelfIntersections,assertNoDetectedSelfIntersections,
} from '../dist/index.js';
const E=(fn,code)=>assert.throws(fn,e=>e instanceof GeometryError&&e.code===code);

test('2D orientation follows right-handed +Y-up coordinates',()=>{
  assert.equal(orientation2D([0,0],[1,0],[0,1]),1);
  assert.equal(orientation2D([0,0],[0,1],[1,0]),-1);
  assert.equal(orientation2D([0,0],[1,1],[2,2]),0);
});
test('adaptive 2D orientation detects determinant cancelled by naive arithmetic',()=>{
  const m=2**27;
  const naive=m*(m+2)-(m+1)**2;
  assert.equal(naive,0);
  assert.equal(orientation2D([0,0],[m,m+1],[m+1,m+2]),-1);
});
test('adaptive 3D orientation detects plane side and coplanarity',()=>{
  const a=vec3(0,0,0),b=vec3(1,0,0),c=vec3(0,1,0);
  assert.equal(orientation3D(a,b,c,vec3(0,0,1)),1);
  assert.equal(orientation3D(a,b,c,vec3(0,0,-1)),-1);
  assert.equal(orientation3D(a,b,c,vec3(.3,.2,0)),0);
  assert.equal(orientation3D(a,c,b,vec3(0,0,1)),-1);
});
test('adaptive 3D orientation recovers a sign cancelled by naive determinant',()=>{
  const m=2**27;
  const a=vec3(0,0,0),b=vec3(m,m+1,0);
  const c=vec3(m+1,m+2,0),d=vec3(0,0,1);
  assert.equal(b.x*c.y-b.y*c.x,0);
  assert.notEqual(orientation3D(a,b,c,d),0);
});
test('orientation predicates reject invalid inputs',()=>{
  E(()=>orientation2D([0,Infinity],[1,0],[0,1]),'INVALID_NUMBER');
  E(()=>orientation2D([0,0],[1,0],[1]),'INVALID_DIMENSION');
  E(()=>orientation3D(vec3(0,0,0),null,vec3(1,0,0),vec3(0,1,0)),
    'INVALID_DIMENSION');
});
test('near-coplanar crossing is detected with a declared small tolerance',()=>{
  const h=2**-28;
  const positions=[0,0,0, 2,0,0, 0,2,0,
    .5,.5,-h, .5,.5,h, 1.5,.5,0];
  const normals=Array.from({length:6},()=>[0,0,1]).flat();
  const mesh={positions,normals,indices:[0,1,2,3,4,5]};
  const report=analyzeMeshSelfIntersections(mesh,{tolerance:1e-12});
  assert.equal(report.crossings,1);
  const loose=analyzeMeshSelfIntersections(mesh,{tolerance:1e-7});
  assert.equal(loose.crossings,0);
});
test('previous box geometry still passes intersection diagnostics',()=>{
  assert.equal(assertNoDetectedSelfIntersections(createBox(2,1,3)).totalFindings,0);
});
