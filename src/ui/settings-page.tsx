import {
  AlertCircle,
  AudioLines,
  CheckCircle2,
  Cloud,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react'
import {useCallback, useEffect, useState} from 'react'

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
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Separator} from '@/components/ui/separator'

import {
  createApiClient,
  errorMessage,
  type AuthResult,
  type ConfigureFoundryResult,
  type ConfigureSpeechResult,
  type SettingsGetResult,
} from './api-client.js'

const api = createApiClient()

export function SettingsPage() {
  const [auth, setAuth] = useState<AuthResult | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [settings, setSettings] = useState<
    SettingsGetResult | null
  >(null)
  const [settingsError, setSettingsError] = useState<string | null>(
    null,
  )
  const [configuration, setConfiguration] = useState<
    | {state: 'idle'}
    | {state: 'loading'}
    | {message: string; state: 'error'}
    | {result: ConfigureFoundryResult; state: 'success'}
  >({state: 'idle'})
  const [speechConfiguration, setSpeechConfiguration] = useState<
    | {state: 'idle'}
    | {state: 'loading'}
    | {message: string; state: 'error'}
    | {result: ConfigureSpeechResult; state: 'success'}
  >({state: 'idle'})
  const savedProviders = settings?.manifest?.providers ?? {}
  const savedDeployments = settings?.manifest?.deployments ?? {}

  const loadAuth = useCallback(() => {
    setAuth(null)
    setAuthError(null)
    void api
      .getAuthStatus()
      .then(setAuth)
      .catch((error: unknown) =>
        setAuthError(
          errorMessage(
            error,
            'Azure authentication could not be checked.',
          ),
        ),
      )
  }, [])

  useEffect(loadAuth, [loadAuth])

  const loadSettings = useCallback(() => {
    setSettingsError(null)
    void api
      .getSettings()
      .then(setSettings)
      .catch((error: unknown) =>
        setSettingsError(
          errorMessage(
            error,
            'Saved Foundry connections could not be loaded.',
          ),
        ),
      )
  }, [])

  useEffect(loadSettings, [loadSettings])

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setConfiguration({state: 'loading'})
    try {
      const result = await api.configureFoundry({
        endpoint: String(form.get('endpoint') ?? ''),
        name: String(form.get('name') ?? ''),
      })
      setConfiguration({result, state: 'success'})
      loadSettings()
    } catch (error) {
      setConfiguration({
        message: errorMessage(
          error,
          'The Foundry connection could not be saved.',
        ),
        state: 'error',
      })
    }
  }

  async function handleSpeechSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setSpeechConfiguration({state: 'loading'})
    try {
      const result = await api.configureSpeech({
        apiKey: String(form.get('apiKey') ?? ''),
        endpoint: String(form.get('endpoint') ?? ''),
        voice: String(form.get('voice') ?? ''),
      })
      const apiKeyInput = formElement.elements.namedItem('apiKey')
      if (apiKeyInput instanceof HTMLInputElement) {
        apiKeyInput.value = ''
      }
      setSpeechConfiguration({result, state: 'success'})
      loadSettings()
    } catch (error) {
      setSpeechConfiguration({
        message: errorMessage(
          error,
          'The Azure Speech connection could not be saved.',
        ),
        state: 'error',
      })
    }
  }

  return (
    <main className="w-full px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="mb-8">
        <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Workspace configuration
        </p>
        <h1 className="mt-2 font-heading text-4xl font-semibold tracking-tight sm:text-5xl">
          Settings
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Check the local Azure context, connect Microsoft Foundry,
          and configure private Azure Speech narration.
        </p>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.7fr)_minmax(0,1.3fr)]">
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <ShieldCheck aria-hidden="true" className="size-4" />
              </span>
              <div>
                <CardDescription>Authentication</CardDescription>
                <CardTitle>
                  <h2>Azure CLI context</h2>
                </CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {authError ? (
              <Alert
                aria-labelledby="auth-error-title"
                variant="destructive"
              >
                <AlertCircle aria-hidden="true" />
                <AlertTitle id="auth-error-title">
                  Could not check authentication
                </AlertTitle>
                <AlertDescription className="grid gap-3">
                  <p>{authError}</p>
                  <Button
                    className="w-fit"
                    onClick={loadAuth}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RefreshCcw aria-hidden="true" />
                    Check authentication again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : !auth ? (
              <div
                className="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
                Checking Azure authentication...
              </div>
            ) : auth.state === 'signed-in' ? (
              <div className="grid gap-4">
                <Badge className="w-fit" variant="secondary">
                  <ShieldCheck aria-hidden="true" />
                  Signed in
                </Badge>
                <dl className="grid gap-3 sm:grid-cols-3">
                  {[
                    ['Account', auth.account.name],
                    ['Subscription', auth.subscription.name],
                    ['Tenant', auth.tenantId],
                  ].map(([label, value]) => (
                    <div
                      className="rounded-lg border bg-muted/20 p-3"
                      key={label}
                    >
                      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                        {label}
                      </dt>
                      <dd className="mt-1 break-words text-sm">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="grid gap-3">
                <Badge className="w-fit" variant="destructive">
                  <ShieldOff aria-hidden="true" />
                  Signed out
                </Badge>
                <p className="text-sm text-muted-foreground">
                  Authenticate with Azure CLI before discovering
                  models.
                </p>
                <code className="w-fit rounded-md bg-muted px-2 py-1 text-xs">
                  {auth.help.join(' ')}
                </code>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <Cloud aria-hidden="true" className="size-4" />
              </span>
              <div>
                <CardDescription>Model provider</CardDescription>
                <CardTitle>
                  <h2>Microsoft Foundry</h2>
                </CardTitle>
              </div>
            </div>
            <CardDescription>
              Save a project endpoint and discover supported image and
              video deployments.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {settingsError ? (
              <Alert
                aria-labelledby="settings-error-title"
                variant="destructive"
              >
                <AlertCircle aria-hidden="true" />
                <AlertTitle id="settings-error-title">
                  Could not load saved Foundry connections
                </AlertTitle>
                <AlertDescription className="grid gap-3">
                  <p>{settingsError}</p>
                  <Button
                    className="w-fit"
                    onClick={loadSettings}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <RefreshCcw aria-hidden="true" />
                    Load connections again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}

            {settings !== null &&
            Object.keys(savedProviders).length > 0 ? (
              <section
                aria-labelledby="saved-connections-title"
                className="grid gap-3 rounded-xl border bg-muted/20 p-4"
              >
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Current workspace
                  </p>
                  <h2
                    className="mt-1 font-heading text-base font-medium"
                    id="saved-connections-title"
                  >
                    Saved Foundry connections
                  </h2>
                </div>
                <ul className="grid gap-2">
                  {Object.entries(savedProviders).map(
                    ([name, provider]) => {
                      const deploymentCount = Object.values(
                        savedDeployments,
                      ).filter(
                        (deployment) =>
                          deployment.provider === name,
                      ).length
                      return (
                        <li
                          className="grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-center"
                          key={name}
                        >
                          <div className="grid gap-1">
                            <strong className="text-sm font-medium">
                              {name}
                            </strong>
                            <span className="text-xs text-muted-foreground">
                              {deploymentCount} deployment
                              {deploymentCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <code className="break-all text-xs text-muted-foreground">
                            {provider.projectEndpoint}
                          </code>
                        </li>
                      )
                    },
                  )}
                </ul>
              </section>
            ) : null}

            <Separator />

            <form
              className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]"
              onSubmit={handleSubmit}
            >
              <div className="grid gap-2">
                <Label htmlFor="connection-name">
                  Connection name
                </Label>
                <Input
                  defaultValue="primary"
                  id="connection-name"
                  name="name"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="foundry-endpoint">
                  Foundry project endpoint
                </Label>
                <Input
                  id="foundry-endpoint"
                  name="endpoint"
                  placeholder="https://example.services.ai.azure.com/api/projects/media"
                  required
                  type="url"
                />
              </div>
              <Button
                className="w-fit sm:col-span-2"
                disabled={configuration.state === 'loading'}
                type="submit"
              >
                {configuration.state === 'loading' ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                  />
                ) : (
                  <Cloud aria-hidden="true" />
                )}
                {configuration.state === 'loading'
                  ? 'Discovering deployments...'
                  : 'Save Foundry connection'}
              </Button>
            </form>

            {configuration.state === 'success' ? (
              <Card
                className="border-emerald-500/25 bg-emerald-500/5"
                role="status"
                size="sm"
              >
                <CardHeader>
                  <div className="flex items-center gap-2 text-emerald-500">
                    <CheckCircle2
                      aria-hidden="true"
                      className="size-4"
                    />
                    <span className="text-xs font-medium tracking-wide uppercase">
                      Success
                    </span>
                  </div>
                  <CardTitle>
                    <h2>Foundry connection saved</h2>
                  </CardTitle>
                  <CardDescription>
                    {configuration.result.deployments.length}{' '}
                    supported deployments are available to Auto
                    selection.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <ul className="grid gap-2">
                    {configuration.result.deployments.map(
                      (deployment) => (
                        <li
                          className="grid gap-1 rounded-lg border bg-card p-3 sm:grid-cols-[80px_1fr_auto] sm:items-center sm:gap-3"
                          key={deployment.id}
                        >
                          <Badge
                            className="capitalize"
                            variant="outline"
                          >
                            {deployment.mediaType}
                          </Badge>
                          <strong className="text-sm font-medium">
                            {deployment.model}
                          </strong>
                          <small className="text-xs text-muted-foreground">
                            {deployment.deploymentName}
                          </small>
                        </li>
                      ),
                    )}
                  </ul>
                  {configuration.result.unsupported.length > 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {configuration.result.unsupported.length}{' '}
                      unsupported deployment
                      {configuration.result.unsupported.length === 1
                        ? ''
                        : 's'}{' '}
                      was ignored.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}

            {configuration.state === 'error' ? (
              <Alert
                aria-labelledby="configuration-error-title"
                variant="destructive"
              >
                <AlertCircle aria-hidden="true" />
                <AlertTitle id="configuration-error-title">
                  Foundry connection could not be saved
                </AlertTitle>
                <AlertDescription>
                  {configuration.message}
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
                <AudioLines aria-hidden="true" className="size-4" />
              </span>
              <div>
                <CardDescription>Narration provider</CardDescription>
                <CardTitle>
                  <h2>Azure Speech</h2>
                </CardTitle>
              </div>
            </div>
            <CardDescription>
              Save the Speech resource endpoint, private API key, and
              default MAI voice on this machine. The API key is never
              returned to the browser after it is saved.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {settings?.speech?.configured === true ? (
              <section
                aria-labelledby="saved-speech-title"
                className="grid gap-3 rounded-xl border bg-muted/20 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Current machine
                    </p>
                    <h2
                      className="mt-1 font-heading text-base font-medium"
                      id="saved-speech-title"
                    >
                      Saved Speech connection
                    </h2>
                  </div>
                  <Badge variant="secondary">
                    <CheckCircle2 aria-hidden="true" />
                    Configured
                  </Badge>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-card p-3">
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Resource endpoint
                    </dt>
                    <dd className="mt-1 break-all text-sm">
                      {settings.speech.endpoint}
                    </dd>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Default voice
                    </dt>
                    <dd className="mt-1 break-all text-sm">
                      {settings.speech.defaultVoice}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : null}

            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={handleSpeechSubmit}
            >
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="speech-endpoint">
                  Azure Speech resource endpoint
                </Label>
                <Input
                  defaultValue={
                    settings?.speech?.configured === true
                      ? settings.speech.endpoint
                      : ''
                  }
                  id="speech-endpoint"
                  name="endpoint"
                  placeholder="https://example.cognitiveservices.azure.com/"
                  required
                  type="url"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="speech-api-key">
                  Azure Speech API key
                </Label>
                <Input
                  autoComplete="new-password"
                  id="speech-api-key"
                  name="apiKey"
                  required
                  type="password"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the key again whenever you update this
                  connection.
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="speech-voice">
                  Default MAI voice
                </Label>
                <Input
                  defaultValue={
                    settings?.speech?.configured === true
                      ? settings.speech.defaultVoice
                      : 'en-US-Ethan:MAI-Voice-2'
                  }
                  id="speech-voice"
                  name="voice"
                  required
                />
              </div>
              <Button
                className="w-fit md:col-span-2"
                disabled={speechConfiguration.state === 'loading'}
                type="submit"
              >
                {speechConfiguration.state === 'loading' ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin"
                  />
                ) : (
                  <AudioLines aria-hidden="true" />
                )}
                {speechConfiguration.state === 'loading'
                  ? 'Saving Speech connection...'
                  : 'Save Speech connection'}
              </Button>
            </form>

            {speechConfiguration.state === 'success' ? (
              <Card
                className="border-emerald-500/25 bg-emerald-500/5"
                role="status"
                size="sm"
              >
                <CardHeader>
                  <div className="flex items-center gap-2 text-emerald-500">
                    <CheckCircle2
                      aria-hidden="true"
                      className="size-4"
                    />
                    <span className="text-xs font-medium tracking-wide uppercase">
                      Success
                    </span>
                  </div>
                  <CardTitle>
                    <h2>Speech connection saved</h2>
                  </CardTitle>
                  <CardDescription>
                    Narration will default to{' '}
                    {speechConfiguration.result.voice}.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}

            {speechConfiguration.state === 'error' ? (
              <Alert
                aria-labelledby="speech-configuration-error-title"
                variant="destructive"
              >
                <AlertCircle aria-hidden="true" />
                <AlertTitle id="speech-configuration-error-title">
                  Speech connection could not be saved
                </AlertTitle>
                <AlertDescription>
                  {speechConfiguration.message}
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
