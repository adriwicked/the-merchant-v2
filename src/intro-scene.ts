import Phaser from 'phaser'
import { Terrain, TERRAIN_COLORS } from './map'
import {
  CELL_SIZE,
  CELL_SEPARATION,
  BORDER_WIDTH,
  MAP_WIDTH,
  MAP_HEIGHT,
  GRID_PIXEL_WIDTH,
  GRID_PIXEL_HEIGHT,
  OFFSET_X,
  OFFSET_Y,
  COLORS,
  tweakColor,
  cellPosition,
} from './config'

const WATER_ANIMATION_INTERVAL = 1000

export class IntroScene extends Phaser.Scene {
  private waterGraphics!: Phaser.GameObjects.Graphics
  private waterBaseColors: Map<string, number> = new Map()

  constructor() {
    super('IntroScene')
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.BOARD.BACKGROUND)

    this.drawBoard()
    this.drawWaterOnlyMap()
    this.startWaterAnimation()
    this.drawIntroText()

    this.input.once('pointerdown', () => {
      this.scene.start('GameScene')
    })
  }

  private drawBoard(): void {
    const gfx = this.add.graphics()

    gfx.fillStyle(COLORS.BOARD.BORDER, 1)
    gfx.fillRect(
      OFFSET_X - BORDER_WIDTH,
      OFFSET_Y - BORDER_WIDTH,
      GRID_PIXEL_WIDTH + BORDER_WIDTH * 2,
      GRID_PIXEL_HEIGHT + BORDER_WIDTH * 2,
    )

    gfx.fillStyle(COLORS.BOARD.BACKGROUND, 1)
    gfx.fillRect(OFFSET_X, OFFSET_Y, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT)
  }

  private drawWaterOnlyMap(): void {
    this.waterGraphics = this.add.graphics()
    const deepWaterColor = TERRAIN_COLORS[Terrain.DEEP_WATER]

    this.waterBaseColors.clear()
    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const key = `${row},${col}`
        const baseColor = tweakColor(deepWaterColor)
        this.waterBaseColors.set(key, baseColor)

        const { x, y } = cellPosition(row, col)
        this.waterGraphics.fillStyle(baseColor, 1)
        this.waterGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
    }
  }

  private startWaterAnimation(): void {
    this.time.addEvent({
      delay: WATER_ANIMATION_INTERVAL,
      loop: true,
      callback: () => {
        this.waterGraphics.clear()
        for (const [key, baseColor] of this.waterBaseColors) {
          const [row, col] = key.split(',').map(Number)
          const { x, y } = cellPosition(row, col)
          this.waterGraphics.fillStyle(tweakColor(baseColor), 1)
          this.waterGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
        }
      },
    })
  }

  private drawIntroText(): void {
    this.add.text(CANVAS_CENTER_X, GRID_CENTER_Y - 18, 'THE MERCHANT', {
      fontFamily: 'Georgia',
      fontSize: '28px',
      color: '#dcd2b7',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    const startText = this.add.text(CANVAS_CENTER_X, GRID_CENTER_Y + 18, 'Haz click para empezar', {
      fontFamily: 'Georgia',
      fontSize: '20px',
      color: '#f0f0f0',
    }).setOrigin(0.5)

    this.tweens.add({
      targets: startText,
      alpha: 0.35,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }
}

const CANVAS_CENTER_X = OFFSET_X + GRID_PIXEL_WIDTH / 2
const GRID_CENTER_Y = OFFSET_Y + GRID_PIXEL_HEIGHT / 2
