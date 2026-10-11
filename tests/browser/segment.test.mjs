import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from 'playwright-core';

const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8',
  '.css':'text/css; charset=utf-8'};

test('real WebGL 2 measures transverse intersection endpoints and responds to orbit',
  {timeout:90000},async()=>{
  const server=createServer(async(req,res)=>{
    try{
      const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const path=resolve(root,'.'+pathname);
      if(!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
      const data=await readFile(path);
      res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream',
        'Cache-Control':'no-store'});
      res.end(data);
    }catch(error){
      res.writeHead(error.code==='ENOENT'?404:500);res.end(error.message);
    }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({channel:'chrome',headless:true,args:[
      '--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ]});
    const page=await browser.newPage({viewport:{width:1200,height:850},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/examples/segment-preview.html`,
      {waitUntil:'load'});
    await page.waitForFunction(()=>['true','error'].includes(document.documentElement.dataset.ready),
      {timeout:30000});
    const state=await page.evaluate(()=>({
      ready:document.documentElement.dataset.ready,
      error:window.__pfxSegmentError??null,
      stats:window.__pfxSegmentStats??null,
      webgl2:!!document.querySelector('canvas')?.getContext('webgl2'),
    }));
    assert.equal(state.ready,'true',`browser diagnostic failed: ${state.error}`);
    assert.equal(state.webgl2,true);
    assert.equal(state.stats?.status,'crossing');
    assert.equal(state.stats?.approximate,true);
    assert.ok(Math.abs(state.stats?.length-0.6)<1e-9);
    assert.ok(Math.abs(state.stats?.start.y-0.5)<1e-9);
    assert.ok(Math.abs(state.stats?.end.y-0.5)<1e-9);
    const canvas=page.locator('canvas');
    await mkdir('artifacts',{recursive:true});
    const before=await canvas.screenshot({path:'artifacts/segment-preview-initial.png'});
    const box=await canvas.boundingBox();
    await page.mouse.move(box.x+box.width*.6,box.y+box.height*.52);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.79,box.y+box.height*.4,{steps:16});
    await page.mouse.up();
    const after=await canvas.screenshot({path:'artifacts/segment-preview-orbited.png'});
    assert.equal(before.equals(after),false);
    assert.deepEqual(errors,[]);
    await page.close();
  }finally{
    await browser?.close();
    await new Promise(resolve=>server.close(resolve));
  }
});
