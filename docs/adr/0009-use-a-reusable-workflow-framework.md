# Use a reusable workflow framework for composed Scenarios

Multi-step Scenarios execute as typed workflow definitions over one reusable
workflow module. The module owns dependency scheduling, fan-out and join,
bounded concurrency, checkpoints, artifact tracking, progress, background
execution, failure state, and resume. Scenario definitions own their request
schemas, semantic plans, prompt factories, role requirements, and graph
composition.

Explainer video is the first implementation. It plans scenes, generates one
shared style reference, fans out video and Voice generation, composes the
results locally, and publishes one MP4. Future Scenarios reuse the same
model-generation and media-composition step handlers instead of adding
Scenario-specific runners.

Planning and generated reference-image selection are internal workflow
concerns. They resolve from eligible configured text deployments and the Image
Generator Auto route, respectively. They are not Scenario routing settings.
User Reference Sources remain explicit Generation inputs, while the generated
style reference remains a private working artifact supplied automatically to
each scene.

Workflow state is stored privately under the Generation's `working/`
directory. It contains semantic inputs and plans, never provider-facing Model
Prompts, tokens, or Speech keys. This adds framework code before a second
composed Scenario exists, but prevents scheduling, persistence, and recovery
logic from spreading through adapters and Scenario implementations.
