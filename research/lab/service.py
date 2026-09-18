"""One persistent CPU executor, local Postgres queue, authenticated owner-scoped API.
SQLite is retained only for standalone engine tests.
Run with one Uvicorn process. File lock rejects accidental duplicate executors.
"""
import asyncio, contextlib, fcntl, hmac, json, os, re, sqlite3, threading, time, uuid
from pathlib import Path
from fastapi import FastAPI, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse
from .protocol import Graph, GRAPH_SHA, canonical, validate
from .engine import Interrupted, atomic_json, run
from .discovery_contract import validate as validate_discovery
from .discovery_tasks import TASKS
from .discovery import run as run_discovery

class Store:
    def __init__(self, directory):
        self.root=Path(directory);self.root.mkdir(parents=True,exist_ok=True);self.db=self.root/'jobs.sqlite3'
        self.database_url=os.environ.get('DATABASE_URL')
        if self.database_url:
            with self.connect() as c: c.execute('SELECT id FROM jobs LIMIT 0')
            return
        with self.connect() as c:
            c.execute('PRAGMA journal_mode=WAL')
            c.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_key TEXT NOT NULL, config TEXT NOT NULL, status TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL, error TEXT, UNIQUE(owner, request_key))')
            c.execute('CREATE INDEX IF NOT EXISTS jobs_owner_created ON jobs(owner, created)')
            c.execute('CREATE INDEX IF NOT EXISTS jobs_status_created ON jobs(status, created)')
    def connect(self):
        if self.database_url:
            from .postgres_store import Connection
            return Connection(self.database_url)
        c=sqlite3.connect(self.db,timeout=30);c.row_factory=sqlite3.Row;return c
    def get(self,id,owner=None):
        with self.connect() as c:
            row=c.execute('SELECT * FROM jobs WHERE id=?'+(' AND owner=?' if owner else ''),(id,owner) if owner else (id,)).fetchone()
            if not row: raise HTTPException(404,'Experiment not found')
            return dict(row)
    def submit(self,owner,key,config):
        (validate_discovery if config.get('schema')=='malecns-discovery/1' else validate)(config);value=canonical(config)
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE')
            old=c.execute('SELECT * FROM jobs WHERE owner=? AND request_key=?',(owner,key)).fetchone()
            if old:
                if old['config']!=value: raise HTTPException(409,'Submission key already belongs to another configuration')
                return dict(old)
            if c.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running','pausing')").fetchone()[0]>=10: raise HTTPException(429,'Training queue is full')
            id=str(uuid.uuid4());now=time.time();c.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)',(id,owner,key,value,'queued',now,now,None));return dict(c.execute('SELECT * FROM jobs WHERE id=?',(id,)).fetchone())
    def transition(self,id,owner,action):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');row=c.execute('SELECT * FROM jobs WHERE id=? AND owner=?',(id,owner)).fetchone()
            if not row: raise HTTPException(404,'Experiment not found')
            status=row['status']
            target={'pause':{'queued':'paused','running':'pausing','pausing':'pausing','paused':'paused'},'resume':{'paused':'queued','failed':'queued'},'cancel':{'queued':'cancelled','running':'cancelling','pausing':'cancelling','paused':'cancelled','cancelling':'cancelling','cancelled':'cancelled'}}.get(action,{}).get(status)
            if not target: raise HTTPException(409,'This action is unavailable in the current state')
            c.execute('UPDATE jobs SET status=?,updated=?,error=NULL WHERE id=?',(target,time.time(),id))
        return self.get(id,owner)
    def set(self,id,status,error=None):
        with self.connect() as c: c.execute('UPDATE jobs SET status=?,updated=?,error=? WHERE id=?',(status,time.time(),error,id))
    def claim(self):
        with self.connect() as c:
            c.execute('BEGIN IMMEDIATE');row=c.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created LIMIT 1").fetchone()
            if not row: return None
            c.execute("UPDATE jobs SET status='running',updated=? WHERE id=?",(time.time(),row['id']));return dict(row)
    def public(self,row,detail=True):
        out={k:row[k] for k in ('id','status','created','updated','error')};out['config']=json.loads(row['config']);root=self.root/row['id']
        if detail:
            for name in ('progress','result','artifacts'):
                path=root/(name+'.json')
                if path.exists() and (name=='progress' or row['status']=='completed'): out[name]=json.loads(path.read_text())
        return out

