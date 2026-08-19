import {spawn} from 'node:child_process'
import {extname} from 'node:path'

import type {
  ProcessResult,
  ProcessRunner,
} from './auth-module.js'

export function createChildProcessRunner(): ProcessRunner {
  return {
    async run(command, args, options) {
      return new Promise<ProcessResult>((resolve, reject) => {
        const interactive = options?.interactive === true
        const invocation = resolveInvocation(command, args)
        const child = spawn(invocation.command, invocation.args, {
          shell: false,
          stdio: interactive ? 'inherit' : 'pipe',
        })

        let stderr = ''
        let stdout = ''
        child.stderr?.setEncoding('utf8')
        child.stderr?.on('data', (data: string) => {
          stderr += data
        })
        child.stdout?.setEncoding('utf8')
        child.stdout?.on('data', (data: string) => {
          stdout += data
        })
        child.on('error', reject)
        child.on('close', (exitCode) => {
          resolve({
            exitCode: exitCode ?? 1,
            stderr,
            stdout,
          })
        })
      })
    },
  }

  function resolveInvocation(
    command: string,
    args: string[],
  ): {args: string[]; command: string} {
    if (process.platform === 'win32' && extname(command) === '') {
      return {
        args: ['/d', '/s', '/c', command, ...args],
        command: process.env.ComSpec ?? 'cmd.exe',
      }
    }

    return {args, command}
  }
}
