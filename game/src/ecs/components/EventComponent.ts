import type { EventPage, SpriteProps } from "@shared/engine/index.ts";

/**
 * The Event component at runtime: the authored pages plus what the page selector needs to apply and
 * undo page overrides. Running interpreters are tracked by the EventRuntime, not here.
 */
export class EventComponent {
  public pages: EventPage[];
  /** Index of the active page, -1 when no page's conditions hold. */
  public activePage: number = -1;
  /** True once the page selector evaluated this event at least once. */
  public evaluated: boolean = false;
  /** The authored Sprite props (page appearance overrides are applied on top of these). */
  public baseSprite: SpriteProps | null;
  /** The authored Collider.isSolid (a page `solid` override is applied on top of it). */
  public baseSolid: boolean | null;

  constructor(pages: EventPage[], baseSprite: SpriteProps | null = null, baseSolid: boolean | null = null) {
    this.pages = pages;
    this.baseSprite = baseSprite;
    this.baseSolid = baseSolid;
  }

  public get page(): EventPage | undefined {
    return this.activePage >= 0 ? this.pages[this.activePage] : undefined;
  }
}
