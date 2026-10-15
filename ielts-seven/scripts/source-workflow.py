#!/usr/bin/env python3
"""Portable source packaging fallback; credentials exist only on stdin/in memory."""
import json, os, sys, subprocess, tarfile, tempfile, pathlib, termios

root = pathlib.Path(__file__).resolve().parent.parent
manifest = json.loads((root / '.openai/hosting.json').read_text())
old = None
if sys.stdin.isatty():
    old = termios.tcgetattr(sys.stdin)
    hidden = termios.tcgetattr(sys.stdin)
    hidden[3] &= ~termios.ECHO
    termios.tcsetattr(sys.stdin, termios.TCSADRAIN, hidden)
print('Ready for Site workflow JSON on stdin (input is hidden).', flush=True)
try:
    request = json.loads(sys.stdin.readline())
finally:
    if old is not None: termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old)
credential = request['credential']
project = manifest['project_id']
if project not in credential['remote_url']: raise ValueError('Repository does not match this Site')
if credential['auth_mode'] != 'http_extra_header': raise ValueError('Unsupported authentication mode')
env = dict(os.environ)
env.update(GIT_CONFIG_COUNT='1', GIT_CONFIG_KEY_0='http.extraHeader',
           GIT_CONFIG_VALUE_0='Authorization: Bearer ' + credential['token'], GIT_TERMINAL_PROMPT='0')
for key in list(env):
    if key.startswith('GIT_TRACE') or key == 'GIT_CURL_VERBOSE': env.pop(key)
def run(args, secret=False):
    result = subprocess.run(args, cwd=root, env=env if secret else None,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        message = result.stderr.replace(credential['token'], '[redacted]')
        raise RuntimeError('Command failed: ' + args[0] + '\n' + message)
    return result.stdout.strip()
if not (root / '.git').exists():
    run(['git','init','-b',credential['branch']])
    run(['git','config','user.name','Codex'])
    run(['git','config','user.email','codex@openai.com'])
    run(['git','remote','add','origin',credential['remote_url']])
run(['git','add','-A'])
if run(['git','status','--porcelain']):
    run(['git','commit','-m',request.get('message','Build IELTS learning studio')])
run(['git','push','origin','HEAD:' + credential['branch']], secret=True)
commit = run(['git','rev-parse','HEAD'])
archive = pathlib.Path(request['archivePath']).resolve()
with tempfile.TemporaryDirectory() as tmp:
    raw = subprocess.run(['git','archive',commit], cwd=root, stdout=subprocess.PIPE, check=True).stdout
    source_tar = pathlib.Path(tmp) / 'source.tar'
    source_tar.write_bytes(raw)
    with tarfile.open(source_tar) as inp: inp.extractall(tmp, filter='data')
    with tarfile.open(archive,'w:gz') as out:
        if manifest.get('static'):
            out.add(pathlib.Path(tmp) / '.openai/hosting.json', arcname='.openai/hosting.json')
            out.add(pathlib.Path(tmp) / manifest['static']['directory'], arcname=manifest['static']['directory'])
        else:
            build = subprocess.run(['node','scripts/build-worker.mjs'], cwd=tmp, capture_output=True, text=True)
            if build.returncode: raise RuntimeError(build.stderr)
            out.add(pathlib.Path(tmp) / '.openai/hosting.json', arcname='.openai/hosting.json')
            out.add(pathlib.Path(tmp) / '.artifact', arcname='dist')
print(json.dumps({'project_id':project,'commit_sha':commit,'archive':str(archive)}), flush=True)
