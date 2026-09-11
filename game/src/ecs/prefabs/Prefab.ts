export interface Prefab<TProps = any> {
  name: string;
  build: (props: TProps) => any[];
}

export function definePrefab<TProps>(definition: Prefab<TProps>): Prefab<TProps> {
  return definition;
}
