"""Supabase Postgres adapter for the executor's durable queue.

All statements are server constants. Queue transitions take a transaction-scoped
table lock, preserving the single-executor store's serialization semantics.
"""
import re
import psycopg

class Row(dict):
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)

def row_factory(cursor):
    names = [column.name for column in cursor.description] if cursor.description else []
    return lambda values: Row(zip(names, values))

class Connection:
    def __init__(self, url):
        self.connection = psycopg.connect(url, options="-c search_path=lab,public", row_factory=row_factory)
    def __enter__(self):
        self.connection.__enter__()
        return self
    def __exit__(self, *args):
        return self.connection.__exit__(*args)
    def execute(self, sql, params=()):
        if sql == "BEGIN IMMEDIATE":
            return self.connection.execute("LOCK TABLE jobs IN SHARE ROW EXCLUSIVE MODE")
        return self.connection.execute(sql.replace("?", "%s"), params)
