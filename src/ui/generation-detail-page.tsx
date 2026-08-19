import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  ImageIcon,
  Link2,
  LoaderCircle,
  Pencil,
  RefreshCcw,
  Trash2,
  Video,
} from 'lucide-react'
import {useCallback, useEffect, useState} from 'react'
import {Link, useParams} from 'react-router-dom'

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
import {Label} from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import {Separator} from '@/components/ui/separator'
import {Textarea} from '@/components/ui/textarea'

import {
  ApiError,
  createApiClient,
  errorMessage,
  type GenerationRecord,
} from './api-client.js'
import {
  defaultStyleFor,
  listStyleDefinitions,
} from '../catalog/styles.js'
import {
  generationSelectionLabel,
  generationStyleLabel,
} from './generation-label.js'
import {GenerationStatusBadge} from './generation-status-badge.js'

const api = createApiClient()

export function GenerationDetailPage() {
  const {id = ''} = useParams()
  const [generation, setGeneration] =
    useState<GenerationRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [creativeBrief, setCreativeBrief] = useState('')
  const [style, setStyle] = useState(defaultStyleFor('image'))
  const [editState, setEditState] = useState<
    | {state: 'idle'}
    | {state: 'loading'}
    | {generationId: string; state: 'success'}
  >({state: 'idle'})
  const [recreateState, setRecreateState] = useState<
    | {state: 'idle'}
    | {state: 'loading'}
    | {generationId: string; state: 'success'}
  >({state: 'idle'})
  const [referenceState, setReferenceState] = useState<
    | {state: 'idle'}
    | {state: 'loading'}
    | {paths: string[]; state: 'success'}
  >({state: 'idle'})
  const [exportState, setExportState] = useState<
    | {state: 'idle'}
    | {state: 'loading'}
    | {message: string; state: 'confirming'}
    | {files: string[]; state: 'success'}
  >({state: 'idle'})
  const [deleteState, setDeleteState] = useState<
    'idle' | 'confirming' | 'loading' | 'success'
  >('idle')
  const [actionError, setActionError] = useState<string | null>(null)

  const loadGeneration = useCallback(() => {
    setGeneration(null)
    setLoadError(null)
    void api
      .getGeneration(id)
      .then(({generation: loaded}) => {
        setGeneration(loaded)
        setCreativeBrief(loaded.creativeBrief)
        setStyle(
          loaded.selection.kind === 'generator'
            ? loaded.selection.style
            : defaultStyleFor(loaded.mediaType),
        )
      })
      .catch((error: unknown) =>
        setLoadError(
          errorMessage(error, 'The Generation could not be loaded.'),
        ),
      )
  }, [id])

  useEffect(loadGeneration, [loadGeneration])

  async function handleEdit() {
    setActionError(null)
    setEditState({state: 'loading'})
    try {
      const result = await api.editGeneration(id, {
        creativeBrief,
        style,
      })
      setEditState({
        generationId: result.generation.id,
        state: 'success',
      })
    } catch (error) {
      setEditState({state: 'idle'})
      setActionError(errorMessage(error))
    }
  }

  async function handleRecreate() {
    setActionError(null)
    setRecreateState({state: 'loading'})
    try {
      const result = await api.recreateGeneration(id, {
        creativeBrief,
        style,
      })
      setRecreateState({
        generationId: result.generation.id,
        state: 'success',
      })
    } catch (error) {
      setRecreateState({state: 'idle'})
      setActionError(errorMessage(error))
    }
  }

  async function handleReference() {
    setActionError(null)
    setReferenceState({state: 'loading'})
    try {
      const result = await api.addReferences([id])
      setReferenceState({
        paths: result.references.map((reference) => reference.path),
        state: 'success',
      })
    } catch (error) {
      setReferenceState({state: 'idle'})
      setActionError(errorMessage(error))
    }
  }

  async function handleExport(force = false) {
    setActionError(null)
    setExportState({state: 'loading'})
    try {
      const result = await api.exportGeneration(id, {force})
      setExportState({files: result.files, state: 'success'})
    } catch (error) {
      if (
        !force &&
        error instanceof ApiError &&
        error.code === 'confirmation_required'
      ) {
        setExportState({
          message: error.message,
          state: 'confirming',
        })
        return
      }
      setExportState({state: 'idle'})
      setActionError(errorMessage(error))
    }
  }

  async function handleDelete() {
    setActionError(null)
    setDeleteState('loading')
    try {
      await api.deleteGeneration(id, true)
      setDeleteState('success')
    } catch (error) {
      setDeleteState('confirming')
      setActionError(errorMessage(error))
    }
  }

  if (loadError) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-4 py-12">
        <Alert
          aria-labelledby="detail-error-title"
          className="max-w-xl"
          variant="destructive"
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle id="detail-error-title">
            <h1>Could not load Generation</h1>
          </AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>{loadError}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={loadGeneration}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link to="/generations">Back to Generations</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  if (!generation) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-4">
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin"
          />
          Loading Generation...
        </div>
      </main>
    )
  }

  if (deleteState === 'success') {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-4 py-12">
        <Card className="w-full max-w-lg text-center">
          <CardHeader className="justify-items-center">
            <span className="mb-3 flex size-14 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 aria-hidden="true" className="size-5" />
            </span>
            <CardDescription>
              Removed from this workspace
            </CardDescription>
            <CardTitle>
              <h1 className="text-2xl">Generation deleted</h1>
            </CardTitle>
            <CardDescription>
              Generation {id} and its working files were removed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/generations">Back to Generations</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  const MediaIcon =
    generation.mediaType === 'image' ? ImageIcon : Video

  return (
    <main
      className="grid min-h-[calc(100vh-4rem)] w-full lg:grid-cols-[minmax(0,1fr)_420px]"
      data-layout="generation-detail"
    >
      <section
        className="relative flex min-h-[60vh] items-center justify-center overflow-hidden bg-[#171a1d] p-4 sm:p-8 lg:min-h-[calc(100vh-4rem)]"
        data-layout="media-stage"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,oklch(0.7_0.04_240_/_0.12),transparent_50%)]"
        />

        <div className="absolute top-4 left-4 z-10">
          <Button
            asChild
            className="border-white/10 bg-black/25 text-white backdrop-blur hover:bg-black/45 hover:text-white"
            size="sm"
            variant="outline"
          >
            <Link to="/generations">
              <ArrowLeft aria-hidden="true" />
              Generations
            </Link>
          </Button>
        </div>

        {generation.outputs.length === 0 ? (
          <div className="relative grid justify-items-center gap-3 text-center text-white/70">
            <span className="flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-black/20">
              <MediaIcon aria-hidden="true" className="size-6" />
            </span>
            <strong className="font-heading text-base font-medium">
              No output file recorded
            </strong>
          </div>
        ) : (
          <div
            className={
              generation.outputs.length > 1
                ? 'relative grid size-full grid-cols-1 place-items-center gap-4 lg:grid-cols-2'
                : 'relative grid size-full place-items-center'
            }
          >
            {generation.outputs.map((output, index) => {
              const source = `/api/generations/${encodeURIComponent(generation.id)}/outputs/${index}`
              return (
                <figure
                  className="grid size-full min-h-0 place-items-center gap-2"
                  key={output.path}
                >
                  {output.mediaType.startsWith('image/') ? (
                    <img
                      alt={`Generated output ${index + 1}`}
                      className="max-h-[calc(100vh-8rem)] max-w-full rounded-md object-contain shadow-2xl shadow-black/30"
                      src={source}
                    />
                  ) : output.mediaType.startsWith('video/') ? (
                    <video
                      aria-label={`Generated output ${index + 1}`}
                      className="max-h-[calc(100vh-8rem)] max-w-full rounded-md object-contain shadow-2xl shadow-black/30"
                      controls
                      src={source}
                    />
                  ) : output.mediaType.startsWith('audio/') ? (
                    <audio
                      aria-label={`Generated narration ${index + 1}`}
                      className="w-full max-w-xl"
                      controls
                      src={source}
                    />
                  ) : null}
                  <figcaption className="max-w-full truncate text-xs text-white/40">
                    {output.path}
                  </figcaption>
                </figure>
              )
            })}
          </div>
        )}

        {generation.error ? (
          <Alert
            className="absolute right-4 bottom-4 left-4 z-10 bg-background/95 backdrop-blur"
            variant="destructive"
          >
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{generation.error.code}</AlertTitle>
            <AlertDescription>
              {generation.error.message}
            </AlertDescription>
          </Alert>
        ) : null}
      </section>

      <aside
        aria-label="Generation information"
        className="border-t bg-background lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)] lg:overflow-y-auto lg:border-t-0 lg:border-l"
        data-layout="information-panel"
      >
        <header className="border-b p-5">
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Generation
          </p>
          <h1 className="mt-1 break-all font-heading text-xl font-semibold tracking-tight">
            Generation {generation.id}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge className="capitalize" variant="outline">
              {generation.mediaType}
            </Badge>
            <GenerationStatusBadge status={generation.status} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
          {new Date(generation.createdAt).toLocaleString()}
          </p>
        </header>

        <div className="grid gap-5 p-5">
              <section className="grid gap-2">
                <Label htmlFor="detail-brief">Creative Brief</Label>
                <Textarea
                  className="min-h-36 resize-y"
                  id="detail-brief"
                  onChange={(event) =>
                    setCreativeBrief(event.target.value)
                  }
                  rows={7}
                  value={creativeBrief}
                />
              </section>

              <section className="grid gap-2">
                <Label htmlFor="detail-style">Style</Label>
                <NativeSelect
                  className="w-full"
                  id="detail-style"
                  onChange={(event) => setStyle(event.target.value)}
                  value={style}
                >
                  {listStyleDefinitions(generation.mediaType).map(
                    (definition) => (
                      <NativeSelectOption
                        key={definition.id}
                        value={definition.id}
                      >
                        {definition.label}
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </section>

              <Separator />

              <section className="grid gap-3 text-sm">
                {[
                  ['Model', generation.resolvedModel.model],
                  ['Deployment', generation.resolvedModel.deployment],
                  ['Created with', generationSelectionLabel(generation)],
                  ['Style', generationStyleLabel(generation)],
                  [
                    'Preset',
                    generation.selection.kind === 'scenario'
                      ? generation.selection.preset
                      : undefined,
                  ],
                  [
                    'Scenario',
                    generation.selection.kind === 'scenario'
                      ? generationSelectionLabel(generation)
                      : undefined,
                  ],
                ]
                  .filter(
                    (entry): entry is [string, string] =>
                      entry[1] !== undefined,
                  )
                  .map(([label, value]) => (
                  <div
                    className="grid grid-cols-[90px_minmax(0,1fr)] gap-3"
                    key={label}
                  >
                    <span className="text-muted-foreground">
                      {label}
                    </span>
                    <strong className="break-words font-medium">
                      {value}
                    </strong>
                  </div>
                  ))}
              </section>

              <Separator />

              <section className="grid gap-3">
                <h2 className="font-heading text-sm font-medium">
                  Reference Assets
                </h2>
                {generation.references.length === 0 ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    No Reference Assets.
                  </p>
                ) : (
                  <ul className="grid gap-2">
                    {generation.references.map((reference) => (
                      <li
                        className="grid gap-1 rounded-lg border bg-muted/20 p-3"
                        key={`${reference.path}-${reference.sha256}`}
                      >
                        <code className="break-all text-xs">
                          {reference.path}
                        </code>
                        <span className="text-xs text-muted-foreground">
                          {reference.mediaType}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Separator />

              <section className="grid gap-3">
                <h2 className="font-heading text-sm font-medium">
                  Source Generations
                </h2>
                {generation.sourceGenerations.length === 0 ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    This Generation started from a Creative Brief.
                  </p>
                ) : (
                  <div className="grid justify-items-start gap-1">
                    {generation.sourceGenerations.map((sourceId) => (
                      <Button
                        asChild
                        className="h-auto px-0"
                        key={sourceId}
                        variant="link"
                      >
                        <Link to={`/generations/${sourceId}`}>
                          Source Generation {sourceId}
                        </Link>
                      </Button>
                    ))}
                  </div>
                )}
              </section>

              <Separator />

              <section className="grid grid-cols-2 gap-2">
                <Button
                  disabled={editState.state === 'loading'}
                  onClick={handleEdit}
                  type="button"
                  variant="outline"
                >
                  {editState.state === 'loading' ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  ) : (
                    <Pencil aria-hidden="true" />
                  )}
                  {editState.state === 'loading'
                    ? 'Editing...'
                    : 'Edit'}
                </Button>
                <Button
                  disabled={recreateState.state === 'loading'}
                  onClick={handleRecreate}
                  type="button"
                  variant="outline"
                >
                  {recreateState.state === 'loading' ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  ) : (
                    <RefreshCcw aria-hidden="true" />
                  )}
                  {recreateState.state === 'loading'
                    ? 'Recreating...'
                    : 'Recreate'}
                </Button>
                <Button
                  disabled={referenceState.state === 'loading'}
                  onClick={handleReference}
                  type="button"
                  variant="outline"
                >
                  {referenceState.state === 'loading' ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  ) : (
                    <Link2 aria-hidden="true" />
                  )}
                  {referenceState.state === 'loading'
                    ? 'Adding reference...'
                    : 'Reference'}
                </Button>
                <Button
                  disabled={exportState.state === 'loading'}
                  onClick={() => handleExport()}
                  type="button"
                  variant="outline"
                >
                  {exportState.state === 'loading' ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="animate-spin"
                    />
                  ) : (
                    <Download aria-hidden="true" />
                  )}
                  {exportState.state === 'loading'
                    ? 'Exporting...'
                    : 'Export'}
                </Button>
                <Button
                  className="col-span-2"
                  onClick={() => setDeleteState('confirming')}
                  type="button"
                  variant="destructive"
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              </section>

              {exportState.state === 'confirming' ? (
                <Card
                  aria-labelledby="export-overwrite-title"
                  className="border-destructive/30 bg-destructive/5"
                  role="alertdialog"
                  size="sm"
                >
                  <CardHeader>
                    <CardTitle>
                      <h2 id="export-overwrite-title">
                        Overwrite exported files?
                      </h2>
                    </CardTitle>
                    <CardDescription>
                      {exportState.message}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button
                      onClick={() =>
                        setExportState({state: 'idle'})
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleExport(true)}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      Confirm overwrite
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {deleteState === 'confirming' ||
              deleteState === 'loading' ? (
                <Card
                  aria-labelledby="delete-title"
                  className="border-destructive/30 bg-destructive/5"
                  role="alertdialog"
                  size="sm"
                >
                  <CardHeader>
                    <CardTitle>
                      <h2 id="delete-title">
                        Delete this Generation?
                      </h2>
                    </CardTitle>
                    <CardDescription>
                      This permanently removes its record and working
                      files.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button
                      disabled={deleteState === 'loading'}
                      onClick={() => setDeleteState('idle')}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Keep Generation
                    </Button>
                    <Button
                      disabled={deleteState === 'loading'}
                      onClick={handleDelete}
                      size="sm"
                      type="button"
                      variant="destructive"
                    >
                      {deleteState === 'loading' ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="animate-spin"
                        />
                      ) : (
                        <Trash2 aria-hidden="true" />
                      )}
                      {deleteState === 'loading'
                        ? 'Deleting...'
                        : 'Confirm delete'}
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {actionError ? (
                <Alert
                  aria-labelledby="action-error-title"
                  variant="destructive"
                >
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle id="action-error-title">
                    Action failed
                  </AlertTitle>
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              ) : null}

              {editState.state === 'success' ? (
                <Card
                  className="border-emerald-500/25 bg-emerald-500/5"
                  role="status"
                  size="sm"
                >
                  <CardContent className="grid gap-2">
                    <p>
                      Edit created Generation {editState.generationId}.
                    </p>
                    <Button
                      asChild
                      className="w-fit px-0"
                      variant="link"
                    >
                      <Link
                        to={`/generations/${editState.generationId}`}
                      >
                        Open edited Generation
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {recreateState.state === 'success' ? (
                <Card
                  className="border-emerald-500/25 bg-emerald-500/5"
                  role="status"
                  size="sm"
                >
                  <CardContent className="grid gap-2">
                    <p>
                      Recreate created Generation{' '}
                      {recreateState.generationId}.
                    </p>
                    <Button
                      asChild
                      className="w-fit px-0"
                      variant="link"
                    >
                      <Link
                        to={`/generations/${recreateState.generationId}`}
                      >
                        Open recreated Generation
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {referenceState.state === 'success' ? (
                <Card
                  className="border-emerald-500/25 bg-emerald-500/5"
                  role="status"
                  size="sm"
                >
                  <CardContent className="grid gap-2">
                    <p>
                      Added {referenceState.paths.length} output
                      {referenceState.paths.length === 1 ? '' : 's'} to
                      the Create references.
                    </p>
                    <Button
                      asChild
                      className="w-fit px-0"
                      variant="link"
                    >
                      <Link
                        state={{referencePaths: referenceState.paths}}
                        to="/create"
                      >
                        Continue in Create
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : null}

              {exportState.state === 'success' ? (
                <Card
                  className="border-emerald-500/25 bg-emerald-500/5"
                  role="status"
                  size="sm"
                >
                  <CardContent className="grid gap-2">
                    <p>
                      Exported {exportState.files.length} file
                      {exportState.files.length === 1 ? '' : 's'}.
                    </p>
                    {exportState.files.map((file) => (
                      <code
                        className="break-all text-xs text-muted-foreground"
                        key={file}
                      >
                        {file}
                      </code>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
        </div>
      </aside>
    </main>
  )
}
