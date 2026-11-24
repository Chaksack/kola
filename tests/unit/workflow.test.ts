import { describe, expect, it } from 'vitest'
import { runWorkflow, WorkflowError } from '../../server/services/workflow'

describe('runWorkflow', () => {
  it('runs steps in order', async () => {
    const log: string[] = []
    await runWorkflow([{ name: 'a', run: async () => void log.push('a') }, { name: 'b', run: async () => void log.push('b') }], {})
    expect(log).toEqual(['a', 'b'])
  })

  it('compensates completed steps in reverse when a later step fails', async () => {
    const log: string[] = []
    const run = runWorkflow(
      [
        { name: 'reserve', run: async () => void log.push('reserve'), compensate: async () => void log.push('release') },
        { name: 'authorize', run: async () => void log.push('authorize'), compensate: async () => void log.push('cancel') },
        { name: 'create', run: async () => { throw new Error('db down') } },
      ],
      {},
    )
    await expect(run).rejects.toBeInstanceOf(WorkflowError)
    expect(log).toEqual(['reserve', 'authorize', 'cancel', 'release'])
  })

  it('keeps compensating when a compensation fails and reports it', async () => {
    const log: string[] = []
    try {
      await runWorkflow(
        [
          { name: 'a', run: async () => {}, compensate: async () => void log.push('undo a') },
          { name: 'b', run: async () => {}, compensate: async () => { throw new Error('undo b failed') } },
          { name: 'c', run: async () => { throw new Error('boom') } },
        ],
        {},
      )
    } catch (err) {
      const e = err as WorkflowError
      expect(e.step).toBe('c')
      expect((e.cause as Error).message).toBe('boom')
      expect(e.compensationErrors.map((x) => x.step)).toEqual(['b'])
    }
    expect(log).toEqual(['undo a'])
  })
})
