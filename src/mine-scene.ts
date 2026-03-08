import Phaser from 'phaser'
import { GameLocation } from './locations'
import {
  CELL_SIZE, CELL_SEPARATION, BORDER_WIDTH,
  MAP_WIDTH, MAP_HEIGHT, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT,
  OFFSET_X, OFFSET_Y, COLORS, tweakColor, cellPosition,
} from './config'

enum MineTile {
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
  private playerRow = 0
  private playerCol = 0
  private playerRect!: Phaser.GameObjects.Rectangle
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private lastMoveTime = 0

  constructor() {
    super('MineScene')
  }

  init(_data: { location: GameLocation }) {
    // Could use location data to seed the mine layout in the future
  }

  create() {
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

    // Generate mine layout
    this.mineGrid = generateMineLayout()

    // Draw mine tiles
    const tileGraphics = this.add.graphics()
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const { x, y } = cellPosition(row, col)
        const tile = this.mineGrid[row][col]
        const color = tile === MineTile.BLACK
          ? MINE_COLORS[MineTile.BLACK]
          : tweakColor(MINE_COLORS[tile])
        tileGraphics.fillStyle(color, 1)
        tileGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
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

    // Keyboard input
    this.cursors = this.input.keyboard!.createCursorKeys()

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
    }
  }
}
