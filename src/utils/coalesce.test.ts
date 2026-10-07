import { describe, expect, it } from 'vitest'
import { createCoalescedRunner } from './coalesce'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('createCoalescedRunner', () => {
  it('runs once when triggered once', async () => {
    let runs = 0
    const trigger = createCoalescedRunner(async () => void runs++)
    await trigger()
    expect(runs).toBe(1)
  })

  it('never runs concurrently, and re-runs once after the current run when triggered meanwhile', async () => {
    const gates = [deferred(), deferred(), deferred()]
    let runs = 0
    let active = 0
    let maxActive = 0
    const trigger = createCoalescedRunner(async () => {
      const gate = gates[runs++]
      active++
      maxActive = Math.max(maxActive, active)
      await gate.promise
      active--
    })

    const first = trigger()
    // three triggers while the first run is still in flight collapse into a single follow-up run
    await trigger()
    await trigger()
    await trigger()
    expect(runs).toBe(1)

    gates[0].resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(runs).toBe(2)
    gates[1].resolve()
    await first
    expect(runs).toBe(2)
    expect(maxActive).toBe(1)
  })

  it('stays usable after a run fails', async () => {
    let runs = 0
    const trigger = createCoalescedRunner(async () => {
      runs++
      if (runs === 1) throw new Error('boom')
    })
    await expect(trigger()).rejects.toThrow('boom')
    await trigger()
    expect(runs).toBe(2)
  })
})
