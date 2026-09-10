export class TagComponent {
  public tag: string;

  constructor(tag: string) {
    this.tag = tag;
  }
}

export const Tag = (tag: string) => new TagComponent(tag);
