import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright-core';

const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
function createFileServer(){
  return createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const filepath=resolve(root,'.'+pathname);
      if (!filepath.startsWith(root+sep)) {
        res.writeHead(403);res.end();return;
      }
      const body=await readFile(filepath);
      res.writeHead(200,{'Content-Type':types[extname(filepath)]??'application/octet-stream',
        'Cache-Control':'no-store'});
      res.end(body);
    }catch(error){
      res.writeHead(error.code==='ENOENT'?404:500);res.end(error.message);
    }
  });
}
test('revolution and convex extrusion render in WebGL 2 and respond to orbit controls',
  {timeout:90000}, async()=>{
  const server=createFileServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({
      channel:'chrome',headless:true,args:[
        '--no-sandbox','--enable-webgl','--use-gl=angle',
        '--use-angle=swiftshader','--enable-unsafe-swiftshader',
      ],
    });
    const page=await browser.newPage({viewport:{width:1200,height:850},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/examples/solid-builders.html`,
      {waitUntil:'load'});
    await page.waitForFunction(()=>['true','error'].includes(document.documentElement.dataset.ready),
      {timeout:30000});
    const state=await page.evaluate(()=>({
      ready:document.documentElement.dataset.ready,
      error:window.__pfxSolidError??null,
      stats:window.__pfxSolidStats??null,
      webgl2:!!document.querySelector('canvas')?.getContext('webgl2'),
    }));
    assert.equal(state.ready,'true',`browser rendering failed: ${state.error}`);
    assert.equal(state.webgl2,true);
    assert.equal(state.stats?.triangles,660);
    assert.equal(state.stats?.vertices,712);
    const canvas=page.locator('canvas');
    await mkdir('artifacts',{recursive:true});
    const before=await canvas.screenshot({path:'artifacts/solid-builders-initial.png'});
    const rect=await canvas.boundingBox();
    await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.55);
    await page.mouse.down();
    await page.mouse.move(rect.x+rect.width*.75,rect.y+rect.height*.46,{steps:15});
    await page.mouse.up();
    const after=await canvas.screenshot({path:'artifacts/solid-builders-orbited.png'});
    assert.equal(before.equals(after),false,'the camera did not visually update on drag');
    assert.deepEqual(errors,[]);
    await page.close();
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
