import {spawn} from 'node:child_process';
import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {omp} from './controller.mjs';
export async function createBridge() {
 const token=randomBytes(32).toString('hex'),auth=Buffer.from(token),pending=new Map(),events=[];
 const gateway=spawn(omp,['auth-gateway','stdio'],{stdio:['pipe','pipe','pipe'],env:process.env});
 let buffer='',gatewayError='',sequence=0;
 gateway.stderr.on('data',b=>{gatewayError=(gatewayError+b).slice(-2000);});
 let readyResolve,readyReject;const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
 gateway.on('error',readyReject);gateway.on('exit',code=>{readyReject(new Error('Host gateway exited '+code));for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Host gateway exited'));}pending.clear();});
 gateway.stdout.setEncoding('utf8');gateway.stdout.on('data',chunk=>{buffer+=chunk;for(let i;(i=buffer.indexOf('\n'))>=0;){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(!line.trim())continue;let msg;try{msg=JSON.parse(line);}catch{readyReject(new Error('Invalid gateway JSON'));continue;}if(msg.ready){readyResolve();continue;}const p=pending.get(String(msg.id));if(p){clearTimeout(p.timer);pending.delete(String(msg.id));p.resolve(msg);}}});
 const startupTimer=setTimeout(()=>{gateway.kill();readyReject(new Error('Gateway startup timeout'));},15000);try{await ready;}finally{clearTimeout(startupTimer);}
 function upstream(input){return new Promise((resolve,reject)=>{const id=String(++sequence);const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Model response timeout'));},60000);pending.set(id,{resolve,reject,timer});const body={model:'openai-codex/gpt-6-luna',messages:input.messages,stream:false,reasoning_effort:'low'};for(const key of ['tools','tool_choice','temperature','max_tokens','max_completion_tokens','parallel_tool_calls'])if(input[key]!==undefined)body[key]=input[key];gateway.stdin.write(JSON.stringify({id,path:'/v1/chat/completions',body})+'\n');});}
 const server=http.createServer(async(req,res)=>{
  const supplied=Buffer.from((req.headers.authorization||'').replace(/^Bearer /,''));
  if(!req.headers.authorization?.startsWith('Bearer ')||supplied.length!==auth.length||!timingSafeEqual(supplied,auth)){events.push({status:401,path:req.url});res.writeHead(401).end();return;}
  if(req.method!=='POST'||req.url!=='/v1/chat/completions'){events.push({status:404,path:req.url});res.writeHead(404).end();return;}
  try{let bytes=0,text='';for await(const chunk of req){bytes+=chunk.length;if(bytes>2*1024*1024){res.writeHead(413).end();return;}text+=chunk;}const input=JSON.parse(text);
   if(input.model!=='luna'){events.push({status:403,reason:'model'});res.writeHead(403).end();return;}
   if(!Array.isArray(input.messages)||input.messages.length>200){res.writeHead(400).end();return;}
   const textOnly=input.messages.every(message=>message&&['system','developer','user','assistant','tool'].includes(message.role)&&(message.content===null||typeof message.content==='string'||Array.isArray(message.content)&&message.content.every(part=>part?.type==='text'&&typeof part.text==='string')));
   if(!textOnly){events.push({status:400,reason:'non-text-content'});res.writeHead(400).end();return;}
   // Host-side image/file normalization must never become a filesystem or URL-fetch proxy.
   input.messages=input.messages.map(message=>Object.fromEntries(['role','content','name','tool_call_id','tool_calls'].filter(key=>message[key]!==undefined).map(key=>[key,message[key]])));
   if(sequence>=16){res.writeHead(429).end();return;}
   const response=await upstream(input);events.push({status:response.status,stream:input.stream===true,model:'openai-codex/gpt-6-luna'});
   if(response.status!==200){res.writeHead(response.status||502,{'content-type':'application/json'}).end(JSON.stringify(response.body));return;}
   if(!input.stream){res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify(response.body));return;}
   res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});
   const body=response.body,choice=body.choices[0],message=choice.message;
   const chunk={id:body.id,object:'chat.completion.chunk',created:body.created,model:'luna',choices:[{index:0,delta:{role:'assistant',...(message.content?{content:message.content}:{}),...(message.tool_calls?{tool_calls:message.tool_calls.map((call,index)=>({index,...call}))}:{})},finish_reason:null}]};
   res.write('data: '+JSON.stringify(chunk)+'\n\n');res.write('data: '+JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:choice.finish_reason}],usage:body.usage})+'\n\n');res.end('data: [DONE]\n\n');
  }catch(e){events.push({status:502,error:e.message});if(!res.headersSent)res.writeHead(502);res.end();}
 });
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 return {port,token,events,gatewayPid:gateway.pid,async close(){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));gateway.stdin.end();const exited=new Promise(resolve=>gateway.once('exit',resolve));await Promise.race([exited,new Promise(resolve=>setTimeout(()=>{gateway.kill('SIGTERM');resolve();},1000))]);}};
}
