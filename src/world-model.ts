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

let model: WorldModel | null = null

/**
 * Returns the persistent world model, generating it on first call.
 * Pure data — no visual concerns.
 */
export function getWorldModel(): WorldModel {
  if (model) return model

  const rawNoiseGrid = generateNoiseGrid(MAP_WIDTH, MAP_HEIGHT, DEFAULT_PARAMS)
  const noiseValues = applyRadialFalloff(rawNoiseGrid, DEFAULT_PARAMS.radialFalloff)
  const terrain = classifyTerrain(noiseValues, DEFAULT_PARAMS)
  const locations = generateLocations(terrain)

  const waterCells = new Set<string>()
  for (let row = 0; row < MAP_HEIGHT; row++) {
    for (let col = 0; col < MAP_WIDTH; col++) {
      if (isAnimatedWater(terrain[row][col])) {
        waterCells.add(`${row},${col}`)
      }
    }
  }

  model = { terrain, noiseValues, locations, waterCells }
  return model
}
