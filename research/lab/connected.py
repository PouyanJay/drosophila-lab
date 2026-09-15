"""Container entrypoint for self-service setup. Secret stays on the persistent volume."""
import os, secrets
from pathlib import Path

def service_token(root):
    path=Path(root)/'service-token'
    path.parent.mkdir(parents=True,exist_ok=True)
    try:
        fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    except FileExistsError:
        token=path.read_text().strip()
    else:
        token=secrets.token_urlsafe(48)
        with os.fdopen(fd,'w') as f:f.write(token+'\n')
    if len(token)<32:raise RuntimeError('The saved trainer secret is invalid. Restore the service-token file before restarting.')
    return token

if __name__=='__main__':
    os.environ['LAB_SERVICE_TOKEN']=service_token('/data')
    os.execvp('uvicorn',['uvicorn','research.lab.service:create_app','--factory','--host','0.0.0.0','--port','8000','--workers','1','--no-access-log'])
