export type ThemeId = 'suburb' | 'cbd' | 'industrial' | 'tunnel' | 'bridge' | 'stadium';

export interface Theme {
  id: ThemeId;
  label: string;
  speedLimit: number;
  median: 'raised' | 'barrier';
  /** Width of the raised footpath/nature strip beyond the kerb. */
  footpath: number;
  buildings: 'houses' | 'towers' | 'warehouses' | 'none';
  /** Verge material beyond the footpath/shoulder, or null (tunnel, bridge). */
  lawn: 'suburb' | 'cbd' | 'industrial' | null;
  structure: 'none' | 'tunnel' | 'bridge';
  /** Gap between the footpath and building fronts. */
  setback: [number, number];
  /** Lot frontage range along the road. */
  frontage: [number, number];
  height: [number, number];
  depth: [number, number];
  palette: number[];
  streetLightEvery: number;
  treeEvery: number;
  /** Mean spacing of side streets, 0 = none. */
  crossStreetEvery: number;
  edgeLines: boolean;
  ground: number;
}

export const THEMES: Record<ThemeId, Theme> = {
  suburb: {
    id: 'suburb', label: 'Suburbs', speedLimit: 60, median: 'raised', footpath: 4.5, buildings: 'houses',
    setback: [6, 11], frontage: [14, 20], height: [3.2, 6.4], depth: [10, 14],
    palette: [0xd9c8a9, 0xc98f6b, 0xe6ddd0, 0xa9b8a0, 0xd4b48c, 0xb7a6a0, 0xece4d4],
    streetLightEvery: 40, treeEvery: 14, crossStreetEvery: 190, edgeLines: false, ground: 0x6f8f4e, lawn: 'suburb', structure: 'none',
  },
  cbd: {
    id: 'cbd', label: 'City', speedLimit: 40, median: 'raised', footpath: 5, buildings: 'towers',
    setback: [0, 0.5], frontage: [18, 34], height: [18, 90], depth: [18, 30],
    palette: [0x9aa6b2, 0xc4bdb0, 0x7d8a97, 0xb5aa98, 0x8c9399, 0xd0ccc4, 0x6e7c88],
    streetLightEvery: 30, treeEvery: 22, crossStreetEvery: 150, edgeLines: false, ground: 0x8a8a86, lawn: 'cbd', structure: 'none',
  },
  industrial: {
    id: 'industrial', label: 'Motorway', speedLimit: 80, median: 'barrier', footpath: 3, buildings: 'warehouses',
    setback: [14, 30], frontage: [40, 80], height: [7, 12], depth: [30, 50],
    palette: [0xb4b8bb, 0x8d969c, 0xc7bfae, 0x9fa9a0, 0xa39a8d],
    streetLightEvery: 55, treeEvery: 30, crossStreetEvery: 0, edgeLines: true, ground: 0x7a8a58, lawn: 'industrial', structure: 'none',
  },
  tunnel: {
    id: 'tunnel', label: 'Tunnel', speedLimit: 60, median: 'barrier', footpath: 0, buildings: 'none',
    setback: [0, 0], frontage: [50, 50], height: [0, 0], depth: [0, 0], palette: [0x999999],
    streetLightEvery: 1000, treeEvery: 1000, crossStreetEvery: 0, edgeLines: true, ground: 0x6c8a4f, lawn: null, structure: 'tunnel',
  },
  bridge: {
    id: 'bridge', label: 'Bridge', speedLimit: 70, median: 'barrier', footpath: 0, buildings: 'none',
    setback: [0, 0], frontage: [50, 50], height: [0, 0], depth: [0, 0], palette: [0x999999],
    streetLightEvery: 45, treeEvery: 1000, crossStreetEvery: 0, edgeLines: true, ground: 0x3f6f8a, lawn: null, structure: 'bridge',
  },
  stadium: {
    id: 'stadium', label: 'Stadium', speedLimit: 40, median: 'raised', footpath: 6, buildings: 'towers',
    setback: [2, 6], frontage: [20, 40], height: [8, 24], depth: [16, 26],
    palette: [0x8f8a80, 0xa59c8a, 0x6f7a84, 0xb4ab9c, 0x7c858c],
    streetLightEvery: 25, treeEvery: 18, crossStreetEvery: 170, edgeLines: false, ground: 0x8a8a86, lawn: 'cbd', structure: 'none',
  },
};
