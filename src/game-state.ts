import { generateNoiseGrid, applyRadialFalloff, classifyTerrain, Terrain, TERRAIN_COLORS, DEFAULT_PARAMS } from './map'
import { generateLocations, GameLocation } from './locations'
import { MAP_WIDTH, MAP_HEIGHT, tweakColor } from './config'

/**
 * Persistent mine state: grid layout + positions of uncollected nuggets.
 * Keyed by "row,col" of the mine location on the world map.
 */
export interface MineState {
  grid: number[][] // MineTile values (0=BLACK, 1=WALL, 2=FLOOR)
  tileColors: number[][] // Pre-computed tweaked colors per tile
  nuggetPositions: Set<string> // "row,col" keys
}

interface WorldState {
  terrainMap: Terrain[][]
  locations: GameLocation[]
  /** Pre-computed tweaked colors per cell for land tiles (null = water) */
  landColors: (number | null)[][]
  /** Pre-computed base colors for water cells (for animation) */
  waterCells: { row: number; col: number; color: number }[]
  /** Persistent mine states keyed by "row,col" */
  mines: Map<string, MineState>
}

let state: WorldState | null = null

function isWater(t: Terrain): boolean {
  return t === Terrain.DEEP_WATER || t === Terrain.MEDIUM_WATER || t === Terrain.SEA_SHORE || t === Terrain.FOAM
}

/**
 * Returns the persistent world state, generating it on first call.
 */
export function getWorldState(): WorldState {
  if (state) return state

  const rawNoiseGrid = generateNoiseGrid(MAP_WIDTH, MAP_HEIGHT, DEFAULT_PARAMS)
  const noiseGrid = applyRadialFalloff(rawNoiseGrid, DEFAULT_PARAMS.radialFalloff)
  const terrainMap = classifyTerrain(noiseGrid, DEFAULT_PARAMS)
  const locations = generateLocations(terrainMap)

  const landColors: (number | null)[][] = []
  const waterCells: { row: number; col: number; color: number }[] = []

  for (let row = 0; row < MAP_HEIGHT; row++) {
    landColors[row] = []
    for (let col = 0; col < MAP_WIDTH; col++) {
      const terrain = terrainMap[row][col]
      const baseColor = tweakColor(TERRAIN_COLORS[terrain])

      if (isWater(terrain)) {
        landColors[row][col] = null
        waterCells.push({ row, col, color: baseColor })
      } else {
        landColors[row][col] = baseColor
      }
    }
  }

  state = {
    terrainMap,
    locations,
    landColors,
    waterCells,
    mines: new Map(),
  }

  return state
}

/**
 * Get or create persistent state for a specific mine.
 */
export function getMineState(loc: GameLocation): MineState {
  const world = getWorldState()
  const key = `${loc.row},${loc.col}`
  let ms = world.mines.get(key)
  if (!ms) {
    ms = { grid: [], tileColors: [], nuggetPositions: new Set() }
    world.mines.set(key, ms)
  }
  return ms
}
