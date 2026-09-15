import {readFileSync,existsSync,cpSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {Pool} from 'pg';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
if(!process.argv[2])throw Error('Choose a trusted backup folder: npm run local:restore -- backups/FOLDER');
process.loadEnvFile('.env.local');
const folder=path.resolve(process.argv[2]);
if(JSON.parse(readFileSync(path.join(folder,'backup.json'),'utf8')).schema!=='drosophila-backup/1')throw Error('Unrecognized backup');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
try{
 const row=(await pool.query('SELECT (SELECT count(*) FROM lab.lab_records)+(SELECT count(*) FROM lab.jobs)+(SELECT count(*) FROM lab.provider_connections)+(SELECT count(*) FROM lab.compute_connections) AS count')).rows[0];
 if(Number(row.count)!==0)throw Error('Restore requires an empty workspace. Existing data was not changed. Use a fresh installation.');
 const privateEnv=readFileSync(path.join(folder,'environment.private'),'utf8');
 const key=privateEnv.split(/\r?\n/).find(l=>l.startsWith('PROVIDER_ENCRYPTION_KEY='));
 if(!key)throw Error('Backup encryption key missing');
 const dump=readFileSync(path.join(folder,'database.sql'),'utf8');
 const stopped=spawnSync('docker',['compose','-f','compose.local.yaml','stop','trainer'],{stdio:'inherit'});
 if(stopped.error||stopped.status)throw Error('Could not stop the trainer');
 const sql='DROP SCHEMA lab CASCADE;\n'+dump+'\nREVOKE ALL ON SCHEMA lab FROM PUBLIC,anon,authenticated;\nREVOKE ALL ON ALL TABLES IN SCHEMA lab FROM PUBLIC,anon,authenticated;\n';
 const restored=spawnSync('docker',['exec','-i','supabase_db_drosophila-local','psql','-U','postgres','-d','postgres','--single-transaction','--set','ON_ERROR_STOP=1'],{input:sql,stdio:['pipe','inherit','inherit']});
 if(restored.error||restored.status)throw Error('Database restore failed; its transaction was rolled back.');
 if(existsSync(path.join(folder,'runs')))cpSync(path.join(folder,'runs'),'.local-data/runs',{recursive:true});
 const local=readFileSync('.env.local','utf8').replace(/^PROVIDER_ENCRYPTION_KEY=.*$/m,key);
 writeFileSync('.env.local',local,{mode:0o600});
 console.log('Backup restored. Run npm run local to reopen the workspace.');
}finally{await pool.end();}
