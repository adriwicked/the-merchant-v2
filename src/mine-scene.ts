import Phaser from 'phaser'
import { GameLocation } from './locations'
import { getMineState, MineState } from './game-state'
import {
  CANVAS_WIDTH, CELL_SIZE, CELL_SEPARATION, BORDER_WIDTH,
  MAP_WIDTH, MAP_HEIGHT, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT,
  OFFSET_X, OFFSET_Y, COLORS, tweakColor, cellPosition,
} from './config'
import { inventory } from './inventory'

export enum MineTile {
  BLACK,
  WALL,
  FLOOR,
}

const MINE_COLORS = {
  [MineTile.BLACK]: 0x2a2a2a,
  [MineTile.WALL]: 0x6b4c2a,
  [MineTile.FLOOR]: 0x8c7050,
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

function generateMineLayout(): MineTile[][] {
  const grid: MineTile[][] = []

  for (let row = 0; row < MAP_HEIGHT; row++) {
    grid[row] = []
    for (let col = 0; col < MAP_WIDTH; col++) {
      grid[row][col] = MineTile.BLACK
    }
  }

  // Create a rectangular room in the center
  const roomW = 9 + Math.floor(Math.random() * 6) // 9-14
  const roomH = 7 + Math.floor(Math.random() * 4) // 7-10
  const roomX = Math.floor((MAP_WIDTH - roomW) / 2)
  const roomY = Math.floor((MAP_HEIGHT - roomH) / 2)

  // Walls (outer ring of the room)
  for (let row = roomY; row < roomY + roomH; row++) {
    for (let col = roomX; col < roomX + roomW; col++) {
      grid[row][col] = MineTile.WALL
    }
  }

  // Floor (inner area)
  for (let row = roomY + 1; row < roomY + roomH - 1; row++) {
    for (let col = roomX + 1; col < roomX + roomW - 1; col++) {
      grid[row][col] = MineTile.FLOOR
    }
  }

  // Add a couple of gallery corridors branching from the room
  const corridors = 2 + Math.floor(Math.random() * 2) // 2-3 corridors
  for (let c = 0; c < corridors; c++) {
    const horizontal = Math.random() > 0.5
    if (horizontal) {
      const corridorRow = roomY + 1 + Math.floor(Math.random() * (roomH - 2))
      const goRight = Math.random() > 0.5
      const length = 4 + Math.floor(Math.random() * 6)

      if (goRight) {
        const startCol = roomX + roomW
        for (let col = startCol; col < Math.min(startCol + length, MAP_WIDTH - 1); col++) {
          grid[corridorRow - 1][col] = MineTile.WALL
          grid[corridorRow][col] = MineTile.FLOOR
          grid[corridorRow + 1][col] = MineTile.WALL
        }
      } else {
        const startCol = roomX - 1
        for (let col = startCol; col > Math.max(startCol - length, 0); col--) {
          grid[corridorRow - 1][col] = MineTile.WALL
          grid[corridorRow][col] = MineTile.FLOOR
          grid[corridorRow + 1][col] = MineTile.WALL
        }
      }
    } else {
      const corridorCol = roomX + 1 + Math.floor(Math.random() * (roomW - 2))
      const goDown = Math.random() > 0.5
      const length = 4 + Math.floor(Math.random() * 6)

      if (goDown) {
        const startRow = roomY + roomH
        for (let row = startRow; row < Math.min(startRow + length, MAP_HEIGHT - 1); row++) {
          grid[row][corridorCol - 1] = MineTile.WALL
          grid[row][corridorCol] = MineTile.FLOOR
          grid[row][corridorCol + 1] = MineTile.WALL
        }
      } else {
        const startRow = roomY - 1
        for (let row = startRow; row > Math.max(startRow - length, 0); row--) {
          grid[row][corridorCol - 1] = MineTile.WALL
          grid[row][corridorCol] = MineTile.FLOOR
          grid[row][corridorCol + 1] = MineTile.WALL
        }
      }
    }
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
  private inventoryText!: Phaser.GameObjects.Text
  private nuggets: Map<string, Phaser.GameObjects.Rectangle> = new Map()

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
    this.drawAllTiles()

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
        if (this.mineGrid[r][c] !== MineTile.BLACK && this.mineGrid[r][c] !== MineTile.WALL) continue

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

    this.drawAllTiles()
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

  /** Pre-compute a tweaked color for every tile in the grid. */
  private computeTileColors(grid: MineTile[][]): number[][] {
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
    return colors
  }

  private drawAllTiles() {
    this.tileGraphics.clear()
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const { x, y } = cellPosition(row, col)
        this.tileGraphics.fillStyle(this.tileColors[row][col], 1)
        this.tileGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
    }
  }

  private updateInventoryText() {
    this.inventoryText.setText(`Bombs: ${inventory.bombs}  Gold: ${inventory.goldNuggets}`)
  }
}
