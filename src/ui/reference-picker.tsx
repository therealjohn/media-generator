import {
  AlertCircle,
  File as FileIcon,
  FileText,
  ImageIcon,
  Images,
  LoaderCircle,
  Plus,
  Upload,
  Video,
  X,
} from 'lucide-react'
import {useEffect, useState} from 'react'

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {Label} from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {Textarea} from '@/components/ui/textarea'

import {
  createApiClient,
  errorMessage,
  type GenerationRecord,
  type GenerationsListResult,
} from './api-client.js'
import {generationSelectionLabel} from './generation-label.js'

export interface ReferenceSelection {
  generationId?: string
  mediaType?: string
  outputIndex?: number
  path: string
  previewUrl?: string
}

export interface TextReferenceSelection {
  content: string
  format: 'markdown' | 'text'
  id: string
  title?: string
}

export type ReferencePickerPurpose =
  | 'references'
  | 'source-video'
  | 'text-context'

interface ReferencePickerProps {
  compact?: boolean
  onChange(value: ReferenceSelection[]): void
  onTextReferencesChange?(
    value: TextReferenceSelection[],
  ): void
  purpose?: ReferencePickerPurpose
  textReferences?: TextReferenceSelection[]
  value: ReferenceSelection[]
}

const api = createApiClient()

