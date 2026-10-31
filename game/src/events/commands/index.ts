// Importing this module registers every built-in command handler.
import "./dialogue";
import "./flow";
import "./state";
import "./character";
import "./screen";

export { COMMAND_HANDLERS, registerCommandHandler } from "./registry";
