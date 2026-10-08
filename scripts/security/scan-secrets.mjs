import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, lstatSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const binary = process.env.GITLEAKS_BIN ?? 'gitleaks'
function scan(args) {
  const result = spawnSync(binary, args, { cwd: root, stdio: 'inherit', shell: false })
  if (result.error)
    throw new Error('Install Gitleaks 8.30.1 or set GITLEAKS_BIN to its executable path')
  if (result.status !== 0)
    throw new Error('Secret scan failed; review redacted findings before committing')
}
scan(['git', '.', '--redact', '--log-opts=--all'])
const temporary = mkdtempSync(join(tmpdir(), 'afr-secret-scan-'))
try {
  // Scan tracked and non-ignored new files. Never read real ignored environment files.
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root },
  )
    .toString()
    .split('\0')
    .filter(Boolean)
  for (const relative of new Set(files)) {
    const source = resolve(root, relative)
    let stat
    try {
      stat = lstatSync(source)
    } catch {
      continue
    }
    if (!stat.isFile() || stat.isSymbolicLink()) continue
    const target = join(temporary, relative)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
  }
  scan(['dir', temporary, '--redact', '--gitleaks-ignore-path', join(root, '.gitleaksignore')])
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
