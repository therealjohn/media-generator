import {describe, expect, test} from 'vitest'

import {
  createAuthModule,
  type ProcessResult,
  type ProcessRunner,
} from '../../src/auth/auth-module.js'

describe('AuthModule', () => {
  test('reports when Azure CLI is unavailable', async () => {
    const auth = createAuthModule({
      run: async () => {
        throw Object.assign(new Error('spawn az ENOENT'), {
          code: 'ENOENT',
        })
      },
    })

    await expect(auth.status()).resolves.toEqual({
      help: [
        'Install Azure CLI: https://learn.microsoft.com/cli/azure/install-azure-cli',
      ],
      state: 'unavailable',
    })
  })

  test('delegates logout to Azure CLI', async () => {
    const auth = createAuthModule(
      new ExactProcessRunner('az', ['logout'], {
        exitCode: 0,
        stderr: '',
        stdout: '',
      }),
    )

    await expect(auth.logout()).resolves.toEqual({
      state: 'logout-completed',
    })
  })

  test('delegates login to Azure CLI', async () => {
    const auth = createAuthModule(
      new ExactProcessRunner('az', ['login'], {
        exitCode: 0,
        stderr: '',
        stdout: '',
      }),
    )

    await expect(auth.login()).resolves.toEqual({
      state: 'login-completed',
    })
  })

  test('reports when Azure CLI has no signed-in account', async () => {
    const auth = createAuthModule(
      new QueueProcessRunner([
        {
          exitCode: 1,
          stderr: 'Please run az login',
          stdout: '',
        },
      ]),
    )

    await expect(auth.status()).resolves.toEqual({
      help: ['Run `mg auth login`'],
      state: 'signed-out',
    })
  })

  test('reports the current Azure CLI identity', async () => {
    const runner = new QueueProcessRunner([
      {
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify({
          id: 'subscription-id',
          name: 'Developer Subscription',
          tenantId: 'tenant-id',
          user: {
            name: 'john@example.com',
            type: 'user',
          },
        }),
      },
    ])

    const auth = createAuthModule(runner)

    await expect(auth.status()).resolves.toEqual({
      account: {
        name: 'john@example.com',
        type: 'user',
      },
      state: 'signed-in',
      subscription: {
        id: 'subscription-id',
        name: 'Developer Subscription',
      },
      tenantId: 'tenant-id',
    })
  })
})

class ExactProcessRunner implements ProcessRunner {
  constructor(
    private readonly expectedCommand: string,
    private readonly expectedArgs: string[],
    private readonly result: ProcessResult,
  ) {}

  async run(
    command: string,
    args: string[],
  ): Promise<ProcessResult> {
    expect(command).toBe(this.expectedCommand)
    expect(args).toEqual(this.expectedArgs)
    return this.result
  }
}

class QueueProcessRunner implements ProcessRunner {
  constructor(private readonly results: ProcessResult[]) {}

  async run(): Promise<ProcessResult> {
    const result = this.results.shift()
    if (result === undefined) {
      throw new Error('No queued process result')
    }

    return result
  }
}
