# Microsoft Foundry Media Model API Surfaces

Research date: 2026-08-17

This note maps the proposed initial image and video models to the API adapters a local CLI would need. It uses Microsoft Learn and first-party provider documentation linked by Microsoft.

## Summary

The proposed catalog requires five confirmed adapter families:

1. `MAIImageAdapter` for `MAI-Image-2.5`, `MAI-Image-2.5-Flash`, and `MAI-Image-2e`.
2. `AzureOpenAIImageAdapter` for `gpt-image-2`.
3. `BFLFluxAdapter` for the four FLUX models.
4. `SoraVideoJobAdapter` for `sora-2`.
5. `MAIVoiceAdapter` for `MAI-Voice-2` through Azure Speech.

The three Stability AI models are visible in the Foundry catalog, but current first-party Microsoft documentation does not establish a reliable Azure-proxied request contract. They also require the hub-based Foundry classic path. Defer them until their deployed endpoint can be inspected or an official integration reference is available.

## Model catalog

| Requested model | Catalog identifier | Lifecycle | Confirmed adapter |
| --- | --- | --- | --- |
| MAI-Image-2.5 | `MAI-Image-2.5` | Preview | MAI Image |
| MAI-Image-2.5-Flash | `MAI-Image-2.5-Flash` | Preview | MAI Image |
| gpt-image-2 | `gpt-image-2` | Generally available | Azure OpenAI Images |
| MAI-Image-2e | `MAI-Image-2e` | Preview | MAI Image |
| Flux.1-Kontext-pro | `FLUX.1-Kontext-pro` | Preview | BFL FLUX |
| Flux-1.1-Pro | `FLUX-1.1-pro` | Preview | BFL FLUX |
| Flux.2-Pro | `FLUX.2-pro` | Preview | BFL FLUX |
| Flux.2-flex | `FLUX.2-flex` | Preview | BFL FLUX |
| Stable-Diffusion-3.5-Large | `Stable-Diffusion-3.5-Large` | Unconfirmed | Unknown |
| Stable-Image-Ultra | `Stable-Image-Ultra` | Unconfirmed | Unknown |
| Stable-Image-Core | `Stable-Image-Core` | Unconfirmed | Unknown |
| sora-2 | `sora-2` | Preview | Sora video jobs |

The exact deployment model spelling matters in the Workspace Manifest. In
particular, the FLUX identifiers mix dots and hyphens. MAI-Voice-2 is not a
Foundry deployment entry; it is selected by Voice name through a private Azure
Speech Connection.

Sources: [Foundry Models sold by Azure](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure), [Foundry partner models](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-from-partners).

## Adapter contracts

### MAI Image

Models:

- `MAI-Image-2.5`
- `MAI-Image-2.5-Flash`
- `MAI-Image-2e`

Generation uses:

```text
POST https://{resource}.services.ai.azure.com/mai/v1/images/generations
```

The request includes the deployment name, prompt, width, and height. The synchronous response contains base64 PNG data.

`MAI-Image-2.5` and `MAI-Image-2.5-Flash` also support multipart image edits through `/mai/v1/images/edits`. `MAI-Image-2e` is text-to-image only.

Authentication supports an API key or Microsoft Entra ID scoped to `https://cognitiveservices.azure.com/.default`.

Source: [Deploy and use MAI image models](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-mai-image).

### Azure OpenAI Images

Model:

- `gpt-image-2`

Generation and editing use the Azure OpenAI Images API. The v1 paths are:

```text
POST https://{resource}.services.ai.azure.com/openai/v1/images/generations?api-version=preview
POST https://{resource}.services.ai.azure.com/openai/v1/images/edits?api-version=preview
```

Generation is synchronous. The response contains base64 image data. Editing uses multipart form data and can include an image and mask.

Authentication supports an API key or Microsoft Entra ID scoped to `https://cognitiveservices.azure.com/.default`.

Source: [Use image generation models from OpenAI](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/dall-e).

### BFL FLUX

Models:

- `FLUX.1-Kontext-pro`
- `FLUX-1.1-pro`
- `FLUX.2-pro`
- `FLUX.2-flex`

The native BFL provider path is:

```text
POST https://{resource}.api.cognitive.microsoft.com/providers/blackforestlabs/v1/{model-path}?api-version=preview
```

