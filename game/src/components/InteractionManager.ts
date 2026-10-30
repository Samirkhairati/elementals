import { InteractionSystem } from "@/world/InteractionSystem";
import { gameState } from "@/core/GameState";
import { EventBus, Events } from "@/utils/EventBus";
import { Direction } from "@/utils/Direction";

const DIRECTION_OFFSETS = {
  [Direction.LEFT]: { dx: -1, dy: 0 },
  [Direction.RIGHT]: { dx: 1, dy: 0 },
  [Direction.UP]: { dx: 0, dy: -1 },
  [Direction.DOWN]: { dx: 0, dy: 1 },
};

export class InteractionManager {
  private interactionSystem: InteractionSystem;
  private isDialogueOpen: boolean = false;

  constructor(interactionSystem: InteractionSystem) {
    this.interactionSystem = interactionSystem;

    // Bind events
    this.onInputAction = this.onInputAction.bind(this);
    this.onPlayerMoved = this.onPlayerMoved.bind(this);
    this.onDialogueClosed = this.onDialogueClosed.bind(this);

    EventBus.on(Events.INPUT_ACTION, this.onInputAction);
    EventBus.on(Events.PLAYER_MOVED, this.onPlayerMoved);
    EventBus.on(Events.DIALOGUE_CLOSED, this.onDialogueClosed);
  }

  public destroy() {
    EventBus.off(Events.INPUT_ACTION, this.onInputAction);
    EventBus.off(Events.PLAYER_MOVED, this.onPlayerMoved);
    EventBus.off(Events.DIALOGUE_CLOSED, this.onDialogueClosed);
  }

  private onDialogueClosed() {
    this.isDialogueOpen = false;
  }

  public getIsDialogueOpen(): boolean {
    return this.isDialogueOpen;
  }

  private onInputAction() {
    if (this.isDialogueOpen) {
      EventBus.emit(Events.DIALOGUE_CLOSED);
      this.isDialogueOpen = false;
      return;
    }

    if (gameState.isInputLocked) return;

    const pos = gameState.playerPosition;
    
    // 1. Check tile player is standing on
    let interactable = this.interactionSystem.getInteractableAt(pos.gridX, pos.gridY);
    
    // 2. If nothing to interact with underneath, check tile in front of player
    if (!interactable) {
      const offset = DIRECTION_OFFSETS[pos.direction];
      if (offset) {
        interactable = this.interactionSystem.getInteractableAt(pos.gridX + offset.dx, pos.gridY + offset.dy);
      }
    }

    // 3. Fallback: check 4 cardinal adjacent tiles around player
    if (!interactable) {
      for (const offset of Object.values(DIRECTION_OFFSETS)) {
        const candidate = this.interactionSystem.getInteractableAt(pos.gridX + offset.dx, pos.gridY + offset.dy);
        if (candidate) {
          interactable = candidate;
          break;
        }
      }
    }

    if (interactable) {
      this.triggerInteraction(interactable);
    }
  }

  public tryTriggerInteractionAt(gridX: number, gridY: number): boolean {
    if (this.isDialogueOpen) {
      EventBus.emit(Events.DIALOGUE_CLOSED);
      this.isDialogueOpen = false;
      return true;
    }

    if (gameState.isInputLocked) return false;

    let interactable = this.interactionSystem.getInteractableAt(gridX, gridY);
    const pos = gameState.playerPosition;
    const dist = Math.abs(pos.gridX - gridX) + Math.abs(pos.gridY - gridY);

    // If no direct interactable on clicked tile, check if any adjacent tile has one
    if (!interactable && dist <= 3) {
      for (const offset of Object.values(DIRECTION_OFFSETS)) {
        const candidate = this.interactionSystem.getInteractableAt(gridX + offset.dx, gridY + offset.dy);
        if (candidate) {
          interactable = candidate;
          break;
        }
      }
    }

    if (!interactable) return false;

    // If player is within reach (adjacent or within 3 tiles)
    if (dist <= 3) {
      let direction = pos.direction;
      if (Math.abs(gridX - pos.gridX) >= Math.abs(gridY - pos.gridY)) {
        direction = gridX > pos.gridX ? Direction.RIGHT : Direction.LEFT;
      } else {
        direction = gridY > pos.gridY ? Direction.DOWN : Direction.UP;
      }

      gameState.updatePlayerPosition(pos.worldX, pos.worldY, pos.gridX, pos.gridY, direction);
      this.triggerInteraction(interactable);
      return true;
    }

    return false;
  }

  private onPlayerMoved() {
    const pos = gameState.playerPosition;
    const interactable = this.interactionSystem.getInteractableAt(pos.gridX, pos.gridY);

    if (interactable && interactable.type === "on_step") {
      this.triggerInteraction(interactable);
    }
  }

  public triggerInteraction(interactable: any) {
    if (interactable.message) {
      this.isDialogueOpen = true;
      EventBus.emit(Events.SHOW_DIALOGUE, interactable.message);
    } else if (interactable.targetMap) {
      EventBus.emit(Events.MAP_SWITCH_REQUEST, interactable.targetMap);
    } else if (interactable.eventKey) {
      EventBus.emit(interactable.eventKey, interactable);
    }
  }
}
