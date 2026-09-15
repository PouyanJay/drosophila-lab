import {Pool} from 'pg';
const globalDb=globalThis as unknown as {localLabPool?:Pool};
export function database(){
 const connectionString=process.env.DATABASE_URL;
 if(!connectionString)throw Error('Start the local workspace to connect Supabase.');
 if(!globalDb.localLabPool){
  const pool=new Pool({connectionString,max:8,options:'-c search_path=lab,public',connectionTimeoutMillis:5000});
  pool.on('error',()=>{console.warn('Local database disconnected; new requests will reconnect.');});
  globalDb.localLabPool=pool;
 }
 return globalDb.localLabPool;
}
export function labDb(){return {prepare(sql:string){
 // Server-owned SQL only. User values always remain bound parameters.
 let index=0;const query=sql.replace(/\?/g,()=>`$${++index}`);
 const statement=(values:unknown[]=[])=>({
 bind:(...args:unknown[])=>statement(args),
 all:async()=>({results:(await database().query(query,values)).rows}),
 first:async()=>((await database().query(query,values)).rows[0]??null),
 run:async()=>{await database().query(query,values);return {success:true};},
 });return statement();
}};}
