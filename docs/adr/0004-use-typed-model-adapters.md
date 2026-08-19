# Use typed model adapters with declarative configuration

Executable provider behavior will live in typed CLI adapters, while `.mg/config.json` contains only endpoints, deployment mappings, enabled built-ins, and routing choices. This keeps arbitrary HTTP recipes out of repositories and concentrates provider changes behind a real adapter seam, at the cost of requiring a CLI release for each new API family.
