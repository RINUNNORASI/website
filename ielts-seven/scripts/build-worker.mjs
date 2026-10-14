import {readFile,writeFile,mkdir,readdir,rm,cp} from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=process.cwd(),output=path.join(root,'.artifact');
await rm(output,{recursive:true,force:true});
await mkdir(path.join(output,'server'),{recursive:true});
await mkdir(path.join(output,'.openai'),{recursive:true});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.md':'text/markdown; charset=utf-8','.json':'application/json; charset=utf-8'};
const assets={};
async function collect(dir,prefix=''){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const file=path.join(dir,entry.name),route=prefix+'/'+entry.name;
    if(entry.isDirectory())await collect(file,route);
    else{const extension=path.extname(file);if(!types[extension])continue;const bytes=await readFile(file);assets[route]={body:extension==='.png'?bytes.toString('base64'):bytes.toString('utf8'),type:types[extension],...(extension==='.png'?{base64:true}:{})};}
  }
}
await collect(path.join(root,'dist'));
const requirements=await readFile(path.join(root,'docs/DAILY_REQUIREMENTS.md'),'utf8');
assets['/docs/DAILY_REQUIREMENTS.md']={body:requirements,type:types['.md']};
const context={window:{}};vm.createContext(context);vm.runInContext(assets['/reading-data.js'].body,context);
const seedLessons=JSON.parse(JSON.stringify(context.window.READING_LESSONS));
const [engine,sync,backend]=await Promise.all(['dist/engine.js','dist/sync-state.js','worker/index.mjs'].map(f=>readFile(path.join(root,f),'utf8')));
const code=engine+'\n'+sync+'\nconst SITE_ASSETS='+JSON.stringify(assets)+';\nconst SITE_SEED_LESSONS='+JSON.stringify(seedLessons)+';\n'+backend;
await writeFile(path.join(output,'server/index.js'),code);
await cp(path.join(root,'.openai/hosting.json'),path.join(output,'.openai/hosting.json'));
await cp(path.join(root,'drizzle'),path.join(output,'.openai/drizzle'),{recursive:true});
const worker=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
assert.equal(typeof worker.default.fetch,'function');
const front=await worker.default.fetch(new Request('https://xunci.test/'),{});
assert.equal(front.status,200);assert.match(await front.text(),/循词/);
const icon=await worker.default.fetch(new Request('https://xunci.test/assets/mark.png'),{});
assert.equal(icon.status,200);assert.equal(icon.headers.get('Content-Type'),'image/png');
const magic=new Uint8Array(await icon.arrayBuffer());assert.deepEqual([...magic.slice(0,4)],[137,80,78,71]);
console.log(JSON.stringify({output,assets:Object.keys(assets).length,sourceBytes:Buffer.byteLength(code),lessons:seedLessons.length}));
