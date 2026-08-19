import {
  AlertCircle,
  FileImage,
  FileText,
  FileVideo2,
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
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
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
}

export interface TextReferenceSelection {
  content: string
  format: 'markdown' | 'text'
  id: string
  title: string
}

interface ReferencePickerProps {
  onChange(value: ReferenceSelection[]): void
  onTextReferencesChange?(
    value: TextReferenceSelection[],
  ): void
  textReferences?: TextReferenceSelection[]
  value: ReferenceSelection[]
}

const api = createApiClient()

export function ReferencePicker({
  onChange,
  onTextReferencesChange = () => undefined,
  textReferences = [],
  value,
}: ReferencePickerProps) {
  const [open, setOpen] = useState(false)
  const [manualPaths, setManualPaths] = useState('')
  const [textContent, setTextContent] = useState('')
  const [textFormat, setTextFormat] = useState<
    'markdown' | 'text'
  >('markdown')
  const [textTitle, setTextTitle] = useState('')
  const [selectionError, setSelectionError] = useState<string | null>(
    null,
  )
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
    if (!open || generationState.state !== 'idle') {
      return
    }
    loadGenerations()
  }, [generationState.state, open])

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

  function addManualPaths() {
    const paths = manualPaths
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
    if (paths.length === 0) {
      return
    }
    onChange(
      mergeReferences(
        value,
        paths.map((path) => ({
          mediaType: inferMediaType(path),
          path,
        })),
      ),
    )
    setManualPaths('')
  }

  async function addGeneration(generation: GenerationRecord) {
    setSelectionError(null)
    setAddingGenerationId(generation.id)
    try {
      const result = await api.addReferences([generation.id])
      onChange(
        mergeReferences(
          value,
          result.references.map((reference, outputIndex) => ({
            generationId: reference.generationId,
            mediaType: reference.mediaType,
            outputIndex,
            path: reference.path,
          })),
        ),
      )
    } catch (error) {
      setSelectionError(
        errorMessage(
          error,
          'The Generation reference could not be added.',
        ),
      )
    } finally {
      setAddingGenerationId(null)
    }
  }

  function removeReference(path: string) {
    onChange(value.filter((reference) => reference.path !== path))
  }

  function addTextReference() {
    const content = textContent.trim()
    if (content.length === 0) {
      return
    }
    const title =
      textTitle.trim() || `Text Reference ${textReferences.length + 1}`
    onTextReferencesChange([
      ...textReferences,
      {
        content,
        format: textFormat,
        id:
          globalThis.crypto?.randomUUID?.() ??
          `text-${Date.now()}-${textReferences.length}`,
        title,
      },
    ])
    setTextContent('')
    setTextTitle('')
  }

  function removeTextReference(id: string) {
    onTextReferencesChange(
      textReferences.filter((reference) => reference.id !== id),
    )
  }

  return (
    <>
      <div className="grid gap-2">
        <Label>References</Label>
        {value.length === 0 && textReferences.length === 0 ? (
          <Button
            aria-label="Add references"
            className="h-36 w-full flex-col gap-3 border-dashed bg-muted/10 text-muted-foreground hover:bg-muted/25 hover:text-foreground"
            data-reference-dropzone="true"
            onClick={() => setOpen(true)}
            type="button"
            variant="outline"
          >
            <ReferenceIcons />
            <span className="grid gap-1 text-center">
              <strong className="font-heading text-sm font-medium">
                Add references
              </strong>
              <span className="text-xs font-normal">
                Local files, pasted text, or prior Generations
              </span>
            </span>
          </Button>
        ) : (
          <div className="flex min-h-36 flex-wrap items-center gap-3 rounded-xl border bg-muted/10 p-4">
            <Button
              aria-label="Add more references"
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
          Add local files, pasted text or Markdown, or reuse outputs
          from prior Generations.
        </p>
      </div>

      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent className="!w-full sm:!max-w-3xl">
          <SheetHeader className="border-b">
            <SheetTitle>Add references</SheetTitle>
            <SheetDescription>
              Choose local files, paste text or Markdown, or reuse
              outputs from this Media Workspace.
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
                Could not add Generation reference
              </AlertTitle>
              <AlertDescription>{selectionError}</AlertDescription>
            </Alert>
          ) : null}

          <Tabs
            className="min-h-0 flex-1 px-4 pb-4"
            defaultValue="local"
          >
            <TabsList className="grid h-auto w-full grid-cols-4">
              <TabsTrigger value="local">
                <Upload aria-hidden="true" />
                Local files
              </TabsTrigger>
              <TabsTrigger
                aria-label="Text"
                value="text"
              >
                <FileText aria-hidden="true" />
                Text
              </TabsTrigger>
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
            </TabsList>

            <TabsContent
              className="min-h-0 overflow-y-auto pt-4"
              value="local"
            >
              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="reference-paths">
                    Reference paths
                  </Label>
                  <Textarea
                    className="min-h-36 resize-y"
                    id="reference-paths"
                    onChange={(event) =>
                      setManualPaths(event.target.value)
                    }
                    placeholder={
                      'C:\\assets\\product.png\nOne local path per line'
                    }
                    value={manualPaths}
                  />
                </div>
                <Button
                  className="w-fit"
                  disabled={manualPaths.trim().length === 0}
                  onClick={addManualPaths}
                  type="button"
                >
                  <Plus aria-hidden="true" />
                  Add paths
                </Button>
              </div>
            </TabsContent>

            <TabsContent
              className="min-h-0 overflow-y-auto pt-4"
              value="text"
            >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="text-reference-title">Title</Label>
                  <Input
                    id="text-reference-title"
                    onChange={(event) =>
                      setTextTitle(event.target.value)
                    }
                    placeholder="Product documentation"
                    value={textTitle}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="text-reference-format">Format</Label>
                  <NativeSelect
                    className="w-full"
                    id="text-reference-format"
                    onChange={(event) =>
                      setTextFormat(
                        event.target.value === 'text'
                          ? 'text'
                          : 'markdown',
                      )
                    }
                    value={textFormat}
                  >
                    <NativeSelectOption value="markdown">
                      Markdown
                    </NativeSelectOption>
                    <NativeSelectOption value="text">
                      Plain text
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="text-reference-content">
                    Text or Markdown content
                  </Label>
                  <Textarea
                    className="min-h-64 resize-y font-mono text-sm"
                    id="text-reference-content"
                    onChange={(event) =>
                      setTextContent(event.target.value)
                    }
                    placeholder="# Product documentation"
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
                  Add Text Reference
                </Button>
              </div>
            </TabsContent>

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
          </Tabs>
        </SheetContent>
      </Sheet>
    </>
  )
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

