import Phaser from 'phaser'
import { GameLocation } from './locations'
import { getMineState, MineState } from './game-state'
import {
  CANVAS_WIDTH, CELL_SIZE, CELL_SEPARATION, BORDER_WIDTH,
  MAP_WIDTH, MAP_HEIGHT, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT,
  OFFSET_X, OFFSET_Y, COLORS, tweakColor, brightenColor, cellPosition,
} from './config'
import { inventory } from './inventory'

export enum MineTile {
  BLACK,
  WALL,
  FLOOR,
  TORCH,
}

const MINE_COLORS: Record<number, number> = {
  [MineTile.BLACK]: 0x2a2a2a,
  [MineTile.WALL]: 0x382a1a,
  [MineTile.FLOOR]: 0x3d332a,
  [MineTile.TORCH]: 0xfff4e0,
}

const PLAYER_COLOR = 0x3366cc
const PLAYER_SIZE = 6
const MOVE_COOLDOWN = 150
const BOMB_COLOR = 0xcc4444
const BOMB_FUSE_MS = 2000
const BOMB_RADIUS_MIN = 3
const BOMB_RADIUS_MAX = 5
const GOLD_NUGGET_COLOR = 0xffd700
const GOLD_NUGGET_SIZE = 4
const GOLD_SPAWN_CHANCE = 0.15

// Torch system
const TORCH_RADIUS = 6        // tiles of light reach
const TORCH_BRIGHTNESS = 1.5  // max brightness multiplier at torch
const TORCH_WARMTH = 0.6      // warm tint factor at torch

function generateMineLayout(): MineTile[][] {
  const grid: MineTile[][] = []

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
  const floorTiles: Set<string> = new Set()

  // Seed: mark center as floor
  floorTiles.add(`${centerRow},${centerCol}`)

  // Expand outward: iterate all cells in radius, accept with probability
  // that drops off with distance. Run multiple passes for organic shape.
  const candidates: { r: number; c: number; dist: number }[] = []
  for (let r = centerRow - radius - 1; r <= centerRow + radius + 1; r++) {
    for (let c = centerCol - radius - 1; c <= centerCol + radius + 1; c++) {
      if (r < 1 || r >= MAP_HEIGHT - 1 || c < 1 || c >= MAP_WIDTH - 1) continue
      const dist = Math.sqrt((r - centerRow) ** 2 + (c - centerCol) ** 2)
      if (dist <= radius + 1) {
        candidates.push({ r, c, dist })
      }
    }
  }

  // Sort by distance so inner tiles are processed first
  candidates.sort((a, b) => a.dist - b.dist)

  // Pass 1: carve floor tiles with distance-based probability
  for (const { r, c, dist } of candidates) {
    const normalized = dist / radius // 0 at center, 1 at edge
    // Inner 40%: always floor. Then probability drops to 0 at edge.
    const chance = normalized < 0.4 ? 1.0 : 1.0 - ((normalized - 0.4) / 0.6) * 0.85
    if (Math.random() < chance) {
      floorTiles.add(`${r},${c}`)
    }
  }

  // Pass 2: remove isolated floor tiles (must have at least 2 floor neighbors)
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]]
  const toRemove: string[] = []
  for (const key of floorTiles) {
    const [r, c] = key.split(',').map(Number)
    let neighbors = 0
    for (const [dr, dc] of dirs) {
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

  // Wall pass: any BLACK tile adjacent to FLOOR becomes WALL
  const wallTiles: { r: number; c: number }[] = []
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] !== MineTile.BLACK) continue
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && grid[nr][nc] === MineTile.FLOOR) {
          wallTiles.push({ r, c })
          break
        }
      }
    }
  }
  for (const { r, c } of wallTiles) {
    grid[r][c] = MineTile.WALL
  }

  // Also add diagonal walls for a thicker border feel
  const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
  const diagWalls: { r: number; c: number }[] = []
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
  for (const { r, c } of diagWalls) {
    grid[r][c] = MineTile.WALL
  }

  // Torch placement: eligible WALL tiles that are adjacent (cardinal) to at least one FLOOR tile
  const eligibleTorchTiles: { r: number; c: number }[] = []
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] !== MineTile.WALL) continue
      for (const [dr, dc] of dirs) {
        const nr = r + dr
        const nc = c + dc
        if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && grid[nr][nc] === MineTile.FLOOR) {
          eligibleTorchTiles.push({ r, c })
          break
        }
      }
    }
  }

  // Convert some eligible walls to torches: pick exactly 2-4 torches
  const torchPositions: { r: number; c: number }[] = []
  const torchCount = 2 + Math.floor(Math.random() * 3) // 2, 3, or 4
  // Shuffle eligible tiles for randomness
  for (let i = eligibleTorchTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [eligibleTorchTiles[i], eligibleTorchTiles[j]] = [eligibleTorchTiles[j], eligibleTorchTiles[i]]
  }

  for (const { r, c } of eligibleTorchTiles) {
    if (torchPositions.length >= torchCount) break

    // Check min distance to existing torches (Manhattan distance >= 8)
    const tooClose = torchPositions.some(
      (t) => Math.abs(t.r - r) + Math.abs(t.c - c) < 8,
    )
    if (tooClose) continue

    grid[r][c] = MineTile.TORCH
    torchPositions.push({ r, c })
  }

  return grid
}

