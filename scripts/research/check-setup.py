import io,json,os,stat,tempfile,unittest,zipfile,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT))
from research.lab.connected import service_token
from research.lab.connection_export import export
class SetupTests(unittest.TestCase):
 def test_secret_survives_restart(self):
  with tempfile.TemporaryDirectory() as root:
   a=service_token(root);self.assertGreaterEqual(len(a),48);self.assertEqual(a,service_token(root));self.assertEqual(stat.S_IMODE((Path(root)/'service-token').stat().st_mode),0o600)
 def test_export_checks_running_graph(self):
  seen=[]
  def opener(req,timeout):
   seen.append(req);return io.BytesIO(json.dumps({'graphSha256':'729b2b60c7759ead12163cc30daa2b8a3abf8565f0f5773f19fde20cfaa14f7b'}).encode())
  d=export('https://old-name.trycloudflare.com\nhttps://new-name.trycloudflare.com','test-only-credential',opener)
  self.assertEqual(d['url'],'https://new-name.trycloudflare.com');self.assertEqual(d['token'],'test-only-credential');self.assertEqual(seen[0].full_url,'http://127.0.0.1:8000/health')
  with self.assertRaises(RuntimeError):export('not ready','test-only',opener)
 def test_package(self):
  with zipfile.ZipFile(ROOT/'public/research/persistent-trainer.zip') as z:
   for p in ['Start-Mac.command','Start-Windows.ps1','Start-Linux.sh','connect-compose.yaml','research/lab/connected.py','research/lab/connection_export.py','graph/counts.npz']:self.assertIn(p,z.namelist())
   self.assertNotIn('connection.json',z.namelist());self.assertNotIn('ports:',z.read('connect-compose.yaml').decode());self.assertIn('connection.json',z.read('.gitignore').decode())
unittest.main()