class Executor:
    def __init__(self,store,graph,threads=2,max_seconds=21600):
        self.store=store;self.graph=graph;self.threads=threads;self.max_seconds=max_seconds;self.stop=threading.Event();self.thread=None
    def start(self):
        self.lock=open(self.store.root/'executor.lock','a+')
        try: fcntl.flock(self.lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError: self.lock.close();raise RuntimeError('Another executor owns this data directory')
        with self.store.connect() as c:
            c.execute("UPDATE jobs SET status='queued' WHERE status='running'")
            c.execute("UPDATE jobs SET status='paused' WHERE status='pausing'")
            c.execute("UPDATE jobs SET status='cancelled' WHERE status='cancelling'")
        self.thread=threading.Thread(target=self.loop,daemon=True);self.thread.start()
    def close(self):
        self.stop.set()
        if self.thread: self.thread.join()
        fcntl.flock(self.lock,fcntl.LOCK_UN);self.lock.close()
    def loop(self):
        while not self.stop.is_set():
            row=self.store.claim()
            if not row: self.stop.wait(.5);continue
            id=row['id'];started=time.monotonic()
            def control():
                status=self.store.get(id)['status']
                if self.stop.is_set() or status in ('pausing','cancelling'): raise Interrupted(status)
                if time.monotonic()-started>self.max_seconds: raise TimeoutError('Run reached the service time limit; checkpoint retained')
            try:
                config=json.loads(row['config'])
                runner=run_discovery if config.get('schema')=='malecns-discovery/1' else run
                runner(config,self.graph,self.store.root/id,control=control,threads=self.threads)
                control();self.store.set(id,'completed')
            except Interrupted:
                status=self.store.get(id)['status'];self.store.set(id,'cancelled' if status=='cancelling' else 'paused' if status=='pausing' else 'queued')
            except Exception as e:
                # No provider secrets or arbitrary requests reach the trainer.
                self.store.set(id,'failed',str(e)[:400])

def create_app(store=None,graph=None,key=None,start_executor=True):
    token=key or os.environ.get('LAB_SERVICE_TOKEN','')
    if len(token)<32: raise RuntimeError('Set LAB_SERVICE_TOKEN to a random secret of at least 32 characters')
    store=store or Store(os.environ.get('LAB_DATA_DIR','/data/runs'))
    graph=graph or Graph(os.environ.get('LAB_GRAPH_DIR','/data/graph'))
    if graph.manifest['graphSha256']!=GRAPH_SHA and key is None: raise RuntimeError('This service requires the pinned full MaleCNS graph')
    executor=Executor(store,graph,int(os.environ.get('LAB_THREADS','2')),int(os.environ.get('LAB_MAX_SECONDS','21600')))
    @contextlib.asynccontextmanager
    async def lifespan(app):
        if start_executor: executor.start()
        yield
        if start_executor: await asyncio.to_thread(executor.close)
    app=FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)
    def auth(authorization:str=Header(default=''),x_lab_owner:str=Header(default='')):
        if not hmac.compare_digest(authorization,'Bearer '+token): raise HTTPException(401,'Invalid training service credential')
        if not re.fullmatch(r'[a-f0-9]{64}',x_lab_owner): raise HTTPException(400,'Missing owner identity')
        return x_lab_owner
    @app.middleware('http')
    async def bounded(request:Request,call_next):
        if request.method=='POST':
            body=bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body)>8192: return __import__('fastapi').responses.JSONResponse({'detail':'Request too large'},status_code=413)
            request._body=bytes(body)
        response=await call_next(request);response.headers['Cache-Control']='no-store';return response
    @app.get('/health')
    def health(owner=Depends(auth)):
        with store.connect() as c: active=c.execute("SELECT count(*) FROM jobs WHERE status='running'").fetchone()[0]
        return dict(status='busy' if active else 'ready',engine='malecns-synaptic-lab/1.0',graphSha256=graph.hashes['counts.npz'],neurons=graph.counts.shape[0],edges=graph.counts.nnz,device='cpu',persistent=True)
    @app.get('/jobs')
    def listing(owner=Depends(auth)):
        with store.connect() as c: rows=c.execute('SELECT * FROM jobs WHERE owner=? ORDER BY created DESC LIMIT 100',(owner,)).fetchall()
        return dict(jobs=[store.public(dict(r),False) for r in rows if json.loads(r['config']).get('schema')!='malecns-discovery/1'])
    @app.post('/jobs')
    async def submit(request:Request,owner=Depends(auth)):
        try:
            data=await request.json()
            if not isinstance(data,dict) or set(data)!=set(('requestKey','config')) or not re.fullmatch(r'[a-zA-Z0-9-]{8,80}',data['requestKey']): raise ValueError('Invalid submission')
            return store.public(store.submit(owner,data['requestKey'],data['config']))
        except (ValueError,TypeError,KeyError) as e: raise HTTPException(400,str(e))
    @app.get('/jobs/{id}')
    def job(id:str,owner=Depends(auth)): return store.public(store.get(id,owner))
    @app.post('/jobs/{id}/{action}')
    def action(id:str,action:str,owner=Depends(auth)): return store.public(store.transition(id,owner,action))
    @app.get('/jobs/{id}/artifacts/{name}')
    def artifact(id:str,name:str,owner=Depends(auth)):
        row=store.get(id,owner)
        if row['status']!='completed': raise HTTPException(409,'Artifacts become available after completion')
        root=store.root/row['id'];items=json.loads((root/'artifacts.json').read_text())
        item=next((a for a in items if a['name']==name),None)
        if not item or Path(name).name!=name: raise HTTPException(404,'Artifact not found')
        return FileResponse(root/name,filename=name,headers={'X-Artifact-SHA256':item['sha256']})
    @app.get('/discovery-tasks')
    def tasks(owner=Depends(auth)):
        return dict(tasks=[t.describe() for t in TASKS.values()])
    @app.get('/discoveries')
    def discoveries(owner=Depends(auth)):
        with store.connect() as c: rows=c.execute('SELECT * FROM jobs WHERE owner=? ORDER BY created DESC',(owner,)).fetchall()
        return dict(jobs=[store.public(dict(r),False) for r in rows if json.loads(r['config']).get('schema')=='malecns-discovery/1'])
    @app.post('/discoveries')
    async def discover(request:Request,owner=Depends(auth)):
        try:
            data=await request.json()
            if set(data)!=set(('requestKey','config')) or not re.fullmatch(r'[a-zA-Z0-9-]{8,80}',data['requestKey']):raise ValueError('Invalid discovery submission')
            validate_discovery(data['config'])
            return store.public(store.submit(owner,data['requestKey'],data['config']))
        except (ValueError,TypeError,KeyError) as e:raise HTTPException(400,str(e))
    def discovery_row(id,owner):
        row=store.get(id,owner)
        if json.loads(row['config']).get('schema')!='malecns-discovery/1':raise HTTPException(404,'Discovery not found')
        return row
    @app.get('/discoveries/{id}')
    def discovery_detail(id:str,owner=Depends(auth)):return store.public(discovery_row(id,owner))
    @app.get('/discoveries/{id}/candidates/{candidate}/curves')
    def discovery_curves(id:str,candidate:str,owner=Depends(auth)):
        row=discovery_row(id,owner);config=json.loads(row['config'])
        if not re.fullmatch(r'original|candidate-(?:0|[1-9][0-9]?)',candidate):
            raise HTTPException(404,'Candidate not found')
        if candidate!='original' and int(candidate.split('-')[1])>=config['candidates']:
            raise HTTPException(404,'Candidate not found')
        root=(store.root/row['id']/candidate).resolve()
        expected=store.root.resolve()/row['id']/candidate
        if root!=expected or not root.is_dir():raise HTTPException(404,'Candidate not found')
        runs=[];topology=None
        # Enumerate only configured seeds and known phases, never user-selected files.
        # Completed metrics are authoritative; atomic training snapshots cover live runs.
        for phase in ('pilot','full','confirmation'):
            seeds=config['seeds'][:1] if phase=='pilot' else config['seeds']
            if phase=='confirmation':seeds=[seed+100000 for seed in seeds]
            for seed in sorted(seeds):
                member=root/phase/str(seed)
                metrics=member/'metrics.json';path=metrics if metrics.exists() else member/'training.json'
                if not path.exists():continue
                if not path.resolve().is_relative_to(root):raise HTTPException(404,'Candidate data not found')
                try:
                    with path.open('rb') as file:raw=file.read(2*1024*1024+1)
                    if len(raw)>2*1024*1024:raise ValueError('Oversized curve')
                    saved=json.loads(raw)
                    curve=saved['curve']
                    if not isinstance(curve,list) or len(curve)>300:raise ValueError('Invalid curve')
                except (OSError,ValueError,KeyError,TypeError):
                    raise HTTPException(503,'Saved candidate curve is unreadable')
                runs.append(dict(phase=phase,seed=seed,curve=curve,complete=path==metrics))
                if saved.get('topology') is not None and (topology is None or phase=='full'):
                    topology=saved['topology']
        result=dict(candidateId=candidate,runs=runs)
        if topology is not None:result['topology']=topology
        return result
    @app.post('/discoveries/{id}/{operation}')
    def discovery_action(id:str,operation:str,owner=Depends(auth)):
        discovery_row(id,owner);return store.public(store.transition(id,owner,operation))
    @app.get('/discoveries/{id}/artifacts/{name}')
    def discovery_artifact(id:str,name:str,owner=Depends(auth)):
        discovery_row(id,owner);return artifact(id,name,owner)
    return app
