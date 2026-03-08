import { Terrain } from './map'

export enum LocationType {
  CITY,
  MINE,
}

export interface GameLocation {
  type: LocationType
  row: number
  col: number
}

const MIN_DIST_CITY_CITY = 5
const MIN_DIST_MINE_MINE = 5
const MIN_DIST_CITY_MINE = 2
const MAX_CITIES = 3
const MAX_MINES = 2

function getNeighbors(row: number, col: number, height: number, width: number): [number, number][] {
  const neighbors: [number, number][] = []
  if (row > 0) neighbors.push([row - 1, col])
  if (row < height - 1) neighbors.push([row + 1, col])
  if (col > 0) neighbors.push([row, col - 1])
  if (col < width - 1) neighbors.push([row, col + 1])
  return neighbors
}

function tileDistance(r1: number, c1: number, r2: number, c2: number): number {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2)
}

/**
 * Finds all valid city positions: LOW_GRASS tiles adjacent to at least one BEACH_SAND tile.
 */
function findCityCandidates(map: Terrain[][]): [number, number][] {
  const height = map.length
  const width = map[0].length
  const candidates: [number, number][] = []

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (map[row][col] !== Terrain.LOW_GRASS) continue

      const touchesSand = getNeighbors(row, col, height, width)
        .some(([r, c]) => map[r][c] === Terrain.BEACH_SAND)

      if (touchesSand) candidates.push([row, col])
    }
  }

  return candidates
}

/**
 * Finds all valid mine positions: DIRT or ROCK tiles.
 */
function findMineCandidates(map: Terrain[][]): [number, number][] {
  const height = map.length
  const width = map[0].length
  const candidates: [number, number][] = []

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (map[row][col] === Terrain.DIRT || map[row][col] === Terrain.ROCK) {
        candidates.push([row, col])
      }
    }
  }

  return candidates
}

function pickRandom<T>(arr: T[]): T | undefined {
  if (arr.length === 0) return undefined
  return arr[Math.floor(Math.random() * arr.length)]
}

function respectsDistances(
  row: number,
  col: number,
  type: LocationType,
  placed: GameLocation[],
): boolean {
  for (const loc of placed) {
    const dist = tileDistance(row, col, loc.row, loc.col)

    if (type === LocationType.CITY && loc.type === LocationType.CITY) {
      if (dist < MIN_DIST_CITY_CITY) return false
    } else if (type === LocationType.MINE && loc.type === LocationType.MINE) {
      if (dist < MIN_DIST_MINE_MINE) return false
    } else {
      if (dist < MIN_DIST_CITY_MINE) return false
    }
  }
  return true
}

/**
 * Generates locations (cities and mines) on valid terrain tiles,
 * respecting minimum distance constraints.
 */
export function generateLocations(map: Terrain[][]): GameLocation[] {
  const locations: GameLocation[] = []

  const cityCandidates = findCityCandidates(map)
  for (let i = 0; i < MAX_CITIES; i++) {
    const available = cityCandidates.filter(([r, c]) =>
      respectsDistances(r, c, LocationType.CITY, locations)
    )
    const pick = pickRandom(available)
    if (!pick) break
    locations.push({ type: LocationType.CITY, row: pick[0], col: pick[1] })
  }

  const mineCandidates = findMineCandidates(map)
  for (let i = 0; i < MAX_MINES; i++) {
    const available = mineCandidates.filter(([r, c]) =>
      respectsDistances(r, c, LocationType.MINE, locations)
    )
    const pick = pickRandom(available)
    if (!pick) break
    locations.push({ type: LocationType.MINE, row: pick[0], col: pick[1] })
  }

  return locations
}
