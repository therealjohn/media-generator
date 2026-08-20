# Enterprise Media Generation

This context defines the language for an enterprise product that helps people create governed image and video assets.

## Language

**Business Creator**:
An enterprise user who creates image or video assets for marketing, communications, or product work without needing model-specific expertise.
_Avoid_: End user, marketer, content creator

**Technical Business Creator**:
A Business Creator who is comfortable working in a project directory and launching local tools from a terminal.
_Avoid_: Power user

**Generator**:
A general-purpose Image or Video creation surface for freeform requests. It exposes a Creative Brief, references, recommended Styles, media controls, and model selection without prescribing a specific business output.
_Avoid_: Scenario, model

**Scenario**:
A named media deliverable with a purpose-built workflow for creating it, such as an explainer video, short-form video, product hero, or feature highlight. Each Scenario presents only the inputs, Presets, and Production Options relevant to that deliverable.
_Avoid_: Generator, model, raw generation form

**Style**:
The intended visual or motion character applied directly in a Generator, such as cinematic, handheld UGC, minimal studio, or editorial illustration. A Scenario can incorporate Styles through its Presets.
_Avoid_: Scenario, Preset, model

**Preset**:
A named reusable bundle of creative and production choices scoped to a Generator or Scenario. A Preset can be built in or created from saved choices and references.
_Avoid_: Scenario, Style

**Production Option**:
An independent Scenario choice that changes how its media is produced, such as subtitles, voice, language, duration, or orientation.
_Avoid_: Style, Preset

**Creative Brief**:
The Business Creator's natural-language description of the content they want to produce.
_Avoid_: Model Prompt

**Model Prompt**:
The transient provider-facing instruction assembled internally by the CLI from a Creative Brief and the selected Generator or Scenario, Style or Preset, Reference Sources, Production Options, and model guidance. It is not exposed or persisted.
_Avoid_: Creative Brief

**Eligible Model**:
A media model approved for a Generator or Scenario role because it supports the required capabilities and policies.
_Avoid_: Available model, supported model

**Auto Selection**:
The default choice that resolves to a workspace-configured Model Deployment. Other configured candidates require explicit approval after a failure, and the resolved model remains visible to the Business Creator.
_Avoid_: Default model

**Model Provider**:
A service that exposes media models for generation, such as Microsoft Foundry.
_Avoid_: Vendor, model host

**Model Deployment**:
A configured, callable instance of a media model available through a Model Provider.
_Avoid_: Endpoint, provider model

**Agent Skill**:
A local coding-agent workflow that invokes the CLI to generate and manage media in a Media Workspace. It can operate without the Local UI.
_Avoid_: Platform API client

**Media Workspace**:
The user-local working area associated with a Project Directory. It holds private configuration, reference metadata, generation records, and working media shared by the Agent Skill, CLI, and Local UI.
_Avoid_: Project Directory, tenant, cloud workspace

**Project Directory**:
The directory where the CLI is initialized. It holds the Workspace Manifest and explicitly exported final assets, but not working generations.
_Avoid_: Media Workspace, Git repository

**Exported Asset**:
A selected generated image or video deliberately copied from a Media Workspace into its Project Directory for use by the project.
_Avoid_: Draft, working generation

**Generation**:
One recorded request to create or transform media, including its inputs, outcome, and any resulting assets.
_Avoid_: Exported Asset, file

**Reference Source**:
Supporting material used to ground a Generation. A Reference Source is a Reference Asset, Text Reference, or Web Reference.
_Avoid_: Creative Brief, Model Prompt

**Reference Asset**:
An existing local file used as generation input through its original path. It remains outside the Media Workspace and can become unavailable if it moves or changes.
Workflow-generated consistency images are private working artifacts, not Reference Assets or user setup.
_Avoid_: Text Reference, Web Reference, Exported Asset, generated asset

**Text Reference**:
Plain text or Markdown supplied directly as grounding material. It is stored privately with the Generation so the source content remains available for inspection and Recreate.
_Avoid_: Creative Brief, Web Reference

**Web Reference**:
An HTTP or HTTPS URL recorded as source provenance. Media Gen does not retrieve its content; a Business Creator or Agent must read the page and incorporate the relevant information into the Creative Brief or a Text Reference.
_Avoid_: Reference Asset, fetched webpage

**Edit**:
Creating a new Generation from a prior generated asset as a reference plus a new Creative Brief.
_Avoid_: Mutating a Generation

**Recreate**:
Creating a new Generation initialized from a prior Generation's Creative Brief and choices, with an opportunity to change them before submission.
_Avoid_: Retry, Edit

**Local UI**:
A browser interface served on localhost that reads and changes one Media Workspace.
_Avoid_: Hosted web app, SaaS client

**Workspace Manifest**:
The source-controlled definition of a Media Workspace's enabled Scenarios, non-secret Provider Connections, Model Deployments, and routing intent.
_Avoid_: Local settings, secrets file

**Local Profile**:
The unshared credentials and machine-specific overrides needed to use a Workspace Manifest in one local environment.
_Avoid_: Workspace Manifest

**Provider Connection**:
A configured route to a Model Provider resource or project through which Model Deployments can be called.
_Avoid_: Model, Scenario

**Speech Connection**:
The private, machine-local connection to an Azure Speech resource used to synthesize narration. It supplies a default Voice and is separate from Model Deployments and the Workspace Manifest.
_Avoid_: Model Deployment, Foundry deployment, voice route

**Voice**:
A named speech persona synthesized through a Speech Connection. An Explainer request can use Auto to resolve the Speech Connection's default Voice. The Local UI selects that default Voice by name so a Business Creator can choose another Voice or explicitly turn Voice off.
_Avoid_: Model Deployment, speaker file
