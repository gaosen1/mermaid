/**
 * 订阅 agent-api 的 SSE 推送：inbox 有新笔记时它发 `inbox` 事件，页面据此导入，
 * 因此不需要轮询。笔记本身先落盘到 inbox/（持久队列），推送只负责「叫醒」页面。
 *
 * 连接成功（含断线重连）时也触发一次 onInbox 补漏——断线期间到达的笔记不会丢。
 * 断线 / 连不上时由我们自己按 reconnectMs 重连（原生 EventSource 默认约 3 秒一次，
 * 服务没起时会刷屏报错）。
 */

export interface EventSourceLike {
  onopen: (() => void) | null
  onerror: (() => void) | null
  addEventListener: (type: string, listener: () => void) => void
  close: () => void
}

export interface InboxPushOptions {
  /** 每次（重）连时重新取 URL，这样 token 轮换后能自愈；返回 null 表示暂时连不了 */
  getUrl: () => Promise<string | null>
  onInbox: () => void
  reconnectMs?: number
  createSource?: (url: string) => EventSourceLike
}

export interface InboxPushClient {
  close: () => void
}

const DEFAULT_RECONNECT_MS = 30_000

export function createInboxPushClient(options: InboxPushOptions): InboxPushClient {
  const reconnectMs = options.reconnectMs ?? DEFAULT_RECONNECT_MS
  const createSource = options.createSource ?? ((url: string) => new EventSource(url) as EventSourceLike)

  let source: EventSourceLike | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const scheduleReconnect = () => {
    if (closed || timer !== null) return
    timer = setTimeout(() => {
      timer = null
      void connect()
    }, reconnectMs)
  }

  const connect = async () => {
    if (closed) return
    let url: string | null
    try {
      url = await options.getUrl()
    } catch {
      url = null
    }
    if (closed) return
    if (!url) {
      scheduleReconnect()
      return
    }
    const es = createSource(url)
    source = es
    es.addEventListener('inbox', () => options.onInbox())
    es.onopen = () => options.onInbox()
    es.onerror = () => {
      es.close()
      if (source === es) source = null
      scheduleReconnect()
    }
  }

  void connect()

  return {
    close() {
      closed = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      source?.close()
      source = null
    },
  }
}
