import { GameLocation } from './locations'
import { MAP_WIDTH, MAP_HEIGHT } from './config'

// ── Enums & constants ────────────────────────────────────────────────

export enum MineTile {
  BLACK,
  WALL,
  FLOOR,
  TORCH,
}

export const BOMB_RADIUS_MIN = 3
export const BOMB_RADIUS_MAX = 5
export const GOLD_SPAWN_CHANCE = 0.15

const DIRS_CARDINAL: Array<Array<number>> = [[-1, 0], [1, 0], [0, -1], [0, 1]]
const DIRS_ALL: Array<Array<number>> = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]

// ── Persistent state ─────────────────────────────────────────────────

/**
 * Persistent mine state: grid layout + uncollected nuggets.
 * Pure data — no colors or visuals.
 */
export interface MineState {
  grid: Array<Array<MineTile>>
  nuggetPositions: Set<string>
}

const mines = new Map<string, MineState>()

/** Get or create persistent state for a specific mine. */
export function getMineState(loc: GameLocation): MineState {
  const key = `${loc.row},${loc.col}`
  let mineState = mines.get(key)
  if (!mineState) {
    mineState = { grid: [], nuggetPositions: new Set() }
    mines.set(key, mineState)
  }
  return mineState
}

// ── Layout generation ────────────────────────────────────────────────

export function generateMineLayout(): Array<Array<MineTile>> {
  const grid: Array<Array<MineTile>> = []

  for (let row = 0; row < MAP_HEIGHT; row++) {
    grid[row] = []
    for (let col = 0; col < MAP_WIDTH; col++) {
      grid[row][col] = MineTile.BLACK
    }
  }

  // Irregular cavern using flood-fill expansion from center
  const centerRow = Math.floor(MAP_HEIGHT / 2)
  const centerCol = Math.floor(MAP_WIDTH / 2)
  const radius = 10
  const floorTiles = new Set<string>()

  floorTiles.add(`${centerRow},${centerCol}`)

  const candidates: Array<{ r: number; c: number; dist: number }> = []
  for (let r = centerRow - radius - 1; r <= centerRow + radius + 1; r++) {
    for (let c = centerCol - radius - 1; c <= centerCol + radius + 1; c++) {
      if (r < 1 || r >= MAP_HEIGHT - 1 || c < 1 || c >= MAP_WIDTH - 1) continue
      const dist = Math.sqrt((r - centerRow) ** 2 + (c - centerCol) ** 2)
      if (dist <= radius + 1) {
        candidates.push({ r, c, dist })
      }
    }
  }

  candidates.sort((a, b) => a.dist - b.dist)

  // Pass 1: carve floor tiles with distance-based probability
  for (const { r, c, dist } of candidates) {
    const normalized = dist / radius
    const chance = normalized < 0.4 ? 1.0 : 1.0 - ((normalized - 0.4) / 0.6) * 0.85
    if (Math.random() < chance) {
      floorTiles.add(`${r},${c}`)
    }
  }

  // Pass 2: remove isolated floor tiles (must have >= 2 floor neighbors)
  const toRemove: Array<string> = []
  for (const key of floorTiles) {
    const [r, c] = key.split(',').map(Number)
    let neighbors = 0
    for (const [dr, dc] of DIRS_CARDINAL) {
      if (floorTiles.has(`${r + dr},${c + dc}`)) neighbors++
    }
    if (neighbors < 2) toRemove.push(key)
  }
  for (const key of toRemove) floorTiles.delete(key)

  // Apply floor tiles to grid
  for (const key of floorTiles) {
    const [r, c] = key.split(',').map(Number)
    grid[r][c] = MineTile.FLOOR
  }

  // Wall pass: BLACK adjacent (cardinal) to FLOOR becomes WALL
  const wallTiles: Array<{ r: number; c: number }> = []
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] !== MineTile.BLACK) continue
      for (const [dr, dc] of DIRS_CARDINAL) {
        const nr = r + dr
        const nc = c + dc
        if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && grid[nr][nc] === MineTile.FLOOR) {
          wallTiles.push({ r, c })
          break
        }
      }
    }
  }
  for (const { r, c } of wallTiles) grid[r][c] = MineTile.WALL

  // Diagonal walls for thicker border
  const diagDirs: Array<Array<number>> = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  const diagWalls: Array<{ r: number; c: number }> = []
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] !== MineTile.BLACK) continue
      for (const [dr, dc] of diagDirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && grid[nr][nc] === MineTile.FLOOR) {
          diagWalls.push({ r, c })
          break
        }
      }
    }
  }
  for (const { r, c } of diagWalls) grid[r][c] = MineTile.WALL

  // Torch placement
  const eligibleTorchTiles: Array<{ r: number; c: number }> = []
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] !== MineTile.WALL) continue
      for (const [dr, dc] of DIRS_CARDINAL) {
        const nr = r + dr
        const nc = c + dc
        if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && grid[nr][nc] === MineTile.FLOOR) {
          eligibleTorchTiles.push({ r, c })
          break
        }
      }
    }
  }

  const torchPositions: Array<{ r: number; c: number }> = []
  const torchCount = 2 + Math.floor(Math.random() * 3)
  // Shuffle
  for (let i = eligibleTorchTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligibleTorchTiles[i], eligibleTorchTiles[j]] = [eligibleTorchTiles[j], eligibleTorchTiles[i]]
  }

  for (const { r, c } of eligibleTorchTiles) {
    if (torchPositions.length >= torchCount) break
    const tooClose = torchPositions.some(
      (t) => Math.abs(t.r - r) + Math.abs(t.c - c) < 8,
    )
    if (tooClose) continue
    grid[r][c] = MineTile.TORCH
    torchPositions.push({ r, c })
  }

  return grid
}

