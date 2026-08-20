import {
  AlertCircle,
  CheckCircle2,
  ImageIcon,
  LoaderCircle,
  Monitor,
  RectangleHorizontal,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Square,
  Video,
} from 'lucide-react'
import {useEffect, useMemo, useState} from 'react'
import {Link, useLocation} from 'react-router-dom'

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {Slider} from '@/components/ui/slider'
import {Textarea} from '@/components/ui/textarea'

import {
  createApiClient,
  errorMessage,
  type GenerationRecord,
  type SettingsGetResult,
} from './api-client.js'
import {ChoiceCardGrid} from './choice-card-grid.js'
import {ModelSelection} from './model-selection.js'
import {
  ReferencePicker,
  type ReferenceSelection,
  type TextReferenceSelection,
} from './reference-picker.js'
import {
  defaultStyleFor,
  listStyleDefinitions,
} from '../catalog/styles.js'

type MediaType = 'image' | 'video'

const generators: Array<{
  description: string
  mediaType: MediaType
  title: string
}> = [
  {
    description: 'Create a freeform image from a Creative Brief.',
    mediaType: 'image',
    title: 'Image',
  },
  {
    description: 'Create a freeform video from a Creative Brief.',
    mediaType: 'video',
    title: 'Video',
  },
]

const api = createApiClient()

