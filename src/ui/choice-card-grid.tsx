import {CheckCircle2} from 'lucide-react'

import {Button} from '@/components/ui/button'

export interface ChoiceCard {
  description: string
  id: string
  title: string
}

export function ChoiceCardGrid({
  choices,
  description,
  label,
  onChange,
  value,
}: {
  choices: readonly ChoiceCard[]
  description: string
  label: string
  onChange(value: string): void
  value: string
}) {
  return (
    <section aria-label={label} className="mt-8">
      <div>
        <h2 className="font-heading text-2xl font-semibold">{label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {choices.map((choice, index) => {
          const selected = choice.id === value
          return (
            <Button
              aria-pressed={selected}
              className={`group relative h-auto min-h-36 min-w-0 items-end justify-start overflow-hidden whitespace-normal p-0 text-left transition ${
                selected
                  ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/15'
                  : 'border-border/70 hover:border-primary/50'
              }`}
              data-selected={selected}
              key={choice.id}
              onClick={() => onChange(choice.id)}
              type="button"
              variant="outline"
            >
              <span
                aria-hidden="true"
                className={`absolute inset-0 bg-gradient-to-br ${
                  index % 3 === 0
                    ? 'from-violet-500/35 via-card to-cyan-500/20'
                    : index % 3 === 1
                      ? 'from-amber-500/30 via-card to-rose-500/20'
                      : 'from-emerald-500/30 via-card to-blue-500/20'
                }`}
              />
              {selected ? (
                <span className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm">
                  <CheckCircle2 aria-hidden="true" className="size-3" />
                  Selected
                </span>
              ) : null}
              <span className="relative grid w-full min-w-0 gap-1 bg-gradient-to-t from-background/95 to-transparent p-4">
                <strong className="font-heading text-base whitespace-normal break-words">
                  {choice.title}
                </strong>
                <span className="text-xs leading-5 whitespace-normal text-muted-foreground text-wrap break-words">
                  {choice.description}
                </span>
              </span>
            </Button>
          )
        })}
      </div>
    </section>
  )
}
