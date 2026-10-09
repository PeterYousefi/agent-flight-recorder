"""Archive reviewed source for the VM build, excluding ignored/private local files."""
import subprocess
import tarfile
from pathlib import Path

files = subprocess.check_output(
    ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z']
).decode().split('\0')
allowed_roots = {'apps', 'packages', 'infra', 'scripts'}
allowed_files = {
    'Dockerfile', '.dockerignore', 'package.json', 'pnpm-lock.yaml',
    'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.base.json', '.npmrc',
}
target = Path('.env.azure-vm-source.tar.gz')
target.touch(mode=0o600, exist_ok=True)
target.chmod(0o600)
count = 0
with tarfile.open(target, 'w:gz') as archive:
    for name in sorted(set(files)):
        path = Path(name)
        if not name or (path.parts[0] not in allowed_roots and name not in allowed_files):
            continue
        if any(part.startswith('.env') or part in {'node_modules', 'dist'} for part in path.parts):
            raise SystemExit('Private/build file found in source archive selection')
        if path.is_symlink() or not path.is_file():
            continue
        archive.add(path, arcname=name, recursive=False)
        count += 1
print(f'Cloud build archive: {count} source files, {target.stat().st_size} bytes')
