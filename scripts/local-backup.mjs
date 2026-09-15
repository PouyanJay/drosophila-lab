import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,cpSync,existsSync,openSync,closeSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
if(!existsSync('.env.local'))throw Error('Start the local workspace first.');
for(const line of readFileSync('.env.local','utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0)process.env[line.slice(0,i)]=line.slice(i+1);}
function run(args,options={}){const r=spawnSync('docker',args,{stdio:'inherit',...options});if(r.error||r.status!==0)throw Error('Backup step failed: '+args.slice(0,3).join(' '));return r.stdout;}
const target=path.resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(target,{recursive:true,mode:0o700});
console.log('Close the website before backing up. Stopping the trainer at its next checkpoint…');
run(['compose','-f','compose.local.yaml','stop','trainer']);
try{
 const fd=openSync(path.join(target,'database.sql'),'wx',0o600);
 try{run(['exec','supabase_db_drosophila-local','pg_dump','-U','postgres','-d','postgres','--schema=lab','--no-owner','--no-privileges'],{stdio:['ignore',fd,'inherit']});}finally{closeSync(fd);}
 if(existsSync('.local-data/runs'))cpSync('.local-data/runs',path.join(target,'runs'),{recursive:true});
 cpSync('.env.local',path.join(target,'environment.private'));
 writeFileSync(path.join(target,'backup.json'),JSON.stringify({schema:'drosophila-backup/1',createdAt:new Date().toISOString(),database:'Supabase Postgres',includes:['lab schema','trainer artifacts','encryption key']}),{mode:0o600});
 console.log('Backup saved to '+target+'. Keep it private: it includes the key needed to decrypt saved provider credentials.');
}finally{run(['compose','-f','compose.local.yaml','start','trainer']);}
