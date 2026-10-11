import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMeshSelfIntersections, validateMesh } from '../dist/index.js';
import {makeIrregularTriangles} from '../benchmarks/irregular-fixtures.mjs';

test('generated adversarial fixtures are deterministic and contain valid triangles',()=>{
  for(const distribution of ['dense-clusters','elongated-stream']){
    const a=makeIrregularTriangles(192,distribution,123);
    const b=makeIrregularTriangles(192,distribution,123);
    assert.deepEqual(a,b);
    validateMesh(a);
  }
});
test('BVH and sweep parity on dense irregular meshes at multiple sizes and seeds',()=>{
  for(const distribution of ['dense-clusters','elongated-stream']){
    for(const count of [48,128,256]){
      for(const seed of [1,42]){
        const mesh=makeIrregularTriangles(count,distribution,seed);
        const a=analyzeMeshSelfIntersections(mesh,{broadPhase:'bvh'});
        const b=analyzeMeshSelfIntersections(mesh,{broadPhase:'sweep'});
        for(const key of ['broadPhasePairs','testedPairs','crossings',
          'coplanarOverlaps','pointContacts','uncertainPairs',
          'totalFindings','skippedSharedVertexAmbiguities']){
          assert.equal(a[key],b[key],`${distribution} ${count} seed ${seed}: ${key}`);
        }
        assert.deepEqual(a.findings,b.findings);
      }
    }
  }
});
test('fixture construction cannot exceed declared computational domain',()=>{
  assert.throws(()=>makeIrregularTriangles(0));
  assert.throws(()=>makeIrregularTriangles(20001));
  assert.throws(()=>makeIrregularTriangles(16,'unknown'));
});
