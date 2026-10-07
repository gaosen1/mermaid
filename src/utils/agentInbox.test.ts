import { describe, expect, it } from 'vitest'
import { hasPendingInbox } from './agentInbox'

type Entry = [string, { kind: 'file' | 'directory' }]

function fakeRoot(inbox: Entry[] | null): FileSystemDirectoryHandle {
  return {
    getDirectoryHandle: async (name: string) => {
      if (name !== 'inbox' || inbox === null) throw new DOMException('not found', 'NotFoundError')
      return {
        entries: async function* () {
          for (const e of inbox) yield e
        },
      }
    },
  } as unknown as FileSystemDirectoryHandle
}

describe('hasPendingInbox', () => {
  it('is false when the inbox directory does not exist yet', async () => {
    expect(await hasPendingInbox(fakeRoot(null))).toBe(false)
  })

  it('is false for an empty inbox', async () => {
    expect(await hasPendingInbox(fakeRoot([]))).toBe(false)
  })

  it('ignores non-json files and sub-directories', async () => {
    const root = fakeRoot([
      ['notes.txt', { kind: 'file' }],
      ['nested.json', { kind: 'directory' }],
    ])
    expect(await hasPendingInbox(root)).toBe(false)
  })

  it('is true when a json file is waiting', async () => {
    const root = fakeRoot([
      ['readme.txt', { kind: 'file' }],
      ['4922d7c4.json', { kind: 'file' }],
    ])
    expect(await hasPendingInbox(root)).toBe(true)
  })
})
