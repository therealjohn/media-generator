# Do not persist internal Model Prompts

Generation records store the user's Creative Brief, selected Generator or Scenario, Style or Preset, Production Options, references, and model identity, but not the internally assembled provider prompt. This keeps persisted history focused on user intent and avoids retaining provider-facing prompt content, while accepting that an old Generation cannot be reproduced exactly after catalog instructions change.
