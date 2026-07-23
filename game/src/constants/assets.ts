export const TILESETS = [
    "beach_caves",
    "bush",
    "grass",
    "house",
    "interior",
    "outside"
];

const mapFiles = import.meta.glob('../../public/data/maps/*.json');

export const MAPS = Object.keys(mapFiles).map(path => {
    const fileName = path.split('/').pop()!;
    const key = fileName.replace('.json', '');
    
    // Capitalize first letter and add space before numbers (e.g. "map1" -> "Map 1")
    let name = key.charAt(0).toUpperCase() + key.slice(1);
    name = name.replace(/(\d+)/g, ' $1').trim();
    
    return { name, key };
}).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
