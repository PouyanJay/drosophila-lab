CREATE SCHEMA IF NOT EXISTS lab;
REVOKE ALL ON SCHEMA lab FROM PUBLIC, anon, authenticated;
CREATE TABLE lab.lab_records (
 id text PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN ('graph','run','study','study-run','browser-run','agent-session')),
 name text NOT NULL, created_at text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 payload text NOT NULL CHECK(jsonb_typeof(payload::jsonb)='object')
);
CREATE INDEX lab_records_kind_updated ON lab.lab_records(kind,updated_at DESC);
CREATE TABLE lab.provider_connections(id text PRIMARY KEY,user_id text NOT NULL,provider text NOT NULL,sealed_key text NOT NULL,key_hint text NOT NULL,updated_at text NOT NULL);
CREATE TABLE lab.compute_connections(id text PRIMARY KEY,user_id text NOT NULL,name text NOT NULL,url text NOT NULL,sealed_token text NOT NULL,updated_at text NOT NULL);
CREATE INDEX compute_connections_user ON lab.compute_connections(user_id);
CREATE TABLE lab.jobs(id text PRIMARY KEY,owner text NOT NULL,request_key text NOT NULL,config text NOT NULL,status text NOT NULL,created double precision NOT NULL,updated double precision NOT NULL,error text,UNIQUE(owner,request_key));
CREATE INDEX jobs_status_created ON lab.jobs(status,created);
REVOKE ALL ON ALL TABLES IN SCHEMA lab FROM PUBLIC, anon, authenticated;
