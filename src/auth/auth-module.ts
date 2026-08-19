import {z} from 'zod'

export interface ProcessResult {
  exitCode: number
  stderr: string
  stdout: string
}

export interface ProcessRunner {
  run(
    command: string,
    args: string[],
    options?: {interactive?: boolean},
  ): Promise<ProcessResult>
}

export interface SignedInAuthStatus {
  account: {
    name: string
    type: string
  }
  state: 'signed-in'
  subscription: {
    id: string
    name: string
  }
  tenantId: string
}

export interface SignedOutAuthStatus {
  help: string[]
  state: 'signed-out'
}

export interface UnavailableAuthStatus {
  help: string[]
  state: 'unavailable'
}

export type AuthStatus =
  | SignedInAuthStatus
  | SignedOutAuthStatus
  | UnavailableAuthStatus

export interface AuthModule {
  login(): Promise<{state: 'login-completed'}>
  logout(): Promise<{state: 'logout-completed'}>
  status(): Promise<AuthStatus>
}

const azureAccountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tenantId: z.string().min(1),
  user: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
  }),
})

export function createAuthModule(
  processRunner: ProcessRunner,
): AuthModule {
  return {
    async login() {
      const result = await processRunner.run('az', ['login'], {
        interactive: true,
      })
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || 'Azure CLI login failed')
      }

      return {state: 'login-completed'}
    },
    async logout() {
      const result = await processRunner.run('az', ['logout'])
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || 'Azure CLI logout failed')
      }

      return {state: 'logout-completed'}
    },
    async status() {
      let result: ProcessResult
      try {
        result = await processRunner.run('az', [
          'account',
          'show',
          '--output',
          'json',
        ])
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          return {
            help: [
              'Install Azure CLI: https://learn.microsoft.com/cli/azure/install-azure-cli',
            ],
            state: 'unavailable',
          }
        }

        throw error
      }
      if (result.exitCode !== 0) {
        return {
          help: ['Run `mg auth login`'],
          state: 'signed-out',
        }
      }

      const account = azureAccountSchema.parse(
        JSON.parse(result.stdout),
      )

      return {
        account: account.user,
        state: 'signed-in',
        subscription: {
          id: account.id,
          name: account.name,
        },
        tenantId: account.tenantId,
      }
    },
  }
}
