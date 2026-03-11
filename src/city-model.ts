import { MAP_HEIGHT, MAP_WIDTH } from './config'

export enum CityTile {
  LOW_GRASS,
  HIGH_GRASS,
  SEA_SHORE,
  BUILDING_WALL,
  BUILDING_FLOOR,
}

export interface CityState {
  grid: Array<Array<CityTile>>
  npcPositions: Array<{ row: number; col: number }>
  counters: Array<{ row: number; leftCol: number; width: number }>
  startRow: number
  startCol: number
}

let cityState: CityState | null = null

function createBaseGrassGrid(): Array<Array<CityTile>> {
  const grid: Array<Array<CityTile>> = []

  for (let row = 0; row < MAP_HEIGHT; row++) {
    grid[row] = []
    for (let col = 0; col < MAP_WIDTH; col++) {
      grid[row][col] = CityTile.HIGH_GRASS
    }
  }

  return grid
}

function paintLowGrassBlob(
  grid: Array<Array<CityTile>>,
  centerRow: number,
  centerCol: number,
  radius: number,
): void {
  for (let row = centerRow - radius; row <= centerRow + radius; row++) {
    if (row < 0 || row >= MAP_HEIGHT) continue

    for (let col = centerCol - radius; col <= centerCol + radius; col++) {
      if (col < 0 || col >= MAP_WIDTH) continue

      const dist = Math.sqrt((row - centerRow) ** 2 + (col - centerCol) ** 2)
      if (dist > radius) continue

      const noise = ((row * 37 + col * 57 + centerRow * 11 + centerCol * 23) % 100) / 100
      const edgeThreshold = radius - 0.9 + noise * 1.1
      if (dist <= edgeThreshold) {
        grid[row][col] = CityTile.LOW_GRASS
      }
    }
  }
}

function paintSeaShorePond(
  grid: Array<Array<CityTile>>,
  centerRow: number,
  centerCol: number,
  radius: number,
): void {
  for (let row = centerRow - radius; row <= centerRow + radius; row++) {
    if (row < 0 || row >= MAP_HEIGHT) continue

    for (let col = centerCol - radius; col <= centerCol + radius; col++) {
      if (col < 0 || col >= MAP_WIDTH) continue

      const dist = Math.sqrt((row - centerRow) ** 2 + (col - centerCol) ** 2)
      if (dist > radius) continue

      const noise = ((row * 19 + col * 29 + centerRow * 13 + centerCol * 17) % 100) / 100
      const shoreThreshold = radius - 1.1 + noise * 1.2
      if (dist <= shoreThreshold) {
        grid[row][col] = CityTile.SEA_SHORE
      }
    }
  }
}

function placeBuilding(
  grid: Array<Array<CityTile>>,
  topRow: number,
  leftCol: number,
  width: number,
  height: number,
  doorColOffset: number,
): void {
  const bottomRow = topRow + height - 1
  const rightCol = leftCol + width - 1
  const doorCol = leftCol + doorColOffset

  for (let row = topRow; row <= bottomRow; row++) {
    for (let col = leftCol; col <= rightCol; col++) {
      const isEdge = row === topRow || row === bottomRow || col === leftCol || col === rightCol
      grid[row][col] = isEdge ? CityTile.BUILDING_WALL : CityTile.BUILDING_FLOOR
    }
  }

  grid[bottomRow][doorCol] = CityTile.BUILDING_FLOOR
}

function paintPath(
  grid: Array<Array<CityTile>>,
  topRow: number,
  leftCol: number,
  width: number,
  height: number,
): void {
  for (let row = topRow; row < topRow + height; row++) {
    for (let col = leftCol; col < leftCol + width; col++) {
      grid[row][col] = CityTile.LOW_GRASS
    }
  }
}

export function generateCityLayout(): CityState {
  const grid = createBaseGrassGrid()

  paintLowGrassBlob(grid, 10, 7, 5)
  paintLowGrassBlob(grid, 11, 33, 5)
  paintLowGrassBlob(grid, 25, 13, 7)
  paintLowGrassBlob(grid, 27, 33, 6)
  paintLowGrassBlob(grid, 34, 22, 8)

  paintSeaShorePond(grid, 35, 34, 5)

  placeBuilding(grid, 6, 6, 10, 9, 5)
  placeBuilding(grid, 8, 28, 10, 9, 4)

  paintPath(grid, 16, 10, 27, 2)
  paintPath(grid, 17, 21, 3, 11)

  const npcPositions: Array<{ row: number; col: number }> = [
    { row: 10, col: 11 },
    { row: 12, col: 32 },
  ]

  const counters: Array<{ row: number; leftCol: number; width: number }> = [
    { row: 11, leftCol: 9, width: 4 },
    { row: 13, leftCol: 30, width: 4 },
  ]

  return {
    grid,
    npcPositions,
    counters,
    startRow: 31,
    startCol: 22,
  }
}

export function getCityState(): CityState {
  if (cityState) return cityState

  cityState = generateCityLayout()
  return cityState
}

export function canMoveToCity(grid: Array<Array<CityTile>>, row: number, col: number): boolean {
  return (
    row >= 0 && row < MAP_HEIGHT &&
    col >= 0 && col < MAP_WIDTH &&
    grid[row][col] !== CityTile.BUILDING_WALL
  )
}
