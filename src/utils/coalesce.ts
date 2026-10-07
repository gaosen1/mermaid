/**
 * 把「可能并发触发」的异步任务合并：运行中又被触发，不丢弃、也不并发，
 * 而是记一笔，当前这轮跑完后再补跑一轮（多次触发只补一轮）。
 */
export function createCoalescedRunner(run: () => Promise<void>): () => Promise<void> {
  let running = false
  let again = false

  const trigger = async (): Promise<void> => {
    if (running) {
      again = true
      return
    }
    running = true
    try {
      await run()
    } finally {
      running = false
    }
    if (again) {
      again = false
      await trigger()
    }
  }
  return trigger
}
