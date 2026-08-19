import {
  AlertCircle,
  ImageIcon,
  LoaderCircle,
  Play,
  Plus,
  Video,
} from 'lucide-react'
import {useCallback, useEffect, useState} from 'react'
import {Link} from 'react-router-dom'

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

import {
  createApiClient,
  errorMessage,
  type GenerationRecord,
  type GenerationsListResult,
} from './api-client.js'
import {generationSelectionLabel} from './generation-label.js'
import {GenerationStatusBadge} from './generation-status-badge.js'

const api = createApiClient()

export function GenerationsPage() {
  const [state, setState] = useState<
    | {state: 'loading'}
    | {message: string; state: 'error'}
    | {result: GenerationsListResult; state: 'success'}
  >({state: 'loading'})

  const loadGenerations = useCallback(() => {
    setState({state: 'loading'})
    void api
      .listGenerations()
      .then((result) => setState({result, state: 'success'}))
      .catch((error: unknown) =>
        setState({
          message: errorMessage(
            error,
            'Generation history could not be loaded.',
          ),
          state: 'error',
        }),
      )
  }, [])

  useEffect(loadGenerations, [loadGenerations])

  if (state.state === 'loading') {
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
          Loading Generations...
        </div>
      </main>
    )
  }

  if (state.state === 'error') {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-4 py-12">
        <Alert
          aria-labelledby="generations-error-title"
          className="max-w-xl"
          variant="destructive"
        >
          <AlertCircle aria-hidden="true" />
          <AlertTitle id="generations-error-title">
            <h1>Could not load Generations</h1>
          </AlertTitle>
          <AlertDescription className="grid gap-3">
            <p>{state.message}</p>
            <Button
              className="w-fit"
              onClick={loadGenerations}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  const {result} = state

  if (result.generations.length === 0) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-4 py-12">
        <Card className="w-full max-w-lg text-center">
          <CardHeader className="justify-items-center">
            <span className="mb-3 flex size-14 items-center justify-center rounded-2xl border bg-muted text-muted-foreground">
              <Plus aria-hidden="true" className="size-5" />
            </span>
            <CardDescription>Generation history</CardDescription>
            <CardTitle>
              <h1 className="text-2xl">No Generations yet</h1>
            </CardTitle>
            <CardDescription>
              Your image and video Generations will appear here.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/create">Create your first Generation</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    )
  }

  const generations = [...result.generations].sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt),
  )

  return (
    <main className="flex h-[calc(100vh-4rem)] min-h-[520px] w-full flex-col overflow-hidden">
      <header className="flex min-h-16 flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <div>
          <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Workspace history
          </p>
          <div className="flex items-baseline gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              Generations
            </h1>
            <p className="hidden text-sm text-muted-foreground md:block">
              Review, reuse, and export work from this Media Workspace.
            </p>
          </div>
        </div>
        <Badge className="w-fit" variant="outline">
          {result.count} Generation{result.count === 1 ? '' : 's'}
        </Badge>
      </header>

      <section
        aria-label="Generation gallery"
        className="flex min-h-0 flex-1 flex-wrap content-start gap-px overflow-y-auto bg-border p-px"
        data-layout="full-screen-gallery"
      >
        {generations.map((generation) => (
          <GenerationGalleryTile
            generation={generation}
            key={generation.id}
          />
        ))}
        <div
          aria-hidden="true"
          className="h-0"
          style={{flexBasis: '18rem', flexGrow: 999}}
        />
      </section>
    </main>
  )
}

