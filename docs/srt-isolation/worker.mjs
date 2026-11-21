import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Readable,Writable} from 'node:stream';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {compile,node} from './controller.mjs';

const withTimeout=async(promise,ms,label)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out`)),ms);})]);}finally{clearTimeout(timer);}};
export async function startWorker({work,temp,controller,bridge,readOnly=[],sandboxed,commandDirectory}){
 const modules=path.join(controller,'acp','node_modules'),packageFile=path.join(modules,'pi-acp','package.json'),launcher=path.join(controller,'acp','pi');
 assert.equal(JSON.parse(fs.readFileSync(packageFile,'utf8')).version,'0.0.34','Unexpected pi-acp adapter version');
 const require=createRequire(packageFile),sdkRequire=createRequire(path.join(modules,'@agentclientprotocol','sdk','package.json'));
 const {ClientSideConnection,ndJsonStream}=await import(pathToFileURL(require.resolve('@agentclientprotocol/sdk')));
 const sdkMeta=JSON.parse(fs.readFileSync(sdkRequire.resolve('@agentclientprotocol/sdk/package.json'),'utf8'));assert.equal(sdkMeta.version,'0.26.0');
 const argv=[node,path.join(modules,'pi-acp/dist/index.js')],compileStart=performance.now();
 const launch=await compile({work,temp,controller,port:bridge.port,readOnly:[...readOnly,modules,launcher],argv}),compileMs=performance.now()-compileStart;
 fs.writeFileSync(path.join(temp,'agent/models.json'),JSON.stringify({providers:{bridge:{baseUrl:`http://127.0.0.1:${bridge.port}/v1`,api:'openai-completions',apiKey:bridge.token,authHeader:true,models:[{id:'luna',name:'Scoped OpenAI Luna',reasoning:false,input:['text'],contextWindow:128000,maxTokens:8192}]}}}),{mode:0o600});
 const start=performance.now(),child=spawn(sandboxed?launch.binary:argv[0],sandboxed?launch.args:argv.slice(1),{cwd:work,env:{...launch.env,PATH:commandDirectory+':'+launch.env.PATH,PI_ACP_PI_COMMAND:launcher,PI_OFFLINE:'1',PI_TELEMETRY:'0',NODE_COMPILE_CACHE:path.join(temp,'node-cache')},stdio:['pipe','pipe','pipe'],detached:true});
 let stderr='',exit,closed=false;const events=[],deniedDelegations=[];
 const ended=new Promise(resolve=>{child.once('exit',(status,signal)=>{exit={status,signal};resolve(exit);});child.once('error',error=>{exit={status:null,signal:null,error:error.message};resolve(exit);});});
 child.stderr.on('data',b=>stderr+=b);
 const kill=signal=>{if(!child.pid)return;try{process.kill(-child.pid,signal);}catch(e){if(e.code!=='ESRCH')throw e;}};
 const deny=name=>async()=>{deniedDelegations.push(name);throw new Error(`Host delegation disabled: ${name}`);};
 const client=new ClientSideConnection(()=>({sessionUpdate:async p=>{events.push(p);},requestPermission:deny('permission'),readTextFile:deny('read'),writeTextFile:deny('write'),createTerminal:deny('terminal')}),ndJsonStream(Writable.toWeb(child.stdin),Readable.toWeb(child.stdout)));
 try{
  const initialized=await withTimeout(client.initialize({protocolVersion:1,clientInfo:{name:'srt-isolation-client',version:'1'},clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false}}),15000,'ACP initialize');
  assert.equal(initialized.protocolVersion,1);assert.equal(initialized.agentInfo.name,'pi-acp');assert.equal(initialized.agentInfo.version,'0.0.34');
  assert.equal(initialized.agentCapabilities.promptCapabilities.embeddedContext,false);
  const session=await withTimeout(client.newSession({cwd:work,mcpServers:[]}),20000,'ACP session/new');
  assert.equal(session.models.currentModelId,'bridge/luna');
  return{pid:child.pid,startupMs:performance.now()-start,compileMs,argv,manifest:launch.manifest,initialized,session,events,deniedDelegations,
   async prompt(message){const at=performance.now();try{const result=await withTimeout(client.prompt({sessionId:session.sessionId,prompt:[{type:'text',text:message}]}),90000,'ACP session/prompt');assert.equal(result.stopReason,'end_turn',JSON.stringify(result));assert.deepEqual(deniedDelegations,[]);return{wallMs:performance.now()-at,result};}catch(error){try{await withTimeout(client.cancel({sessionId:session.sessionId}),1000,'ACP cancel');}catch{}kill('SIGTERM');throw error;}},
   async close(logFile){if(closed)return exit;closed=true;child.stdin.end();let result;try{result=await withTimeout(ended,5000,'ACP shutdown');}catch{kill('SIGTERM');try{result=await withTimeout(ended,1500,'ACP SIGTERM shutdown');}catch{kill('SIGKILL');result=await withTimeout(ended,3000,'ACP SIGKILL shutdown');}}finally{kill('SIGKILL');}if(logFile)fs.writeFileSync(logFile,JSON.stringify({argv,manifest:launch.manifest,profile:fs.readFileSync(launch.manifest.profileFile,'utf8'),initialized,session,exit:result,stderr,events,deniedDelegations},(key,value)=>/^(apiKey|authorization|token)$/i.test(key)?'[SCOPED TOKEN OMITTED]':value,2));assert.equal(result.status,0,stderr);assert.equal(stderr,'');assert.deepEqual(deniedDelegations,[]);return result;}
  };
 }catch(error){child.stdin.end();kill('SIGTERM');try{await withTimeout(ended,1500,'ACP cleanup');}catch{kill('SIGKILL');try{await withTimeout(ended,3000,'ACP forced cleanup');}catch{}}finally{kill('SIGKILL');}throw error;}
}
