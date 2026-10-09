"""Cancel only an older controller stuck in the removed, read-only SKU catalog query."""
import os
from pathlib import Path
import signal
import subprocess

records = {}
for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid=,command='], text=True).splitlines():
    parts = line.strip().split(None, 2)
    if len(parts) == 3:
        records[int(parts[0])] = (int(parts[1]), parts[2])
for pid, (_, command) in records.items():
    if command != 'bash scripts/azure/deploy-vm-demo.sh' or pid == os.getppid():
        continue
    cwd = subprocess.check_output(['lsof', '-a', '-p', str(pid), '-d', 'cwd', '-Fn'], text=True)
    if 'n' + str(Path.cwd().resolve()) not in cwd.splitlines():
        continue
    descendants = {pid}
    while True:
        updated = descendants | {child for child, (parent, _) in records.items() if parent in descendants}
        if updated == descendants:
            break
        descendants = updated
    if not any('vm list-skus --location canadacentral --size Standard_B2pts_v2' in records[child][1]
               for child in descendants):
        raise SystemExit('Another deployment is already active; refusing concurrent provisioning.')
    os.kill(pid, signal.SIGKILL)
    for child in descendants - {pid}:
        try:
            os.kill(child, signal.SIGTERM)
        except ProcessLookupError:
            pass
    print('Stopped the older read-only SKU preflight in this same workspace.')
