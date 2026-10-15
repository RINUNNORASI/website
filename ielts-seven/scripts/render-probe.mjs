// A data-free connectivity check before moving the application to another host.
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>循词 · 连接测试</title><link rel="stylesheet" href="/style.css"><script src="/check.js" defer></script></head><body><main><p class="eyebrow">循词 · IELTS 7</p><h1>页面已加载。</h1><p id="result" role="status">正在检查本站连接…</p><p class="muted">这一步只测试新地址的访问情况。完整词库和邮箱登录将在测试通过后接入。</p><a href="/health">查看连接响应</a></main></body></html>`;
const css = `:root{font-family:system-ui,sans-serif;color:#24483f;background:#f5f7f2}body{margin:0;padding:clamp(24px,8vw,80px)}main{max-width:620px;margin:8vh auto;padding:clamp(24px,6vw,48px);border:1px solid #dce5d8;border-radius:18px;background:white}.eyebrow{font-size:14px;letter-spacing:.12em}h1{font-size:clamp(28px,5vw,40px)}p{line-height:1.8}.muted{color:#66796d}a{color:#24483f}`;
const js = `fetch('/health',{cache:'no-store'}).then(async response=>{if(!response.ok)throw Error();const body=await response.json();if(body.status!=='ok'||body.app!=='xunci-connectivity-probe')throw Error();document.querySelector('#result').textContent='连接测试通过。请回到对话告诉我“测试站能打开”。';}).catch(()=>{document.querySelector('#result').textContent='页面已打开，但本站连接检查未完成。请把这个结果告诉我。';});`;
const routes = new Map([
  ['/', {type:'text/html; charset=utf-8', body:html}],
  ['/style.css', {type:'text/css; charset=utf-8', body:css}],
  ['/check.js', {type:'text/javascript; charset=utf-8', body:js}],
]);

export function createProbeServer() {
  return http.createServer((request, response) => {
    const method = request.method || '';
    let pathname;
    try { pathname = new URL(request.url, 'http://localhost').pathname; }
    catch { response.writeHead(400); response.end(); return; }
    const headers = {
      'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    };
    if (!['GET','HEAD'].includes(method)) {
      response.writeHead(405, {...headers, Allow:'GET, HEAD'}); response.end(); return;
    }
    const asset = pathname === '/health'
      ? {type:'application/json; charset=utf-8', body:JSON.stringify({status:'ok',app:'xunci-connectivity-probe'})}
      : routes.get(pathname);
    if (!asset) { response.writeHead(404, headers); response.end(); return; }
    response.writeHead(200, {...headers, 'Content-Type':asset.type});
    response.end(method === 'HEAD' ? undefined : asset.body);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rawPort = process.env.PORT || '10000';
  if (!/^\d{1,5}$/.test(rawPort) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const server = createProbeServer();
  server.listen(Number(rawPort), '0.0.0.0', () => console.log('Xunci connectivity probe is ready.'));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => server.close());
}
