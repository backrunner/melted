#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 Melted contributors
# SPDX-License-Identifier: GPL-3.0-or-later
"""Apple Container owns all local Node, PostgreSQL and workerd processes."""
import json
import hashlib
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parent.parent
LOCAL = REPO / '.local'
NODE = 'node:24-bookworm-slim'

def run(*args, capture=False, check=True, **kwargs):
    return subprocess.run(list(args), cwd=REPO, check=check, text=True,
                          stdout=subprocess.PIPE if capture else None, **kwargs)

def state(name):
    result = run('container', 'inspect', name, capture=True, check=False, stderr=subprocess.DEVNULL)
    return json.loads(result.stdout)[0] if result.returncode == 0 else None

def ensure(name, args):
    current = state(name)
    if current is None:
        run('container', 'run', '--detach', '--name', name, *args)
    elif current['status']['state'] != 'running':
        run('container', 'start', name)

def envfile(path, values):
    path.write_text(''.join(f'{key}={value}\n' for key, value in values.items()))
    path.chmod(0o600)

def execute(*args):
    run('container', 'exec', '--env-file', str(LOCAL/'node.env'), 'melted-tools', *args)

def setup():
    LOCAL.mkdir(exist_ok=True, mode=0o700)
    pg_env = LOCAL/'container-postgres.env'
    if not pg_env.exists():
        envfile(pg_env, {'POSTGRES_USER':'melted','POSTGRES_DB':'melted_dev',
                        'POSTGRES_PASSWORD':secrets.token_urlsafe(32),
                        'PGDATA':'/var/lib/postgresql/data/pgdata'})
    # A named volume survives container replacement. Never delete it in this script.
    if run('container', 'volume', 'inspect', 'melted-pg-data', capture=True, check=False, stderr=subprocess.DEVNULL).returncode:
        run('container', 'volume', 'create', 'melted-pg-data')
    ensure('melted-postgres', ['--env-file',str(pg_env),'--volume','melted-pg-data:/var/lib/postgresql/data','postgres:17-bookworm'])
    ensure('melted-tools', ['--cpus','4','--memory','3G','--publish','127.0.0.1:8787:8787',
                           '--volume',f'{REPO}:/workspace','--workdir','/workspace/server',NODE,'sleep','infinity'])
    for _ in range(30):
        if run('container','exec','melted-postgres','pg_isready','-U','melted',capture=True,check=False).returncode == 0:
            break
        time.sleep(1)
    else:
        raise SystemExit('PostgreSQL did not become ready; use container logs melted-postgres')
    ip = state('melted-postgres')['status']['networks'][0]['ipv4Address'].split('/')[0]
    values = dict(line.split('=',1) for line in pg_env.read_text().splitlines() if '=' in line)
    base = f"postgres://melted:{values['POSTGRES_PASSWORD']}@{ip}:5432/"
    envfile(LOCAL/'node.env', {'DATABASE_URL':base+'melted_dev','MELTED_TEST_DATABASE_URL':base+'melted_test',
                             'MELTED_SERVER_ID':'melted-local-development','MELTED_OPERATOR':'Melted 本机开发服务器',
                             'PUBLIC_ORIGIN':'http://127.0.0.1:8421','DEVELOPMENT_SAMPLES':'true'})
    exists=run('container','exec','melted-postgres','psql','-U','melted','-d','postgres','-Atc',
               "SELECT 1 FROM pg_database WHERE datname='melted_test'",capture=True).stdout.strip()
    if not exists: run('container','exec','melted-postgres','createdb','-U','melted','melted_test')
    dependency_hash = hashlib.sha256(b''.join(
        (REPO/'server'/name).read_bytes() for name in ['package.json', 'package-lock.json']
    )).hexdigest()
    installed = LOCAL/'container-dependencies.sha256'
    if not (REPO/'server/node_modules/.package-lock.json').exists() or not installed.exists() or installed.read_text() != dependency_hash:
        execute('npm','ci')
        installed.write_text(dependency_hash)
    execute('npm','run','migrate')
    print('Container database and tools ready')

def up():
    setup()
    execute('npm','run','build')
    old=state('melted-api')
    if old:
        if old['status']['state']=='running':run('container','stop','melted-api')
        run('container','delete','melted-api')
    ensure('melted-api',['--env-file',str(LOCAL/'node.env'),'--publish','127.0.0.1:8421:8421',
                         '--volume',f'{REPO}:/workspace','--workdir','/workspace/server',NODE,
                         'node','dist/server/src/entrypoints/node.js'])
    print('API: http://127.0.0.1:8421; Cloudflare emulator: python3 scripts/dev.py worker')

action=sys.argv[1] if len(sys.argv)>1 else 'up'
if action=='setup':setup()
elif action=='up':up()
elif action=='worker':execute('npx','wrangler','dev','--env','local','--ip','0.0.0.0','--port','8787','--local','--persist-to','.wrangler/local')
elif action=='check':
    execute('npm','run','check');execute('npm','run','format:check');execute('npm','test');execute('npm','run','worker:check')
elif action=='exec':execute(*sys.argv[2:])
elif action=='down':
    for name in ['melted-api','melted-tools','melted-postgres']:
        current=state(name)
        if current and current['status']['state']=='running':run('container','stop',name)
elif action=='logs':run('container','logs','melted-api')
else:raise SystemExit('Usage: dev.py setup|up|worker|check|exec COMMAND...|down|logs')
