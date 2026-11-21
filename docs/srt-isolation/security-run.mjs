import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {prepare,compile,node,bun} from './controller.mjs';
const root=path.dirname(new URL(import.meta.url).pathname);
const runRoot=fs.mkdtempSync('/private/tmp/srt-check-');
const source=path.join(runRoot,'source'), outside=path.join(runRoot,'outside'),cache=path.join(runRoot,'cache');
for(const d of [source,outside,cache])fs.mkdirSync(d,{mode:0o700});
const sentinel=path.join(outside,'sentinel');fs.writeFileSync(sentinel,'SYNTHETIC-ONLY');
fs.linkSync(sentinel,path.join(source,'materialized-hardlink'));
fs.copyFileSync(path.join(root,'probes.mjs'),path.join(source,'probes.mjs'));
const cacheFile=path.join(cache,'download-sentinel');fs.writeFileSync(cacheFile,'CACHE-SYNTHETIC');
const toolSentinel=path.join(cache,'toolchain-sentinel');fs.writeFileSync(toolSentinel,'TOOL-SYNTHETIC');
const authority=path.join(root,'authority.json');fs.writeFileSync(authority,'{"grantExpansion":false}');
const defaultTemp='/private/tmp/claude';if(!fs.existsSync(defaultTemp))fs.mkdirSync(defaultTemp,{mode:0o700});assert(fs.lstatSync(defaultTemp).isDirectory(),'Shared default temp is not a real directory');
const defaultSentinel=path.join(defaultTemp,'srt-denied-'+path.basename(runRoot));fs.writeFileSync(defaultSentinel,'SHARED-SYNTHETIC',{flag:'wx'});
const hostFd=fs.openSync(sentinel,'r'),sentinelStat=fs.fstatSync(hostFd);
const sockets={docker:path.join(outside,'docker.sock'),sshAgent:path.join(outside,'agent.sock')};
const accepted={docker:0,sshAgent:0};const servers=[];
for(const [name,socket]of Object.entries(sockets)){const server=net.createServer(c=>{accepted[name]++;c.end('SYNTHETIC');});await new Promise((resolve,reject)=>server.once('error',reject).listen(socket,resolve));servers.push(server);await new Promise((resolve,reject)=>{const c=net.connect(socket);c.once('error',reject);c.once('data',()=>{c.destroy();resolve();});});assert.equal(accepted[name],1);}
for(const service of ['com.apple.coreservices.launchservicesd','com.apple.coreservices.appleevents','com.apple.securityd.xpc']){const c=spawnSync(path.join(root,'mach-probe'),[service],{encoding:'utf8'});assert.equal(c.status,0,c.stdout+c.stderr);}
const results=[];
for(const runtime of [node,bun]){
 const job=fs.mkdtempSync(path.join(runRoot,'job-'));const work=path.join(job,'work'),temp=path.join(job,'temp');fs.mkdirSync(temp,{mode:0o700});prepare(source,work);
 const original=fs.statSync(path.join(source,'materialized-hardlink')),copied=fs.statSync(path.join(work,'materialized-hardlink'));assert.notEqual(original.ino,copied.ino);assert.equal(copied.nlink,1);
 fs.symlinkSync(sentinel,path.join(work,'outside-link'));
 const target={sentinel,hostFd,sentinelDev:sentinelStat.dev,sentinelInode:sentinelStat.ino,cacheFile,cacheContent:'CACHE-SYNTHETIC',toolSentinel,policy:path.join(root,'work.sb'),srtCode:path.join(process.env.SRT_PACKAGE,'dist/index.js'),controller:path.join(root,'controller.mjs'),authority,sharedTemp:'/private/tmp/srt-shared-'+path.basename(runRoot),srtDefaultTemp:defaultSentinel,privateTemp:temp,sockets,machHelper:path.join(root,'mach-probe')};
 fs.writeFileSync(path.join(work,'targets.json'),JSON.stringify(target));
 const options={work,temp,controller:root,readOnly:[cache,path.join(root,'mach-probe')],argv:[runtime,path.join(work,'probes.mjs'),path.join(work,'targets.json')]};
 const launch=compile(options);const start=performance.now();
 const r=await new Promise(resolve=>{const child=spawn(launch.binary,launch.args,{cwd:launch.cwd,env:launch.env,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);const timer=setTimeout(()=>child.kill('SIGKILL'),20000);child.once('exit',(status,signal)=>{clearTimeout(timer);resolve({status,signal,stdout,stderr});});});
 results.push({runtime,...r,wallMs:performance.now()-start,manifest:launch.manifest,copy:{sourceInode:original.ino,workInode:copied.ino,nlink:copied.nlink},outsideAfter:fs.readFileSync(sentinel,'utf8'),cacheAfter:fs.readFileSync(cacheFile,'utf8')});
}
for(const [name,socket]of Object.entries(sockets)){assert.equal(accepted[name],1);await new Promise((resolve,reject)=>{const c=net.connect(socket);c.once('error',reject);c.once('data',()=>{c.destroy();resolve();});});assert.equal(accepted[name],2);}
assert.equal(fs.readFileSync(defaultSentinel,'utf8'),'SHARED-SYNTHETIC');fs.unlinkSync(defaultSentinel);
for(const server of servers)await new Promise(resolve=>server.close(resolve));
fs.closeSync(hostFd);
const missing=()=>compile({work:runRoot,temp:runRoot,controller:root,argv:['/usr/bin/true'],binary:path.join(root,'missing-sandbox')});let missingFailed=false;try{missing();}catch{missingFailed=true;}
assert(missingFailed);assert.equal(fs.readFileSync(sentinel,'utf8'),'SYNTHETIC-ONLY');assert.equal(fs.readFileSync(cacheFile,'utf8'),'CACHE-SYNTHETIC');assert.deepEqual(accepted,{docker:2,sshAgent:2});
const evidence={runRoot,accepted,missingFailed,results};fs.writeFileSync(path.join(runRoot,'evidence.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({runRoot,runtimes:results.map(r=>({runtime:r.runtime,status:r.status,signal:r.signal,stderr:r.stderr,checks:r.stdout?JSON.parse(r.stdout).rows.length:0,failed:r.stdout?JSON.parse(r.stdout).rows.filter(row=>!row.pass):[{error:'Probe produced no JSON; inspect signal and stderr'}],outsideAfter:r.outsideAfter,cacheAfter:r.cacheAfter})),socketPositiveControls:accepted,missingFailed},null,2));
assert(results.every(r=>r.status===0),'Boundary probe failed; inspect evidence');
