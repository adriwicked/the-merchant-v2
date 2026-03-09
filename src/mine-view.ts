import Phaser from 'phaser'
import {
  CELL_SIZE, CANVAS_WIDTH, BORDER_WIDTH,
  MAP_WIDTH, MAP_HEIGHT, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT,
  OFFSET_X, OFFSET_Y, COLORS, tweakColor, brightenColor, cellPosition,
} from './config'
import { MineTile } from './mine-model'

// ── Visual constants ─────────────────────────────────────────────────

const MINE_COLORS: Record<number, number> = {
  [MineTile.BLACK]: 0x2a2a2a,
  [MineTile.WALL]: 0x382a1a,
  [MineTile.FLOOR]: 0x3d332a,
  [MineTile.TORCH]: 0xfff4e0,
}

const PLAYER_COLOR = 0x3366cc
const PLAYER_SIZE = 6
const BOMB_COLOR = 0xcc4444
const GOLD_NUGGET_COLOR = 0xffd700
const GOLD_NUGGET_SIZE = 4

// Torch lighting parameters
const TORCH_RADIUS = 6
const TORCH_BRIGHTNESS = 1.5
const TORCH_WARMTH = 0.6

// ── Torch lighting helpers ───────────────────────────────────────────

interface LitCell {
  row: number
  col: number
  baseColor: number
}

function findTorches(grid: Array<Array<MineTile>>): Array<{ r: number; c: number }> {
  const torches: Array<{ r: number; c: number }> = []
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] === MineTile.TORCH) torches.push({ r, c })
    }
  }
  return torches
}

function torchInfluence(
  r: number, c: number,
  torches: Array<{ r: number; c: number }>,
): { factor: number; warmth: number } {
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

  return { factor: maxFactor, warmth: maxWarmth }
}

// ── Tile color computation ───────────────────────────────────────────

/** Compute tweaked base colors for every tile, then apply torch lighting to floor tiles. */
function computeTileColors(grid: Array<Array<MineTile>>): Array<Array<number>> {
  const colors: Array<Array<number>> = []
  for (let row = 0; row < MAP_HEIGHT; row++) {
    colors[row] = []
    for (let col = 0; col < MAP_WIDTH; col++) {
      const tile = grid[row][col]
      colors[row][col] = tile === MineTile.BLACK
        ? MINE_COLORS[MineTile.BLACK]
        : tweakColor(MINE_COLORS[tile])
    }
  }

  const torches = findTorches(grid)
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] !== MineTile.FLOOR) continue
      const { factor, warmth } = torchInfluence(r, c, torches)
      if (factor > 1.0) {
        colors[r][c] = brightenColor(colors[r][c], factor, warmth)
      }
    }
  }

  return colors
}

/** Returns the list of FLOOR cells within range of at least one torch. */
function computeTorchLitCells(grid: Array<Array<MineTile>>, tileColors: Array<Array<number>>): Array<LitCell> {
  const torches = findTorches(grid)
  if (torches.length === 0) return []

  const litCells: Array<LitCell> = []
  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] !== MineTile.FLOOR) continue
      for (const torch of torches) {
        const dist = Math.sqrt((r - torch.r) ** 2 + (c - torch.c) ** 2)
        if (dist <= TORCH_RADIUS) {
          litCells.push({ row: r, col: c, baseColor: tileColors[r][c] })
          break
        }
      }
    }
  }
  return litCells
}

/** Recalculate torch lighting on all FLOOR tiles. Mutates tileColors in place. */
function recalcTorchLighting(grid: Array<Array<MineTile>>, tileColors: Array<Array<number>>): void {
  const torches = findTorches(grid)

  for (let r = 0; r < MAP_HEIGHT; r++) {
    for (let c = 0; c < MAP_WIDTH; c++) {
      if (grid[r][c] !== MineTile.FLOOR) continue

      const baseFloor = tweakColor(MINE_COLORS[MineTile.FLOOR])
      const { factor, warmth } = torchInfluence(r, c, torches)

      tileColors[r][c] = factor > 1.0
        ? brightenColor(baseFloor, factor, warmth)
        : baseFloor
    }
  }
}

/**
 * Renders the mine interior. Owns all color/lighting computation and Phaser visuals.
 * The controller tells it what happened in the model; the view decides how to show it.
 */
export class MineView {
  private scene: Phaser.Scene
  private tileColors: Array<Array<number>> = []
  private litCells: Array<LitCell> = []
  private tileGraphics!: Phaser.GameObjects.Graphics
  private torchGraphics!: Phaser.GameObjects.Graphics
  private playerRect!: Phaser.GameObjects.Rectangle
  private inventoryText!: Phaser.GameObjects.Text
  private nuggetRects: Map<string, Phaser.GameObjects.Rectangle> = new Map()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /** Initial setup: compute colors from grid, draw board frame, create layers. */
  create(grid: Array<Array<MineTile>>): void {
    // Compute tile colors (with torch lighting) from the grid
    this.tileColors = computeTileColors(grid)
    this.litCells = computeTorchLitCells(grid, this.tileColors)

    this.scene.cameras.main.setBackgroundColor(COLORS.BOARD.BACKGROUND)

    const gfx = this.scene.add.graphics()

    // Border
    gfx.fillStyle(COLORS.BOARD.BORDER, 1)
    gfx.fillRect(
      OFFSET_X - BORDER_WIDTH,
      OFFSET_Y - BORDER_WIDTH,
      GRID_PIXEL_WIDTH + BORDER_WIDTH * 2,
      GRID_PIXEL_HEIGHT + BORDER_WIDTH * 2,
    )

    // Background behind cells
    gfx.fillStyle(COLORS.BOARD.BACKGROUND, 1)
    gfx.fillRect(OFFSET_X, OFFSET_Y, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT)

    // Graphics layers
    this.tileGraphics = this.scene.add.graphics()
    this.torchGraphics = this.scene.add.graphics()

    // Draw all tiles
    this.drawAllTiles()

    // Player rectangle (positioned later by movePlayer)
    this.playerRect = this.scene.add.rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, PLAYER_COLOR)
    this.playerRect.setVisible(false)

