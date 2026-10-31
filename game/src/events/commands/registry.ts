import type { CommandHandler } from "../types";

/**
 * Type -> handler. Built-in handlers register themselves from `commands/index.ts`; add your own with
 * `registerCommandHandler` (see docs/game-runtime.md, "Adding a command").
 */
export const COMMAND_HANDLERS: Map<string, CommandHandler> = new Map();

export function registerCommandHandler(type: string, handler: CommandHandler): void {
  COMMAND_HANDLERS.set(type, handler);
}
