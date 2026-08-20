import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'

export function ModelSelection({
  autoLabel,
  deployments,
  label,
  onChange,
  requiresApproval,
  value,
}: {
  autoLabel: string
  deployments: ReadonlyArray<
    readonly [string, {model: string}]
  >
  label: string
  onChange(value: string): void
  requiresApproval: boolean
  value: string
}) {
  return (
    <div className="grid gap-3">
      <Label htmlFor="deployment-id">{label}</Label>
      <NativeSelect
        className="w-full"
        id="deployment-id"
        name="deploymentId"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <NativeSelectOption value="">{autoLabel}</NativeSelectOption>
        {deployments.map(([id, deployment]) => (
          <NativeSelectOption key={id} value={id}>
            {deployment.model} · {id}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p className="text-xs leading-5 text-muted-foreground">
        Auto follows workspace routing. Manual fallback selection
        requires approval.
      </p>
      {requiresApproval ? (
        <div className="flex items-center gap-2">
          <Checkbox id="force" name="force" />
          <Label htmlFor="force">Approve fallback</Label>
        </div>
      ) : null}
    </div>
  )
}
