"""Read tunnel logs from stdin; print a verified connection file for the local owner."""
import json, re, sys, urllib.request
from pathlib import Path

def export(logs,token,opener=urllib.request.urlopen):
    urls=re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com',logs)
    if not urls:raise RuntimeError('The HTTPS connection is still starting. Run the launcher again in a moment.')
    url=urls[-1]
    # Local health check only. The website independently verifies public DNS and the HTTPS endpoint.
    request=urllib.request.Request('http://127.0.0.1:8000/health',headers={'Authorization':'Bearer '+token,'X-Lab-Owner':'0'*64})
    with opener(request,timeout=10) as r:health=json.load(r)
    if health.get('graphSha256')!='729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b':raise RuntimeError('The full graph has not passed verification.')
    return {'schema':'malecns-compute/1','name':'My computer','url':url,'token':token}

if __name__=='__main__':
    try:print(json.dumps(export(sys.stdin.read(),Path('/data/service-token').read_text().strip()),indent=2))
    except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
