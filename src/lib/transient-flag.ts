import { useCallback, useEffect, useMemo, useState } from 'react'

/** Bandeira que liga por um instante e desliga sozinha — base do feedback
 * "Salvo ✓" no próprio botão. Núcleo puro (sem React) para ser testável. */
export function createTransientFlag(
  onChange: (on: boolean) => void,
  durationMs: number,
  timers: {
    set: (fn: () => void, ms: number) => unknown
    clear: (id: unknown) => void
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
) {
  let timer: unknown = null

  function cancel() {
    if (timer !== null) {
      timers.clear(timer)
      timer = null
    }
    onChange(false)
  }

  return {
    /** Liga e agenda o desligamento (religar reinicia a contagem). */
    trigger() {
      if (timer !== null) timers.clear(timer)
      onChange(true)
      timer = timers.set(() => {
        timer = null
        onChange(false)
      }, durationMs)
    },
    /** Desliga já (ex.: nova tentativa de salvar, ou falha). */
    cancel,
    /** Limpeza ao desmontar: cancela o timer sem disparar setState. */
    dispose() {
      if (timer !== null) timers.clear(timer)
      timer = null
    },
  }
}

/** [ligado, disparar, cancelar] — por padrão ~1,8 s. */
export function useTransientFlag(durationMs = 1800): [boolean, () => void, () => void] {
  const [on, setOn] = useState(false)
  const flag = useMemo(() => createTransientFlag(setOn, durationMs), [durationMs])
  useEffect(() => () => flag.dispose(), [flag])
  const trigger = useCallback(() => flag.trigger(), [flag])
  const cancel = useCallback(() => flag.cancel(), [flag])
  return [on, trigger, cancel]
}
