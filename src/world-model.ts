import { generateNoiseGrid, applyRadialFalloff, classifyTerrain, Terrain, DEFAULT_PARAMS } from './map'
import { generateLocations, GameLocation } from './locations'
import { MAP_WIDTH, MAP_HEIGHT } from './config'

/**
 * Pure data representation of the generated world.
 * No colors, no Phaser objects — just terrain, noise values, and locations.
 */
export interface WorldModel {
  /** Classified terrain type per cell */
  terrain: Array<Array<Terrain>>
  /** Raw noise values (-1 to 1) after radial falloff, per cell */
  noiseValues: Array<Array<number>>
  /** Generated locations (cities and mines) */
  locations: Array<GameLocation>
  /** Set of "row,col" keys for cells that are animated water */
  waterCells: Set<string>
}

function isAnimatedWater(t: Terrain): boolean {
  return t === Terrain.DEEP_WATER || t === Terrain.MEDIUM_WATER || t === Terrain.SEA_SHORE || t === Terrain.FOAM
}

function buildWaterCells(terrain: Array<Array<Terrain>>): Set<string> {
  const waterCells = new Set<string>()
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (isAnimatedWater(terrain[row][col])) {
        waterCells.add(`${row},${col}`)
      }
    }
  }
  return waterCells
}

let model: WorldModel | null = null

/**
 * Generates the raw noise grid with radial falloff applied.
 * This is the "height map" — call once, then use for the emergence animation.
 */
export function generateWorldNoise(): Array<Array<number>> {
  const rawNoiseGrid = generateNoiseGrid(MAP_WIDTH, MAP_HEIGHT, DEFAULT_PARAMS)
  return applyRadialFalloff(rawNoiseGrid, DEFAULT_PARAMS.radialFalloff)
}

/**
 * Given a noise grid with an offset applied, classify terrain.
 * Returns terrain + waterCells (no locations — those come at finalization).
 */
export function classifyWithOffset(
  baseNoise: Array<Array<number>>,
  offset: number,
): { terrain: Array<Array<Terrain>>; waterCells: Set<string> } {
  const offsetGrid: Array<Array<number>> = []
  for (let row = 0; row < MAP_HEIGHT; row++) {
    offsetGrid[row] = []
    for (let col = 0; col < MAP_WIDTH; col++) {
      offsetGrid[row][col] = baseNoise[row][col] + offset
    }
  }
  const terrain = classifyTerrain(offsetGrid, DEFAULT_PARAMS)
  const waterCells = buildWaterCells(terrain)
  return { terrain, waterCells }
}

/**
 * Finalize the world model from a noise grid (no offset — use the original values).
 * Generates locations and caches the singleton.
 */
export function finalizeWorldModel(noiseValues: Array<Array<number>>): WorldModel {
  const terrain = classifyTerrain(noiseValues, DEFAULT_PARAMS)
  const locations = generateLocations(terrain)
  const waterCells = buildWaterCells(terrain)

  model = { terrain, noiseValues, locations, waterCells }
  return model
}

/**
 * Returns the persistent world model, generating it on first call.
 * Pure data — no visual concerns.
 */
export function getWorldModel(): WorldModel {
  if (model) return model

  const noiseValues = generateWorldNoise()
  return finalizeWorldModel(noiseValues)
}
