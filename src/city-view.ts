import Phaser from 'phaser'
import {
  CELL_SIZE,
  BORDER_WIDTH,
  GRID_PIXEL_WIDTH,
  GRID_PIXEL_HEIGHT,
  OFFSET_X,
  OFFSET_Y,
  COLORS,
  tweakColor,
  cellPosition,
} from './config'
import { CityTile } from './city-model'

const CITY_COLORS: Record<number, number> = {
  [CityTile.LOW_GRASS]: 0x2a7465,
  [CityTile.HIGH_GRASS]: 0x1f6154,
  [CityTile.SEA_SHORE]: 0x4699de,
  [CityTile.BUILDING_WALL]: 0x4b3324,
  [CityTile.BUILDING_FLOOR]: 0x2e4f4d,
}

const PLAYER_COLOR = 0xd7d9df
const PLAYER_SIZE = 6
const NPC_COLOR = 0xd6b26f
const NPC_SIZE = 4

const COUNTER_BASE_COLOR = CITY_COLORS[CityTile.BUILDING_WALL]

function computeTileColors(grid: Array<Array<CityTile>>): Array<Array<number>> {
  const colors: Array<Array<number>> = []

  for (let row = 0; row < grid.length; row++) {
    colors[row] = []
    for (let col = 0; col < grid[row].length; col++) {
      const tile = grid[row][col]
      colors[row][col] = tweakColor(CITY_COLORS[tile])
    }
  }

  return colors
}

export class CityView {
  private scene: Phaser.Scene
  private tileGraphics!: Phaser.GameObjects.Graphics
  private playerRect!: Phaser.GameObjects.Rectangle
  private npcRects: Array<Phaser.GameObjects.Rectangle> = []
  private counterRects: Array<Phaser.GameObjects.Rectangle> = []
  private tileColors: Array<Array<number>> = []

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  create(
    grid: Array<Array<CityTile>>,
    npcPositions: Array<{ row: number; col: number }>,
    counters: Array<{ row: number; leftCol: number; width: number }>,
  ): void {
    this.scene.cameras.main.setBackgroundColor(COLORS.BOARD.BACKGROUND)

    const frameGraphics = this.scene.add.graphics()

    frameGraphics.fillStyle(COLORS.BOARD.BORDER, 1)
    frameGraphics.fillRect(
      OFFSET_X - BORDER_WIDTH,
      OFFSET_Y - BORDER_WIDTH,
      GRID_PIXEL_WIDTH + BORDER_WIDTH * 2,
      GRID_PIXEL_HEIGHT + BORDER_WIDTH * 2,
    )

    frameGraphics.fillStyle(COLORS.BOARD.BACKGROUND, 1)
    frameGraphics.fillRect(OFFSET_X, OFFSET_Y, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT)

    this.tileColors = computeTileColors(grid)
    this.tileGraphics = this.scene.add.graphics()
    this.drawAllTiles(grid)

    this.playerRect = this.scene.add.rectangle(0, 0, PLAYER_SIZE, PLAYER_SIZE, PLAYER_COLOR)
    this.playerRect.setVisible(false)

    this.createNpcs(npcPositions)
    this.createCounters(counters)
  }

  movePlayer(row: number, col: number): void {
    const { x, y } = cellPosition(row, col)
    this.playerRect.setPosition(x + CELL_SIZE / 2, y + CELL_SIZE / 2)
    this.playerRect.setVisible(true)
    this.scene.children.bringToTop(this.playerRect)
  }

  private drawAllTiles(grid: Array<Array<CityTile>>): void {
    this.tileGraphics.clear()

    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < grid[row].length; col++) {
        const { x, y } = cellPosition(row, col)
        this.tileGraphics.fillStyle(this.tileColors[row][col], 1)
        this.tileGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
    }
  }

  private createNpcs(npcPositions: Array<{ row: number; col: number }>): void {
    this.npcRects = []

    for (const npc of npcPositions) {
      const { x, y } = cellPosition(npc.row, npc.col)
      const npcRect = this.scene.add.rectangle(
        x + CELL_SIZE / 2,
        y + CELL_SIZE / 2,
        NPC_SIZE,
        NPC_SIZE,
        tweakColor(NPC_COLOR),
      )
      this.npcRects.push(npcRect)
    }
  }

  private createCounters(counters: Array<{ row: number; leftCol: number; width: number }>): void {
    this.counterRects = []

    for (const counter of counters) {
      const { x, y } = cellPosition(counter.row, counter.leftCol)
      const widthPx = counter.width * CELL_SIZE
      const counterRect = this.scene.add.rectangle(
        x + widthPx / 2,
        y + CELL_SIZE / 2,
        widthPx,
        CELL_SIZE,
        tweakColor(COUNTER_BASE_COLOR),
      ).setOrigin(0.5, 0.5)

      this.counterRects.push(counterRect)
    }
  }
}