function GenerationGalleryTile({
  generation,
}: {
  generation: GenerationRecord
}) {
  const output = generation.outputs[0]
  const inFlight = isInFlightStatus(generation.status)
  const [aspectRatio, setAspectRatio] = useState(
    generation.mediaType === 'video' ? 16 / 9 : 1,
  )
  const MediaIcon =
    generation.mediaType === 'image' ? ImageIcon : Video
  const outputSource = `/api/generations/${encodeURIComponent(generation.id)}/outputs/0`
  const selectionLabel = generationSelectionLabel(generation)

  function updateAspectRatio(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      return
    }
    setAspectRatio(Math.min(3, Math.max(0.4, width / height)))
  }

  return (
    <Card
      aria-labelledby={`generation-${generation.id}`}
      className="group relative min-h-40 min-w-40 overflow-hidden rounded-none border-0 bg-black py-0 ring-0"
      data-aspect-ratio={aspectRatio.toFixed(3)}
      data-tile-layout="intrinsic"
      role="article"
      style={{
        aspectRatio: `${aspectRatio}`,
        flexBasis: `calc(${aspectRatio} * 18rem)`,
        flexGrow: aspectRatio,
      }}
    >
      <div className="absolute inset-0 overflow-hidden">
        {inFlight && !output ? (
          <div className="relative grid size-full place-items-center overflow-hidden bg-gradient-to-br from-muted via-card to-muted/50">
            <div
              aria-hidden="true"
              className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_50%_42%,oklch(0.75_0.08_270_/_0.18),transparent_42%)]"
            />
            <div
              aria-label={`Generating ${selectionLabel}`}
              aria-live="polite"
              className="relative z-10 grid justify-items-center gap-3 text-center text-white"
              role="status"
            >
              <span className="flex size-12 items-center justify-center rounded-full border border-white/15 bg-black/25 backdrop-blur">
                <LoaderCircle
                  aria-hidden="true"
                  className="size-5 animate-spin"
                />
              </span>
              <span className="font-heading text-sm font-medium">
                Generating {generation.mediaType}...
              </span>
              <span className="text-xs capitalize text-white/55">
                {generation.status}
              </span>
            </div>
          </div>
        ) : output?.mediaType.startsWith('image/') ? (
          <img
            alt={`Generation output for ${selectionLabel}`}
            className="size-full bg-black object-contain transition duration-500 group-hover:scale-[1.01]"
            data-fit="intrinsic"
            loading="lazy"
            onLoad={(event) =>
              updateAspectRatio(
                event.currentTarget.naturalWidth,
                event.currentTarget.naturalHeight,
              )
            }
            src={outputSource}
          />
        ) : output?.mediaType.startsWith('video/') ? (
          <>
            <video
              aria-label={`Generation output for ${selectionLabel}`}
              className="size-full bg-black object-contain transition duration-500 group-hover:scale-[1.01]"
              data-fit="intrinsic"
              muted
              onLoadedMetadata={(event) =>
                updateAspectRatio(
                  event.currentTarget.videoWidth,
                  event.currentTarget.videoHeight,
                )
              }
              playsInline
              preload="metadata"
              src={outputSource}
            />
            <span className="absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur">
              <Play
                aria-hidden="true"
                className="ml-0.5 size-4 fill-current"
              />
            </span>
          </>
        ) : (
          <div
            className={
              generation.mediaType === 'image'
                ? 'size-full bg-gradient-to-br from-violet-500/30 via-card to-cyan-500/20'
                : 'size-full bg-gradient-to-br from-cyan-500/25 via-card to-lime-500/15'
            }
          />
        )}
        {!inFlight && !output ? (
          <MediaIcon
            aria-hidden="true"
            className="absolute top-1/2 left-1/2 size-20 -translate-x-1/2 -translate-y-1/2 text-foreground/10"
            strokeWidth={1.25}
          />
        ) : null}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/25" />

      <Link
        aria-label={`Open Generation ${generation.id}`}
        className="absolute inset-0 z-20 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
        data-generation-tile-link="true"
        to={`/generations/${generation.id}`}
      >
        <span className="sr-only">
          Open Generation {generation.id}
        </span>
      </Link>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 p-3">
        <Badge
          className="border-white/15 bg-black/35 text-white backdrop-blur"
          variant="outline"
        >
          {generation.mediaType}
        </Badge>
        <GenerationStatusBadge status={generation.status} />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 grid gap-2 p-3 text-white opacity-90 transition group-hover:opacity-100 sm:p-4">
        <div>
          <p className="text-[11px] text-white/60">
            {new Date(generation.createdAt).toLocaleString()}
          </p>
          <h2
            className="mt-1 font-heading text-base font-medium capitalize sm:text-lg"
            id={`generation-${generation.id}`}
          >
            {selectionLabel}
          </h2>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/70 sm:text-sm">
            {generation.creativeBrief}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 text-[11px] text-white/50">
          <span className="truncate">
            {generation.resolvedModel.model}
          </span>
          <span className="shrink-0">
            {inFlight
              ? 'In progress'
              : `${generation.outputs.length} output${generation.outputs.length === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>
    </Card>
  )
}

function isInFlightStatus(status: GenerationRecord['status']) {
  return (
    status === 'created' ||
    status === 'validating' ||
    status === 'submitted' ||
    status === 'running'
  )
}
