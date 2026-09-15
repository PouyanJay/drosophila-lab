"""Real HTTP full-graph verification; kills/restarts the service after a checkpoint."""
import argparse, hashlib, json, os, secrets, subprocess, sys, time
from pathlib import Path
import httpx
from .protocol import DEFAULT, Graph
from .engine import atomic_json, replay

def verify(graphdir,root,reference=None):
    root=Path(root);root.mkdir(parents=True,exist_ok=True);token=secrets.token_urlsafe(40)
    env={**os.environ,'LAB_SERVICE_TOKEN':token,'LAB_GRAPH_DIR':str(graphdir),'LAB_DATA_DIR':str(root/'runs')}
    owner='a'*64;headers={'Authorization':'Bearer '+token,'X-Lab-Owner':owner};base='http://127.0.0.1:8769'
    log=open(root/'service.log','a');process=None
    def boot():
        nonlocal process
        p=subprocess.Popen([sys.executable,'-m','uvicorn','research.lab.service:create_app','--factory','--host','127.0.0.1','--port','8769','--no-access-log'],env=env,stdout=log,stderr=log)
        process=p
        for _ in range(100):
            try:
                r=httpx.get(base+'/health',headers=headers,trust_env=False,timeout=2)
                if r.status_code==200: return p
            except httpx.HTTPError: pass
            if p.poll() is not None: raise RuntimeError('Trainer exited; inspect service.log')
            time.sleep(.2)
        raise RuntimeError('Trainer startup timed out')
    def call(method,path,**kw):
        r=httpx.request(method,base+path,headers=headers,trust_env=False,timeout=30,**kw);r.raise_for_status();return r.json()
    try:
        process=boot();config=DEFAULT.copy();job=call('POST','/jobs',json=dict(requestKey='full-graph-'+secrets.token_hex(8),config=config));id=job['id'];paused=False;killed=False;seen=0;start=time.monotonic()
        while True:
            row=call('GET','/jobs/'+id);p=row.get('progress',{});count=p.get('completedUpdates',0)
            if count!=seen: print(json.dumps(dict(status=row['status'],savedUpdates=count,total=p.get('totalUpdates'))),flush=True);seen=count
            if count>=1 and not paused:
                call('POST','/jobs/'+id+'/pause')
                for _ in range(120):
                    if call('GET','/jobs/'+id)['status']=='paused': break
                    time.sleep(.2)
                else: raise AssertionError('Pause did not reach a checkpoint')
                call('POST','/jobs/'+id+'/resume');paused=True
            if count>=3 and not killed:
                process.kill();process.wait();process=boot();killed=True
                assert call('GET','/jobs/'+id)['id']==id
                print('Service restarted; job recovered from durable state',flush=True)
            if row['status']=='completed': break
            if row['status']=='failed': raise AssertionError(row['error'])
            if time.monotonic()-start>1800: raise AssertionError('Verification timeout')
            time.sleep(1)
        result=row['result'];assert paused and killed
        for m in result['models']:
            for r in m['runs']: assert r['parameterChangeNorms']['edge_scale']>0
        for a in row['artifacts']:
            response=httpx.get(base+'/jobs/'+id+'/artifacts/'+a['name'],headers=headers,trust_env=False,timeout=60);response.raise_for_status();assert hashlib.sha256(response.content).hexdigest()==a['sha256']
        assert httpx.get(base+'/jobs/'+id,headers={**headers,'X-Lab-Owner':'b'*64},trust_env=False).status_code==404
        verified=replay(Graph(graphdir),root/'runs'/id)
        if reference:
            previous=json.loads(Path(reference).read_text())
            for vi in (0,1):
                for i in range(len(config['seeds'])):
                    a=previous['models'][vi]['runs'][i];b=result['models'][vi]['runs'][i]
                    assert a['parameterSha256']==b['parameterSha256']
                    assert a['history']==b['history']
                    assert a['test']==b['test']
        report=dict(passed=True,jobId=id,fullGraph=result['graph'],pausedAndResumed=paused,forcedRestartRecovered=killed,replay=verified,repeatMatches=bool(reference),artifactHashesVerified=True,ownerIsolation=True,accuracy=[m['accuracy'] for m in result['models']],delta=result['delta'],seconds=time.monotonic()-start)
        atomic_json(root/'verification.json',report);print(json.dumps(report),flush=True)
    finally:
        if process and process.poll() is None: process.terminate();process.wait(timeout=120)
        log.close()

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--graph',required=True);p.add_argument('--out',required=True);p.add_argument('--reference');a=p.parse_args();verify(a.graph,a.out,a.reference)
