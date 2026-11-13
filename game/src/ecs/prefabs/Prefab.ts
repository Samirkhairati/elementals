export interface Prefab<TProps = unknown> {
  name: string;
  build: (props: TProps) => unknown[];
}

export function definePrefab<TProps>(definition: Prefab<TProps>): Prefab<TProps> {
  return definition;
}
