import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawnSync} from 'node:child_process';
const t=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const rows=[];
function denied(name,fn){try{const value=fn();rows.push({name,pass:false,result:'ALLOWED',value});}catch(e){rows.push({name,pass:['EPERM','EACCES'].includes(e.code),code:e.code,message:e.message});}}
async function deniedAsync(name,fn){try{await fn();rows.push({name,pass:false,result:'ALLOWED'});}catch(e){rows.push({name,pass:['EPERM','EACCES'].includes(e.code),code:e.code,message:e.message});}}
for(const [name,target] of [['absolute',t.sentinel],['relative',path.relative(process.cwd(),t.sentinel)],['symlink','outside-link']]){denied(name+'-read',()=>fs.readFileSync(target));denied(name+'-write',()=>fs.writeFileSync(target,'ESCAPE'));}
denied('outside-directory-metadata',()=>fs.statSync(path.dirname(t.sentinel)));
denied('outside-directory-list',()=>fs.readdirSync(path.dirname(t.sentinel)));
denied('external-hardlink-create',()=>fs.linkSync(t.sentinel,'new-external-link'));
denied('cache-hardlink-create',()=>fs.linkSync(t.cacheFile,'new-cache-link'));
let inherited=false;try{const st=fs.fstatSync(t.hostFd);inherited=st.dev===t.sentinelDev&&st.ino===t.sentinelInode;}catch(e){if(e.code!=='EBADF')throw e;}rows.push({name:'no-inherited-host-file-descriptor',pass:!inherited});
for(const [name,target] of [['cache',t.cacheFile],['policy',t.policy],['srt-code',t.srtCode],['controller',t.controller],['authority',t.authority],['toolchain',t.toolSentinel]]){if(name!=='cache'&&name!=='toolchain')denied(name+'-private-read',()=>fs.readFileSync(target));denied(name+'-write',()=>fs.writeFileSync(target,'ESCAPE'));denied(name+'-unlink',()=>fs.unlinkSync(target));denied(name+'-rename',()=>fs.renameSync(target,path.join(process.cwd(),name+'-stolen')));}
rows.push({name:'cache-read',pass:fs.readFileSync(t.cacheFile,'utf8')===t.cacheContent});
rows.push({name:'toolchain-read',pass:fs.readFileSync(t.toolSentinel,'utf8')==='TOOL-SYNTHETIC'});
denied('controller-parent-rename',()=>fs.renameSync(path.dirname(t.controller),'stolen-controller'));
for(const [name,target] of [['shared-tmp',t.sharedTemp],['srt-default-tmp',t.srtDefaultTemp]])denied(name+'-write',()=>fs.writeFileSync(target,'ESCAPE'));
if(process.versions.bun){await deniedAsync('Bun.file-outside-read',()=>Bun.file(t.sentinel).text());await deniedAsync('Bun.write-outside',()=>Bun.write(t.sentinel,'ESCAPE'));rows.push({name:'Bun.file-cache-read',pass:await Bun.file(t.cacheFile).text()===t.cacheContent});}
const copy=fs.readFileSync('materialized-hardlink','utf8');fs.writeFileSync('materialized-hardlink','PRIVATE-CHANGE');rows.push({name:'materialized-hardlink-private-edit',pass:copy==='SYNTHETIC-ONLY'&&fs.statSync('materialized-hardlink').nlink===1});
fs.writeFileSync(path.join(t.privateTemp,'allowed'),'PRIVATE-TEMP');rows.push({name:'private-temp-write',pass:fs.readFileSync(path.join(t.privateTemp,'allowed'),'utf8')==='PRIVATE-TEMP'});
for(const [name,cmd,args] of [['child-read','/bin/cat',[t.sentinel]],['grandchild-write','/bin/bash',['-c','/bin/bash -c \'printf ESCAPE > "$1"\' bash "$1"','bash',t.sentinel]]]){const r=spawnSync(cmd,args,{encoding:'utf8'});rows.push({name,pass:r.status!==0&&/not permitted|denied/i.test(r.stderr||''),status:r.status,stderr:r.stderr});}
for(const [name,socket] of Object.entries(t.sockets))await new Promise(resolve=>{const conn=net.connect(socket);const timer=setTimeout(()=>{conn.destroy();rows.push({name:name+'-socket',pass:false,error:'timeout'});resolve();},2000);conn.once('error',e=>{clearTimeout(timer);rows.push({name:name+'-socket',pass:['EPERM','EACCES'].includes(e.code)||(!!process.versions.bun&&e.code==='ECONNREFUSED'),code:e.code,positiveControlsRequired:true});resolve();});conn.once('connect',()=>{clearTimeout(timer);conn.destroy();rows.push({name:name+'-socket',pass:false,result:'CONNECTED'});resolve();});});
for(const [name,argv] of [['mach-launchservices',[t.machHelper,'com.apple.coreservices.launchservicesd']],['mach-appleevents',[t.machHelper,'com.apple.coreservices.appleevents']],['mach-securityd',[t.machHelper,'com.apple.securityd.xpc']]]){const r=spawnSync(argv[0],argv.slice(1),{encoding:'utf8'});rows.push({name,pass:r.status===77,status:r.status,stdout:r.stdout,stderr:r.stderr});}
console.log(JSON.stringify({runtime:process.versions.bun?'bun':'node',rows}));process.exitCode=rows.every(r=>r.pass)?0:1;
