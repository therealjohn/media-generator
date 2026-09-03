# Security Policy

## Supported versions

Media Gen is an early prototype. Security fixes are applied only to the default
branch. Older revisions and forks are not maintained by this project.

| Version | Supported |
| --- | --- |
| Default branch | Yes |
| Older revisions | No |

## Reporting a vulnerability

Use GitHub private vulnerability reporting for this repository when it is
available. Otherwise contact a repository maintainer through a private
channel listed on their GitHub profile. Do not open a public issue for
suspected vulnerabilities, exposed credentials, or private workspace data.

Include the affected version, reproduction steps, impact, and any suggested
mitigation. Do not include live API keys, access tokens, customer media, or
other sensitive data. If a credential may have been exposed, revoke or rotate
it before reporting.

Please allow maintainers time to investigate before public disclosure. This
community-maintained project does not promise a response or remediation SLA.

## Safe research

Test only with accounts, resources, files, and systems you are authorized to
use. Do not access other people's data, degrade shared services, or retain
sensitive information. Stop testing and report the issue if you encounter
credentials, private media, or data that is not yours.

## Security boundaries

- `mg serve` accepts loopback hosts and loopback browser origins only.
- Microsoft Foundry and Azure Speech credentials are sent only to validated
  Azure service hostnames.
- Azure access tokens remain in memory.
- Azure Speech API keys are stored in the machine-local Local Profile and are
  never returned by Settings APIs or structured CLI output.
- Reference files and Creative Brief content are sent to the configured model
  provider when a Generation is submitted.

Provider availability, provider content-policy decisions, and vulnerabilities
in Microsoft-hosted services should be reported to the relevant service owner.
Vulnerabilities in Media Gen's handling of those services belong here.
