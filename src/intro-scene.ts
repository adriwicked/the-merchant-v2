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
import { generateWorldNoise, classifyWithOffset, finalizeWorldModel } from './world-model'

const WATER_ANIMATION_INTERVAL = 1000
const EMERGENCE_OFFSET_START = -2
const EMERGENCE_OFFSET_END = 0
const EMERGENCE_DURATION = 3000
const EMERGENCE_REDRAW_INTERVAL = 80
const TEXT_FADE_DURATION = 600

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
      this.startEmergence()
    })
  }

  // ── Intro visuals (water-only map + text) ──────────────────────────

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
    const title = this.add.text(CANVAS_CENTER_X, GRID_CENTER_Y - 18, 'THE MERCHANT', {
      fontFamily: 'Georgia',
      fontSize: '28px',
      color: '#dcd2b7',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    title.setName('title')

    const startText = this.add.text(CANVAS_CENTER_X, GRID_CENTER_Y + 18, 'Haz click para empezar', {
      fontFamily: 'Georgia',
      fontSize: '20px',
      color: '#f0f0f0',
    }).setOrigin(0.5)
    startText.setName('startText')

    this.tweens.add({
      targets: startText,
      alpha: 0.35,
      duration: 850,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  // ── Island emergence animation ─────────────────────────────────────

  private startEmergence(): void {
    // Disable further clicks
    this.input.removeAllListeners()

    // Find text objects and fade them out
    const title = this.children.getByName('title') as Phaser.GameObjects.Text
    const startText = this.children.getByName('startText') as Phaser.GameObjects.Text

    // Stop the blinking tween on startText
    this.tweens.killTweensOf(startText)

    this.tweens.add({
      targets: [title, startText],
      alpha: 0,
      duration: TEXT_FADE_DURATION,
      ease: 'Sine.easeOut',
      onComplete: () => {
        title.destroy()
        startText.destroy()
        this.runEmergenceAnimation()
      },
    })
  }

  private runEmergenceAnimation(): void {
    // Generate the noise grid (height map) — this is the real world data
    const noiseValues = generateWorldNoise()

    // Graphics layer for emerging terrain (drawn on top of water)
    const terrainGraphics = this.add.graphics()

    // Track current offset via a tweened object
    const progress = { offset: EMERGENCE_OFFSET_START }

    // Cache tweaked colors per cell so terrain doesn't shimmer during emergence
    // Stores { color, terrainType } so we recompute when terrain type changes
    const terrainColorCache: Map<string, { color: number; terrainType: Terrain }> = new Map()

    // Redraw terrain periodically during the tween (not every frame — too expensive)
    const redrawEvent = this.time.addEvent({
      delay: EMERGENCE_REDRAW_INTERVAL,
      loop: true,
      callback: () => {
        this.redrawEmergingTerrain(noiseValues, progress.offset, terrainGraphics, terrainColorCache)
      },
    })

    this.tweens.add({
      targets: progress,
      offset: EMERGENCE_OFFSET_END,
      duration: EMERGENCE_DURATION,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        redrawEvent.destroy()

        // Finalize the world model (terrain + locations) with the real noise values
        finalizeWorldModel(noiseValues)

        // Switch to the game scene
        this.scene.start('GameScene', { fromIntro: true })
      },
    })
  }

  private redrawEmergingTerrain(
    noiseValues: Array<Array<number>>,
    offset: number,
    gfx: Phaser.GameObjects.Graphics,
    colorCache: Map<string, { color: number; terrainType: Terrain }>,
  ): void {
    const { terrain, waterCells } = classifyWithOffset(noiseValues, offset)

    gfx.clear()

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (waterCells.has(`${row},${col}`)) continue

        const { x, y } = cellPosition(row, col)
        const terrainType = terrain[row][col]
        const key = `${row},${col}`

        // Get or compute a stable color for this cell, recomputing if terrain type changed
        const cached = colorCache.get(key)
        let color: number
        if (cached !== undefined && cached.terrainType === terrainType) {
          color = cached.color
        } else {
          color = tweakColor(TERRAIN_COLORS[terrainType])
          colorCache.set(key, { color, terrainType })
        }

        gfx.fillStyle(color, 1)
        gfx.fillRect(x, y, CELL_SIZE, CELL_SIZE)

        // Update water base colors: remove this cell from water animation
        // since it's now land
        if (this.waterBaseColors.has(key)) {
          this.waterBaseColors.delete(key)
        }
      }
    }
  }
}

const CANVAS_CENTER_X = OFFSET_X + GRID_PIXEL_WIDTH / 2
const GRID_CENTER_Y = OFFSET_Y + GRID_PIXEL_HEIGHT / 2
