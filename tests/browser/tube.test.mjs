import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {chromium} from 'playwright-core';

const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
test('3D polyline sweep renders verified mesh and orbits in Chrome WebGL 2',{timeout:90000},async()=>{
  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file=resolve(root,'.'+pathname);
      if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream',
        'Cache-Control':'no-store'});
      res.end(data);
    }catch(error){
      res.writeHead(error.code==='ENOENT'?404:500);res.end(error.message);
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({
      channel:'chrome',headless:true,
      args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
        '--enable-unsafe-swiftshader'],
    });
    const page=await browser.newPage({viewport:{width:1200,height:840},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/examples/tube-preview.html`,
      {waitUntil:'load'});
    await page.waitForFunction(()=>['true','error'].includes(document.documentElement.dataset.ready),
      {timeout:30000});
    const state=await page.evaluate(()=>({
      ready:document.documentElement.dataset.ready,
      error:window.__pfxTubeError??null,
      stats:window.__pfxTubeStats??null,
      gl:!!document.querySelector('canvas')?.getContext('webgl2'),
    }));
    assert.equal(state.ready,'true',`tube render failure: ${state.error}`);
    assert.equal(state.gl,true);
    assert.equal(state.stats?.triangles,320);
    assert.equal(state.stats?.vertices,233);
    assert.equal(state.stats?.boundaryEdges,0);
    assert.equal(state.stats?.manifold,true);
    const canvas=page.locator('canvas');
    await mkdir('artifacts',{recursive:true});
    const before=await canvas.screenshot({path:'artifacts/tube-sweep-initial.png'});
    const box=await canvas.boundingBox();
    await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.78,box.y+box.height*.41,{steps:12});
    await page.mouse.up();
    const after=await canvas.screenshot({path:'artifacts/tube-sweep-orbited.png'});
    assert.equal(before.equals(after),false,'orbit interaction did not modify scene');
    assert.deepEqual(errors,[]);
    await page.close();
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
