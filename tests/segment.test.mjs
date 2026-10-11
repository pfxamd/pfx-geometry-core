import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GeometryError, vec3, estimateTransverseTriangleIntersection,
  analyzeMeshSelfIntersections, createBox,
} from '../dist/index.js';

const v=vec3;
const a=[v(0,0,0),v(2,0,0),v(0,2,0)];
const crossing=[v(.4,.5,-1),v(1.6,.5,-1),v(1,.5,1)];
const separated=[v(3,.5,-1),v(4,.5,-1),v(3.5,.5,1)];
const nearCoplanar=[v(0,0,1e-10),v(2,0,1e-10),v(0,2,1e-10)];
const aligned=[v(0,0,1),v(1,0,1),v(0,1,1)];
const close=(a,b,tol=1e-10)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);
const pointClose=(p,x,y,z)=>{close(p.x,x);close(p.y,y);close(p.z,z);};
function pointsSorted(s){return [s.start,s.end].sort((p,q)=>p.x-q.x);}
test('known exact axis-aligned transverse intersection yields expected endpoints',()=>{
  const report=estimateTransverseTriangleIntersection(a,crossing);
  assert.equal(report.status,'crossing',JSON.stringify(report));
  assert.equal(report.approximate,true);
  const [p,q]=pointsSorted(report);
  pointClose(p,.7,.5,0);
  pointClose(q,1.3,.5,0);
});
test('swapping triangle order preserves the same physical endpoints',()=>{
  const first=estimateTransverseTriangleIntersection(a,crossing);
  const second=estimateTransverseTriangleIntersection(crossing,a);
  assert.equal(first.status,'crossing');
  assert.equal(second.status,'crossing');
  const [p,q]=pointsSorted(first),[r,s]=pointsSorted(second);
  close(p.x,r.x);close(q.x,s.x);
  close(p.y,r.y);close(q.z,s.z);
});
test('translation in supported numeric range moves the segment without changing its length',()=>{
  const delta=v(1000,-200,12);
  const moved=tri=>tri.map(p=>v(p.x+delta.x,p.y+delta.y,p.z+delta.z));
  const result=estimateTransverseTriangleIntersection(moved(a),moved(crossing));
  assert.equal(result.status,'crossing',JSON.stringify(result));
  const [p,q]=pointsSorted(result);
  pointClose(p,1000.7,-199.5,12);
  pointClose(q,1001.3,-199.5,12);
});
test('no transverse crossing for far-away triangles',()=>{
  assert.equal(estimateTransverseTriangleIntersection(a,separated).status,'none');
  assert.equal(estimateTransverseTriangleIntersection(a,aligned).status,'none');
});
test('parallel and near-coplanar surfaces are not misreported as a known segment',()=>{
  const r=estimateTransverseTriangleIntersection(a,nearCoplanar);
  assert.equal(r.status,'indeterminate');
  assert.ok(typeof r.reason==='string');
});
test('tangent cases remain indeterminate, not invented endpoints',()=>{
  const tangent=[v(.5,.5,-1),v(.5,.5,1),v(1,.5,0)];
  assert.equal(estimateTransverseTriangleIntersection(a,tangent).status,'indeterminate');
});
test('malformed and degenerate inputs fail with structured errors',()=>{
  const fail=(fn,code)=>assert.throws(fn,e=>e instanceof GeometryError&&e.code===code);
  fail(()=>estimateTransverseTriangleIntersection(a.slice(0,2),crossing),'INVALID_DIMENSION');
  fail(()=>estimateTransverseTriangleIntersection(a,crossing,0),'INVALID_DIMENSION');
  fail(()=>estimateTransverseTriangleIntersection(a,crossing,Infinity),'INVALID_NUMBER');
  fail(()=>estimateTransverseTriangleIntersection(a,[v(0,0,0),v(1,0,0),v(2,0,0)]),
    'DEGENERATE_GEOMETRY');
  fail(()=>estimateTransverseTriangleIntersection(a,[null,v(1,0,0),v(0,1,1)]),
    'INVALID_DIMENSION');
});
test('the dedicated endpoint API does not alter the global collision report',()=>{
  const joined={
    positions:[...a,...crossing].flatMap(p=>[p.x,p.y,p.z]),
    normals:Array.from({length:6},()=>[0,0,1]).flat(),
    indices:[0,1,2,3,4,5],
  };
  const prev=analyzeMeshSelfIntersections(joined);
  assert.equal(prev.crossings,1);
  assert.equal(estimateTransverseTriangleIntersection(a,crossing).status,'crossing');
  assert.deepEqual(analyzeMeshSelfIntersections(joined),prev);
});