export function CreatePage() {
  const location = useLocation()
  const [mediaType, setMediaType] = useState<MediaType>('image')
  const [scenarioId, setScenarioId] = useState<
    'explainer-video' | 'short-form-video' | null
  >(null)
  const [presetId, setPresetId] = useState('')
  const [voice, setVoice] = useState('off')
  const [subtitles, setSubtitles] = useState(true)
  const [orientation, setOrientation] = useState<
    'horizontal' | 'vertical'
  >('vertical')
  const [language, setLanguage] = useState('auto')
  const [clipCount, setClipCount] = useState(1)
  const [clipDuration, setClipDuration] = useState(8)
  const [scenarioEnableState, setScenarioEnableState] = useState<
    'idle' | 'loading'
  >('idle')
  const [style, setStyle] = useState(defaultStyleFor('image'))
  const [aspectRatio, setAspectRatio] = useState('1:1')
  const [duration, setDuration] = useState(5)
  const [explainerDurationChoice, setExplainerDurationChoice] =
    useState('60')
  const [deploymentId, setDeploymentId] = useState('')
  const [references, setReferences] = useState<ReferenceSelection[]>(
    () =>
      readReferencePaths(location.state).map((path) => ({
        path,
      })),
  )
  const [textReferences, setTextReferences] = useState<
    TextReferenceSelection[]
  >([])
  const [settings, setSettings] = useState<
    SettingsGetResult | undefined
  >()
  const [submission, setSubmission] = useState<
    | {state: 'idle'}
    | {state: 'submitting'}
    | {message: string; state: 'error'}
    | {generation: GenerationRecord; state: 'success'}
  >({state: 'idle'})
  const activeScenario = settings?.scenarios?.find(
    (scenario) => scenario.id === scenarioId,
  )
  const activeGenerator = generators.find(
    (generator) => generator.mediaType === mediaType,
  )!
  const scenarioRole =
    activeScenario?.id === 'explainer-video'
      ? 'visuals'
      : activeScenario?.routingRoles[0]
  const route =
    activeScenario === undefined
      ? settings?.manifest?.routing?.generators?.[mediaType]?.auto ?? []
      : scenarioRole === undefined
        ? []
        : settings?.manifest?.routing?.scenarios?.[activeScenario.id]?.[
            scenarioRole
          ]?.auto ?? []
  const deployments = settings?.manifest?.deployments ?? {}
  const eligibleDeployments = useMemo(
    () =>
      Object.entries(deployments)
        .filter(([, deployment]) =>
          mediaType === 'video'
            ? deployment.adapter === 'sora-video'
            : [
                'azure-openai-image',
                'bfl-flux',
                'mai-image',
              ].includes(deployment.adapter),
        )
        .sort(([leftId], [rightId]) => {
          const leftIndex = route.indexOf(leftId)
          const rightIndex = route.indexOf(rightId)
          return (
            (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
            (rightIndex === -1
              ? Number.MAX_SAFE_INTEGER
              : rightIndex)
          )
        }),
    [deployments, mediaType, route],
  )
  const autoDeployment = deployments[route[0] ?? '']
  const activeDeployment =
    deployments[deploymentId] ?? autoDeployment
  const activeVideoProfile = settings?.catalog?.videoModels.find(
    (profile) => profile.model === activeDeployment?.model,
  )
  const voiceOptions = settings?.catalog?.voices ?? []
  const selectedRouteIndex = route.indexOf(deploymentId)
  const configuredSpeech =
    settings?.speech?.configured === true
      ? settings.speech
      : undefined
  const availableScenarios = settings?.scenarios ?? []
  const activeMissingRoles =
    activeScenario?.readiness.missingRoles.filter(
      (role) =>
        role !== 'planning' &&
        role !== 'reference-image' &&
        !(
          activeScenario.id === 'explainer-video' &&
          voice === 'off' &&
          role === 'voice'
        ),
    ) ?? []
  const activeScenarioReady = activeMissingRoles.length === 0

  useEffect(() => {
    let active = true
    void api
      .getSettings()
      .then((result) => {
        if (active) {
          setSettings(result)
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [])

  function selectMediaType(nextMediaType: MediaType) {
    setScenarioId(null)
    setMediaType(nextMediaType)
    setAspectRatio(nextMediaType === 'image' ? '1:1' : '16:9')
    setDuration(nextMediaType === 'video' ? 8 : 5)
    setDeploymentId('')
    setStyle(defaultStyleFor(nextMediaType))
    setReferences([])
    setTextReferences([])
  }

  function selectScenario(
    nextScenarioId: 'explainer-video' | 'short-form-video',
  ) {
    setScenarioId(nextScenarioId)
    setMediaType('video')
    const scenario = settings?.scenarios.find(
      (candidate) => candidate.id === nextScenarioId,
    )
    setPresetId(scenario?.presets[0]?.id ?? '')
    setAspectRatio('16:9')
    setDuration(nextScenarioId === 'explainer-video' ? 60 : 12)
    setExplainerDurationChoice('60')
    setDeploymentId('')
    setStyle(defaultStyleFor('video'))
    setReferences([])
    setTextReferences([])
    setVoice(
      settings?.speech?.configured === true
        ? settings.speech.defaultVoice
        : 'off',
    )
    setSubtitles(true)
    setOrientation('vertical')
    setLanguage('auto')
    setClipCount(1)
    setClipDuration(8)
  }

  async function enableScenario() {
    if (activeScenario === undefined) {
      return
    }
    setScenarioEnableState('loading')
    try {
      await api.setScenarioEnabled(activeScenario.id, true)
      setSettings(await api.getSettings())
    } catch (error) {
      setSubmission({
        message: errorMessage(error, 'The Scenario could not be enabled.'),
        state: 'error',
      })
    } finally {
      setScenarioEnableState('idle')
    }
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmission({state: 'submitting'})

    try {
      if (activeScenario !== undefined) {
        const selectedDeploymentId = String(
          form.get('deploymentId') ?? '',
        ).trim()
        const deploymentOverrides =
          selectedDeploymentId.length > 0 &&
          scenarioRole !== undefined
            ? {[scenarioRole]: selectedDeploymentId}
            : {}
        const creativeBrief = String(
          form.get('creativeBrief') ?? '',
        ).trim()
        const common = {
          force: form.get('force') === 'on',
        }
        const result =
          activeScenario.id === 'explainer-video'
            ? await api.createScenario({
                ...common,
                request: {
                  creativeBrief,
                  deploymentOverrides,
                  kind: 'scenario',
                  options: {
                    'aspect-ratio':
                      aspectRatio === '9:16' ? '9:16' : '16:9',
                    duration,
                    subtitles,
                    voice:
                      voice === 'off'
                        ? {mode: 'off'}
                        : voice === 'auto'
                          ? {mode: 'auto'}
                          : {id: voice, mode: 'selected'},
                  },
                  preset:
                    presetId ||
                    activeScenario.presets[0]?.id ||
                    'editorial-motion-graphics',
                  scenario: 'explainer-video',
                  sourcePaths: references.map(
                    (reference) => reference.path,
                  ),
                  ...(textReferences.length === 0
                    ? {}
                    : {
                        textReferences: textReferences.map(
                          ({content, format, title}) => ({
                            content,
                            format,
                            title,
                          }),
                        ),
                      }),
                },
              })
            : await api.createScenario({
                ...common,
                request: {
                  creativeBrief,
                  deploymentOverrides,
                  kind: 'scenario',
                  options: {
                    'clip-count': clipCount,
                    'clip-duration': clipDuration,
                    language,
                    orientation,
                    subtitles,
                  },
                  preset:
                    presetId ||
                    activeScenario.presets[0]?.id ||
                    'bold-urban',
                  scenario: 'short-form-video',
                  sourcePaths: references.map(
                    (reference) => reference.path,
                  ),
                  ...(textReferences.length === 0
                    ? {}
                    : {
                        textReferences: textReferences.map(
                          ({content, format, title}) => ({
                            content,
                            format,
                            title,
                          }),
                        ),
                      }),
                },
              })
        setSubmission({
          generation: result.generation,
          state: 'success',
        })
        return
      }

      const selectedDeploymentId = String(
        form.get('deploymentId') ?? '',
      ).trim()
      const controls: Record<string, unknown> =
        mediaType === 'image'
          ? imageControls(String(form.get('aspectRatio') ?? '1:1'))
          : videoControls(
              String(form.get('aspectRatio') ?? '16:9'),
              Number(form.get('duration') ?? 5),
            )
      addAdvancedControls(
        controls,
        activeDeployment?.adapter,
        form,
      )
      const result = await api.createGeneration({
        controls,
        creativeBrief: String(form.get('creativeBrief') ?? '').trim(),
        deploymentId: selectedDeploymentId || undefined,
        ...(form.get('force') === 'on' ? {force: true} : {}),
        mediaType,
        referencePaths: references.map((reference) => reference.path),
        style: String(
          form.get('style') ?? defaultStyleFor(mediaType),
        ),
        ...(textReferences.length === 0
          ? {}
          : {
              textReferences: textReferences.map(
                ({content, format, title}) => ({
                  content,
                  format,
                  title,
                }),
              ),
            }),
      })

      setSubmission({
        generation: result.generation,
        state: 'success',
      })
    } catch (error) {
      setSubmission({
        message: errorMessage(
          error,
          'The Generation request could not be completed.',
        ),
        state: 'error',
      })
    }
  }

  return (
    <main className="grid min-h-[calc(100vh-4rem)] w-full lg:grid-cols-[320px_minmax(0,1fr)]">
      <nav
        aria-label="Create"
        className="border-b bg-muted/20 p-3 lg:border-r lg:border-b-0 lg:p-5"
      >
        <p className="mb-3 hidden px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase lg:block">
          Create
        </p>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {generators.map((generator) => {
            const Icon =
              generator.mediaType === 'image' ? ImageIcon : Video
            const active =
              scenarioId === null && generator.mediaType === mediaType

            return (
              <Button
                aria-pressed={active}
                className="h-auto w-full items-start justify-start gap-3 whitespace-normal px-3 py-3 text-left"
                key={generator.mediaType}
                onClick={() => selectMediaType(generator.mediaType)}
                type="button"
                variant={active ? 'secondary' : 'ghost'}
              >
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground"
                >
                  <Icon className="size-4" />
                </span>
                <span className="grid gap-1">
                  <strong className="text-sm font-medium lg:whitespace-nowrap">
                    {generator.title}
                  </strong>
                  <span className="hidden text-xs leading-relaxed text-muted-foreground lg:block">
                    {generator.description}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
        {availableScenarios.length > 0 ? (
          <>
            <p className="mt-7 mb-3 hidden px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase lg:block">
              Scenarios
            </p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {availableScenarios.map((scenario) => {
                const active = scenario.id === scenarioId
                return (
                  <Button
                    aria-pressed={active}
                    className="h-auto w-full items-start justify-start gap-3 whitespace-normal px-3 py-3 text-left"
                    key={scenario.id}
                    onClick={() => selectScenario(scenario.id)}
                    type="button"
                    variant={active ? 'secondary' : 'ghost'}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground"
                    >
                      <Video className="size-4" />
                    </span>
                    <span className="grid gap-1">
                      <strong className="text-sm font-medium lg:whitespace-nowrap">
                        {scenario.title}
                      </strong>
                      <span className="hidden text-xs leading-relaxed text-muted-foreground lg:block">
                        {scenario.description}
                      </span>
                    </span>
                  </Button>
                )
              })}
            </div>
          </>
        ) : null}
      </nav>

      <form
        className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_390px]"
        onSubmit={handleSubmit}
      >
        <input name="style" type="hidden" value={style} />
        <section className="relative overflow-hidden px-5 py-12 sm:px-8 lg:px-12 lg:py-16 xl:px-16 xl:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle_at_top,oklch(0.55_0.18_290_/_0.16),transparent_68%)]"
          />
          <div className="relative mx-auto max-w-4xl">
            <div className="mb-4 flex items-center gap-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
              <Sparkles aria-hidden="true" className="size-3.5" />
              {activeScenario === undefined
                ? 'Start with intent'
                : 'Purpose-built workflow'}
            </div>
            <h1 className="max-w-3xl font-heading text-4xl leading-none font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {activeScenario?.title ?? activeGenerator.title}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
              {activeScenario?.description ??
                activeGenerator.description}
            </p>

            <Card className="mt-7 bg-card/90 shadow-2xl shadow-black/10 backdrop-blur">
              <CardContent className="grid gap-3">
                <Label htmlFor="creative-brief">
                  {activeScenario?.id === 'explainer-video'
                    ? 'What should the video explain?'
                    : activeScenario?.id === 'short-form-video'
                      ? 'Direction'
                      : 'Creative Brief'}
                </Label>
                <Textarea
                  className="min-h-48 resize-y border-0 bg-transparent p-0 text-base leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent sm:text-lg"
                  id="creative-brief"
                  name="creativeBrief"
                  placeholder={
                    activeScenario?.id === 'explainer-video'
                      ? 'Describe the topic, audience, key idea, and desired takeaway...'
                      : activeScenario?.id === 'short-form-video'
                        ? 'Describe the moment, message, or emphasis to prioritize...'
                        : mediaType === 'image'
                      ? 'Describe the product, audience, composition, and moment you want to capture...'
                      : 'Describe the product story, key reveal, pace, and final launch moment...'
                  }
                  required={activeScenario?.id !== 'short-form-video'}
                />
                {activeScenario?.id === 'short-form-video' ? (
                  <>
                    <ReferencePicker
                      compact
                      onChange={setReferences}
                      purpose="source-video"
                      value={references}
                    />
                    <ReferencePicker
                      compact
                      onChange={() => undefined}
                      onTextReferencesChange={setTextReferences}
                      purpose="text-context"
                      textReferences={textReferences}
                      value={[]}
                    />
                  </>
                ) : (
                  <ReferencePicker
                    compact
                    onChange={setReferences}
                    onTextReferencesChange={setTextReferences}
                    textReferences={textReferences}
                    value={references}
                  />
                )}
              </CardContent>
            </Card>

            {activeScenario === undefined ? (
              <ChoiceCardGrid
                choices={listStyleDefinitions(mediaType).map(
                  (definition) => ({
                    description: definition.description,
                    id: definition.id,
                    title: definition.label,
                  }),
                )}
                description="Choose the visual treatment for this Generator."
                label="Styles"
                onChange={setStyle}
                value={style}
              />
            ) : (
              <ChoiceCardGrid
                choices={activeScenario.presets}
                description="Choose the visual treatment for this workflow."
                label="Presets"
                onChange={setPresetId}
                value={
                  presetId || activeScenario.presets[0]?.id || ''
                }
              />
            )}

            {submission.state === 'success' ? (
              <Card
                className={
                  submission.generation.status === 'succeeded'
                    ? 'mt-5 border-emerald-500/25 bg-emerald-500/5'
                    : 'mt-5 border-sky-500/25 bg-sky-500/5'
                }
                role="status"
              >
                <CardHeader>
                  <div
                    className={
                      submission.generation.status === 'succeeded'
                        ? 'flex items-center gap-2 text-emerald-500'
                        : 'flex items-center gap-2 text-sky-500'
                    }
                  >
                    {submission.generation.status === 'succeeded' ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="size-4"
                      />
                    ) : (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    )}
                    <span className="text-xs font-medium tracking-wider uppercase">
                      {submission.generation.status === 'succeeded'
                        ? 'Success'
                        : 'In progress'}
                    </span>
                  </div>
                  <CardTitle>
                    <h2>
                      {submission.generation.status === 'succeeded'
                        ? 'Generation created'
                        : 'Generation in progress'}
                    </h2>
                  </CardTitle>
                  <CardDescription>
                    {submission.generation.status === 'succeeded'
                      ? 'Your media is ready to review.'
                      : 'The workflow is running. Open the Generation to follow each step.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to={`/generations/${submission.generation.id}`}
                    >
                      Open Generation
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {submission.state === 'error' ? (
              <Alert
                aria-labelledby="generation-error-title"
                className="mt-5"
                variant="destructive"
              >
                <AlertCircle aria-hidden="true" />
                <AlertTitle id="generation-error-title">
                  Generation could not be created
                </AlertTitle>
                <AlertDescription>{submission.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </section>

        <aside className="border-t bg-muted/20 p-5 xl:border-t-0 xl:border-l">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-heading text-base font-medium">
                Production
              </p>
              <p className="text-xs text-muted-foreground">
                Configure this output.
              </p>
            </div>
            <Badge className="capitalize" variant="outline">
              {activeScenario?.title ?? mediaType}
            </Badge>
          </div>

          {activeScenario === undefined ? (
            <>
              <Card size="sm">
                <CardContent>
                  <ModelSelection
                    autoLabel={
                      autoDeployment === undefined
                        ? 'Auto selection'
                        : `Auto · ${autoDeployment.model}`
                    }
                    deployments={eligibleDeployments}
                    label="Model"
                    onChange={setDeploymentId}
                    requiresApproval={selectedRouteIndex > 0}
                    value={deploymentId}
                  />
                </CardContent>
              </Card>

              <AspectRatioControl
                aspectRatio={aspectRatio}
                mediaType={mediaType}
                onChange={setAspectRatio}
              />

              {mediaType === 'video' ? (
                <DurationControl
                  allowedDurations={
                    activeVideoProfile?.clipDurationsSeconds
                  }
                  duration={duration}
                  label="Duration"
                  onChange={setDuration}
                />
              ) : null}

              <details className="mt-4 overflow-hidden rounded-xl border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                    Advanced
                  </span>
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {advancedSummary(activeDeployment?.adapter)}
                  </span>
                </summary>
                <div className="border-t p-4">
                  <AdvancedControls
                    adapter={activeDeployment?.adapter}
                    mediaType={mediaType}
                  />
                </div>
              </details>

              <Button
                className="mt-5 w-full"
                disabled={submission.state === 'submitting'}
                size="lg"
                type="submit"
              >
                {submission.state === 'submitting' ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                  />
                ) : mediaType === 'image' ? (
                  <ImageIcon aria-hidden="true" />
                ) : (
                  <Video aria-hidden="true" />
                )}
                {submission.state === 'submitting'
                  ? `Generating ${mediaType}...`
                  : `Generate ${mediaType}`}
              </Button>
            </>
          ) : (
            <>
              {!activeScenario.enabled ? (
                <Alert className="mt-5">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Scenario disabled</AlertTitle>
                  <AlertDescription className="grid gap-3">
                    Enable this workflow in the workspace before creating.
                    <Button
                      className="w-fit"
                      disabled={scenarioEnableState === 'loading'}
                      onClick={() => void enableScenario()}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      {scenarioEnableState === 'loading'
                        ? 'Enabling...'
                        : `Enable ${activeScenario.title}`}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              {activeScenario.enabled &&
              !activeScenarioReady ? (
                <Alert className="mt-5" variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>
                    <h2>Scenario needs setup</h2>
                  </AlertTitle>
                  <AlertDescription className="grid gap-3">
                    <span>
                      Missing setup:{' '}
                      {activeMissingRoles.join(', ')}
                    </span>
                    <Button
                      asChild
                      className="w-fit"
                      size="sm"
                      variant="outline"
                    >
                      <Link to="/settings">Open Settings</Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}

              {activeScenario.id === 'explainer-video' ? (
                <>
                  <div className="mt-5 grid gap-2">
                    <Label htmlFor="scenario-voice">Voice</Label>
                    <NativeSelect
                      className="w-full"
                      id="scenario-voice"
                      onChange={(event) => {
                        const nextVoice = event.target.value
                        setVoice(nextVoice)
                      }}
                      value={voice}
                    >
                      <NativeSelectOption value="off">
                        Off
                      </NativeSelectOption>
                      {configuredSpeech !== undefined &&
                      !voiceOptions.some(
                        (option) =>
                          option.id === configuredSpeech.defaultVoice,
                      ) ? (
                        <NativeSelectOption
                          value={configuredSpeech.defaultVoice}
                        >
                          {configuredSpeech.defaultVoice} · Configured
                          default
                        </NativeSelectOption>
                      ) : null}
                      {voiceOptions.map((option) => (
                        <NativeSelectOption
                          disabled={configuredSpeech === undefined}
                          key={option.id}
                          value={option.id}
                        >
                          {option.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    {configuredSpeech === undefined ? (
                      <p className="text-xs text-muted-foreground">
                        Configure Azure Speech in Settings to enable
                        narration.
                      </p>
                    ) : null}
                  </div>
                  <SubtitlesControl
                    checked={subtitles}
                    onChange={setSubtitles}
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <AspectRatioControl
                      aspectRatio={aspectRatio}
                      mediaType="video"
                      onChange={setAspectRatio}
                    />
                    <ExplainerDurationControl
                      choice={explainerDurationChoice}
                      duration={duration}
                      onChange={(nextDuration) => {
                        setDuration(nextDuration)
                      }}
                      onChoiceChange={setExplainerDurationChoice}
                      profile={activeVideoProfile}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div
                    aria-label="Layout"
                    className="mt-5 grid gap-4 sm:grid-cols-2"
                    role="group"
                  >
                    <div className="grid gap-2">
                      <Label htmlFor="scenario-orientation">
                        Orientation
                      </Label>
                      <NativeSelect
                        className="w-full"
                        id="scenario-orientation"
                        onChange={(event) =>
                          setOrientation(
                            event.target.value === 'horizontal'
                              ? 'horizontal'
                              : 'vertical',
                          )
                        }
                        value={orientation}
                      >
                        <NativeSelectOption value="vertical">
                          Vertical
                        </NativeSelectOption>
                        <NativeSelectOption value="horizontal">
                          Horizontal
                        </NativeSelectOption>
                      </NativeSelect>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="scenario-language">Language</Label>
                      <NativeSelect
                        className="w-full"
                        id="scenario-language"
                        onChange={(event) =>
                          setLanguage(event.target.value)
                        }
                        value={language}
                      >
                        <NativeSelectOption value="auto">
                          Auto detect
                        </NativeSelectOption>
                        <NativeSelectOption value="en">
                          English
                        </NativeSelectOption>
                        <NativeSelectOption value="es">
                          Spanish
                        </NativeSelectOption>
                        <NativeSelectOption value="fr">
                          French
                        </NativeSelectOption>
                      </NativeSelect>
                    </div>
                  </div>
                  <SubtitlesControl
                    checked={subtitles}
                    onChange={setSubtitles}
                  />
                  <div
                    aria-label="Clips"
                    className="mt-4 grid gap-4 sm:grid-cols-2 [&>div]:mt-0"
                    role="group"
                  >
                    <div className="grid gap-2">
                      <Label htmlFor="scenario-clip-count">
                        Clip count
                      </Label>
                      <NativeSelect
                        className="w-full"
                        id="scenario-clip-count"
                        onChange={(event) =>
                          setClipCount(Number(event.target.value))
                        }
                        value={String(clipCount)}
                      >
                        {[1, 2, 3, 4].map((count) => (
                          <NativeSelectOption
                            key={count}
                            value={String(count)}
                          >
                            {count}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                    </div>
                    <DurationControl
                      allowedDurations={
                        activeVideoProfile?.clipDurationsSeconds
                      }
                      duration={clipDuration}
                      label="Clip duration"
                      onChange={setClipDuration}
                    />
                  </div>
                </>
              )}

              <details className="mt-5 overflow-hidden rounded-xl border bg-card">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal
                      aria-hidden="true"
                      className="size-4 text-muted-foreground"
                    />
                    Advanced
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Video model
                  </span>
                </summary>
                <div className="grid gap-3 border-t p-4">
                  <ModelSelection
                    autoLabel="Auto"
                    deployments={eligibleDeployments}
                    label="Video model"
                    onChange={setDeploymentId}
                    requiresApproval={selectedRouteIndex > 0}
                    value={deploymentId}
                  />
                </div>
              </details>

              <Button
                className="mt-5 w-full"
                disabled={
                  submission.state === 'submitting' ||
                  !activeScenario.enabled ||
                  !activeScenarioReady ||
                  (activeScenario.id === 'short-form-video' &&
                    references.length !== 1)
                }
                size="lg"
                type="submit"
              >
                {submission.state === 'submitting' ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                  />
                ) : (
                  <Video aria-hidden="true" />
                )}
                {submission.state === 'submitting'
                  ? `Creating ${activeScenario.title}...`
                  : `Create ${activeScenario.title}`}
              </Button>
            </>
          )}
        </aside>
      </form>
    </main>
  )
}

function AspectRatioControl({
  aspectRatio,
  mediaType,
  onChange,
}: {
  aspectRatio: string
  mediaType: MediaType
  onChange: (value: string) => void
}) {
  return (
    <div className="mt-4 grid gap-2">
      <Label htmlFor="aspect-ratio">Aspect ratio</Label>
      <Select
        key={mediaType}
        name="aspectRatio"
        onValueChange={onChange}
        value={aspectRatio}
      >
        <SelectTrigger
          aria-label="Aspect ratio"
          className="w-full"
          id="aspect-ratio"
        >
          <AspectRatioIcon ratio={aspectRatio} />
          <SelectValue>{aspectRatio}</SelectValue>
        </SelectTrigger>
        <SelectContent position="popper">
          {mediaType === 'image' ? (
            <SelectItem
              aria-label="1:1 Square"
              textValue="1:1 Square"
              value="1:1"
            >
              <Square aria-hidden="true" />
              <span>1:1</span>{' '}
              <span className="text-muted-foreground">Square</span>
            </SelectItem>
          ) : null}
          <SelectItem
            aria-label="16:9 Widescreen"
            textValue="16:9 Widescreen"
            value="16:9"
          >
            <Monitor aria-hidden="true" />
            <span>16:9</span>{' '}
            <span className="text-muted-foreground">Widescreen</span>
          </SelectItem>
          <SelectItem
            aria-label="9:16 Vertical phone"
            textValue="9:16 Vertical phone"
            value="9:16"
          >
            <Smartphone aria-hidden="true" />
            <span>9:16</span>{' '}
            <span className="text-muted-foreground">
              Vertical phone
            </span>
          </SelectItem>
          {mediaType === 'image' ? (
            <SelectItem
              aria-label="4:3 Classic landscape"
              textValue="4:3 Classic landscape"
              value="4:3"
            >
              <RectangleHorizontal aria-hidden="true" />
              <span>4:3</span>{' '}
              <span className="text-muted-foreground">
                Classic landscape
              </span>
            </SelectItem>
          ) : null}
        </SelectContent>
      </Select>
    </div>
  )
}

function DurationControl({
  allowedDurations,
  duration,
  label,
  onChange,
}: {
  allowedDurations?: number[]
  duration: number
  label: string
  onChange: (value: number) => void
}) {
  const id = label === 'Duration' ? 'duration' : 'clip-duration'
  if (allowedDurations !== undefined) {
    return (
      <div className="mt-4 grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <NativeSelect
          className="w-full"
          id={id}
          name={id}
          onChange={(event) => onChange(Number(event.target.value))}
          value={String(duration)}
        >
          {allowedDurations.map((seconds) => (
            <NativeSelectOption key={seconds} value={String(seconds)}>
              {durationLabel(seconds)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    )
  }
  return (
    <div className="mt-4 grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <span className="text-sm font-medium">{duration} seconds</span>
      </div>
      <input name={id} type="hidden" value={duration} />
      <Slider
        aria-label={label}
        className="py-2 [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-track]]:h-2"
        id={id}
        max={12}
        min={5}
        onValueChange={(values) => {
          const nextDuration = values[0]
          if (nextDuration !== undefined) {
            onChange(nextDuration)
          }
        }}
        step={1}
        value={[duration]}
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>5s</span>
        <span>12s</span>
      </div>
    </div>
  )
}

function ExplainerDurationControl({
  choice,
  duration,
  onChange,
  onChoiceChange,
  profile,
}: {
  choice: string
  duration: number
  onChange: (value: number) => void
  onChoiceChange: (value: string) => void
  profile:
    | SettingsGetResult['catalog']['videoModels'][number]
    | undefined
}) {
  if (profile === undefined) {
    return (
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Select a configured video model to show duration options.
      </p>
    )
  }

  return (
    <div className="mt-4 grid gap-2">
      <Label htmlFor="explainer-duration">Duration</Label>
      <NativeSelect
        className="w-full"
        id="explainer-duration"
        onChange={(event) => {
          const nextChoice = event.target.value
          onChoiceChange(nextChoice)
          if (nextChoice === 'manual') {
            onChange(
              nearestComposableDuration(profile, duration),
            )
            return
          }
          onChange(Number(nextChoice))
        }}
        value={choice}
      >
        {profile.explainerDurationPresetsSeconds.map((seconds) => (
          <NativeSelectOption key={seconds} value={String(seconds)}>
            {durationLabel(seconds)}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value="manual">Manual</NativeSelectOption>
      </NativeSelect>
      {choice === 'manual' ? (
        <div className="mt-2 grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="manual-duration">Manual duration</Label>
            <span className="text-sm font-medium">
              Effective: {durationLabel(duration)}
            </span>
          </div>
          <Slider
            aria-label="Manual duration"
            className="py-2 [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-track]]:h-2"
            id="manual-duration"
            max={profile.manualDuration.maxSeconds}
            min={profile.manualDuration.minSeconds}
            onValueChange={(values) => {
              const requested = values[0]
              if (requested !== undefined) {
                onChange(
                  nearestComposableDuration(profile, requested),
                )
              }
            }}
            step={1}
            value={[duration]}
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>
              {durationLabel(profile.manualDuration.minSeconds)}
            </span>
            <span>
              {durationLabel(profile.manualDuration.maxSeconds)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function nearestComposableDuration(
  profile: SettingsGetResult['catalog']['videoModels'][number],
  requestedSeconds: number,
): number {
  return [...profile.composableDurationsSeconds].sort((left, right) => {
    const distance =
      Math.abs(left - requestedSeconds) -
      Math.abs(right - requestedSeconds)
    if (distance !== 0) {
      return distance
    }
    if (left >= requestedSeconds && right < requestedSeconds) {
      return -1
    }
    if (right >= requestedSeconds && left < requestedSeconds) {
      return 1
    }
    return left - right
  })[0] ?? requestedSeconds
}

function durationLabel(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`
  }
  const minutes = seconds / 60
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
}

function SubtitlesControl({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <Checkbox
        checked={checked}
        id="scenario-subtitles"
        onCheckedChange={(value) => onChange(value === true)}
      />
      <Label htmlFor="scenario-subtitles">Subtitles</Label>
    </div>
  )
}

function AspectRatioIcon({ratio}: {ratio: string}) {
  const props = {
    'aria-hidden': true,
    'data-aspect-ratio-icon': true,
    className: 'size-4 text-muted-foreground',
  } as const

  if (ratio === '16:9') {
    return <Monitor {...props} />
  }
  if (ratio === '9:16') {
    return <Smartphone {...props} />
  }
  if (ratio === '4:3') {
    return <RectangleHorizontal {...props} />
  }
  return <Square {...props} />
}

function imageControls(aspectRatio: string): Record<string, number> {
  if (aspectRatio === '16:9') {
    return {height: 864, width: 1536}
  }
  if (aspectRatio === '9:16') {
    return {height: 1536, width: 864}
  }
  if (aspectRatio === '4:3') {
    return {height: 768, width: 1024}
  }
  return {height: 1024, width: 1024}
}

function videoControls(
  aspectRatio: string,
  duration: number,
): Record<string, number> {
  return {
    height: aspectRatio === '9:16' ? 1280 : 720,
    nSeconds: duration,
    width: aspectRatio === '9:16' ? 720 : 1280,
  }
}

function AdvancedControls({
  adapter,
  mediaType,
}: {
  adapter?: string
  mediaType: MediaType
}) {
  if (adapter === 'azure-openai-image') {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="quality">Quality</Label>
          <NativeSelect
            className="w-full"
            defaultValue="auto"
            id="quality"
            name="quality"
          >
            <NativeSelectOption value="auto">Auto</NativeSelectOption>
            <NativeSelectOption value="low">Low</NativeSelectOption>
            <NativeSelectOption value="medium">
              Medium
            </NativeSelectOption>
            <NativeSelectOption value="high">High</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="output-format">Output format</Label>
          <NativeSelect
            className="w-full"
            defaultValue="png"
            id="output-format"
            name="outputFormat"
          >
            <NativeSelectOption value="png">PNG</NativeSelectOption>
            <NativeSelectOption value="jpeg">JPEG</NativeSelectOption>
            <NativeSelectOption value="webp">WebP</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="background">Background</Label>
          <NativeSelect
            className="w-full"
            defaultValue="auto"
            id="background"
            name="background"
          >
            <NativeSelectOption value="auto">Auto</NativeSelectOption>
            <NativeSelectOption value="opaque">
              Opaque
            </NativeSelectOption>
            <NativeSelectOption value="transparent">
              Transparent
            </NativeSelectOption>
          </NativeSelect>
        </div>
      </div>
    )
  }

  if (adapter === 'bfl-flux') {
    return (
      <div className="grid gap-2">
        <Label htmlFor="output-format">Output format</Label>
        <NativeSelect
          className="w-full"
            defaultValue="jpeg"
            id="output-format"
            name="outputFormat"
          >
          <NativeSelectOption value="jpeg">JPEG</NativeSelectOption>
          <NativeSelectOption value="png">PNG</NativeSelectOption>
        </NativeSelect>
      </div>
    )
  }

  if (adapter === 'sora-video') {
    return (
      <div className="grid gap-2">
        <Label htmlFor="variants">Variants</Label>
        <NativeSelect
          className="w-full"
          defaultValue="1"
          id="variants"
          name="variants"
        >
          <NativeSelectOption value="1">1</NativeSelectOption>
          <NativeSelectOption value="2">2</NativeSelectOption>
          <NativeSelectOption value="3">3</NativeSelectOption>
          <NativeSelectOption value="4">4</NativeSelectOption>
        </NativeSelect>
      </div>
    )
  }

  return (
    <p className="text-xs leading-5 text-muted-foreground">
      {mediaType === 'image'
        ? 'This model uses the selected ratio and style without additional controls.'
        : 'Select a configured video model to show its controls.'}
    </p>
  )
}

function addAdvancedControls(
  controls: Record<string, unknown>,
  adapter: string | undefined,
  form: FormData,
): void {
  if (adapter === 'azure-openai-image') {
    const quality = String(form.get('quality') ?? 'auto')
    const background = String(form.get('background') ?? 'auto')
    if (quality !== 'auto') {
      controls.quality = quality
    }
    if (background !== 'auto') {
      controls.background = background
    }
    controls.output_format = String(
      form.get('outputFormat') ?? 'png',
    )
  } else if (adapter === 'bfl-flux') {
    controls.output_format = String(
      form.get('outputFormat') ?? 'jpeg',
    )
  } else if (adapter === 'sora-video') {
    controls.nVariants = Number(form.get('variants') ?? 1)
  }
}

function advancedSummary(adapter: string | undefined): string {
  if (adapter === 'azure-openai-image') {
    return 'Quality · Format · Background'
  }
  if (adapter === 'bfl-flux') {
    return 'Format'
  }
  if (adapter === 'sora-video') {
    return 'Variants'
  }
  return 'Model controls'
}

function readReferencePaths(state: unknown): string[] {
  if (
    typeof state !== 'object' ||
    state === null ||
    !('referencePaths' in state) ||
    !Array.isArray(state.referencePaths)
  ) {
    return []
  }

  return state.referencePaths.filter(
    (path): path is string => typeof path === 'string',
  )
}
