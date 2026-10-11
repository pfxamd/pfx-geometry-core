import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeometryError, vec3, createBox, createBezierPatchMesh, revolveProfile,
  extrudeConvexPolygon, sweepCircularTube, analyzeMeshTopology,
  assertClosedOriented2Manifold, validateMesh, boundsOfMesh,
} from '../dist/index.js';
import {toThreeBufferGeometry} from '../adapters/three/index.mjs';
const V=vec3;
const close=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`expected ${b}, got ${a}`);
const fails=(fn,code)=>assert.throws(fn,e=>e instanceof GeometryError&&e.code===code);
const box=createBox(2,2,2);
const cylinder=revolveProfile([{radius:1,height:0},{radius:1,height:2}],{radialSegments:32});
const prism=extrudeConvexPolygon([{x:0,y:0},{x:2,y:0},{x:2,y:1},{x:0,y:1}],2);
const bent=[V(0,0,0),V(0,1,0),V(.45,2,.25)];
const merge=(a,b)=>{
  const offset=a.positions.length/3;
  return {
    positions:[...a.positions,...b.positions],
    normals:[...a.normals,...b.normals],
    indices:[...a.indices,...b.indices.map(x=>x+offset)],
  };
};
test('existing measured closed primitives have orientable 2-manifold topology',()=>{
  for(const mesh of [box,cylinder,prism]){
    const r=assertClosedOriented2Manifold(mesh);
    assert.equal(r.boundaryEdges,0);assert.equal(r.nonManifoldEdges,0);
    assert.equal(r.orientationConflicts,0);assert.equal(r.nonManifoldVertices,0);
    assert.equal(r.connectedComponents,1);
    assert.ok(r.weldedVertices<r.originalVertices);
  }
});
test('open Bézier patch and uncapped lathe have detected boundary edges',()=>{
  const grid=Array.from({length:4},(_,j)=>Array.from({length:4},(_,i)=>V(i/3,j/3,0)));
  const patch=createBezierPatchMesh(grid,{uSegments:4,vSegments:3});
  const p=analyzeMeshTopology(patch);
  assert.equal(p.boundaryEdges,14);
  assert.equal(p.isClosedOriented2Manifold,false);
  fails(()=>assertClosedOriented2Manifold(patch),'INVALID_MESH');
  const r=analyzeMeshTopology(revolveProfile([{radius:1,height:0},{radius:1,height:2}],
    {radialSegments:16,capEnds:false}));
  assert.equal(r.boundaryEdges,32);
});
test('flipped triangle triggers inconsistent edge orientation',()=>{
  const indices=[...box.indices];
  [indices[1],indices[2]]=[indices[2],indices[1]];
  const r=analyzeMeshTopology({...box,indices});
  assert.ok(r.orientationConflicts>0);
  assert.equal(r.isClosedOriented2Manifold,false);
});
test('edge shared by three triangles is non-manifold',()=>{
  const positions=[0,0,0, 1,0,0, 0,1,0, 0,0,1, 0,-1,0];
  const normals=Array.from({length:5},()=>[0,0,1]).flat();
  const r=analyzeMeshTopology({positions,normals,indices:[0,1,2,1,0,3,0,1,4]});
  assert.equal(r.nonManifoldEdges,1);
  assert.equal(r.isClosedOriented2Manifold,false);
});
test('two box shells pinched at one vertex are rejected; disjoint components are tracked',()=>{
  const translated={...box,positions:box.positions.map((n,i)=>n+2)};
  const touching=analyzeMeshTopology(merge(box,translated));
  assert.equal(touching.connectedComponents,2);
  assert.ok(touching.nonManifoldVertices>0);
  assert.equal(touching.isClosedOriented2Manifold,false);
  const away={...box,positions:box.positions.map((n,i)=>n+4)};
  const separated=analyzeMeshTopology(merge(box,away));
  assert.equal(separated.connectedComponents,2);
  assert.equal(separated.isClosedOriented2Manifold,true);
});
test('absolute welding tolerance explicitly determines whether a seam is considered closed',()=>{
  const slightlyOpen={...box,positions:box.positions.map((n,i)=>i<12&&i%3===0?n+.0002:n)};
  const strict=analyzeMeshTopology(slightlyOpen);
  assert.equal(strict.isClosedOriented2Manifold,false);
  const loose=analyzeMeshTopology(slightlyOpen,{weldTolerance:.001});
  assert.equal(loose.isClosedOriented2Manifold,true);
  fails(()=>analyzeMeshTopology(box,{weldTolerance:0}),'INVALID_DIMENSION');
  fails(()=>analyzeMeshTopology(box,{weldTolerance:1e-30}),'INVALID_DIMENSION');
});
function volume(mesh){
  let sum=0;
  for(let i=0;i<mesh.indices.length;i+=3){
    const [a,b,c]=mesh.indices.slice(i,i+3).map(index=>mesh.positions.slice(3*index,3*index+3));
    sum+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
  }
  return sum;
}
function outwardNormals(mesh){
  for(let i=0;i<mesh.indices.length;i+=3){
    const [a,b,c]=mesh.indices.slice(i,i+3).map(index=>mesh.positions.slice(3*index,3*index+3));
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],
      vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    const cross=[uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
    const index=mesh.indices[i]*3;
    const dot=cross.reduce((sum,n,j)=>sum+n*mesh.normals[index+j],0);
    assert.ok(dot>1e-12,`inward face at triangle ${i/3}: ${dot}`);
  }
}
test('straight tube is a closed measured cylinder with correct volume and outward winding',()=>{
  const path=[V(0,0,0),V(0,2,0)],before=JSON.stringify(path);
  const radius=.25,N=32;
  const mesh=sweepCircularTube(path,{radius,radialSegments:N});
  validateMesh(mesh);outwardNormals(mesh);
  const report=assertClosedOriented2Manifold(mesh);
  assert.equal(report.boundaryEdges,0);
  assert.equal(mesh.indices.length/3,4*N);
  assert.equal(mesh.positions.length/3,2*(N+1)+2*(N+2));
  const expected=.5*N*radius*radius*Math.sin(2*Math.PI/N)*2;
  close(volume(mesh),expected,1e-9);
  assert.deepEqual(boundsOfMesh(mesh).size,V(.5,2,.5));
  assert.equal(JSON.stringify(path),before);
});
test('bent tube follows 3D polyline, transfers to Three.js, and preserves closed topology',()=>{
  const mesh=sweepCircularTube(bent,{radius:.2,radialSegments:24});
  validateMesh(mesh);outwardNormals(mesh);
  assert.equal(mesh.indices.length/3,144);
  assert.equal(mesh.positions.length/3,127);
  const topology=analyzeMeshTopology(mesh);
  assert.equal(topology.isClosedOriented2Manifold,true);
  assert.equal(topology.connectedComponents,1);
  const geometry=toThreeBufferGeometry(mesh);
  assert.equal(geometry.index.count,mesh.indices.length);
  geometry.dispose();
});
test('tube supports deliberate open ends and reports exactly the two boundary rings',()=>{
  const mesh=sweepCircularTube(bent,{radius:.2,radialSegments:24,capEnds:false});
  assert.equal(mesh.indices.length/3,96);
  assert.equal(analyzeMeshTopology(mesh).boundaryEdges,48);
  assert.equal(analyzeMeshTopology(mesh).isClosedOriented2Manifold,false);
});
test('tube rejects unsupported bends, oversized radius and invalid inputs',()=>{
  fails(()=>sweepCircularTube([V(0,0,0)],{radius:.1,radialSegments:16}),'INVALID_DIMENSION');
  fails(()=>sweepCircularTube([V(0,0,0),V(0,0,0)],{radius:.1,radialSegments:16}),'DEGENERATE_GEOMETRY');
  fails(()=>sweepCircularTube([V(0,0,0),V(0,1,0),V(1,1,0)],{radius:.1,radialSegments:16}),'INVALID_DIMENSION');
  fails(()=>sweepCircularTube([V(0,0,0),V(0,1,0)],{radius:.6,radialSegments:16}),'INVALID_DIMENSION');
  fails(()=>sweepCircularTube([V(0,0,0),V(0,1,0)],{radius:.1,radialSegments:5}),'INVALID_DIMENSION');
  fails(()=>sweepCircularTube([V(0,0,0),V(0,1,0)],{radius:.1,radialSegments:257}),'INVALID_DIMENSION');
  fails(()=>sweepCircularTube([V(0,0,0),V(0,1,0)],{radius:.1,radialSegments:16,capEnds:'yes'}),'INVALID_DIMENSION');
  fails(()=>sweepCircularTube([V(0,0,0),V(0,1,0)],{radius:Infinity,radialSegments:16}),'INVALID_NUMBER');
});
