// Tilesets, sprites and database are NOT listed here: they come from the generated manifests under
// public/data (sprites.json, tilesets.json, database.json), loaded by the Boot/Preloader scenes.
// Only the maps are discovered by the bundler (file base name = map id).

const mapFiles = import.meta.glob('../../public/data/maps/*.json');

export const MAPS = Object.keys(mapFiles).map(path => {
    const fileName = path.split('/').pop()!;
    const key = fileName.replace('.json', '');
    
    // Capitalize first letter and add space before numbers (e.g. "map1" -> "Map 1")
    let name = key.charAt(0).toUpperCase() + key.slice(1);
    name = name.replace(/(\d+)/g, ' $1').trim();
    
    return { name, key };
}).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