export function findPlayerStart(grid: Array<Array<MineTile>>): { row: number; col: number } {
  const centerRow = Math.floor(MAP_HEIGHT / 2)
  const centerCol = Math.floor(MAP_WIDTH / 2)

  for (let dist = 0; dist < MAP_WIDTH; dist++) {
    for (let dr = -dist; dr <= dist; dr++) {
      for (let dc = -dist; dc <= dist; dc++) {
        if (Math.abs(dr) !== dist && Math.abs(dc) !== dist) continue
        const r = centerRow + dr
        const c = centerCol + dc
        if (r >= 0 && r < MAP_HEIGHT && c >= 0 && c < MAP_WIDTH && grid[r][c] === MineTile.FLOOR) {
          return { row: r, col: c }
        }
      }
    }
  }

  return { row: centerRow, col: centerCol }
}

// ── Explosion ────────────────────────────────────────────────────────

export interface ExplosionResult {
  /** Tiles converted to FLOOR */
  converted: Array<{ r: number; c: number }>
  /** New wall tiles created around the blast */
  newWalls: Array<{ r: number; c: number }>
  /** Nugget positions spawned */
  newNuggets: Array<{ r: number; c: number }>
}

/**
 * Explode at (row, col): convert nearby BLACK/WALL/TORCH to FLOOR,
 * regenerate walls around new floor, spawn nuggets.
 * Mutates grid in place. Returns what changed so the view can update visuals.
 */
export function explode(grid: Array<Array<MineTile>>, row: number, col: number): ExplosionResult {
  const radius = BOMB_RADIUS_MIN + Math.random() * (BOMB_RADIUS_MAX - BOMB_RADIUS_MIN)
  const converted: Array<{ r: number; c: number }> = []

  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      const tile = grid[r][c]
      if (tile !== MineTile.BLACK && tile !== MineTile.WALL && tile !== MineTile.TORCH) continue

      const dist = Math.sqrt((r - row) ** 2 + (c - col) ** 2)
      if (dist > radius) continue

      const normalizedDist = dist / radius
      const destroyChance = normalizedDist < 0.5 ? 1.0 : 1.0 - (normalizedDist - 0.5) * 1.6
      if (Math.random() > destroyChance) continue

      grid[r][c] = MineTile.FLOOR
      converted.push({ r, c })
    }
  }

  // Regenerate walls: BLACK adjacent to FLOOR becomes WALL
  const newWalls: Array<{ r: number; c: number }> = []
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] !== MineTile.BLACK) continue
      for (const [dr, dc] of DIRS_ALL) {
        const nr = r + dr
        const nc = c + dc
        if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && grid[nr][nc] === MineTile.FLOOR) {
          newWalls.push({ r, c })
          break
        }
      }
    }
  }
  for (const { r, c } of newWalls) grid[r][c] = MineTile.WALL

  // Spawn nuggets
  const newNuggets: Array<{ r: number; c: number }> = []
  for (const { r, c } of converted) {
    if (Math.random() < GOLD_SPAWN_CHANCE) {
      newNuggets.push({ r, c })
    }
  }

  return { converted, newWalls, newNuggets }
}

// ── Movement validation ──────────────────────────────────────────────

/** Check if the player can move to (row, col). */
export function canMoveTo(grid: Array<Array<MineTile>>, row: number, col: number): boolean {
  return (
    row >= 0 && row < MAP_HEIGHT &&
    col >= 0 && col < MAP_WIDTH &&
    grid[row][col] === MineTile.FLOOR
  )
}
