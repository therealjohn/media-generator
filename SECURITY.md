# Security Policy

## Supported versions

Media Gen is an early prototype. Security fixes are applied to the latest
release and the default branch.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository when it is
available. Otherwise contact a repository maintainer through a private
channel listed on their GitHub profile. Do not open a public issue for
suspected vulnerabilities, exposed credentials, or private workspace data.

Include the affected version, reproduction steps, impact, and any suggested
mitigation. Do not include live API keys, access tokens, customer media, or
other sensitive data. If a credential may have been exposed, revoke or rotate
it before reporting.

## Security boundaries

- `mg serve` accepts loopback hosts and loopback browser origins only.
- Microsoft Foundry and Azure Speech credentials are sent only to validated
  Azure service hostnames.
- Azure access tokens remain in memory.
- Azure Speech API keys are stored in the machine-local Local Profile and are
  never returned by Settings APIs or structured CLI output.
- Reference files and Creative Brief content are sent to the configured model
  provider when a Generation is submitted.
