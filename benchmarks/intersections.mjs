/**
 * Reproducible performance samples, not a speed guarantee.
 * Results reflect the runner, Node version, JIT, workload and memory pressure.
 */
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {analyzeMeshSelfIntersections} from '../dist/index.js';

function makeFixture(triangles,kind){
  const positions=[],normals=[],indices=[];
  for(let i=0;i<triangles;i++){
    const group=kind==='separated'?i:Math.floor(i/2);
    const base=group*8;
    const t=i%2;
    const vertices=kind==='separated'
      ?[[base,0,0],[base+1,0,0],[base,1,0]]
      :t===0
        ?[[base,0,0],[base+2,0,0],[base,2,0]]
        :[[base+.4,.5,-1],[base+1.6,.5,-1],[base+1,.5,1]];
    const start=positions.length/3;
    for(const p of vertices){positions.push(...p);normals.push(0,0,1);}
    indices.push(start,start+1,start+2);
  }
  return {positions,normals,indices};
}
function sample(mesh,mode){
  const options={broadPhase:mode,maxFindings:1};
  analyzeMeshSelfIntersections(mesh,options); // JIT warmup; excluded from timing.
  const durations=[];
  let latest;
  for(let i=0;i<3;i++){
    const start=performance.now();
    latest=analyzeMeshSelfIntersections(mesh,options);
    durations.push(performance.now()-start);
  }
  durations.sort((a,b)=>a-b);
  return {medianMs:Number(durations[1].toFixed(3)),
    minMs:Number(durations[0].toFixed(3)),
    maxMs:Number(durations[2].toFixed(3)),
    candidates:latest.broadPhasePairs,
    crossings:latest.crossings,
    detected:latest.totalFindings};
}
const output={
  schemaVersion:1,
  description:'Measured Node runtime timing; no guaranteed speedup or peak physical memory.',
  dateUTC:new Date().toISOString(),node:process.version,
  architecture:process.arch,platform:process.platform,
  logicalCpuCount:cpus().length,
  fixtureResults:[],
};
for(const [kind,sizes] of [['separated',[256,1024,4096,8192]],
                           ['crossing-pairs',[128,512,1024]]]){
  for(const triangleCount of sizes){
    const mesh=makeFixture(triangleCount,kind);
    const bvh=sample(mesh,'bvh'),sweep=sample(mesh,'sweep');
    if(bvh.candidates!==sweep.candidates||bvh.crossings!==sweep.crossings||
       bvh.detected!==sweep.detected)throw Error('Benchmark algorithm result mismatch');
    if(kind==='crossing-pairs' && bvh.crossings!==triangleCount/2)
      throw Error('Crossing fixture did not produce expected pairs');
    if(kind==='separated'&&bvh.candidates!==0)
      throw Error('Separated fixture unexpectedly has overlapping AABBs');
    output.fixtureResults.push({kind,triangleCount,bvh,sweep});
  }
}
output.heapUsedMiB=Number((process.memoryUsage().heapUsed/1048576).toFixed(2));
console.log(JSON.stringify(output,null,2));
