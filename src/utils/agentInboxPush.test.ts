import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInboxPushClient, type EventSourceLike } from './agentInboxPush'

class FakeSource implements EventSourceLike {
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  private listeners = new Map<string, () => void>()
  url: string
  constructor(url: string) {
    this.url = url
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener)
  }
  emit(type: string) {
    this.listeners.get(type)?.()
  }
  close() {
    this.closed = true
  }
}

function setup(getUrl: () => Promise<string | null> = async () => 'http://x/api/events?token=t') {
  const sources: FakeSource[] = []
  const onInbox = vi.fn()
  const client = createInboxPushClient({
    getUrl,
    onInbox,
    reconnectMs: 1000,
    createSource: (url) => {
      const s = new FakeSource(url)
      sources.push(s)
      return s
    },
  })
  return { sources, onInbox, client }
}

const flush = () => vi.advanceTimersByTimeAsync(0)

describe('createInboxPushClient', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('imports on every inbox event and does nothing else while idle (no polling)', async () => {
    const { sources, onInbox } = setup()
    await flush()
    expect(sources).toHaveLength(1)
    sources[0].emit('inbox')
    sources[0].emit('inbox')
    expect(onInbox).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(onInbox).toHaveBeenCalledTimes(2)
    expect(sources).toHaveLength(1)
  })

  it('catches up once when a connection is (re)established', async () => {
    const { sources, onInbox } = setup()
    await flush()
    sources[0].onopen?.()
    expect(onInbox).toHaveBeenCalledTimes(1)
  })

  it('closes a failed connection and reconnects after the delay, re-reading the url', async () => {
    const getUrl = vi.fn().mockResolvedValueOnce('http://x/?token=old').mockResolvedValue('http://x/?token=new')
    const { sources } = setup(getUrl)
    await flush()
    sources[0].onerror?.()
    expect(sources[0].closed).toBe(true)
    await vi.advanceTimersByTimeAsync(999)
    expect(sources).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(sources).toHaveLength(2)
    expect(sources[1].url).toContain('token=new')
  })

  it('retries later when no url is available yet', async () => {
    const getUrl = vi.fn().mockResolvedValueOnce(null).mockResolvedValue('http://x/?token=t')
    const { sources } = setup(getUrl)
    await flush()
    expect(sources).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(sources).toHaveLength(1)
  })

  it('stops everything on close()', async () => {
    const { sources, client } = setup()
    await flush()
    sources[0].onerror?.()
    client.close()
    await vi.advanceTimersByTimeAsync(5000)
    expect(sources).toHaveLength(1)
  })
})
