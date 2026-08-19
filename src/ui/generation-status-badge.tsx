import {Badge} from '@/components/ui/badge'

import type {GenerationRecord} from './api-client.js'

export function GenerationStatusBadge({
  status,
}: {
  status: GenerationRecord['status']
}) {
  const variant =
    status === 'failed' || status === 'interrupted'
      ? 'destructive'
      : status === 'succeeded'
        ? 'secondary'
        : 'outline'

  return (
    <Badge className="capitalize" variant={variant}>
      {status}
    </Badge>
  )
}
