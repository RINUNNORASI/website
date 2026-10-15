// Loopback-only QA adapter. This file is never embedded in the production Worker.
import http from 'node:http';
import {readFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import '../dist/engine.js';
import '../dist/sync-state.js';
import worker from '../worker/index.mjs';
const root=process.cwd();await mkdir('.wrangler',{recursive:true});
const sqlite=new DatabaseSync('.wrangler/dev.sqlite');
sqlite.exec('CREATE TABLE IF NOT EXISTS __qa_migrations (name TEXT PRIMARY KEY)');
for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort()){
  if(!sqlite.prepare('SELECT name FROM __qa_migrations WHERE name=?').get(name)){
    sqlite.exec(await readFile(path.join('drizzle',name),'utf8'));
    sqlite.prepare('INSERT INTO __qa_migrations(name) VALUES(?)').run(name);
  }
}
const DB={prepare(sql){let args=[];const obj={bind(...next){args=next;return obj;},async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){return {results:sqlite.prepare(sql).all(...args),success:true};},async run(){const x=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(x.changes)}};}};return obj;},async batch(statements){sqlite.exec('BEGIN');try{const values=await Promise.all(statements.map(s=>s.run()));sqlite.exec('COMMIT');return values;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.md':'text/markdown; charset=utf-8','.json':'application/json; charset=utf-8'};
globalThis.SITE_ASSETS={};
const seedContext={window:{}};vm.createContext(seedContext);vm.runInContext(await readFile('dist/reading-data.js','utf8'),seedContext);globalThis.SITE_SEED_LESSONS=seedContext.window.READING_LESSONS;
const server=http.createServer(async(req,res)=>{
  try{
    const authority='http://127.0.0.1:4173',url=new URL(req.url,authority);
    if(req.headers.host!=='127.0.0.1:4173'&&req.headers.host!=='localhost:4173'){res.writeHead(403);res.end();return;}
    if(url.pathname==='/signin-with-chatgpt'){
      const user=url.searchParams.get('dev_user')||'local-alpha';if(!/^local-[a-z]+$/.test(user)){res.writeHead(400);res.end();return;}
      res.writeHead(302,{'Set-Cookie':'xunci-dev-user='+user+'; Path=/; HttpOnly; SameSite=Lax','Location':'/#today'});res.end();return;
    }
    if(!url.pathname.startsWith('/api/')&&url.pathname!=='/mcp'){
      const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
      if(relative.includes('..')){res.writeHead(400);res.end();return;}
      try{const bytes=await readFile(path.join(root,'dist',relative)),ext=path.extname(relative);globalThis.SITE_ASSETS[url.pathname==='/'?'/index.html':url.pathname]={body:ext==='.png'?bytes.toString('base64'):bytes.toString('utf8'),type:types[ext]||'application/octet-stream',...(ext==='.png'?{base64:true}:{})};}catch{}
    }
    globalThis.SITE_ASSETS['/docs/DAILY_REQUIREMENTS.md']={body:await readFile('docs/DAILY_REQUIREMENTS.md','utf8'),type:types['.md']};
    const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value&&!key.startsWith('oai-authenticated-'))headers.set(key,Array.isArray(value)?value.join(','):value);
    const user=String(req.headers.cookie||'').match(/(?:^|;\s*)xunci-dev-user=(local-[a-z]+)/)?.[1];
    if(user){headers.set('oai-authenticated-user-id',user);headers.set('oai-authenticated-user-email',user+'@sites.test');}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks);const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&body.length?{body,duplex:'half'}:{})});
    const response=await worker.fetch(request,{DB,EDITOR_EMAIL:'local-alpha@sites.test'});const outgoing=Object.fromEntries(response.headers);const cookies=response.headers.getSetCookie();if(cookies.length)outgoing['set-cookie']=cookies;res.writeHead(response.status,outgoing);res.end(Buffer.from(await response.arrayBuffer()));
  }catch(error){res.writeHead(500);res.end('Local QA adapter error: '+error.message);}
});
server.listen(4173,'127.0.0.1',()=>console.log('Local QA: http://127.0.0.1:4173/signin-with-chatgpt?dev_user=local-alpha'));
process.on('SIGINT',()=>server.close(()=>{sqlite.close();process.exit(0);}));
