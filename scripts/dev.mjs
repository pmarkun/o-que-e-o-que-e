import { spawn } from 'node:child_process'

const processes = [
  spawn(process.execPath, ['--env-file-if-exists=.env.local', '--watch', 'server/index.mjs'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' }),
]

let stopping = false

function stop(signal = 'SIGTERM') {
  if (stopping) return
  stopping = true
  for (const child of processes) child.kill(signal)
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (!stopping && code) process.exitCode = code
    stop()
  })
}

process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
