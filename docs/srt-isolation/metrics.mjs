import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
function seconds(text){const parts=text.split(':').map(Number);return parts.reduce((sum,value)=>sum*60+value,0);}
export function snapshot(rootPid){
 const result=spawnSync('/bin/ps',['-axo','pid=,ppid=,rss=,time='],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
 const rows=result.stdout.trim().split('\n').map(line=>{const [pid,ppid,rss,time]=line.trim().split(/\s+/);return{pid:Number(pid),ppid:Number(ppid),rssKiB:Number(rss),cpuSeconds:seconds(time)};});
 const included=new Set([rootPid]);let changed=true;while(changed){changed=false;for(const row of rows)if(included.has(row.ppid)&&!included.has(row.pid)){included.add(row.pid);changed=true;}}
 const tree=rows.filter(row=>included.has(row.pid));assert(tree.some(row=>row.pid===rootPid),'Worker exited during resource sample');
 return{pids:tree.map(row=>row.pid).sort((a,b)=>a-b),rssKiB:tree.reduce((sum,row)=>sum+row.rssKiB,0),cpuSeconds:tree.reduce((sum,row)=>sum+row.cpuSeconds,0)};
}
export async function idleMetrics(workerPid,gatewayPid,windowMs=5000){
 const samples=[],gatewaySamples=[];const start=performance.now();
 do{samples.push(snapshot(workerPid));gatewaySamples.push(snapshot(gatewayPid));await new Promise(resolve=>setTimeout(resolve,250));}while(performance.now()-start<windowMs);
 samples.push(snapshot(workerPid));gatewaySamples.push(snapshot(gatewayPid));const elapsedMs=performance.now()-start;
 assert.deepEqual(samples[0].pids,samples.at(-1).pids,'Idle tree changed; cumulative CPU comparison invalid');
 const summarize=values=>({pids:values.at(-1).pids,peakRSSKiB:Math.max(...values.map(x=>x.rssKiB)),meanRSSKiB:Math.round(values.reduce((s,x)=>s+x.rssKiB,0)/values.length),idleCpuSeconds:Number((values.at(-1).cpuSeconds-values[0].cpuSeconds).toFixed(3))});
 return{windowMs:elapsedMs,sampleIntervalMs:250,samples:samples.length,worker:summarize(samples),gateway:summarize(gatewaySamples),scope:'Sum of live process-tree RSS from ps (shared pages may be counted more than once); CPU cumulative TIME delta during stable-PID idle window. Gateway is separate, host controller is excluded.'};
}