    // Inventory text below the grid
    const textY = OFFSET_Y + GRID_PIXEL_HEIGHT + BORDER_WIDTH + 8
    this.inventoryText = this.scene.add.text(CANVAS_WIDTH / 2, textY, '', {
      fontSize: '14px',
      color: '#cccccc',
      fontFamily: 'Arial',
    }).setOrigin(0.5, 0)
  }

  /** Start the torch flicker animation timer. */
  startTorchFlicker(): void {
    this.scene.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => this.drawTorchLitCells(),
    })
  }

  // ── Post-explosion visual update ───────────────────────────────────

  /**
   * After an explosion changed the grid, update colors for converted tiles
   * and new walls, recalculate torch lighting, and redraw everything.
   */
  onExplosion(
    grid: Array<Array<MineTile>>,
    converted: Array<{ r: number; c: number }>,
    newWalls: Array<{ r: number; c: number }>,
  ): void {
    // Update colors for tiles that changed
    for (const { r, c } of converted) {
      this.tileColors[r][c] = tweakColor(MINE_COLORS[MineTile.FLOOR])
    }
    for (const { r, c } of newWalls) {
      this.tileColors[r][c] = tweakColor(MINE_COLORS[MineTile.WALL])
    }

    // Recalculate torch lighting (torches may have been destroyed)
    recalcTorchLighting(grid, this.tileColors)
    this.litCells = computeTorchLitCells(grid, this.tileColors)

    // Redraw
    this.drawAllTiles()
    this.shakeCamera()
    this.bringNuggetsToTop()
    this.bringPlayerToTop()
  }

  // ── Tile rendering ─────────────────────────────────────────────────

  private drawAllTiles(): void {
    this.tileGraphics.clear()
    const litSet = new Set(this.litCells.map((c) => `${c.row},${c.col}`))

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (litSet.has(`${row},${col}`)) continue
        const { x, y } = cellPosition(row, col)
        this.tileGraphics.fillStyle(this.tileColors[row][col], 1)
        this.tileGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
    }

    this.drawTorchLitCells()
  }

  private drawTorchLitCells(): void {
    this.torchGraphics.clear()
    for (const { row, col, baseColor } of this.litCells) {
      const { x, y } = cellPosition(row, col)
      this.torchGraphics.fillStyle(tweakColor(baseColor), 1)
      this.torchGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    }
  }

  // ── Player ─────────────────────────────────────────────────────────

  movePlayer(row: number, col: number): void {
    const { x, y } = cellPosition(row, col)
    this.playerRect.setPosition(x + CELL_SIZE / 2, y + CELL_SIZE / 2)
    this.playerRect.setVisible(true)
  }

  bringPlayerToTop(): void {
    this.scene.children.bringToTop(this.playerRect)
  }

  // ── Bomb ───────────────────────────────────────────────────────────

  showBomb(row: number, col: number): () => void {
    const { x, y } = cellPosition(row, col)
    const bombMarker = this.scene.add.rectangle(
      x + CELL_SIZE / 2,
      y + CELL_SIZE / 2,
      CELL_SIZE,
      CELL_SIZE,
      BOMB_COLOR,
    )

    this.scene.tweens.add({
      targets: bombMarker,
      alpha: 0.3,
      duration: 300,
      yoyo: true,
      repeat: -1,
    })

    return () => bombMarker.destroy()
  }

  private shakeCamera(): void {
    this.scene.cameras.main.shake(150, 0.005)
  }

  // ── Nuggets ────────────────────────────────────────────────────────

  createNugget(row: number, col: number): void {
    const key = `${row},${col}`
    if (this.nuggetRects.has(key)) return

    const { x, y } = cellPosition(row, col)
    const nugget = this.scene.add.rectangle(
      x + CELL_SIZE / 2,
      y + CELL_SIZE / 2,
      GOLD_NUGGET_SIZE,
      GOLD_NUGGET_SIZE,
      GOLD_NUGGET_COLOR,
    )
    this.nuggetRects.set(key, nugget)
  }

  destroyNugget(row: number, col: number): boolean {
    const key = `${row},${col}`
    const rect = this.nuggetRects.get(key)
    if (!rect) return false
    rect.destroy()
    this.nuggetRects.delete(key)
    return true
  }

  private bringNuggetsToTop(): void {
    for (const rect of this.nuggetRects.values()) {
      this.scene.children.bringToTop(rect)
    }
  }

  // ── Inventory text ─────────────────────────────────────────────────

  updateInventoryText(bombs: number, goldNuggets: number): void {
    this.inventoryText.setText(`Bombs: ${bombs}  Gold: ${goldNuggets}`)
  }
}