export function ReferencePicker({
  compact = false,
  onChange,
  onTextReferencesChange = () => undefined,
  purpose = 'references',
  textReferences = [],
  value,
}: ReferencePickerProps) {
  const config = referencePickerConfig(purpose)
  const allowsGenerations =
    config.sources.includes('images') ||
    config.sources.includes('videos')
  const [open, setOpen] = useState(false)
  const [browsingLocalFiles, setBrowsingLocalFiles] = useState(false)
  const [textContent, setTextContent] = useState('')
  const [selectionError, setSelectionError] = useState<{
    message: string
    title: string
  } | null>(null)
  const [addingGenerationId, setAddingGenerationId] = useState<
    string | null
  >(null)
  const [generationState, setGenerationState] = useState<
    | {state: 'idle'}
    | {state: 'loading'}
    | {message: string; state: 'error'}
    | {result: GenerationsListResult; state: 'success'}
  >({state: 'idle'})

  useEffect(() => {
    if (
      !open ||
      !allowsGenerations ||
      generationState.state !== 'idle'
    ) {
      return
    }
    loadGenerations()
  }, [allowsGenerations, generationState.state, open])

  function loadGenerations() {
    setGenerationState({state: 'loading'})
    void api
      .listGenerations()
      .then((result) =>
        setGenerationState({result, state: 'success'}),
      )
      .catch((error: unknown) =>
        setGenerationState({
          message: errorMessage(
            error,
            'Generation references could not be loaded.',
          ),
          state: 'error',
        }),
      )
  }

  async function browseLocalFiles() {
    setSelectionError(null)
    setBrowsingLocalFiles(true)
    try {
      const result = await api.browseReferenceFiles(
        purpose === 'source-video'
          ? 'source-video'
          : 'references',
      )
      const additions = result.files.map((file) => ({
        mediaType: file.mediaType,
        path: file.path,
        previewUrl: file.previewUrl,
      }))
      applyAssetAdditions(additions)
    } catch (error) {
      setSelectionError({
        message: errorMessage(
          error,
          'Local files could not be selected.',
        ),
        title: 'Could not browse local files',
      })
    } finally {
      setBrowsingLocalFiles(false)
    }
  }

  async function addGeneration(generation: GenerationRecord) {
    setSelectionError(null)
    setAddingGenerationId(generation.id)
    try {
      const result = await api.addReferences([generation.id])
      const additions = result.references.map(
        (reference, outputIndex) => ({
          generationId: reference.generationId,
          mediaType: reference.mediaType,
          outputIndex,
          path: reference.path,
        }),
      )
      applyAssetAdditions(additions)
    } catch (error) {
      setSelectionError({
        message: errorMessage(
          error,
          'The Generation reference could not be added.',
        ),
        title: 'Could not add Generation reference',
      })
    } finally {
      setAddingGenerationId(null)
    }
  }

  function removeReference(path: string) {
    onChange(value.filter((reference) => reference.path !== path))
  }

  function applyAssetAdditions(additions: ReferenceSelection[]) {
    if (purpose === 'source-video') {
      if (additions.length !== 1) {
        setSelectionError({
          message:
            'Select a source Generation with exactly one video output.',
          title: 'Choose one video output',
        })
        return
      }
      onChange(additions)
      return
    }
    onChange(mergeReferences(value, additions))
  }

  function addTextReference() {
    const content = textContent.trim()
    if (content.length === 0) {
      return
    }
    onTextReferencesChange([
      ...textReferences,
      {
        content,
        format: 'text',
        id:
          globalThis.crypto?.randomUUID?.() ??
          `text-${Date.now()}-${textReferences.length}`,
      },
    ])
    setTextContent('')
  }

  function removeTextReference(id: string) {
    onTextReferencesChange(
      textReferences.filter((reference) => reference.id !== id),
    )
  }

  return (
    <>
      {compact ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button
            aria-label={config.addLabel}
            data-reference-dropzone="true"
            onClick={() => setOpen(true)}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Plus aria-hidden="true" />
            {config.addLabel}
          </Button>
          {value.map((reference) => (
            <CompactReferenceBadge
              key={reference.path}
              onRemove={() => removeReference(reference.path)}
              reference={reference}
            />
          ))}
          {textReferences.map((reference) => (
            <Badge
              className="max-w-52 gap-1.5 py-1"
              key={reference.id}
              variant="outline"
            >
              <FileText aria-hidden="true" className="size-3" />
              <span className="truncate">
                {textReferenceLabel(reference)}
              </span>
              <button
                aria-label={`Remove text reference ${textReferenceLabel(reference)}`}
                className="rounded-sm text-muted-foreground hover:text-foreground"
                onClick={() => removeTextReference(reference.id)}
                type="button"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
      <div className="grid gap-2">
        <Label>{config.fieldLabel}</Label>
        {value.length === 0 && textReferences.length === 0 ? (
          <Button
            aria-label={config.addLabel}
            className="h-36 w-full flex-col gap-3 border-dashed bg-muted/10 text-muted-foreground hover:bg-muted/25 hover:text-foreground"
            data-reference-dropzone="true"
            onClick={() => setOpen(true)}
            type="button"
            variant="outline"
          >
            <ReferenceIcons />
            <span className="grid gap-1 text-center">
              <strong className="font-heading text-sm font-medium">
                {config.addLabel}
              </strong>
              <span className="text-xs font-normal">
                {config.emptyDescription}
              </span>
            </span>
          </Button>
        ) : (
          <div className="flex min-h-36 flex-wrap items-center gap-3 rounded-xl border bg-muted/10 p-4">
            <Button
              aria-label={config.addMoreLabel}
              className="size-24 shrink-0 rounded-2xl border-dashed"
              onClick={() => setOpen(true)}
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" />
            </Button>
            {value.map((reference) => (
              <ReferencePreview
                key={reference.path}
                onRemove={() => removeReference(reference.path)}
                reference={reference}
              />
            ))}
            {textReferences.map((reference) => (
              <TextReferencePreview
                key={reference.id}
                onRemove={() => removeTextReference(reference.id)}
                reference={reference}
              />
            ))}
          </div>
        )}
        <p className="text-xs leading-5 text-muted-foreground">
          {config.help}
        </p>
      </div>
      )}

      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="!w-full sm:!max-w-3xl">
          <SheetHeader className="border-b">
            <SheetTitle>{config.sheetTitle}</SheetTitle>
            <SheetDescription>
              {config.sheetDescription}
            </SheetDescription>
          </SheetHeader>

          {selectionError ? (
            <Alert
              aria-labelledby="reference-selection-error-title"
              className="mx-4"
              variant="destructive"
            >
              <AlertCircle aria-hidden="true" />
              <AlertTitle id="reference-selection-error-title">
                {selectionError.title}
              </AlertTitle>
              <AlertDescription>
                {selectionError.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <Tabs
            className="min-h-0 flex-1 px-4 pb-4"
            defaultValue={config.defaultTab}
          >
            <TabsList
              className="grid h-auto w-full"
              style={{
                gridTemplateColumns: `repeat(${config.sources.length}, minmax(0, 1fr))`,
              }}
            >
              {config.sources.includes('local') ? (
                <TabsTrigger value="local">
                  <Upload aria-hidden="true" />
                  Local files
                </TabsTrigger>
              ) : null}
              {config.sources.includes('text') ? (
                <TabsTrigger aria-label="Text" value="text">
                  <FileText aria-hidden="true" />
                  Text
                </TabsTrigger>
              ) : null}
              {config.sources.includes('images') ? (
                <TabsTrigger
                  aria-label="Image Generations"
                  value="images"
                >
                  <Images aria-hidden="true" />
                  <span className="hidden sm:inline">
                    Image Generations
                  </span>
                  <span className="sm:hidden">Images</span>
                </TabsTrigger>
              ) : null}
              {config.sources.includes('videos') ? (
                <TabsTrigger
                  aria-label="Video Generations"
                  value="videos"
                >
                  <Video aria-hidden="true" />
                  <span className="hidden sm:inline">
                    Video Generations
                  </span>
                  <span className="sm:hidden">Videos</span>
                </TabsTrigger>
              ) : null}
            </TabsList>

            {config.sources.includes('local') ? (
              <TabsContent
                className="min-h-0 overflow-y-auto pt-4"
                value="local"
              >
              <div className="grid gap-4">
                <Button
                  className="w-fit"
                  disabled={browsingLocalFiles}
                  onClick={() => void browseLocalFiles()}
                  type="button"
                >
                  {browsingLocalFiles ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  ) : (
                    <Upload aria-hidden="true" />
                  )}
                  {browsingLocalFiles ? 'Browsing...' : 'Browse files'}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {purpose === 'source-video'
                    ? 'Choose one MP4 or MOV file. Media Gen uses its path automatically.'
                    : 'Choose files from this computer. Media Gen uses their paths automatically.'}
                </p>
                {value.some(
                  (reference) => reference.generationId === undefined,
                ) ? (
                  <div
                    aria-label="Selected local files"
                    className="flex flex-wrap gap-3"
                    role="group"
                  >
                    {value
                      .filter(
                        (reference) =>
                          reference.generationId === undefined,
                      )
                      .map((reference) => (
                        <ReferencePreview
                          key={reference.path}
                          onRemove={() =>
                            removeReference(reference.path)
                          }
                          reference={reference}
                        />
                      ))}
                  </div>
                ) : null}
              </div>
              </TabsContent>
            ) : null}

            {config.sources.includes('text') ? (
              <TabsContent
                className="min-h-0 overflow-y-auto pt-4"
                value="text"
              >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="text-reference-content">Text</Label>
                  <Textarea
                    className="min-h-64 resize-y font-mono text-sm"
                    id="text-reference-content"
                    onChange={(event) =>
                      setTextContent(event.target.value)
                    }
                    placeholder="Paste reference text"
                    value={textContent}
                  />
                </div>
                <Button
                  className="w-fit"
                  disabled={textContent.trim().length === 0}
                  onClick={addTextReference}
                  type="button"
                >
                  <Plus aria-hidden="true" />
                  Add text
                </Button>
              </div>
              </TabsContent>
            ) : null}

            {config.sources.includes('images') ? (
              <TabsContent
                className="min-h-0 overflow-y-auto pt-4"
                value="images"
              >
              <GenerationReferenceGrid
                addingGenerationId={addingGenerationId}
                mediaType="image"
                onAdd={addGeneration}
                onRetry={loadGenerations}
                selected={value}
                state={generationState}
              />
              </TabsContent>
            ) : null}

            {config.sources.includes('videos') ? (
              <TabsContent
                className="min-h-0 overflow-y-auto pt-4"
                value="videos"
              >
              <GenerationReferenceGrid
                addingGenerationId={addingGenerationId}
                mediaType="video"
                onAdd={addGeneration}
                onRetry={loadGenerations}
                selected={value}
                state={generationState}
              />
              </TabsContent>
            ) : null}
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  )
}

type ReferenceSourceTab = 'images' | 'local' | 'text' | 'videos'

function referencePickerConfig(purpose: ReferencePickerPurpose): {
  addLabel: string
  addMoreLabel: string
  defaultTab: 'local' | 'text'
  emptyDescription: string
  fieldLabel: string
  help: string
  sheetDescription: string
  sheetTitle: string
  sources: readonly ReferenceSourceTab[]
} {
  if (purpose === 'source-video') {
    return {
      addLabel: 'Choose source video',
      addMoreLabel: 'Change source video',
      defaultTab: 'local',
      emptyDescription: 'One local MP4 or MOV, or a prior video',
      fieldLabel: 'Source video',
      help: 'Choose exactly one MP4 or MOV source video.',
      sheetDescription:
        'Choose one local MP4 or MOV file, or reuse a prior Video Generation.',
      sheetTitle: 'Add source video',
      sources: ['local', 'videos'],
    }
  }
  if (purpose === 'text-context') {
    return {
      addLabel: 'Add context',
      addMoreLabel: 'Add more context',
      defaultTab: 'text',
      emptyDescription: 'Paste supporting text',
      fieldLabel: 'Context',
      help: 'Paste optional text to guide the result.',
      sheetDescription: 'Paste optional supporting text.',
      sheetTitle: 'Add context',
      sources: ['text'],
    }
  }
  return {
    addLabel: 'Add references',
    addMoreLabel: 'Add more references',
    defaultTab: 'local',
    emptyDescription: 'Local files, pasted text, or prior Generations',
    fieldLabel: 'References',
    help:
      'Add local files, paste text, or reuse outputs from prior Generations.',
    sheetDescription:
      'Choose local files, paste text, or reuse outputs from this Media Workspace.',
    sheetTitle: 'Add references',
    sources: ['local', 'text', 'images', 'videos'],
  }
}

function ReferenceIcons() {
  return (
    <span aria-hidden="true" className="flex -space-x-2">
      <span className="flex size-10 items-center justify-center rounded-full border bg-background shadow">
        <ImageIcon className="size-4" />
      </span>
      <span className="flex size-10 items-center justify-center rounded-full border bg-background shadow">
        <Video className="size-4" />
      </span>
    </span>
  )
}

function CompactReferenceBadge({
  onRemove,
  reference,
}: {
  onRemove(): void
  reference: ReferenceSelection
}) {
  const previewSource = referencePreviewSource(reference)
  const isImage = reference.mediaType?.startsWith('image/') ?? false
  return (
    <Badge
      className="max-w-52 gap-1.5 py-1"
      variant="outline"
    >
      {previewSource !== undefined && isImage ? (
        <img
          alt={`Reference ${fileName(reference.path)}`}
          className="size-5 rounded-sm object-cover"
          src={previewSource}
        />
      ) : (
        <FileIcon aria-hidden="true" className="size-3" />
      )}
      <span className="truncate">{fileName(reference.path)}</span>
      <button
        aria-label={`Remove ${fileName(reference.path)}`}
        className="rounded-sm text-muted-foreground hover:text-foreground"
        onClick={onRemove}
        type="button"
      >
        <X aria-hidden="true" className="size-3" />
      </button>
    </Badge>
  )
}

function ReferencePreview({
  onRemove,
  reference,
}: {
  onRemove(): void
  reference: ReferenceSelection
}) {
  const previewSource = referencePreviewSource(reference)
  const isImage = reference.mediaType?.startsWith('image/') ?? false
  const isVideo = reference.mediaType?.startsWith('video/') ?? false

  return (
    <div
      className="group relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-card"
      title={fileName(reference.path)}
    >
      {previewSource !== undefined && isImage ? (
        <img
          alt={`Reference ${fileName(reference.path)}`}
          className="size-full object-cover"
          src={previewSource}
        />
      ) : previewSource !== undefined && isVideo ? (
        <video
          aria-label={`Reference ${fileName(reference.path)}`}
          className="size-full object-cover"
          muted
          playsInline
          preload="metadata"
          src={previewSource}
        />
      ) : (
        <GenericFilePreview path={reference.path} />
      )}
      {previewSource !== undefined ? (
        <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-[10px] text-white">
          {fileName(reference.path)}
        </span>
      ) : null}
      <Button
        aria-label={`Remove reference ${fileName(reference.path)}`}
        className="absolute top-1 right-1 opacity-0 shadow group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onRemove}
        size="icon-xs"
        type="button"
        variant="secondary"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

function referencePreviewSource(
  reference: ReferenceSelection,
): string | undefined {
  return (
    reference.previewUrl ??
    (reference.generationId === undefined
      ? undefined
      : `/api/generations/${encodeURIComponent(reference.generationId)}/outputs/${reference.outputIndex ?? 0}`)
  )
}

function TextReferencePreview({
  onRemove,
  reference,
}: {
  onRemove(): void
  reference: TextReferenceSelection
}) {
  const label = textReferenceLabel(reference)
  return (
    <div
      className="group relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-card"
      title={label}
    >
      <FileText
        aria-hidden="true"
        className="size-7 text-muted-foreground"
      />
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-[10px] text-white">
        {label}
      </span>
      <Button
        aria-label={`Remove text reference ${label}`}
        className="absolute top-1 right-1 opacity-0 shadow group-hover:opacity-100 focus-visible:opacity-100"
        onClick={onRemove}
        size="icon-xs"
        type="button"
        variant="secondary"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}

function GenericFilePreview({path}: {path: string}) {
  const details = fileDetails(path)
  return (
    <span className="grid w-full justify-items-center gap-1 px-2 text-center">
      <span className="sr-only">{fileName(path)}</span>
      <FileIcon
        aria-hidden="true"
        className="size-7 text-muted-foreground"
      />
      <span className="w-full truncate text-[11px] font-medium">
        {details.title}
      </span>
      <Badge className="px-1.5 text-[9px]" variant="secondary">
        {details.extension}
      </Badge>
    </span>
  )
}

function GenerationReferenceGrid({
  addingGenerationId,
  mediaType,
  onAdd,
  onRetry,
  selected,
  state,
}: {
  addingGenerationId: string | null
  mediaType: 'image' | 'video'
  onAdd(generation: GenerationRecord): Promise<void>
  onRetry(): void
  selected: ReferenceSelection[]
  state:
    | {state: 'idle'}
    | {state: 'loading'}
    | {message: string; state: 'error'}
    | {result: GenerationsListResult; state: 'success'}
}) {
  if (state.state === 'idle' || state.state === 'loading') {
    return (
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        role="status"
      >
        <LoaderCircle aria-hidden="true" className="animate-spin" />
        Loading Generations...
      </div>
    )
  }

  if (state.state === 'error') {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load Generations</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>{state.message}</p>
          <Button
            className="w-fit"
            onClick={onRetry}
            size="sm"
            type="button"
            variant="outline"
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const generations = state.result.generations.filter(
    (generation) =>
      generation.mediaType === mediaType &&
      generation.outputs.length > 0,
  )

  if (generations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No completed {mediaType} Generations are available.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {generations.map((generation) => {
        const selectedGeneration = selected.some(
          (reference) => reference.generationId === generation.id,
        )
        const loading = addingGenerationId === generation.id
        return (
          <Button
            aria-label={`Use Generation ${generation.id}`}
            className="relative h-auto min-h-40 overflow-hidden p-0"
            disabled={loading}
            key={generation.id}
            onClick={() => void onAdd(generation)}
            type="button"
            variant="outline"
          >
            {generation.mediaType === 'image' ? (
              <img
                alt=""
                className="absolute inset-0 size-full object-cover"
                src={`/api/generations/${encodeURIComponent(generation.id)}/outputs/0`}
              />
            ) : (
              <video
                aria-hidden="true"
                className="absolute inset-0 size-full object-cover"
                muted
                playsInline
                preload="metadata"
                src={`/api/generations/${encodeURIComponent(generation.id)}/outputs/0`}
              />
            )}
            <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
            <span className="absolute inset-x-0 bottom-0 grid gap-1 p-3 text-left text-white">
              <strong className="truncate text-sm">
                {generationSelectionLabel(generation)}
              </strong>
              <span className="truncate text-xs text-white/65">
                {generation.creativeBrief}
              </span>
            </span>
            {selectedGeneration ? (
              <Badge className="absolute top-2 right-2">
                Selected
              </Badge>
            ) : null}
            {loading ? (
              <span className="absolute inset-0 grid place-items-center bg-black/45">
                <LoaderCircle
                  aria-hidden="true"
                  className="animate-spin text-white"
                />
              </span>
            ) : null}
          </Button>
        )
      })}
    </div>
  )
}

function mergeReferences(
  current: ReferenceSelection[],
  additions: ReferenceSelection[],
) {
  const references = new Map(
    current.map((reference) => [reference.path, reference]),
  )
  for (const reference of additions) {
    references.set(reference.path, reference)
  }
  return [...references.values()]
}

function fileName(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path
}

function fileDetails(path: string): {
  extension: string
  title: string
} {
  const name = fileName(path)
  const extensionIndex = name.lastIndexOf('.')
  if (extensionIndex <= 0 || extensionIndex === name.length - 1) {
    return {extension: 'FILE', title: name}
  }
  return {
    extension: name.slice(extensionIndex + 1).toUpperCase(),
    title: name.slice(0, extensionIndex),
  }
}

function textReferenceLabel(
  reference: TextReferenceSelection,
): string {
  const explicitTitle = reference.title?.trim()
  if (explicitTitle) {
    return explicitTitle
  }
  const firstLine = reference.content
    .trim()
    .split(/\r?\n/, 1)[0]
    ?.replace(/^#{1,6}\s+/, '')
    .trim()
  return firstLine?.slice(0, 40) || 'Text reference'
}
