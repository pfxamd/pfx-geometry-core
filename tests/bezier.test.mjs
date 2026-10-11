import test from 'node:test';
import assert from 'node:assert/strict';
import {
  vec3, cross3, dot3, normalize3, cubicBezier3, cubicBezierDerivative3,
  sampleCubicBezier3, evaluateBezierPatch3, createBezierPatchMesh,
  validateMesh, boundsOfMesh, GeometryError,
} from '../dist/index.js';
const V=vec3;
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<=tol,`Expected ${b}, got ${a}`);
const checkVec=(a,b,tol=1e-9)=>{close(a.x,b.x,tol);close(a.y,b.y,tol);close(a.z,b.z,tol);};
const throwsCode=(fn,code)=>assert.throws(fn,e=>e instanceof GeometryError&&e.code===code);
const linear=[V(0,0,0),V(1,0,0),V(2,0,0),V(3,0,0)];
const arch=[V(0,0,0),V(0,1,0),V(1,1,0),V(1,0,0)];
const plane=Array.from({length:4},(_,j)=>Array.from({length:4},(_,i)=>V(i/3,j/3,0)));
const dome=Array.from({length:4},(_,j)=>Array.from({length:4},(_,i)=>
  V(i/3,j/3,(i===1||i===2)&&(j===1||j===2)?0.8:0)));

test('cubic Bezier endpoints, midpoint and analytic derivative',()=>{
  checkVec(cubicBezier3(arch,0),arch[0]);checkVec(cubicBezier3(arch,1),arch[3]);
  checkVec(cubicBezier3(arch,.5),V(.5,.75,0));
  checkVec(cubicBezierDerivative3(arch,0),V(0,3,0));
  checkVec(cubicBezierDerivative3(arch,.5),V(1.5,0,0));
  checkVec(cubicBezierDerivative3(arch,1),V(0,-3,0));
});
test('linear reproduction and inclusive deterministic curve sampling',()=>{
  for(const t of [0,.1,.5,.75,1]){
    checkVec(cubicBezier3(linear,t),V(3*t,0,0));
    checkVec(cubicBezierDerivative3(linear,t),V(3,0,0));
  }
  const samples=sampleCubicBezier3(linear,20);
  assert.equal(samples.length,21);assert.ok(Object.isFrozen(samples));
  checkVec(samples[0],V(0,0,0));checkVec(samples.at(-1),V(3,0,0));
});
test('curve rejects invalid controls, parameters and segment counts',()=>{
  throwsCode(()=>cubicBezier3(arch,-.1),'INVALID_DIMENSION');
  throwsCode(()=>cubicBezier3(arch,1.01),'INVALID_DIMENSION');
  throwsCode(()=>cubicBezierDerivative3(arch,NaN),'INVALID_NUMBER');
  throwsCode(()=>sampleCubicBezier3(arch,0),'INVALID_DIMENSION');
  throwsCode(()=>sampleCubicBezier3(arch,4097),'INVALID_DIMENSION');
  throwsCode(()=>sampleCubicBezier3(arch,2.5),'INVALID_DIMENSION');
  throwsCode(()=>cubicBezier3(arch.slice(0,3),.5),'INVALID_DIMENSION');
});
test('tensor-product patch reproduces plane and correct surface normal',()=>{
  const p=evaluateBezierPatch3(plane,.25,.75);
  checkVec(p.position,V(.25,.75,0));
  checkVec(p.tangentU,V(1,0,0));
  checkVec(p.tangentV,V(0,1,0));
  checkVec(p.normal,V(0,0,1));
});
test('patch mesh: vertex count, dimension, indices and face winding',()=>{
  const mesh=createBezierPatchMesh(plane,{uSegments:6,vSegments:4});
  validateMesh(mesh);assert.ok(Object.isFrozen(mesh.indices));
  assert.equal(mesh.positions.length/3,35);assert.equal(mesh.indices.length/3,48);
  checkVec(boundsOfMesh(mesh).size,V(1,1,0));
  for(let i=0;i<mesh.indices.length;i+=3){
    const ids=mesh.indices.slice(i,i+3);
    const [a,b,c]=ids.map(id=>V(...mesh.positions.slice(id*3,id*3+3)));
    assert.ok(dot3(cross3(V(b.x-a.x,b.y-a.y,b.z-a.z),
                          V(c.x-a.x,c.y-a.y,c.z-a.z)),V(0,0,1))>0);
  }
});
test('curved patch has height and analytic differentials agree with finite differences',()=>{
  const u=.37,v=.61,h=1e-5;
  const p=evaluateBezierPatch3(dome,u,v);
  assert.ok(p.position.z>0);
  const up=evaluateBezierPatch3(dome,u+h,v).position;
  const um=evaluateBezierPatch3(dome,u-h,v).position;
  const vp=evaluateBezierPatch3(dome,u,v+h).position;
  const vm=evaluateBezierPatch3(dome,u,v-h).position;
  for(const key of ['x','y','z']){
    close(p.tangentU[key],(up[key]-um[key])/(2*h),1e-8);
    close(p.tangentV[key],(vp[key]-vm[key])/(2*h),1e-8);
  }
  checkVec(p.normal,normalize3(cross3(p.tangentU,p.tangentV)));
  const mesh=createBezierPatchMesh(dome,{uSegments:16,vSegments:12});
  validateMesh(mesh);
  assert.ok(boundsOfMesh(mesh).size.z>.3);
  assert.equal(mesh.indices.length,16*12*6);
});
test('patch rejects malformed controls, over-budget subdivisions and degeneracy',()=>{
  throwsCode(()=>createBezierPatchMesh(plane.slice(0,3),{uSegments:4,vSegments:4}),'INVALID_DIMENSION');
  throwsCode(()=>createBezierPatchMesh(plane,{uSegments:0,vSegments:4}),'INVALID_DIMENSION');
  throwsCode(()=>createBezierPatchMesh(plane,{uSegments:4,vSegments:129}),'INVALID_DIMENSION');
  throwsCode(()=>createBezierPatchMesh(plane,{uSegments:2.5,vSegments:4}),'INVALID_DIMENSION');
  throwsCode(()=>evaluateBezierPatch3(plane,0,Infinity),'INVALID_NUMBER');
  const collapsed=Array.from({length:4},()=>Array.from({length:4},()=>V(0,0,0)));
  throwsCode(()=>evaluateBezierPatch3(collapsed,.5,.5),'DEGENERATE_GEOMETRY');
  throwsCode(()=>createBezierPatchMesh(collapsed,{uSegments:3,vSegments:3}),'DEGENERATE_GEOMETRY');
});