function findPlayerStart(grid: MineTile[][]): { row: number; col: number } {
  // Find the center-most floor tile
  const centerRow = Math.floor(MAP_HEIGHT / 2)
  const centerCol = Math.floor(MAP_WIDTH / 2)

  // Spiral outward from center to find a floor tile
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

export class MineScene extends Phaser.Scene {
  private mineGrid: MineTile[][] = []
  private tileColors: number[][] = []
  private mineState!: MineState
  private currentLocation!: GameLocation
  private playerRow = 0
  private playerCol = 0
  private playerRect!: Phaser.GameObjects.Rectangle
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private lastMoveTime = 0
  private tileGraphics!: Phaser.GameObjects.Graphics
  private torchGraphics!: Phaser.GameObjects.Graphics
  private inventoryText!: Phaser.GameObjects.Text
  private nuggets: Map<string, Phaser.GameObjects.Rectangle> = new Map()
  private torchLitCells: { row: number; col: number; baseColor: number }[] = []

  constructor() {
    super('MineScene')
  }

  init(data: { location: GameLocation }) {
    this.currentLocation = data.location
  }

  create() {
    this.nuggets.clear()
    this.cameras.main.setBackgroundColor(COLORS.BOARD.BACKGROUND)

    const staticGraphics = this.add.graphics()

    // Border
    staticGraphics.fillStyle(COLORS.BOARD.BORDER, 1)
    staticGraphics.fillRect(
      OFFSET_X - BORDER_WIDTH,
      OFFSET_Y - BORDER_WIDTH,
      GRID_PIXEL_WIDTH + BORDER_WIDTH * 2,
      GRID_PIXEL_HEIGHT + BORDER_WIDTH * 2,
    )

    // Background behind cells
    staticGraphics.fillStyle(COLORS.BOARD.BACKGROUND, 1)
    staticGraphics.fillRect(OFFSET_X, OFFSET_Y, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT)

    // Get or create persistent mine state
    this.mineState = getMineState(this.currentLocation)

    if (this.mineState.grid.length > 0) {
      // Reuse existing layout and colors
      this.mineGrid = this.mineState.grid
      this.tileColors = this.mineState.tileColors
    } else {
      // First visit: generate layout, compute colors, and persist
      this.mineGrid = generateMineLayout()
      this.tileColors = this.computeTileColors(this.mineGrid)
      this.mineState.grid = this.mineGrid
      this.mineState.tileColors = this.tileColors
    }

    // Draw mine tiles
    this.tileGraphics = this.add.graphics()
    this.torchGraphics = this.add.graphics()
    this.computeTorchLitCells()
    this.drawAllTiles()

    // Torch flicker animation: re-tweak torch-lit floor cells every 2 seconds
    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.drawTorchLitCells()
      },
    })

    // Recreate nugget visuals from persistent state
    for (const key of this.mineState.nuggetPositions) {
      const [r, c] = key.split(',').map(Number)
      this.createNuggetVisual(r, c)
    }

    // Player
    const start = findPlayerStart(this.mineGrid)
    this.playerRow = start.row
    this.playerCol = start.col

    const { x: px, y: py } = cellPosition(this.playerRow, this.playerCol)
    this.playerRect = this.add.rectangle(
      px + CELL_SIZE / 2,
      py + CELL_SIZE / 2,
      PLAYER_SIZE,
      PLAYER_SIZE,
      PLAYER_COLOR,
    )

    // Inventory text below the grid
    const textY = OFFSET_Y + GRID_PIXEL_HEIGHT + BORDER_WIDTH + 8
    this.inventoryText = this.add.text(CANVAS_WIDTH / 2, textY, '', {
      fontSize: '14px',
      color: '#cccccc',
      fontFamily: 'Arial',
    }).setOrigin(0.5, 0)
    this.updateInventoryText()

    // Keyboard input
    this.cursors = this.input.keyboard!.createCursorKeys()

    // Space to plant bomb
    this.input.keyboard!.on('keydown-SPACE', () => {
      this.plantBomb()
    })

    // ESC to go back to map
    this.input.keyboard!.on('keydown-ESC', () => {
      this.scene.start('GameScene')
    })
  }

  update(_time: number, _delta: number) {
    const now = Date.now()
    if (now - this.lastMoveTime < MOVE_COOLDOWN) return

    let dr = 0
    let dc = 0

    if (this.cursors.up.isDown) dr = -1
    else if (this.cursors.down.isDown) dr = 1
    else if (this.cursors.left.isDown) dc = -1
    else if (this.cursors.right.isDown) dc = 1

    if (dr === 0 && dc === 0) return

    const newRow = this.playerRow + dr
    const newCol = this.playerCol + dc

    if (
      newRow >= 0 && newRow < MAP_HEIGHT &&
      newCol >= 0 && newCol < MAP_WIDTH &&
      this.mineGrid[newRow][newCol] === MineTile.FLOOR
    ) {
      this.playerRow = newRow
      this.playerCol = newCol
      const { x, y } = cellPosition(newRow, newCol)
      this.playerRect.setPosition(x + CELL_SIZE / 2, y + CELL_SIZE / 2)
      this.lastMoveTime = now

      this.tryPickupNugget(newRow, newCol)
    }
  }

  private plantBomb() {
    if (inventory.bombs <= 0) return

    inventory.bombs--
    this.updateInventoryText()

    const bombRow = this.playerRow
    const bombCol = this.playerCol

    // Draw bomb marker on the tile
    const { x, y } = cellPosition(bombRow, bombCol)
    const bombMarker = this.add.rectangle(
      x + CELL_SIZE / 2,
      y + CELL_SIZE / 2,
      CELL_SIZE,
      CELL_SIZE,
      BOMB_COLOR,
    )

    // Blink the bomb marker
    this.tweens.add({
      targets: bombMarker,
      alpha: 0.3,
      duration: 300,
      yoyo: true,
      repeat: -1,
    })

    // Explode after fuse
    this.time.delayedCall(BOMB_FUSE_MS, () => {
      bombMarker.destroy()
      this.explode(bombRow, bombCol)
    })
  }

  private explode(row: number, col: number) {
    const radius = BOMB_RADIUS_MIN + Math.random() * (BOMB_RADIUS_MAX - BOMB_RADIUS_MIN)
    const converted: { r: number; c: number }[] = []

    for (let r = 0; r < MAP_HEIGHT; r++) {
      for (let c = 0; c < MAP_WIDTH; c++) {
        const tile = this.mineGrid[r][c]
        if (tile !== MineTile.BLACK && tile !== MineTile.WALL && tile !== MineTile.TORCH) continue

        const dist = Math.sqrt((r - row) ** 2 + (c - col) ** 2)
        if (dist > radius) continue

        // Irregular shape: tiles near the edge have decreasing chance of being destroyed
        const normalizedDist = dist / radius // 0 at center, 1 at edge
        const destroyChance = normalizedDist < 0.5 ? 1.0 : 1.0 - (normalizedDist - 0.5) * 1.6
        if (Math.random() > destroyChance) continue

        this.mineGrid[r][c] = MineTile.FLOOR
        // Update cached tile color for converted tile
        this.tileColors[r][c] = tweakColor(MINE_COLORS[MineTile.FLOOR])
        converted.push({ r, c })
      }
    }

    // Spawn gold nuggets on some converted tiles
    for (const { r, c } of converted) {
      if (Math.random() < GOLD_SPAWN_CHANCE) {
        this.spawnNugget(r, c)
      }
    }

    // Convert BLACK tiles adjacent to FLOOR into WALL (cardinal + diagonal)
    const allDirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]
    const newWalls: { r: number; c: number }[] = []
    for (let r = 0; r < MAP_HEIGHT; r++) {
      for (let c = 0; c < MAP_WIDTH; c++) {
        if (this.mineGrid[r][c] !== MineTile.BLACK) continue
        for (const [dr, dc] of allDirs) {
          const nr = r + dr
          const nc = c + dc
          if (nr >= 0 && nr < MAP_HEIGHT && nc >= 0 && nc < MAP_WIDTH && this.mineGrid[nr][nc] === MineTile.FLOOR) {
            newWalls.push({ r, c })
            break
          }
        }
      }
    }
    for (const { r, c } of newWalls) {
      this.mineGrid[r][c] = MineTile.WALL
      this.tileColors[r][c] = tweakColor(MINE_COLORS[MineTile.WALL])
    }

    // Recalculate torch lighting for all FLOOR tiles affected by the explosion.
    // Torches may have been destroyed and new floor tiles created.
    this.recalcTorchLighting()

    this.drawAllTiles()
    // Camera shake
    this.cameras.main.shake(150, 0.005)
    // Bring nuggets and player on top of redrawn tiles
    for (const rect of this.nuggets.values()) {
      this.children.bringToTop(rect)
    }
    this.children.bringToTop(this.playerRect)
  }

  private spawnNugget(row: number, col: number) {
    const key = `${row},${col}`
    if (this.nuggets.has(key)) return

    // Persist to mine state
    this.mineState.nuggetPositions.add(key)
    this.createNuggetVisual(row, col)
  }

  /** Creates the visual Rectangle for a nugget (no state mutation). */
  private createNuggetVisual(row: number, col: number) {
    const key = `${row},${col}`
    const { x, y } = cellPosition(row, col)
    const nugget = this.add.rectangle(
      x + CELL_SIZE / 2,
      y + CELL_SIZE / 2,
      GOLD_NUGGET_SIZE,
      GOLD_NUGGET_SIZE,
      GOLD_NUGGET_COLOR,
    )
    this.nuggets.set(key, nugget)
  }

  private tryPickupNugget(row: number, col: number) {
    const key = `${row},${col}`
    const nugget = this.nuggets.get(key)
    if (!nugget) return

    nugget.destroy()
    this.nuggets.delete(key)

    // Remove from persistent state
    this.mineState.nuggetPositions.delete(key)

    inventory.goldNuggets++
    this.updateInventoryText()
  }

  /** Pre-compute a tweaked color for every tile in the grid, including torch lighting. */
  private computeTileColors(grid: MineTile[][]): number[][] {
    // First pass: base tweaked colors
    const colors: number[][] = []
    for (let row = 0; row < MAP_HEIGHT; row++) {
      colors[row] = []
      for (let col = 0; col < MAP_WIDTH; col++) {
        const tile = grid[row][col]
        colors[row][col] = tile === MineTile.BLACK
          ? MINE_COLORS[MineTile.BLACK]
          : tweakColor(MINE_COLORS[tile])
      }
    }

    // Second pass: apply torch lighting to FLOOR tiles
    // Collect all torch positions
    const torches: { r: number; c: number }[] = []
    for (let r = 0; r < MAP_HEIGHT; r++) {
      for (let c = 0; c < MAP_WIDTH; c++) {
        if (grid[r][c] === MineTile.TORCH) torches.push({ r, c })
      }
    }

    // For each floor tile, find the strongest torch influence
    for (let r = 0; r < MAP_HEIGHT; r++) {
      for (let c = 0; c < MAP_WIDTH; c++) {
        if (grid[r][c] !== MineTile.FLOOR) continue

        let maxFactor = 1.0
        let maxWarmth = 0

        for (const torch of torches) {
          const dist = Math.sqrt((r - torch.r) ** 2 + (c - torch.c) ** 2)
          if (dist > TORCH_RADIUS) continue

          // Linear falloff: full brightness at distance 0, factor 1.0 at TORCH_RADIUS
          const t = 1 - dist / TORCH_RADIUS
          const factor = 1.0 + (TORCH_BRIGHTNESS - 1.0) * t
          const warmth = TORCH_WARMTH * t

          if (factor > maxFactor) {
            maxFactor = factor
            maxWarmth = warmth
          }
        }

        if (maxFactor > 1.0) {
          colors[r][c] = brightenColor(colors[r][c], maxFactor, maxWarmth)
        }
      }
    }

    return colors
  }

  private drawAllTiles() {
    this.tileGraphics.clear()
    // Build a set of torch-lit cell keys for quick lookup
    const litSet = new Set(this.torchLitCells.map((c) => `${c.row},${c.col}`))

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        // Torch-lit floor tiles are drawn on the torchGraphics layer
        if (litSet.has(`${row},${col}`)) continue
        const { x, y } = cellPosition(row, col)
        this.tileGraphics.fillStyle(this.tileColors[row][col], 1)
        this.tileGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
    }

    // Draw torch-lit cells on their own layer (for flicker animation)
    this.drawTorchLitCells()
  }

  /** Compute which FLOOR cells are lit by at least one torch. */
  private computeTorchLitCells() {
    this.torchLitCells = []

    // Collect all torch positions
    const torches: { r: number; c: number }[] = []
    for (let r = 0; r < MAP_HEIGHT; r++) {
      for (let c = 0; c < MAP_WIDTH; c++) {
        if (this.mineGrid[r][c] === MineTile.TORCH) torches.push({ r, c })
      }
    }

    if (torches.length === 0) return

    for (let r = 0; r < MAP_HEIGHT; r++) {
      for (let c = 0; c < MAP_WIDTH; c++) {
        if (this.mineGrid[r][c] !== MineTile.FLOOR) continue

        for (const torch of torches) {
          const dist = Math.sqrt((r - torch.r) ** 2 + (c - torch.c) ** 2)
          if (dist <= TORCH_RADIUS) {
            // This cell is lit — store its base color from tileColors (already brightened)
            this.torchLitCells.push({ row: r, col: c, baseColor: this.tileColors[r][c] })
            break // only need to know it's lit, not by how many torches
          }
        }
      }
    }
  }

  /** Draw (or re-draw with flicker) torch-lit floor cells on the torchGraphics layer. */
  private drawTorchLitCells() {
    this.torchGraphics.clear()
    for (const { row, col, baseColor } of this.torchLitCells) {
      const { x, y } = cellPosition(row, col)
      // Re-tweak from base brightened color for flicker effect
      const flickered = tweakColor(baseColor)
      this.torchGraphics.fillStyle(flickered, 1)
      this.torchGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    }
  }

  /**
   * Recalculate torch lighting after explosion: reapply brightness to FLOOR tiles
   * near surviving torches, recompute torchLitCells.
   */
  private recalcTorchLighting() {
    // Collect surviving torch positions
    const torches: { r: number; c: number }[] = []
    for (let r = 0; r < MAP_HEIGHT; r++) {
      for (let c = 0; c < MAP_WIDTH; c++) {
        if (this.mineGrid[r][c] === MineTile.TORCH) torches.push({ r, c })
      }
    }

    // Recalculate lighting for all FLOOR tiles
    for (let r = 0; r < MAP_HEIGHT; r++) {
      for (let c = 0; c < MAP_WIDTH; c++) {
        if (this.mineGrid[r][c] !== MineTile.FLOOR) continue

        // Start from a base tweaked floor color (strip old torch lighting)
        const baseFloor = tweakColor(MINE_COLORS[MineTile.FLOOR])

        let maxFactor = 1.0
        let maxWarmth = 0

        for (const torch of torches) {
          const dist = Math.sqrt((r - torch.r) ** 2 + (c - torch.c) ** 2)
          if (dist > TORCH_RADIUS) continue

          const t = 1 - dist / TORCH_RADIUS
          const factor = 1.0 + (TORCH_BRIGHTNESS - 1.0) * t
          const warmth = TORCH_WARMTH * t

          if (factor > maxFactor) {
            maxFactor = factor
            maxWarmth = warmth
          }
        }

        this.tileColors[r][c] = maxFactor > 1.0
          ? brightenColor(baseFloor, maxFactor, maxWarmth)
          : baseFloor
      }
    }

    // Recompute which cells are torch-lit
    this.computeTorchLitCells()
  }

  private updateInventoryText() {
    this.inventoryText.setText(`Bombs: ${inventory.bombs}  Gold: ${inventory.goldNuggets}`)
  }
}
