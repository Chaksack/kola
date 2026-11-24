/**
 * A tiny saga runner. Steps run in order; if one throws, the compensations of the steps that already
 * succeeded run in reverse order, then the original error is rethrown. Compensation failures are
 * collected (and logged by the caller) but never mask the original error.
 */
export interface WorkflowStep<C> {
  name: string
  run: (ctx: C) => Promise<void>
  compensate?: (ctx: C) => Promise<void>
}

export class WorkflowError extends Error {
  constructor(
    public step: string,
    public override cause: unknown,
    public compensationErrors: { step: string; error: unknown }[],
  ) {
    super(`Workflow failed at "${step}"`)
  }
}

export async function runWorkflow<C>(steps: WorkflowStep<C>[], ctx: C): Promise<C> {
  const done: WorkflowStep<C>[] = []
  for (const step of steps) {
    try {
      await step.run(ctx)
      done.push(step)
    } catch (err) {
      const compensationErrors: { step: string; error: unknown }[] = []
      for (const prev of done.reverse()) {
        if (!prev.compensate) continue
        try {
          await prev.compensate(ctx)
        } catch (error) {
          compensationErrors.push({ step: prev.name, error })
        }
      }
      throw new WorkflowError(step.name, err, compensationErrors)
    }
  }
  return ctx
}
