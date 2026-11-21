import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const mode=process.argv[2],config=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
assert(['prepare','verify'].includes(mode),'Unknown fixture phase');
assert.equal(process.cwd(),config.work);
const hash=(file,algorithm='sha256')=>crypto.createHash(algorithm).update(fs.readFileSync(file)).digest(algorithm==='sha512'?'base64':'hex');
function command(binary,args){
 const start=performance.now(),result=spawnSync(binary,args,{encoding:'utf8',timeout:60000,maxBuffer:1024*1024});
 assert(!result.error,result.error?.message);assert.equal(result.signal,null);
 return{wallMs:performance.now()-start,status:result.status,output:result.stdout+result.stderr};
}
function success(result){assert.equal(result.status,0,result.output);return result;}
const npm=args=>command(process.execPath,[config.npmCli,...args]);
function unchanged(excludeSlug=false){for(const [file,digest] of Object.entries(config.sourceHashes)){if(excludeSlug&&file==='slug.mjs')continue;assert.equal(hash(file),digest,'Unexpected fixture change: '+file);}}
function regular(relative){
 let current=config.work;const parts=relative.split('/');
 for(let i=0;i<parts.length;i++){current=path.join(current,parts[i]);const stat=fs.lstatSync(current);assert(!stat.isSymbolicLink(),'Symlink artifact: '+relative);if(i===parts.length-1){assert(stat.isFile());assert.equal(stat.nlink,1);return{inode:stat.ino,nlink:stat.nlink};}assert(stat.isDirectory());}
}
if(mode==='prepare'){
 unchanged();
 const tcpProbe=await new Promise((resolve,reject)=>{
  const socket=net.connect({host:'127.0.0.1',port:config.tcpPort});
  const timer=setTimeout(()=>{socket.destroy();reject(new Error('TCP probe timeout'));},2000);
  let received='';const finish=(error,value)=>{clearTimeout(timer);error?reject(error):resolve(value);};
  socket.once('connect',()=>{if(config.sandboxed){socket.end();finish(new Error('Unauthorized TCP connection succeeded'));}});
  socket.on('data',data=>{received+=data;});socket.once('end',()=>socket.end());
  socket.once('close',()=>{if(!config.sandboxed)finish(received==='SYNTHETIC'?null:new Error('TCP positive response missing'),'BASELINE_TCP_CONNECTED');});
  socket.once('error',error=>finish(config.sandboxed&&['EPERM','EACCES'].includes(error.code)?null:error,'SANDBOX_TCP_DENIED:'+error.code));
 });
 let boundary='baseline intentionally unconfined';
 if(config.sandboxed){
  const denied=fn=>assert.throws(fn,error=>['EPERM','EACCES'].includes(error.code));
  for(const outside of [config.outside,path.relative(config.work,config.outside)]){denied(()=>fs.readFileSync(outside));denied(()=>fs.writeFileSync(outside,'ESCAPE'));}
  const alias='.outside-probe';fs.symlinkSync(config.outside,alias);
  try{denied(()=>fs.readFileSync(alias));denied(()=>fs.writeFileSync(alias,'ESCAPE'));}finally{fs.unlinkSync(alias);}
  for(const fn of [()=>fs.writeFileSync(config.archive,'ESCAPE'),()=>fs.unlinkSync(config.archive),()=>fs.renameSync(config.archive,'stolen-cache'),()=>fs.linkSync(config.archive,'linked-cache')])denied(fn);
  boundary='OUTSIDE_ABSOLUTE_RELATIVE_SYMLINK_READ_WRITE_DENIED; CACHE_WRITE_UNLINK_RENAME_HARDLINK_DENIED';
 }
 assert.equal(hash(config.archive,'sha512'),config.archiveSHA512);
 const install=['install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',path.join(config.temp,'npm-cache')];
 const coldInstall=success(npm(install));
 const red=command(process.execPath,['check.mjs']);assert.equal(red.status,1,red.output);assert.match(red.output,/srt cache/);
 fs.rmSync('node_modules',{recursive:true});
 const warmInstall=success(npm(install));
 assert.equal(hash(config.archive,'sha512'),config.archiveSHA512);unchanged();
 console.log(JSON.stringify({phase:'prepare',tcpProbe,boundary,coldInstall,red,warmInstall,archiveSHA512:hash(config.archive,'sha512')}));
}else{
 unchanged(true);regular('slug.mjs');
 const check=success(npm(['run','check'])),build=success(npm(['run','build']));
 assert.match(check.output,/CHECK_OK: slug and installed dependency/);assert.match(build.output,/BUILD_OK/);
 const dependency=regular('node_modules/is-number/index.js'),artifact=regular('dist/result.txt');
 assert.equal(fs.readFileSync('dist/result.txt','utf8'),'srt-cache');
 const git=args=>success(command(config.git,['-c','core.fsmonitor=false',...args])).output.trim();
 const commitFiles=git(['diff','HEAD~1','HEAD','--name-only']);assert.equal(commitFiles,'slug.mjs');
 assert.equal(git(['rev-list','--count','HEAD']),'2');
 const commit=git(['rev-parse','HEAD']);assert.match(commit,/^[0-9a-f]{40}$/);
 assert.equal(git(['diff','HEAD','--name-only']),'');
 console.log(JSON.stringify({phase:'verify',check,build,dependency,artifact,result:'srt-cache',commit,commitFiles,slug:fs.readFileSync('slug.mjs','utf8')}));
}
