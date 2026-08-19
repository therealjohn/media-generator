# Use the filesystem as the authoritative Generation store

Each Generation will have a self-contained directory and JSON record under the user-level Media Workspace. The CLI owns atomic state transitions and per-record locking; indexes are disposable. This keeps state inspectable and recoverable without a database, at the cost of implementing careful concurrency, migration, and cleanup behavior.
