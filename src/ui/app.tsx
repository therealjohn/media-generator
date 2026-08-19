import {Images, Settings, Sparkles, WandSparkles} from 'lucide-react'
import type {ReactNode} from 'react'
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'

import {Button} from '@/components/ui/button'

import {CreatePage} from './create-page.js'
import {GenerationDetailPage} from './generation-detail-page.js'
import {GenerationsPage} from './generations-page.js'
import {SettingsPage} from './settings-page.js'

export function App() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-xl">
        <div className="flex h-16 w-full items-center gap-4 px-4 lg:px-6">
          <Button
            asChild
            className="mr-auto gap-2 px-2 text-sm font-semibold"
            variant="ghost"
          >
            <NavLink to="/create">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Sparkles aria-hidden="true" className="size-4" />
              </span>
              <span>Media Workspace</span>
            </NavLink>
          </Button>
          <nav
            aria-label="Primary"
            className="flex items-center gap-1 rounded-xl border bg-muted/40 p-1"
          >
            <AppNavLink icon={<WandSparkles />} to="/create">
              Create
            </AppNavLink>
            <AppNavLink icon={<Images />} to="/generations">
              Generations
            </AppNavLink>
            <AppNavLink icon={<Settings />} to="/settings">
              Settings
            </AppNavLink>
          </nav>
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Navigate replace to="/create" />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/generations" element={<GenerationsPage />} />
        <Route
          path="/generations/:id"
          element={<GenerationDetailPage />}
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate replace to="/create" />} />
      </Routes>
    </div>
  )
}

function AppNavLink({
  children,
  icon,
  to,
}: {
  children: string
  icon: ReactNode
  to: string
}) {
  const {pathname} = useLocation()
  const active =
    pathname === to ||
    (to === '/generations' && pathname.startsWith('/generations/'))

  return (
    <Button
      asChild
      className="gap-2"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
    >
      <NavLink aria-label={children} to={to}>
        <span aria-hidden="true" className="[&>svg]:size-3.5">
          {icon}
        </span>
        <span className="hidden sm:inline">{children}</span>
      </NavLink>
    </Button>
  )
}
