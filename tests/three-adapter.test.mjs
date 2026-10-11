import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import {
  createBox, createBezierPatchMesh, vec3, projectPoint,
  perspectiveCamera, GeometryError,
} from '../dist/index.js';
import { toThreeBufferGeometry, toThreePerspectiveCamera } from '../adapters/three/index.mjs';

const near = (a,b,tol=2e-6) =>
  assert.ok(Math.abs(a-b) < tol, `expected ${b} got ${a}`);
const nearVec = (a,b,tol=2e-6) => {
  near(a.x,b.x,tol); near(a.y,b.y,tol); near(a.z,b.z,tol);
};
const grid = Array.from({length:4},(_,v) =>
  Array.from({length:4},(_,u) =>
    vec3(u/3,v/3,(u===1||u===2)&&(v===1||v===2)?0.35:0)));

test('adapter exports a measured box without changing CPU source', () => {
  const source=createBox(2,1,0.5);
  const orig=source.positions.slice();
  const three=toThreeBufferGeometry(source);
  assert.equal(three.getAttribute('position').count,24);
  assert.equal(three.getAttribute('normal').count,24);
  assert.equal(three.index.count,36);
  assert.ok(three.index.array instanceof Uint16Array);
  assert.deepEqual(three.getAttribute('position').array.length,orig.length);
  assert.deepEqual(source.positions,orig);
  nearVec(three.boundingBox.min,vec3(-1,-0.5,-0.25));
  nearVec(three.boundingBox.max,vec3(1,0.5,0.25));
  three.dispose();
});
test('adapter transports analytic patch normals and winding to Three buffers', () => {
  const source=createBezierPatchMesh(grid,{uSegments:8,vSegments:6});
  const three=toThreeBufferGeometry(source);
  assert.equal(three.getAttribute('position').count,63);
  assert.equal(three.index.count,8*6*6);
  for(let i=0;i<source.normals.length;i++)near(three.getAttribute('normal').array[i],source.normals[i]);
  for(let i=0;i<source.indices.length;i++)assert.equal(three.index.array[i],source.indices[i]);
  assert.ok(three.boundingBox.max.z>0.1);
  three.dispose();
});
test('Float32 overflow and coordinate collapse must be rejected', () => {
  const box=createBox(2,2,2);
  assert.throws(()=>toThreeBufferGeometry({
    ...box, positions:box.positions.map(v=>v*1e39),
  }),e=>e instanceof GeometryError&&e.code==='INVALID_MESH');
  const farBox=createBox(2,2,2);
  assert.throws(()=>toThreeBufferGeometry({
    ...farBox,
    positions:farBox.positions.map((v,i)=>i%3===0?v+1e8:v),
  }),e=>e instanceof GeometryError&&e.code==='DEGENERATE_GEOMETRY');
});
test('converted camera exactly follows core projection and view',()=>{
  const options={
    eye:vec3(3,2,5), target:vec3(-0.3,0.1,0),
    fovYRadians:Math.PI/3,aspect:16/9,near:0.1,far:100,
  };
  const source=perspectiveCamera(options);
  const camera=toThreePerspectiveCamera(source);
  nearVec(camera.position,options.eye,1e-10);
  for(let i=0;i<16;i++){
    near(camera.matrixWorldInverse.elements[i],source.view[i],1e-10);
    near(camera.projectionMatrix.elements[i],source.projection[i],1e-10);
  }
  for(const point of [vec3(0,0,0),vec3(1,0,0),vec3(0,0.5,-1)]){
    const corePoint=projectPoint(point,source,{width:1280,height:720});
    const projected=new Vector3(point.x,point.y,point.z).project(camera);
    near(projected.x,corePoint.ndc.x,1e-10);
    near(projected.y,corePoint.ndc.y,1e-10);
    near(projected.z,corePoint.ndc.z,1e-10);
  }
  // The camera stays mutable: useful for future interaction/OrbitControls.
  camera.position.x+=1;
  camera.updateMatrixWorld(true);
  near(camera.position.x,options.eye.x+1,1e-10);
});
test('camera rejects inconsistent matrices and singular inputs',()=>{
  const source=perspectiveCamera({
    eye:vec3(0,0,5),target:vec3(0,0,0),
    fovYRadians:Math.PI/3,aspect:1,near:0.1,far:100,
  });
  assert.throws(()=>toThreePerspectiveCamera({
    ...source,projection:Array(16).fill(1),
  }),e=>e instanceof GeometryError&&e.code==='INVALID_CAMERA');
  assert.throws(()=>toThreePerspectiveCamera({
    ...source,view:Array(16).fill(0),
  }),e=>e instanceof GeometryError&&e.code==='INVALID_CAMERA');
});
