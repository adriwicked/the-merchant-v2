import { createNoise2D } from 'simplex-noise'

export enum Terrain {
  DEEP_WATER,
  MEDIUM_WATER,
  FOAM,
  SEA_SHORE,
  BEACH_SAND,
  LOW_GRASS,
  HIGH_GRASS,
  DIRT,
  ROCK,
}

export const TERRAIN_COLORS: Record<Terrain, number> = {
  [Terrain.DEEP_WATER]: 0x256299,
  [Terrain.MEDIUM_WATER]: 0x2375b4,
  [Terrain.SEA_SHORE]: 0x4699de,
  [Terrain.FOAM]: 0x5aabee,
  [Terrain.BEACH_SAND]: 0xab976a,
  [Terrain.LOW_GRASS]: 0x457950,
  [Terrain.HIGH_GRASS]: 0x2d673e,
  [Terrain.DIRT]: 0x3f573a,
  [Terrain.ROCK]: 0x514635,
}

export const TERRAIN_LABELS: Record<Terrain, string> = {
  [Terrain.DEEP_WATER]: 'Deep Water',
  [Terrain.MEDIUM_WATER]: 'Medium Water',
  [Terrain.SEA_SHORE]: 'Sea Shore',
  [Terrain.FOAM]: 'Foam',
  [Terrain.BEACH_SAND]: 'Beach Sand',
  [Terrain.LOW_GRASS]: 'Low Grass',
  [Terrain.HIGH_GRASS]: 'High Grass',
  [Terrain.DIRT]: 'Dirt',
  [Terrain.ROCK]: 'Rock',
}

export interface MapParams {
  baseRanges: Array<{ max: number; terrain: Terrain }>
  shoreRanges: Array<{ max: number; terrain: Terrain }>
  scale: number
  octaves: number
  lacunarity: number
  persistence: number
  radialFalloff: number  // 0 = no falloff, higher = stronger edge darkening
}

export const DEFAULT_PARAMS: MapParams = {
  baseRanges: [
    { max: -0.55, terrain: Terrain.DEEP_WATER },
    { max: -0.09, terrain: Terrain.MEDIUM_WATER },
    { max: 0.20, terrain: Terrain.LOW_GRASS },
    { max: 0.35, terrain: Terrain.HIGH_GRASS },
    { max: 0.46, terrain: Terrain.DIRT },
    { max: 1, terrain: Terrain.ROCK },
  ],
  shoreRanges: [
    { max: -1.00, terrain: Terrain.SEA_SHORE },
    { max: 0.5, terrain: Terrain.BEACH_SAND },
  ],
  scale: 0.06,
  octaves: 4,
  lacunarity: 2.0,
  persistence: 0.35,
  radialFalloff: 1.40,
}

function isWater(terrain: Terrain): boolean {
  return terrain === Terrain.DEEP_WATER || terrain === Terrain.MEDIUM_WATER
}

function isLand(terrain: Terrain): boolean {
  return !isWater(terrain)
}

function getBaseTerrain(value: number, ranges: MapParams['baseRanges']): Terrain {
  for (const range of ranges) {
    if (value <= range.max) return range.terrain
  }
  return Terrain.ROCK
}

function getShoreTerrain(value: number, ranges: MapParams['shoreRanges']): Terrain {
  for (const range of ranges) {
    if (value <= range.max) return range.terrain
  }
  return Terrain.BEACH_SAND
}

/**
 * Generates a grid of raw noise values (no falloff applied).
 * Call this once per seed. Reuse across threshold and falloff changes.
 */
export function generateNoiseGrid(width: number, height: number, params: MapParams): Array<Array<number>> {
  const noise2D = createNoise2D()
  const grid: Array<Array<number>> = []

  for (let row = 0; row < height; row++) {
    grid[row] = []
    for (let col = 0; col < width; col++) {
      let value = 0
      let amplitude = 1
      let frequency = 1
      let maxAmplitude = 0

      for (let i = 0; i < params.octaves; i++) {
        value += amplitude * noise2D(col * params.scale * frequency, row * params.scale * frequency)
        maxAmplitude += amplitude
        amplitude *= params.persistence
        frequency *= params.lacunarity
      }

      grid[row][col] = value / maxAmplitude
    }
  }

  return grid
}

/**
 * Applies radial falloff over a raw noise grid, returning a new grid.
 * No effect inside inner radius (1/3 of half-width), ramps up to edges.
 */
export function applyRadialFalloff(rawGrid: Array<Array<number>>, falloff: number): Array<Array<number>> {
  const height = rawGrid.length
  const width = rawGrid[0].length
  const cx = (width - 1) / 2
  const cy = (height - 1) / 2
  const innerRadius = 1 / 3
  const outerRadius = 1.41
  const grid: Array<Array<number>> = []

  for (let row = 0; row < height; row++) {
    grid[row] = []
    for (let col = 0; col < width; col++) {
      let value = rawGrid[row][col]

      if (falloff > 0) {
        const dx = (col - cx) / cx
        const dy = (row - cy) / cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > innerRadius) {
          const t = (dist - innerRadius) / (outerRadius - innerRadius)
          value -= Math.min(t, 1) * falloff
        }
      }

      grid[row][col] = value
    }
  }

  return grid
}

/**
 * Classifies a pre-computed noise grid into terrain types using the given thresholds.
 * This is fast — no noise computation, just threshold lookups.
 */
export function classifyTerrain(noiseGrid: Array<Array<number>>, params: MapParams): Array<Array<Terrain>> {
  const height = noiseGrid.length
  const width = noiseGrid[0].length
  const map: Array<Array<Terrain>> = []

  // First pass: base terrain from noise values
  for (let row = 0; row < height; row++) {
    map[row] = []
    for (let col = 0; col < width; col++) {
      map[row][col] = getBaseTerrain(noiseGrid[row][col], params.baseRanges)
    }
  }

  // Second pass: apply shore terrain to land cells adjacent to water
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (isWater(map[row][col])) continue

      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ]

      const touchesWater = neighbors.some(([r, c]) =>
        r >= 0 && r < height && c >= 0 && c < width && isWater(map[r][c])
      )

      if (touchesWater) {
        map[row][col] = getShoreTerrain(noiseGrid[row][col], params.shoreRanges)
      }
    }
  }

  // Third pass: apply foam to water cells adjacent to shore (BEACH_SAND or SEA_SHORE)
  // Collect positions first to avoid cascading within the same pass
  const foamCells: Array<[number, number]> = []
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!isWater(map[row][col])) continue

      const neighbors = [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ]

      const touchesShore = neighbors.some(([r, c]) =>
        r >= 0 && r < height && c >= 0 && c < width &&
        (map[r][c] === Terrain.BEACH_SAND || map[r][c] === Terrain.SEA_SHORE)
      )

      if (touchesShore) {
        foamCells.push([row, col])
      }
    }
  }
  for (const [r, c] of foamCells) {
    map[r][c] = Terrain.FOAM
  }

  return map
}

/**
 * Convenience: generates a new noise grid and classifies it in one call.
 */
export function generateMap(width: number, height: number, params: MapParams = DEFAULT_PARAMS): Array<Array<Terrain>> {
  const noiseGrid = generateNoiseGrid(width, height, params)
  return classifyTerrain(noiseGrid, params)
}
