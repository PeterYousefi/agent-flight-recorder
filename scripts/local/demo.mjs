import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
// Demo always uses local emulators and mock providers, independent of .env.
const env = {
  ...process.env,
  SAPIOM_ENABLED: 'false',
  DATABASE_URL: 'postgresql://afr_user:afr_password@localhost:5434/agent_flight_recorder',
  AZURE_SERVICE_BUS_CONNECTION_STRING:
    'Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;',
  AZURE_STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true',
  API_PORT: '3000',
  OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
  VITE_API_BASE_URL: 'http://localhost:3000',
}
delete env.SAPIOM_API_KEY
const children = []
function start(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: false,
    detached: process.platform !== 'win32',
  })
  children.push(child)
  return child
}
function command(executable, args) {
  return new Promise((resolve, reject) => {
    const child = start(executable, args)
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${executable} exited ${code}`)),
    )
  })
}
async function waitFor(url) {
  for (let n = 0; n < 180; n++) {
    if (stopping) throw new Error('Startup interrupted')
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3000) })).ok) return
    } catch {}
    await delay(1000)
  }
  throw new Error('Local readiness timed out')
}
let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  for (const child of children)
    if (child.exitCode === null) {
      try {
        if (process.platform === 'win32') child.kill('SIGTERM')
        else if (child.pid !== undefined) process.kill(-child.pid, 'SIGTERM')
      } catch {
        /* Child already exited. */
      }
    }
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', () =>
      reject(
        new Error(`Local port ${port} is already in use; stop the existing application first`),
      ),
    )
    server.listen(port, '127.0.0.1', () => server.close(resolve))
  })
}
try {
  await checkPort(3000)
  await checkPort(5173)
  await command('docker', ['compose', '--profile', 'observability', 'up', '-d'])
  await command('pnpm', ['build'])
  await command('pnpm', ['--filter', '@afr/persistence', 'prisma:migrate:deploy'])
  start('pnpm', ['--filter', '@afr/api', 'start'])
  start('pnpm', ['--filter', '@afr/worker', 'start'])
  await waitFor('http://127.0.0.1:3000/api/v1/ready')
  start('pnpm', ['--filter', '@afr/web', 'dev', '--host', '127.0.0.1'])
  await waitFor('http://127.0.0.1:5173')
  process.stdout.write(
    '\nAgent Flight Recorder: http://localhost:5173\nDemo Lab: http://localhost:5173/demo-lab\nAPI docs: http://localhost:3000/api/docs\nGrafana: http://localhost:3001/d/afr-operations\nSapiom: disabled. Azure resources: none. Azure cost: $0.\nCtrl+C stops applications; local Docker data remains available.\n',
  )
} catch (error) {
  if (!stopping) process.stderr.write(`Demo startup failed: ${error.message}\n`)
  process.exitCode = stopping ? 0 : 1
  stop()
}
