import test from 'node:test';
import assert from 'node:assert/strict';
import {
  revolveProfile, extrudeConvexPolygon, boundsOfMesh, validateMesh,
  GeometryError, vec3,
} from '../dist/index.js';
import { toThreeBufferGeometry } from '../adapters/three/index.mjs';

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}`);
}
function rejects(fn, code) {
  assert.throws(fn, e => e instanceof GeometryError && e.code === code);
}
function trianglePositions(mesh, i) {
  return mesh.indices.slice(i, i + 3).map(index => {
    const start = index * 3;
    return mesh.positions.slice(start, start + 3);
  });
}
function crossOfTriangle(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return [
    uy*vz - uz*vy,
    uz*vx - ux*vz,
    ux*vy - uy*vx,
  ];
}
function assertWindingMatchesNormals(mesh) {
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = trianglePositions(mesh, i);
    const normal = crossOfTriangle(a, b, c);
    const first = mesh.indices[i] * 3;
    const declared = mesh.normals.slice(first, first + 3);
    const dot = normal.reduce((total, component, j) => total + component*declared[j],0);
    assert.ok(dot > 1e-12, `wrong winding at triangle ${i / 3}`);
  }
}
function signedVolume(mesh) {
  let volume = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a,b,c] = trianglePositions(mesh,i);
    const cross = [
      b[1]*c[2]-b[2]*c[1],
      b[2]*c[0]-b[0]*c[2],
      b[0]*c[1]-b[1]*c[0],
    ];
    volume += (a[0]*cross[0] + a[1]*cross[1] + a[2]*cross[2])/6;
  }
  return volume;
}
const cylinder = [{radius:1,height:0},{radius:1,height:2}];

test('capped revolution builds measured cylinder with outward faces', () => {
  const original=JSON.stringify(cylinder);
  const mesh=revolveProfile(cylinder,{radialSegments:32});
  validateMesh(mesh);
  assert.equal(mesh.indices.length / 3,128);
  assert.deepEqual(boundsOfMesh(mesh).size,vec3(2,2,2));
  assertWindingMatchesNormals(mesh);
  near(signedVolume(mesh),32/2*Math.sin(2*Math.PI/32)*2,1e-9);
  assert.equal(JSON.stringify(cylinder),original);
  assert.ok(Object.isFrozen(mesh.positions));
});
test('revolution works for rising-radius frustum and flat caps',()=>{
  const mesh=revolveProfile([{radius:.5,height:-1},{radius:1,height:1}],
    {radialSegments:24,capEnds:true});
  validateMesh(mesh);
  assertWindingMatchesNormals(mesh);
  assert.ok(signedVolume(mesh)>0);
  assert.deepEqual(boundsOfMesh(mesh).size,vec3(2,2,2));
});
test('revolution can leave ends open without inserting cap triangles',()=>{
  const mesh=revolveProfile(cylinder,{radialSegments:16,capEnds:false});
  validateMesh(mesh);
  assert.equal(mesh.indices.length/3,32);
  assertWindingMatchesNormals(mesh);
  assert.equal(mesh.positions.length/3,34);
});
test('multi-ring revolution preserves profile height and radial limits',()=>{
  const profile=[
    {radius:.5,height:0},
    {radius:1.5,height:1},
    {radius:.75,height:2},
    {radius:1.25,height:3},
  ];
  const mesh=revolveProfile(profile,{radialSegments:16});
  const bounds=boundsOfMesh(mesh);
  near(bounds.min.y,0);
  near(bounds.max.y,3);
  near(bounds.size.x,3);
  assert.equal(mesh.indices.length/3,16*2*(profile.length-1)+16*2);
  assertWindingMatchesNormals(mesh);
});
test('revolution rejects invalid radii, heights, segments and parameters',()=>{
  rejects(()=>revolveProfile([{radius:1,height:0}],{radialSegments:16}),'INVALID_DIMENSION');
  rejects(()=>revolveProfile([{radius:0,height:0},{radius:1,height:1}],{radialSegments:16}),'INVALID_DIMENSION');
  rejects(()=>revolveProfile([{radius:1,height:0},{radius:1,height:0}],{radialSegments:16}),'INVALID_DIMENSION');
  rejects(()=>revolveProfile([{radius:1,height:1},{radius:1,height:0}],{radialSegments:16}),'INVALID_DIMENSION');
  rejects(()=>revolveProfile([{radius:1,height:0},{radius:Infinity,height:1}],{radialSegments:16}),'INVALID_NUMBER');
  rejects(()=>revolveProfile(cylinder,{radialSegments:2}),'INVALID_DIMENSION');
  rejects(()=>revolveProfile(cylinder,{radialSegments:257}),'INVALID_DIMENSION');
  rejects(()=>revolveProfile(cylinder,{radialSegments:8.5}),'INVALID_DIMENSION');
  rejects(()=>revolveProfile(cylinder,{radialSegments:16,capEnds:'yes'}),'INVALID_DIMENSION');
});
test('convex extrusion produces a closed measured prism and exact signed volume',()=>{
  const rectangle=[{x:0,y:0},{x:2,y:0},{x:2,y:3},{x:0,y:3}];
  const original=JSON.stringify(rectangle);
  const mesh=extrudeConvexPolygon(rectangle,4);
  validateMesh(mesh);
  assert.equal(mesh.indices.length/3,12);
  assert.deepEqual(boundsOfMesh(mesh).min,vec3(0,0,0));
  assert.deepEqual(boundsOfMesh(mesh).max,vec3(2,3,4));
  near(signedVolume(mesh),24,1e-10);
  assertWindingMatchesNormals(mesh);
  assert.equal(JSON.stringify(rectangle),original);
  assert.ok(Object.isFrozen(mesh.indices));
});
test('triangular extrusion respects all face windings and depth',()=>{
  const mesh=extrudeConvexPolygon([{x:-1,y:-1},{x:1,y:-1},{x:0,y:2}],2);
  validateMesh(mesh);
  assert.equal(mesh.indices.length/3,8);
  near(signedVolume(mesh),6,1e-9);
  assertWindingMatchesNormals(mesh);
});
test('polygon extrusion rejects clockwise, concave, repeated and collinear points',()=>{
  rejects(()=>extrudeConvexPolygon([{x:0,y:0},{x:0,y:1},{x:1,y:1},{x:1,y:0}],1),'INVALID_DIMENSION');
  rejects(()=>extrudeConvexPolygon([
    {x:0,y:0},{x:3,y:0},{x:1,y:.5},{x:3,y:3},{x:0,y:3}],1),'INVALID_DIMENSION');
  rejects(()=>extrudeConvexPolygon([
    {x:0,y:0},{x:2,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}],1),'INVALID_DIMENSION');
  rejects(()=>extrudeConvexPolygon([
    {x:0,y:0},{x:1,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}],1),'INVALID_DIMENSION');
  rejects(()=>extrudeConvexPolygon([{x:0,y:0},{x:1,y:0}],1),'INVALID_DIMENSION');
});
test('polygon extrusion rejects nonfinite or degenerate depth and coordinates',()=>{
  const triangle=[{x:0,y:0},{x:1,y:0},{x:0,y:1}];
  rejects(()=>extrudeConvexPolygon(triangle,0),'INVALID_DIMENSION');
  rejects(()=>extrudeConvexPolygon(triangle,Infinity),'INVALID_NUMBER');
  rejects(()=>extrudeConvexPolygon(triangle,1e-15),'DEGENERATE_GEOMETRY');
  rejects(()=>extrudeConvexPolygon([{x:0,y:0},{x:Infinity,y:0},{x:0,y:1}],1),'INVALID_NUMBER');
});
test('both new builders feed the existing Three.js adapter unchanged',()=>{
  const lathed=revolveProfile(cylinder,{radialSegments:24});
  const extruded=extrudeConvexPolygon([
    {x:-1,y:-1},{x:1,y:-1},{x:1,y:1},{x:-1,y:1}],1);
  for(const mesh of [lathed,extruded]){
    const three=toThreeBufferGeometry(mesh);
    assert.equal(three.index.count,mesh.indices.length);
    assert.equal(three.getAttribute('position').count,mesh.positions.length/3);
    assert.ok(three.boundingSphere.radius>0);
    three.dispose();
  }
});
