/** Result of a renderer-side operation on project data (`ok` instead of the IPC layer's `success`). */
export type OpResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string }

export const opError = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error: error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error',
})

/** Turn an IPC `{ success, error? }` result (or a thrown error) into an OpResult carrying `pick(result)`. */
export async function runIpc<R extends { success: boolean }, T extends object>(
  call: () => Promise<R> | undefined,
  pick: (result: Extract<R, { success: true }>) => T
): Promise<OpResult<T>> {
  try {
    const result = await call()
    if (!result) return { ok: false, error: 'The editor API is not available' }
    if (!result.success) return { ok: false, error: (result as { error?: string }).error ?? 'Operation failed' }
    return { ok: true, ...pick(result as Extract<R, { success: true }>) }
  } catch (error) {
    return opError(error)
  }
}
