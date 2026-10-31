// Character profiles: named checklists a character may claim (docs/database-and-characters-spec.md §5.6).
// A profile is a contract, not a "kind": a character without one is "custom" and fully valid. Stored in
// code for now; phase 7 uses them to warn when `changeSprite` swaps between different profiles.

import type { CharacterDef } from './characters.ts';
import { resolveClip } from './characters.ts';

export interface CharacterProfile {
  id: string;
  label: string;
  /** One line per requirement, shown as a checklist. */
  requirements: string[];
  /** The requirements `def` does not meet (empty = satisfied). */
  unmet(def: CharacterDef): string[];
}

function directionalClip(def: CharacterDef, activity: 'idle' | 'walk' | 'run'): boolean {
  const name = resolveClip(def, 'normal', activity);
  return name !== null && def.clips[name]?.directional === true;
}

export const CHARACTER_PROFILES: Record<string, CharacterProfile> = {
  actor4: {
    id: 'actor4',
    label: 'Actor (4 directions)',
    requirements: ['Four facings', 'Directional animation bound to idle', 'Directional animation bound to walk', 'Run is optional'],
    unmet(def) {
      const out: string[] = [];
      if (def.facing !== 'four') out.push('facing must be "four"');
      if (!def.bindings.idle || !directionalClip(def, 'idle')) out.push('"idle" must be bound to a directional animation');
      if (!def.bindings.walk || !directionalClip(def, 'walk')) out.push('"walk" must be bound to a directional animation');
      return out;
    },
  },
  prop: {
    id: 'prop',
    label: 'Prop',
    requirements: ['No facing', 'At least one animation or a still frame'],
    unmet(def) {
      const out: string[] = [];
      if (def.facing !== 'none') out.push('facing must be "none"');
      if (Object.keys(def.clips).length === 0 && !def.still) out.push('needs at least one animation or a still frame');
      return out;
    },
  },
};

export function isKnownProfile(id: string): boolean {
  return Object.hasOwn(CHARACTER_PROFILES, id);
}

/** Requirements of profile `id` that `def` fails; an unknown profile reports itself. */
export function unmetProfileRequirements(def: CharacterDef, id: string): string[] {
  return isKnownProfile(id) ? CHARACTER_PROFILES[id].unmet(def) : [`unknown profile "${id}"`];
}
