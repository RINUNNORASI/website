import {readFile,writeFile,mkdir,readdir,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const standalone=process.argv.slice(2).includes('--cloudflare');
assert.ok(process.argv.slice(2).every(value=>value==='--cloudflare'),'Unsupported build option');
const root=process.cwd(),output=path.join(root,standalone?'.cloudflare':'.artifact');
await rm(output,{recursive:true,force:true});
await mkdir(standalone?output:path.join(output,'server'),{recursive:true});
if(!standalone)await mkdir(path.join(output,'.openai'),{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.md':'text/markdown; charset=utf-8','.json':'application/json; charset=utf-8'};
const binaryTypes=new Set(['.png','.mp3']);
const assets={};
async function collect(dir,prefix=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name),route=prefix+'/'+entry.name;
    if(entry.isDirectory())await collect(file,route);
    else{const extension=path.extname(file);if(!types[extension])continue;const bytes=await readFile(file);const binary=binaryTypes.has(extension);assets[route]={body:binary?bytes.toString('base64'):bytes.toString('utf8'),type:types[extension],...(binary?{base64:true}:{})};}
  }
}
await collect(path.join(root,'dist'));
if(standalone){
  const nativeLink='<a class="button outline" href="/signin-with-chatgpt?return_to=%2F" target="_top">ChatGPT 登录</a>';
  assert.ok(assets['/app.js'].body.includes(nativeLink),'Native login markup changed; review standalone navigation');
  assets['/app.js'].body=assets['/app.js'].body.replace(nativeLink,'');
}
const requirements=await readFile(path.join(root,'docs/DAILY_REQUIREMENTS.md'),'utf8');
assets['/docs/DAILY_REQUIREMENTS.md']={body:requirements,type:types['.md']};
assets['/docs/EMAIL_LOGIN_SETUP.md']={body:await readFile(path.join(root,'docs/EMAIL_LOGIN_SETUP.md'),'utf8'),type:types['.md']};
const context={window:{}};vm.createContext(context);vm.runInContext(assets['/reading-data.js'].body,context);
const seedLessons=JSON.parse(JSON.stringify(context.window.READING_LESSONS));
const [engine,sync,auth,backend]=await Promise.all(['dist/engine.js','dist/sync-state.js','worker/email-auth.mjs','worker/index.mjs'].map(f=>readFile(path.join(root,f),'utf8')));
const [transport,recovery,store]=await Promise.all(['runtime/shared-d1.mjs','worker/account-recovery.mjs','worker/shared-store.mjs'].map(f=>readFile(path.join(root,f),'utf8')));
const moduleBody=source=>source.replace(/^import[^\n]*;\s*/gm,'').replace(/^export (?=(?:async )?function |class |const )/gm,'');
const scopedTransport='const {createSharedD1Client}=(()=>{'+moduleBody(transport)+'\nreturn {createSharedD1Client};})();';
const scopedRecovery='const {previewAccountRecovery}=(()=>{'+moduleBody(recovery)+'\nreturn {previewAccountRecovery};})();';
const scopedStore='(()=>{'+moduleBody(store)+'\n})();';
let code=engine+'\n'+sync+'\n'+auth+'\n'+scopedTransport+'\n'+scopedRecovery+'\n'+scopedStore+'\nconst SITE_ASSETS='+JSON.stringify(assets)+';\nconst SITE_SEED_LESSONS='+JSON.stringify(seedLessons)+';\n'+backend.replace(/^import[^\n]*;\s*/gm,'');
if(standalone){
  assert.equal((code.match(/^export default \{/gm)||[]).length,1);
  const boundary=await readFile(path.join(root,'worker/cloudflare-boundary.mjs'),'utf8');
  code=code.replace(/^export default \{/m,'const application = {')+'\n'+boundary.replace(/^export function /m,'function ')+'\nexport default createCloudflareWorker(application);\n';
}
await writeFile(path.join(output,standalone?'worker.mjs':'server/index.js'),code);
if(!standalone){
  await cp(path.join(root,'.openai/hosting.json'),path.join(output,'.openai/hosting.json'));
  await cp(path.join(root,'drizzle'),path.join(output,'.openai/drizzle'),{recursive:true});
}
const worker=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
assert.equal(typeof worker.default.fetch,'function');
const front=await worker.default.fetch(new Request('https://xunci.test/'),{});
assert.equal(front.status,200);assert.match(await front.text(),/循词/);
const icon=await worker.default.fetch(new Request('https://xunci.test/assets/mark.png'),{});
assert.equal(icon.status,200);assert.equal(icon.headers.get('Content-Type'),'image/png');
const magic=new Uint8Array(await icon.arrayBuffer());assert.deepEqual([...magic.slice(0,4)],[137,80,78,71]);
// Verify the deployed representation rather than just the source file. MP3s must
// remain binary through embedding, and native players need byte-range seeking.
for(const [route,asset] of Object.entries(assets).filter(([,asset])=>asset.type==='audio/mpeg')){
  const expected=await readFile(path.join(root,'dist',route.slice(1)));
  assert.ok(expected.length>0,'Empty bundled audio: '+route);
  const response=await worker.default.fetch(new Request('https://xunci.test'+route),{});
  assert.equal(response.headers.get('Content-Type'),'audio/mpeg');
  assert.equal(response.headers.get('Content-Length'),String(expected.length));
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),expected,'Audio bytes changed: '+route);
  const partial=await worker.default.fetch(new Request('https://xunci.test'+route,{headers:{Range:'bytes=0-3'}}),{});
  assert.equal(partial.status,206);
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()),expected.subarray(0,4));
}
if(standalone){
  const script=await worker.default.fetch(new Request('https://xunci.test/app.js'),{});
  assert.ok(!(await script.text()).includes('/signin-with-chatgpt'));
  assert.equal((await worker.default.fetch(new Request('https://xunci.test/mcp'),{})).status,404);
  const forged=await worker.default.fetch(new Request('https://xunci.test/api/learning-state',{headers:{'oai-authenticated-user-id':'forged'}}),{EMAIL_AUTH_ENABLED:'0'});
  assert.equal(forged.status,503);
}
console.log(JSON.stringify({target:standalone?'cloudflare':'sites',output,assets:Object.keys(assets).length,sourceBytes:Buffer.byteLength(code),lessons:seedLessons.length}));
