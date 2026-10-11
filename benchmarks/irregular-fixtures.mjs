/** Synthetic and reproducible test/benchmark fixtures; never used by the core. */
export function seededRandom(seed=0xC0FFEE) {
  let state=seed>>>0;
  return ()=>{
    state^=state<<13;
    state^=state>>>17;
    state^=state<<5;
    return (state>>>0)/4294967296;
  };
}
/** Irregular, non-degenerate 3D triangles grouped spatially (not arbitrary production art). */
export function makeIrregularTriangles(count,distribution='dense-clusters',seed=0xC0FFEE) {
  if(!Number.isSafeInteger(count)||count<2||count>20000 ||
     !['dense-clusters','elongated-stream'].includes(distribution))
    throw Error('Unsupported benchmark fixture');
  const random=seededRandom(seed);
  const positions=[],normals=[],indices=[];
  for(let i=0;i<count;i++){
    let x,y,z;
    if(distribution==='dense-clusters') {
      const group=i%4;
      x=group*3+random()*.65;
      y=random()*.9;
      z=random()*.45;
    }else{
      x=(i%16)*1.1+random()*.3;
      y=(Math.floor(i/16)%5)*.55+random()*.3;
      z=random()*.25;
    }
    const vertices=[
      [x,y,z],
      [x+.6+random()*.55,y+random()*.2,z+random()*.22],
      [x+random()*.2,y+.6+random()*.55,z+random()*.22],
    ];
    const start=positions.length/3;
    for(const vertex of vertices){positions.push(...vertex);normals.push(0,0,1);}
    indices.push(start,start+1,start+2);
  }
  return {positions,normals,indices};
}
