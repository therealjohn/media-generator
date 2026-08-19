#!/usr/bin/env node

import {homedir} from 'node:os'
import {join} from 'node:path'

import {runCli} from './adapters/cli/run-cli.js'

process.exitCode = await runCli(process.argv.slice(2), {
  bin: 'mg',
  cwd: process.cwd(),
  env: process.env,
  mediaGenHome: join(homedir(), '.media-gen'),
  stderr: (text) => process.stderr.write(text),
  stdout: (text) => process.stdout.write(text),
})
