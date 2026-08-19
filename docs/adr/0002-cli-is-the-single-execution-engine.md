# Make the CLI the single execution engine

The Agent Skill and Local UI will delegate generation, configuration, persistence, and provider interaction to the same CLI application module. This prevents provider and workspace behavior from drifting across channels and gives tests one interface, while requiring the local HTTP adapter and skill to remain thin.
