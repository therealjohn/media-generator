# Separate Generators from Scenarios

Image and Video are general-purpose Generators, while a Scenario is a named media deliverable with its own Presets, Production Options, routing roles, and workflow. We chose separate creation paths instead of forcing every deliverable through one generation form so focused workflows such as Explainer video and Short-form video can evolve behind the same `MediaGenApplication` interface without productized names or Scenario-specific flags leaking into the general Generators.
