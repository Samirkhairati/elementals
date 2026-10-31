/** Identity of an editor-placed entity: its editor id (event targets, self switches) and display name. */
export class EntityInfoComponent {
  public editorId: string;
  public name: string;

  constructor(editorId: string, name: string = "") {
    this.editorId = editorId;
    this.name = name;
  }
}

export const EntityInfo = (editorId: string, name?: string) => new EntityInfoComponent(editorId, name);
