# Persistent MaleCNS trainer

This package includes the exact retained MaleCNS v1.0 graph and source code for the studio's first reproducible experiment. It is a computational rate model, not a reconstruction of every physiological parameter.

## Self-service setup from the website

Open **Experiment → Compute → Connect a machine → My computer**. Download and extract this kit. Install and start Docker Desktop (macOS or Windows), or Docker Engine with Compose (Linux). Allow at least 8 GB available memory and several GB free disk. CPU only; Apple Silicon uses Linux/amd64 emulation.

Run the launcher from the extracted folder:

- macOS: `bash Start-Mac.command`
- Windows PowerShell: `powershell -ExecutionPolicy Bypass -File .\Start-Windows.ps1`
- Linux: `bash Start-Linux.sh`

The first build downloads pinned Python dependencies and can take several minutes. The trainer generates its own random secret in the persistent Docker volume. An authenticated Cloudflare Quick Tunnel connects the website to the trainer without publishing a host port. When the launcher says READY, return to **Compute** and import `connection.json`, then choose **Verify & connect**. The website verifies the actual full graph before saving an encrypted, account-private connection. No website administrator or server environment change is required.

Keep `connection.json` private: it contains the trainer credential. Do not send it in chat or commit it to source control. The website stores its secret encrypted and does not return it in the connection list or send it to an LLM.

### Persistence and reconnecting

Keep Docker running and the machine awake. Closing the browser or launcher does not stop training. Runs are stored in the `drosophila-compute_connected-runs` Docker volume. Do not delete that volume. Back it up before moving the trainer.

Stop using `docker compose -p drosophila-compute -f connect-compose.yaml stop`. Rerun the launcher to restart. Quick Tunnel addresses can change after a tunnel restart: use **Compute → Manage your machine → Import connection file** to replace the existing connection using the newly generated `connection.json`. This preserves the machine's run history. Use only one copy of this setup kit per computer; the Docker project name deliberately reuses its existing persistent volume.

Cloudflare Quick Tunnels are for personal testing and have no uptime guarantee. They are not a production hosting contract. See https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/ . For a stable deployment, use the existing-server option with a permanent HTTPS endpoint.

## Connect an existing server

The original `compose.yaml` remains available for operators. Generate a secret of at least 32 random characters and set `LAB_SERVICE_TOKEN` in `.env`, then run `docker compose up --build -d`. Expose its authenticated loopback service through a stable HTTPS reverse proxy or managed tunnel. Preserve Authorization and X-Lab-Owner; do not log credentials.

Each user opens **Compute → Existing server**, enters a machine name, root HTTPS URL and trainer secret, and selects **Verify & connect**. Connections can be checked, replaced or removed from the same menu. Removing a connection revokes website access but does not stop the machine or delete its data. The legacy site-wide environment connection remains compatible for previously configured installations.

## First experiment

Tell the Experiment chat you want to remember a cue. Discuss the goal, inherited neuron copies, seeds and budget. Review the inline specification, then start. Validation chooses checkpoints before held-out testing. A tie or regression is a valid result, and repeated tuning against the same test set remains exploratory.

## Reproduce or verify an experiment

For direct Python execution use Python 3.12 and install `research/lab/requirements.lock` (PyTorch CPU wheels are at https://download.pytorch.org/whl/cpu). Run commands from the package root:

```bash
python -m research.lab.engine --graph graph --config experiment-config.json --out runs/reproduction
python -m research.lab.engine --graph graph --out runs/reproduction --replay
python -m research.lab.test_lab
```

Download all artifacts listed in the studio's **Reproduce** section into one directory to replay a hosted run. Download the Artifact checksums file as `artifacts.json` into that same directory. The replay verifier checks source and artifact hashes, trained parameter hashes and held-out predictions. Exact equality is guaranteed only by verification on the same pinned CPU environment; timing varies.

Interrupted runs resume by invoking the same command and output directory. A changed graph, code, configuration, PyTorch/NumPy version or thread count causes resume to fail explicitly. Current optimizer state, best checkpoint, minibatch generator state and completed update number are saved after each update. A corrupted checkpoint fails rather than silently restarting.

## API

All routes require `Authorization: Bearer <trainer-secret>` and `X-Lab-Owner: <64 lowercase hex characters>`. The owner header is trusted only because the caller holds the server secret. Keep that secret limited to the studio and operators.

- `GET /health`: engine, graph and connection status.
- `GET /jobs`: owner-scoped saved runs.
- `POST /jobs`: `{ "requestKey": "unique-retry-stable-key", "config": { ... } }`. Reusing the key with the same configuration returns the same job.
- `GET /jobs/{id}`: immutable specification, progress, result and artifact index.
- `POST /jobs/{id}/pause`, `/resume`, `/cancel`: lifecycle controls.
- `GET /jobs/{id}/artifacts/{name}`: completed artifacts only, with SHA256 header.

There is one CPU executor and at most ten active/queued jobs. Default per-execution time limit is six hours. Failed runs retain a checkpoint. Pausing and cancellation occur at safe computation boundaries. Timing includes neural inference only, not training, HTTP transport or rendering.

## Data and limitations

Source: FlyEM / HHMI Janelia, University of Cambridge, MRC LMB and Google Research, MaleCNS v1.0, CC BY 4.0. The included `graph/manifest.json` records source URLs, source hashes, preprocessing and class counts. Retained graph: 165,122 Traced neurons; 6,235,682 directed pairs with at least five observed synapses. Counts represent aggregated observed contacts. GABA is negative; other/unknown transmitters are positive, an explicit approximation. Copies inherit adjacency and source body IDs; no physiological claim is attached to them.

This milestone does not provide GPU execution, embodied locomotion, arbitrary code execution, autonomous architecture search or a biologically validated fly simulation.