function ReferencePreview({
  onRemove,
  reference,
}: {
  onRemove(): void
  reference: ReferenceSelection
}) {
  const previewSource =
    reference.generationId === undefined
      ? undefined
      : `/api/generations/${encodeURIComponent(reference.generationId)}/outputs/${reference.outputIndex ?? 0}`
  const isImage = reference.mediaType?.startsWith('image/') ?? false
  const isVideo = reference.mediaType?.startsWith('video/') ?? false

  return (
    <div
      className="group relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-card"
      title={reference.path}
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
      ) : isVideo ? (
        <FileVideo2
          aria-hidden="true"
          className="size-7 text-muted-foreground"
        />
      ) : (
        <FileImage
          aria-hidden="true"
          className="size-7 text-muted-foreground"
        />
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-[10px] text-white">
        {fileName(reference.path)}
      </span>
      <Button
        aria-label={`Remove reference ${reference.path}`}
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

function TextReferencePreview({
  onRemove,
  reference,
}: {
  onRemove(): void
  reference: TextReferenceSelection
}) {
  return (
    <div
      className="group relative grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-card"
      title={reference.title}
    >
      <FileText
        aria-hidden="true"
        className="size-7 text-muted-foreground"
      />
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1 text-[10px] text-white">
        {reference.title}
      </span>
      <Button
        aria-label={`Remove Text Reference ${reference.title}`}
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

function inferMediaType(path: string) {
  return /\.(mp4|mov|webm)$/i.test(path)
    ? 'video/*'
    : /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(path)
      ? 'image/*'
      : undefined
}

function fileName(path: string) {
  return path.split(/[\\/]/).at(-1) ?? path
}
