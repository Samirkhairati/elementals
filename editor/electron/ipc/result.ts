/** Shared helpers for turning store results / errors into the `{ success, error }` IPC shape. */

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export type IpcResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: string };

/** Run `fn` and wrap its return value (spread) in `{ success: true, ... }`, or its failure in `{ success: false, error }`. */
export function toResult<T extends object | void>(
  fn: () => T
): IpcResult<T extends object ? T : object> {
  try {
    const value = fn();
    return { success: true, ...(value ?? {}) } as IpcResult<T extends object ? T : object>;
  } catch (error: unknown) {
    return { success: false, error: errorMessage(error) };
  }
}