The models share the provider family but expose different optional parameters and reference-image limits. FLUX.2 models support multiple reference images. `FLUX.1-Kontext-pro` focuses on contextual image editing.

`FLUX.1-Kontext-pro` and `FLUX-1.1-pro` can also use the OpenAI-compatible Images API, but the native BFL path preserves more model-specific controls. Use one BFL adapter with capability checks rather than route the same logical model through two adapters in the prototype.

Authentication supports an Azure resource key or Microsoft Entra ID scoped to `https://cognitiveservices.azure.com/.default`. Marketplace terms and permissions apply because these are non-Microsoft products.

Sources: [Deploy and use FLUX models](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/use-foundry-models-flux), [BFL FLUX.2 API](https://docs.bfl.ai/flux_2/flux2_text_to_image).

### Sora video jobs

Model:

- `sora-2`

Video generation is asynchronous:

```text
POST /openai/v1/videos
GET  /openai/v1/videos/{videoId}
GET  /openai/v1/videos/{videoId}/content
```

The native Sora 2 v1 request uses `model`, `prompt`, `size`, and `seconds`.
The CLI creates a job, polls until it reaches a terminal state, then downloads
the MP4 output. Media Gen uses this native surface for single-variant
text-to-video requests. It retains the preview jobs surface for the existing
reference and multi-variant contracts, and falls back to that surface only
when native job submission returns HTTP 404.

Sora 2 supports text-to-video, image-to-video, and generated-video remix
workflows.

Microsoft Entra authentication uses the `https://ai.azure.com/.default` scope, which differs from the image adapters.

Sora 2 is preview and applies Azure responsible-AI restrictions, including documented blocking of IP and photorealistic content. Supported durations and resolutions are preview constraints and should be discovered or validated during workspace setup rather than assumed permanently.

Sources: [Sora 2 video generation overview](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/video-generation), [Microsoft Foundry Forgebook Sora 2 REST notebook](https://github.com/microsoft-foundry/forgebook/blob/main/notebooks/sora-video-generation-rest-api.ipynb).

### MAI Voice

Models:

- `MAI-Voice-2`

MAI Voice synthesis uses an Azure Speech resource endpoint:

```text
POST {speech-endpoint}/cognitiveservices/v1
```

The request body is SSML. Authentication uses the resource API key in the
`Ocp-Apim-Subscription-Key` header. The response is binary audio; Media Gen
requests `audio-24khz-160kbitrate-mono-mp3`.

The resource endpoint, API key, and default Voice are stored in the private
Local Profile. Foundry deployment discovery does not discover or persist this
connection. Voice IDs select the MAI persona, for example
`en-US-Harper:MAI-Voice-2`.

Sources: [What is MAI-Voice?](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/mai-voices), [Azure Speech SDK samples](https://github.com/Azure-Samples/cognitive-services-speech-sdk).

### Stability AI

Models:

- `Stable-Diffusion-3.5-Large`
- `Stable-Image-Ultra`
- `Stable-Image-Core`

Microsoft lists these partner models, but the current documentation does not provide a first-party how-to for their Azure-proxied endpoint, authentication, request shape, response shape, or sync/async behavior. They require the hub-based Foundry classic deployment experience and Azure Marketplace setup.

Do not claim support based on the public Stability API alone. Confirm the actual deployed Azure endpoint contract first.

Sources: [Foundry partner models](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-from-partners), [Hubs and hub-based projects in Foundry classic](https://learn.microsoft.com/en-us/azure/foundry-classic/concepts/ai-resources).

## CLI implications

- The Workspace Manifest should name a logical model, adapter family, project endpoint, and deployment name explicitly.
- Authentication scope belongs to the adapter, not to a generic global Foundry token helper.
- The adapter normalizes provider output into files before the Generation is marked complete.
- URL outputs must be downloaded immediately into the Media Workspace.
- Capability checks must reject unsupported combinations before a paid request, such as image editing through `MAI-Image-2e`.
- Preview lifecycle and regional availability should be validated by `setup` or `doctor`.
- Automatic fallback must not cross model or adapter boundaries without explicit approval.

## Recommended prototype scope

Implement and verify:

- MAI Image
- Azure OpenAI Images
- BFL FLUX
- Sora video jobs

Defer:

- Stability AI until its deployed Foundry contract is confirmed from a primary source or inspected from an actual deployment.
