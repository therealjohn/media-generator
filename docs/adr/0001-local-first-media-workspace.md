# Use a local-first Media Workspace

Media Gen runs as a local CLI and loopback browser interface instead of a hosted application. Shared configuration lives in `.mg/config.json`, while private configuration, Generation records, and working media live under `~/.media-gen`; only explicit exports copy media into the Project Directory. This avoids operating a service and keeps history and working media under the user's control. Generation requests and selected references still leave the machine when they are sent to a configured provider.
