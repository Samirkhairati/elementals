import { InteractionSystem } from "@/world/InteractionSystem";
import { Player } from "@/entities/Player";
import { EventBus, Events } from "@/utils/EventBus";
import { Direction } from "@/utils/AnimationManager";

const DIRECTION_OFFSETS = {
  [Direction.LEFT]: { dx: -1, dy: 0 },
  [Direction.RIGHT]: { dx: 1, dy: 0 },
  [Direction.UP]: { dx: 0, dy: -1 },
  [Direction.DOWN]: { dx: 0, dy: 1 },
};

export class InteractionManager {
  private interactionSystem: InteractionSystem;
  private player: Player | null = null;
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

  public setPlayer(player: Player) {
    this.player = player;
  }

  public destroy() {
    EventBus.off(Events.INPUT_ACTION, this.onInputAction);
    EventBus.off(Events.PLAYER_MOVED, this.onPlayerMoved);
    EventBus.off(Events.DIALOGUE_CLOSED, this.onDialogueClosed);
  }

  private onDialogueClosed() {
    this.isDialogueOpen = false;
  }

  private onInputAction() {
    if (this.isDialogueOpen) {
        EventBus.emit(Events.DIALOGUE_CLOSED);
        this.isDialogueOpen = false;
        return;
    }

    if (!this.player || this.player.movementLocked) return;

    const pos = this.player.getGridPosition();
    
    // 1. Check tile player is standing on
    let interactable = this.interactionSystem.getInteractableAt(pos.x, pos.y);
    
    // 2. If nothing to interact with underneath, check tile in front of player
    if (!interactable || interactable.type !== "on_interact") {
        const offset = DIRECTION_OFFSETS[this.player.direction];
        interactable = this.interactionSystem.getInteractableAt(pos.x + offset.dx, pos.y + offset.dy);
    }

    if (interactable && interactable.type === "on_interact") {
        this.triggerInteraction(interactable);
    }
  }

  private onPlayerMoved(pos: { x: number, y: number }) {
    if (!this.player) return;
    
    const gridPos = this.player.getGridPosition();
    const interactable = this.interactionSystem.getInteractableAt(gridPos.x, gridPos.y);

    if (interactable && interactable.type === "on_step") {
        this.triggerInteraction(interactable);
    }
  }

  private triggerInteraction(interactable: any) {
      if (interactable.message) {
          this.isDialogueOpen = true;
          EventBus.emit(Events.SHOW_DIALOGUE, interactable.message);
      } else if (interactable.eventKey) {
          // Custom logic based on event key could be emitted here
          // EventBus.emit(interactable.eventKey, interactable);
      }
  }
}
