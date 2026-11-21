import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const srt = process.env.SRT_PACKAGE;assert(srt,'Run through run.mjs so pinned SRT is installed first');
assert.equal(JSON.parse(fs.readFileSync(path.join(srt,'package.json'),'utf8')).version,'0.0.82');
const {wrapCommandWithSandboxMacOS} = await import(pathToFileURL(path.join(srt,'dist/sandbox/macos-sandbox-utils.js')));
const {quote} = await import(pathToFileURL(path.join(srt,'dist/utils/shell-quote.js')));
function locate(name){const r=spawnSync('/usr/bin/which',[name],{encoding:'utf8'});assert.equal(r.status,0,'Missing executable '+name);return fs.realpathSync(r.stdout.trim());}
export const node=fs.realpathSync(process.execPath);
export const bun=locate('bun');
export const omp=locate('omp');
export const git=locate('git');
const piCLI=locate('pi'),npmCLI=locate('npm');
export const piPackage=path.resolve(path.dirname(piCLI),'../..');
export const npmPackage=path.dirname(path.dirname(npmCLI));
assert.equal(JSON.parse(fs.readFileSync(path.join(piPackage,'package.json'),'utf8')).version,'1.5.0','Pi version differs from validated worker');
const toolchain=['/bin','/usr/bin','/usr/lib','/usr/libexec','/sbin','/System/Library','/Library/Apple/System/Library','/private/var/db/dyld','/private/var/select/sh','/private/etc/ssl/openssl.cnf',node,bun,path.dirname(path.dirname(git)),piPackage,npmPackage,'/dev/null','/dev/urandom','/dev/random','/dev/fd'];
const scanned=new Set();function addLibraries(binary){if(scanned.has(binary))return;scanned.add(binary);const r=spawnSync('/usr/bin/otool',['-L',binary],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);for(const line of r.stdout.split('\n').slice(1)){const dependency=line.trim().split(' (')[0];if(!dependency.startsWith('/opt/'))continue;toolchain.push(dependency);const canonical=fs.realpathSync(dependency);toolchain.push(canonical);addLibraries(canonical);}}
addLibraries(git);
for(const entry of [...toolchain])if(fs.existsSync(entry))toolchain.push(fs.realpathSync(entry));
const linkMetadata=new Set();for(const entry of toolchain){let part='/';for(const segment of entry.split('/').filter(Boolean)){part=path.join(part,segment);if(fs.existsSync(part)&&fs.lstatSync(part).isSymbolicLink())linkMetadata.add(part);}}
export function prepare(source, destination) {
 assert(!fs.existsSync(destination),'destination must not exist'); fs.mkdirSync(destination,{mode:0o700});
 function copy(src,dst) { const st=fs.lstatSync(src); if(st.isSymbolicLink() || (!st.isFile()&&!st.isDirectory())) throw new Error('Unsupported input: '+src); if(st.isDirectory()){fs.mkdirSync(dst,{mode:0o700});for(const name of fs.readdirSync(src))copy(path.join(src,name),path.join(dst,name));}else{fs.copyFileSync(src,dst,fs.constants.COPYFILE_EXCL);const out=fs.statSync(dst);assert.equal(out.nlink,1);assert(st.dev!==out.dev||st.ino!==out.ino);}}
 for(const name of fs.readdirSync(source))copy(path.join(source,name),path.join(destination,name));
}
export function compile({work,temp,readOnly=[],port,argv,controller,binary='/usr/bin/sandbox-exec'}) {
 assert(path.isAbsolute(work)&&path.isAbsolute(temp));assert(fs.existsSync(binary),'Sandbox unavailable');
 const previousCwd=process.cwd(),previousTemp=process.env.CLAUDE_CODE_TMPDIR;let wrapped;
 try{process.chdir(work);process.env.CLAUDE_CODE_TMPDIR=temp;wrapped=wrapCommandWithSandboxMacOS({command:quote(argv),needsNetworkRestriction:true,httpProxyPort:port,allowUnixSockets:[],allowAllUnixSockets:false,allowLocalBinding:false,allowMachLookup:[],allowAppleEvents:false,readConfig:{denyOnly:['/'],allowWithinDeny:[work,temp,...toolchain,...readOnly]},writeConfig:{allowOnly:[work,temp],denyWithinAllow:['/tmp/claude','/private/tmp/claude',controller,...readOnly]},allowGitConfig:true,binShell:'/bin/bash'});}finally{process.chdir(previousCwd);if(previousTemp===undefined)delete process.env.CLAUDE_CODE_TMPDIR;else process.env.CLAUDE_CODE_TMPDIR=previousTemp;}
 assert(wrapped.startsWith('env '));
 const decoded=spawnSync('/bin/bash',['-c','printf "%s\\0" '+wrapped.slice(4)],{encoding:'buffer'});assert.equal(decoded.status,0,decoded.stderr?.toString());
 const args=decoded.stdout.toString().split('\0');assert.equal(args.pop(),'');const ix=args.indexOf('/usr/bin/sandbox-exec');assert(ix>0);assert.equal(args[ix+1],'-p');
 const base=args[ix+2], machStart=base.indexOf('; Mach IPC - specific services only (no wildcard)'),machEnd=base.indexOf('; POSIX IPC - shared memory');assert(machStart>0&&machEnd>machStart,'Pinned SRT profile layout changed');
 const metadataRule='(allow file-read-metadata\n  (vnode-type DIRECTORY))';assert(base.includes(metadataRule),'Pinned SRT directory metadata rule changed');
 const hardenedBase=(base.slice(0,machStart)+'; Host policy removes SRT baseline Mach service grants.\n'+base.slice(machEnd)).replace('(allow mach-lookup (global-name "com.apple.SecurityServer"))','').replace(metadataRule,'');
 assert(!hardenedBase.includes('(allow mach-lookup'),'Unexpected SRT Mach grant');
 // Removing SRT's literal root-directory read makes even /usr/bin/true abort on this macOS; it does not authorize descendants.
 const ancestorMetadata=new Set(['/']);for(const entry of [work,temp,...toolchain,...readOnly]){let parent=path.dirname(entry);while(parent!=='/'){ancestorMetadata.add(parent);parent=path.dirname(parent);}}
 const profile=hardenedBase+'\n'+[...new Set([...linkMetadata,...ancestorMetadata])].map(link=>`(allow file-read-metadata (literal ${JSON.stringify(link)}))`).join('\n')+`\n(deny mach-lookup)\n(deny appleevent-send)\n(deny lsopen)\n(deny ipc-posix-shm)\n(deny ipc-posix-sem)\n(deny user-preference-read)\n(deny file-link)\n(deny network-bind)\n(deny network-inbound)\n`;
 fs.writeFileSync(path.join(controller,path.basename(work)+'.sb'),profile,{mode:0o600});
 const env={PATH:'/usr/bin:/bin:/usr/sbin:/sbin:'+path.dirname(node)+':'+path.dirname(bun)+':'+path.dirname(git),HOME:path.join(temp,'home'),TMPDIR:temp,CLAUDE_CODE_TMPDIR:temp,PI_CODING_AGENT_DIR:path.join(temp,'agent'),XDG_CACHE_HOME:path.join(temp,'cache'),GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',LC_ALL:'C',LANG:'C',...Object.fromEntries(args.slice(0,ix).map(entry=>{const eq=entry.indexOf('=');assert(eq>0);return[entry.slice(0,eq),entry.slice(eq+1)];}))};
 fs.mkdirSync(env.HOME,{recursive:true});fs.mkdirSync(env.PI_CODING_AGENT_DIR,{recursive:true});
 return {binary,args:['-p',profile,...args.slice(ix+3)],cwd:work,env,manifest:{srtVersion:'0.0.82',readOnly:[...new Set([...toolchain,...readOnly])],readOnlyNamespaceRoot:'literal / only; no descendants',readOnlySymlinkMetadata:[...linkMetadata],readOnlyAncestorMetadata:[...ancestorMetadata],write:[work,temp],port:port??null,defaultMachServices:false,profileFile:path.join(controller,path.basename(work)+'.sb')}};
}
