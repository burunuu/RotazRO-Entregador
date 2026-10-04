import { describe, expect, it, vi } from 'vitest'
import { createTransientFlag } from '../transient-flag'

function fakeTimers() {
  const pending = new Map<number, { fn: () => void; ms: number }>()
  let nextId = 1
  return {
    timers: {
      set: (fn: () => void, ms: number) => {
        const id = nextId++
        pending.set(id, { fn, ms })
        return id
      },
      clear: (id: unknown) => {
        pending.delete(id as number)
      },
    },
    run: () => {
      for (const { fn } of [...pending.values()]) fn()
      pending.clear()
    },
    pendingCount: () => pending.size,
  }
}

describe('createTransientFlag', () => {
  it('trigger() liga a bandeira e ela desliga sozinha depois do timer', () => {
    const onChange = vi.fn()
    const { timers, run } = fakeTimers()
    const flag = createTransientFlag(onChange, 1800, timers)

    flag.trigger()
    expect(onChange).toHaveBeenCalledWith(true)
    expect(onChange).toHaveBeenCalledTimes(1)

    run()
    expect(onChange).toHaveBeenCalledWith(false)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('disparar de novo antes do timer reinicia a contagem (não desliga cedo)', () => {
    const onChange = vi.fn()
    const { timers, pendingCount } = fakeTimers()
    const flag = createTransientFlag(onChange, 1800, timers)

    flag.trigger()
    expect(pendingCount()).toBe(1)
    flag.trigger()
    expect(pendingCount()).toBe(1) // o timer antigo foi cancelado, não empilhado
    expect(onChange).toHaveBeenCalledTimes(2) // true, true — nunca false no meio
  })

  it('cancel() desliga na hora e limpa o timer pendente (ex.: erro logo após sucesso, ou nova tentativa)', () => {
    const onChange = vi.fn()
    const { timers, run, pendingCount } = fakeTimers()
    const flag = createTransientFlag(onChange, 1800, timers)

    flag.trigger()
    flag.cancel()
    expect(onChange).toHaveBeenLastCalledWith(false)
    expect(pendingCount()).toBe(0)

    run() // nada deveria disparar de novo
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('dispose() limpa o timer sem chamar onChange (desmontagem do componente)', () => {
    const onChange = vi.fn()
    const { timers, pendingCount } = fakeTimers()
    const flag = createTransientFlag(onChange, 1800, timers)

    flag.trigger()
    onChange.mockClear()
    flag.dispose()
    expect(onChange).not.toHaveBeenCalled()
    expect(pendingCount()).toBe(0)
  })
})
