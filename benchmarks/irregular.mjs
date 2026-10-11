import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {analyzeMeshSelfIntersections} from '../dist/index.js';
import {makeIrregularTriangles} from './irregular-fixtures.mjs';

function benchmark(mesh,strategy){
  const options={broadPhase:strategy,maxFindings:16,maxCandidatePairs:750000};
  analyzeMeshSelfIntersections(mesh,options); // warmup outside measurements
  const timings=[];
  let result;
  for(let n=0;n<3;n++){
    const start=performance.now();
    result=analyzeMeshSelfIntersections(mesh,options);
    timings.push(performance.now()-start);
  }
  const sorted=[...timings].sort((a,b)=>a-b);
  return {
    medianMs:+sorted[1].toFixed(3),
    minMs:+sorted[0].toFixed(3),
    maxMs:+sorted[2].toFixed(3),
    candidatePairs:result.broadPhasePairs,
    crossings:result.crossings,
    overlaps:result.coplanarOverlaps,
    pointContacts:result.pointContacts,
    uncertainties:result.uncertainPairs,
    skippedSharedVertexAmbiguities:result.skippedSharedVertexAmbiguities,
  };
}
const output={
  schemaVersion:1,
  createdAt:new Date().toISOString(),
  environment:{node:process.version,arch:process.arch,
    platform:process.platform,logicalCpus:cpus().length},
  method:'1 warmup + 3 measured passes per mode, sorted median; synthetic seeded fixtures',
  warning:'Not an all-mesh speed guarantee. Heap at end is not peak process physical RAM.',
  samples:[],
};
for(const distribution of ['dense-clusters','elongated-stream']){
  for(const triangles of [192,384,640]){
    const fixture=makeIrregularTriangles(triangles,distribution);
    const bvh=benchmark(fixture,'bvh');
    const sweep=benchmark(fixture,'sweep');
    for(const field of ['candidatePairs','crossings','overlaps','pointContacts',
      'uncertainties','skippedSharedVertexAmbiguities']){
      if(bvh[field]!==sweep[field])
        throw Error(`Algorithm parity failure: ${distribution} triangles=${triangles}, field=${field}`);
    }
    output.samples.push({distribution,triangles,bvh,sweep});
  }
}
output.finalHeapUsedMiB=+(process.memoryUsage().heapUsed/1048576).toFixed(2);
console.log(JSON.stringify(output,null,2));
