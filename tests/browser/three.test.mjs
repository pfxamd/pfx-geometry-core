import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {chromium} from 'playwright-core';

const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
function serveFiles(){
  return createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const path=resolve(root,'.'+pathname);
      if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
      const content=await readFile(path);
      res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream',
        'Cache-Control':'no-store'});
      res.end(content);
    }catch(error){
      res.writeHead(error.code==='ENOENT'?404:500);
      res.end(error.message);
    }
  });
}
test('Chrome WebGL 2 renders core-defined geometry and orbits without runtime failures', {timeout:90000}, async()=>{
  const server=serveFiles();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({
      channel:'chrome',headless:true,
      args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
        '--enable-unsafe-swiftshader'],
    });
    const page=await browser.newPage({viewport:{width:1160,height:800},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const address=server.address();
    await page.goto(`http://127.0.0.1:${address.port}/examples/three-preview.html`,{waitUntil:'load'});
    await page.waitForFunction(()=>['true','error'].includes(document.documentElement.dataset.ready),{timeout:30000});
    const outcome=await page.evaluate(()=>({
      ready:document.documentElement.dataset.ready,
      error:window.__pfxGeometryError??null,
      stats:window.__pfxGeometryStats??null,
      canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON(),
      gl:!!document.querySelector('canvas')?.getContext('webgl2'),
    }));
    assert.equal(outcome.ready,'true',`Browser render failed: ${outcome.error}`);
    assert.equal(outcome.gl,true,'WebGL 2 not available');
    assert.equal(outcome.stats?.triangles,3212);
    assert.equal(outcome.stats?.vertices,1705);
    assert.ok(outcome.canvas.width>700&&outcome.canvas.height>300);
    const canvas=page.locator('canvas');
    await mkdir('artifacts',{recursive:true});
    const before=await canvas.screenshot({path:'artifacts/three-adapter-initial.png'});
    const box=await canvas.boundingBox();
    await page.mouse.move(box.x+box.width*.62,box.y+box.height*.53);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.8,box.y+box.height*.48,{steps:12});
    await page.mouse.up();
    const after=await canvas.screenshot({path:'artifacts/three-adapter-orbited.png'});
    assert.equal(before.equals(after),false,'Orbit interaction did not update rendered image');
    assert.deepEqual(errors,[],'Unexpected browser script errors');
    await page.close();
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
