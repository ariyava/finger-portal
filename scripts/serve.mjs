import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','dist');
const port=Number(process.env.PORT??5184);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be an integer between 1024 and 65535.');
try{await stat(path.join(root,'index.html'));}catch{console.error('Production build not found. Run npm install, then npm run build.');process.exit(1);}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.task':'application/octet-stream','.json':'application/json'};
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    let target=path.resolve(root,`.${pathname}`);
    const relative=path.relative(root,target);
    if(relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)){res.writeHead(403);res.end('Forbidden');return;}
    if(pathname==='/'||!path.extname(pathname))target=path.join(root,'index.html');
    const data=await readFile(target);
    res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(self), microphone=(), geolocation=()'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch(error){res.writeHead(error instanceof URIError?400:404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is already in use. Close the other Finger Portal window, or set PORT to a different number.`:error.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${port}/`;
  console.log(`\nFinger Portal is ready: ${url}\nKeep this window open. Press Ctrl+C to stop.\n`);
  if(process.argv.includes('--open')){
    const child=process.platform==='win32'?spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{stdio:'ignore',detached:true,windowsHide:true}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore',detached:true});
    child.on('error',()=>console.log(`Open ${url} in your browser.`));child.unref();
  }
});
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
