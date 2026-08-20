import {spawn} from 'node:child_process'

interface PickerInvocation {
  args: string[]
  command: string
  output: 'json' | 'lines'
}

export interface ReferenceFilePickerRequest {
  extensions?: readonly string[]
  multiple: boolean
  title: string
}

export interface ReferenceFilePickerProcessResult {
  exitCode: number
  stderr: string
  stdout: string
}

interface ReferenceFilePickerOptions {
  platform?: NodeJS.Platform
  run?: (
    command: string,
    args: string[],
  ) => Promise<ReferenceFilePickerProcessResult>
}

export function createReferenceFilePicker(
  options: ReferenceFilePickerOptions = {},
): (request: ReferenceFilePickerRequest) => Promise<string[]> {
  const platform = options.platform ?? process.platform
  const run = options.run ?? runProcess

  return async (request) => {
    const invocation = pickerInvocation(platform, request)
    const result = await run(invocation.command, invocation.args)

    if (result.exitCode !== 0) {
      if (pickerWasCancelled(platform, result)) {
        return []
      }
      const detail = result.stderr.trim()
      throw new Error(
        detail.length === 0
          ? 'The system file picker could not be opened.'
          : `The system file picker could not be opened: ${detail}`,
      )
    }

    return invocation.output === 'json'
      ? parseJsonPaths(result.stdout)
      : parseLinePaths(result.stdout)
  }
}

export const openReferenceFilePicker = createReferenceFilePicker()

function pickerInvocation(
  platform: NodeJS.Platform,
  request: ReferenceFilePickerRequest,
): PickerInvocation {
  const extensions = normalizeExtensions(request.extensions)
  if (platform === 'win32') {
    const patterns =
      extensions.length === 0
        ? '*.*'
        : extensions.map((extension) => `*${extension}`).join(';')
    const filterName =
      extensions.length === 0 ? 'All files' : 'Supported files'
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      '$dialog = New-Object System.Windows.Forms.OpenFileDialog',
      `$dialog.Title = '${escapePowerShellLiteral(request.title)}'`,
      `$dialog.Filter = '${filterName} (${patterns})|${patterns}'`,
      `$dialog.Multiselect = $${request.multiple}`,
      '$dialog.CheckFileExists = $true',
      'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
      '  $dialog.FileNames | ConvertTo-Json -Compress',
      "} else { '[]' }",
    ].join('; ')
    return {
      args: [
        '-NoLogo',
        '-NoProfile',
        '-STA',
        '-Command',
        script,
      ],
      command: 'powershell.exe',
      output: 'json',
    }
  }

  if (platform === 'darwin') {
    return {
      args: [
        '-e',
        `set selectedFiles to choose file with prompt "${escapeAppleScriptString(request.title)}"${request.multiple ? ' with multiple selections allowed' : ''}`,
        '-e',
        'set selectedPaths to {}',
        '-e',
        'repeat with selectedFile in selectedFiles',
        '-e',
        'set end of selectedPaths to POSIX path of selectedFile',
        '-e',
        'end repeat',
        '-e',
        "set AppleScript's text item delimiters to linefeed",
        '-e',
        'return selectedPaths as text',
      ],
      command: 'osascript',
      output: 'lines',
    }
  }

  if (platform === 'linux') {
    const fileFilter =
      extensions.length === 0
        ? undefined
        : `Supported files | ${extensions
            .map((extension) => `*${extension}`)
            .join(' ')}`
    return {
      args: [
        '--file-selection',
        ...(request.multiple ? ['--multiple'] : []),
        '--separator=\n',
        `--title=${request.title}`,
        ...(fileFilter === undefined
          ? []
          : [`--file-filter=${fileFilter}`]),
      ],
      command: 'zenity',
      output: 'lines',
    }
  }

  throw new Error(
    `The system file picker is not supported on ${platform}.`,
  )
}

function parseJsonPaths(stdout: string): string[] {
  const value = stdout.trim()
  if (value.length === 0) {
    return []
  }
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed === 'string') {
    return [parsed]
  }
  if (
    Array.isArray(parsed) &&
    parsed.every((item): item is string => typeof item === 'string')
  ) {
    return parsed
  }
  throw new Error('The system file picker returned invalid paths.')
}

function parseLinePaths(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .filter((path) => path.length > 0)
}

function pickerWasCancelled(
  platform: NodeJS.Platform,
  result: ReferenceFilePickerProcessResult,
): boolean {
  return (
    (platform === 'darwin' &&
      result.exitCode === 1 &&
      /user canceled/i.test(result.stderr)) ||
    (platform === 'linux' &&
      result.exitCode === 1 &&
      result.stderr.trim().length === 0)
  )
}

function runProcess(
  command: string,
  args: string[],
): Promise<ReferenceFilePickerProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: 'pipe',
    })
    let stderr = ''
    let stdout = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
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
}

function normalizeExtensions(
  extensions: readonly string[] | undefined,
): string[] {
  if (extensions === undefined) {
    return []
  }
  return extensions.map((extension) => {
    const normalized = extension.toLowerCase()
    if (!/^\.[a-z0-9]+$/.test(normalized)) {
      throw new Error(`Invalid file extension filter: ${extension}`)
    }
    return normalized
  })
}

function escapePowerShellLiteral(value: string): string {
  return value.replaceAll("'", "''")
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}
