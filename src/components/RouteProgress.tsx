type RouteProgressProps = {
  delivered: number
  total: number
}

export function RouteProgress({ delivered, total }: RouteProgressProps) {
  const remaining = Math.max(0, total - delivered)
  const percent = total > 0 ? Math.round((delivered / total) * 100) : 0

  return (
    <div className="route-progress">
      <p className="route-progress-text">
        {delivered} de {total} entregas · {remaining} restante{remaining === 1 ? '' : 's'}
      </p>
      <div className="route-progress-bar">
        <div className="route-progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
