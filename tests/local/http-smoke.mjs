// Run after npm run build. No database or provider keys are needed for this smoke test.
import {spawn} from 'node:child_process';
import http from 'node:http';
import assert from 'node:assert/strict';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{env:{...process.env,LOCAL_WORKSPACE:'1'},stdio:'ignore'});
function request(headers={},path='/'){return new Promise((resolve,reject)=>{const r=http.get({hostname:'127.0.0.1',port:3100,path,headers},res=>{res.resume();resolve(res.statusCode);});r.on('error',reject);});}
try{
 let ready=false;for(let i=0;i<40;i++){try{if(await request()===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 assert.ok(ready,'local website starts');
 assert.equal(await request({Host:'malicious.example'}),403);
 assert.equal(await request({Origin:'https://malicious.example'}),403);
 assert.equal(await request({'Sec-Fetch-Site':'cross-site'}),403);
 assert.equal(await request({},'/api/morphology?id=10001'),200);
 console.log('Local HTTP smoke passed: startup, host/origin restrictions and bundled morphology.');
}finally{child.kill('SIGTERM');}
