import Phaser from 'phaser'
import {
  CELL_SIZE, CANVAS_WIDTH, BORDER_WIDTH,
  MAP_WIDTH, MAP_HEIGHT, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT,
  OFFSET_X, OFFSET_Y, COLORS, tweakColor, cellPosition,
} from './config'
import { MineTile } from './mine-model'

// ── Visual constants ─────────────────────────────────────────────────

const MINE_COLORS: Record<number, number> = {
  [MineTile.BLACK]: 0x16191d,
  [MineTile.WALL]: 0x494f50,
  [MineTile.FLOOR]: 0x31363f,
}

const PLAYER_COLOR = 0x3366cc
const PLAYER_SIZE = 6
const BOMB_COLOR = 0xcc4444
const GOLD_NUGGET_COLOR = 0xffd700
const GOLD_NUGGET_SIZE = 4

// ── Tile color computation ───────────────────────────────────────────

/** Compute tweaked base colors for every tile. */
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

  return colors
}

/**
 * Renders the mine interior. Owns all color computation and Phaser visuals.
 * The controller tells it what happened in the model; the view decides how to show it.
 */
export class MineView {
  private scene: Phaser.Scene
  private grid: Array<Array<MineTile>> = []
  private tileColors: Array<Array<number>> = []
  private tileGraphics!: Phaser.GameObjects.Graphics
  private playerRect!: Phaser.GameObjects.Rectangle
  private inventoryText!: Phaser.GameObjects.Text
  private nuggetRects: Map<string, Phaser.GameObjects.Rectangle> = new Map()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /** Initial setup: compute colors from grid, draw board frame, create layers. */
  create(grid: Array<Array<MineTile>>): void {
    this.grid = grid
    this.tileColors = computeTileColors(grid)

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

    // Graphics layer
    this.tileGraphics = this.scene.add.graphics()

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

  // ── Post-explosion visual update ───────────────────────────────────

  /**
   * After an explosion changed the grid, update colors for converted tiles
   * and new walls, then redraw everything.
   */
  onExplosion(
    _grid: Array<Array<MineTile>>,
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

    // Redraw
    this.drawAllTiles()
    this.shakeCamera()
    this.bringNuggetsToTop()
    this.bringPlayerToTop()
  }

  // ── Tile rendering ─────────────────────────────────────────────────

  private drawAllTiles(): void {
    this.tileGraphics.clear()

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const { x, y } = cellPosition(row, col)
        this.tileGraphics.fillStyle(this.tileColors[row][col], 1)
        this.tileGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
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
