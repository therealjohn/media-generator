# Keep Speech configuration private and separate from deployments

Azure Speech voices are not Foundry Model Deployments, so Media Gen stores the Speech resource endpoint, API key, and default Voice in the machine-local Local Profile and resolves the optional Explainer `voice` role from that Speech Connection only when Voice is selected. Foundry discovery remains limited to deployable image and video models, while Settings and `mg configure speech` expose only non-secret Speech status after saving the key.
