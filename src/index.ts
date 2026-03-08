import Phaser from 'phaser'
import { generateNoiseGrid, applyRadialFalloff, classifyTerrain, Terrain, TERRAIN_COLORS, DEFAULT_PARAMS } from './map'
import { generateLocations, LocationType, GameLocation } from './locations'
import { MineScene } from './mine-scene'
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, CELL_SIZE, CELL_SEPARATION, BORDER_WIDTH,
  MAP_WIDTH, MAP_HEIGHT, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT,
  OFFSET_X, OFFSET_Y, COLORS, tweakColor, desaturate, cellPosition,
} from './config'

interface LocationVisual {
  loc: GameLocation
  borderGraphics: Phaser.GameObjects.Graphics
  innerRect: Phaser.GameObjects.Rectangle
  hitZone: Phaser.GameObjects.Zone
}

class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene')
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.BOARD.BACKGROUND)

    const staticGraphics = this.add.graphics()

    // Border rectangle behind the grid
    staticGraphics.fillStyle(COLORS.BOARD.BORDER, 1)
    staticGraphics.fillRect(
      OFFSET_X - BORDER_WIDTH,
      OFFSET_Y - BORDER_WIDTH,
      GRID_PIXEL_WIDTH + BORDER_WIDTH * 2,
      GRID_PIXEL_HEIGHT + BORDER_WIDTH * 2,
    )

    // Background behind cells (visible as cell separation)
    staticGraphics.fillStyle(COLORS.BOARD.BACKGROUND, 1)
    staticGraphics.fillRect(OFFSET_X, OFFSET_Y, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT)

    // Terrain layer (land only)
    const terrainGraphics = this.add.graphics()
    const rawNoiseGrid = generateNoiseGrid(MAP_WIDTH, MAP_HEIGHT, DEFAULT_PARAMS)
    const noiseGrid = applyRadialFalloff(rawNoiseGrid, DEFAULT_PARAMS.radialFalloff)
    const map = classifyTerrain(noiseGrid, DEFAULT_PARAMS)

    // Water cells: store base color for animation
    const waterBaseColors: { row: number; col: number; color: number }[] = []
    const waterGraphics = this.add.graphics()

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        const { x, y } = cellPosition(row, col)
        const terrain = map[row][col]
        const baseColor = tweakColor(TERRAIN_COLORS[terrain])

        if (terrain === Terrain.DEEP_WATER || terrain === Terrain.MEDIUM_WATER || terrain === Terrain.SEA_SHORE || terrain === Terrain.FOAM) {
          waterBaseColors.push({ row, col, color: baseColor })
          waterGraphics.fillStyle(baseColor, 1)
          waterGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
        } else {
          terrainGraphics.fillStyle(baseColor, 1)
          terrainGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
        }
      }
    }

    // Animate water: re-tweak from base color every second
    this.time.addEvent({
      delay: 2000,
      loop: true,
      callback: () => {
        waterGraphics.clear()
        for (const cell of waterBaseColors) {
          const { x, y } = cellPosition(cell.row, cell.col)
          waterGraphics.fillStyle(tweakColor(cell.color), 1)
          waterGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
        }
      },
    })

    // Locations layer
    const locations = generateLocations(map)
    const DESAT_AMOUNT = 0.45

    for (const loc of locations) {
      const { x, y } = cellPosition(loc.row, loc.col)
      const baseColor = loc.type === LocationType.CITY ? COLORS.LOCATIONS.CITY : COLORS.LOCATIONS.MINE
      const normalColor = desaturate(baseColor, DESAT_AMOUNT)
      const hoverColor = baseColor
      const innerSize = CELL_SIZE * 0.6
      const centerX = x + CELL_SIZE / 2
      const centerY = y + CELL_SIZE / 2
      const fullSize = CELL_SIZE + CELL_SEPARATION * 2

      // Border graphics for the separation strips
      const borderGfx = this.add.graphics()
      borderGfx.fillStyle(normalColor, 1)
      borderGfx.fillRect(x - CELL_SEPARATION, y - CELL_SEPARATION, fullSize, CELL_SEPARATION)
      borderGfx.fillRect(x - CELL_SEPARATION, y + CELL_SIZE, fullSize, CELL_SEPARATION)
      borderGfx.fillRect(x - CELL_SEPARATION, y, CELL_SEPARATION, CELL_SIZE)
      borderGfx.fillRect(x + CELL_SIZE, y, CELL_SEPARATION, CELL_SIZE)

      // Inner square
      const innerRect = this.add.rectangle(centerX, centerY, innerSize, innerSize, normalColor)

      // Invisible hit zone covering the full cell + border area
      const hitZone = this.add.zone(
        x - CELL_SEPARATION + fullSize / 2,
        y - CELL_SEPARATION + fullSize / 2,
        fullSize,
        fullSize,
      ).setInteractive({ useHandCursor: true })

      const visual: LocationVisual = { loc, borderGraphics: borderGfx, innerRect, hitZone }

      hitZone.on('pointerover', () => {
        this.setLocationHover(visual, hoverColor)
      })
      hitZone.on('pointerout', () => {
        this.setLocationNormal(visual, normalColor, innerSize)
      })

      if (loc.type === LocationType.MINE) {
        hitZone.on('pointerdown', () => {
          this.irisOut(loc)
        })
      }
    }
  }

  private irisOut(loc: GameLocation) {
    // Pre-compute distances from every cell to the mine (Euclidean in tile space)
    const distances: number[][] = []
    let maxDist = 0

    for (let row = 0; row < MAP_HEIGHT; row++) {
      distances[row] = []
      for (let col = 0; col < MAP_WIDTH; col++) {
        const d = Math.sqrt((row - loc.row) ** 2 + (col - loc.col) ** 2)
        distances[row][col] = d
        if (d > maxDist) maxDist = d
      }
    }

    const overlay = this.add.graphics()
    overlay.setDepth(1000)

    // Start at the distance to the farthest grid corner so cells disappear immediately
    const startThreshold = Math.max(
      Math.sqrt(loc.row ** 2 + loc.col ** 2),
      Math.sqrt(loc.row ** 2 + (MAP_WIDTH - 1 - loc.col) ** 2),
      Math.sqrt((MAP_HEIGHT - 1 - loc.row) ** 2 + loc.col ** 2),
      Math.sqrt((MAP_HEIGHT - 1 - loc.row) ** 2 + (MAP_WIDTH - 1 - loc.col) ** 2),
    )
    const progress = { threshold: startThreshold }

    const drawFrame = () => {
      overlay.clear()
      overlay.fillStyle(0x2a2a2a, 1)

      for (let row = 0; row < MAP_HEIGHT; row++) {
        for (let col = 0; col < MAP_WIDTH; col++) {
          if (distances[row][col] >= progress.threshold) {
            const { x, y } = cellPosition(row, col)
            overlay.fillRect(x, y, CELL_SIZE, CELL_SIZE)
          }
        }
      }
    }

    drawFrame()

    this.tweens.add({
      targets: progress,
      threshold: 0,
      duration: 1000,
      ease: 'Linear',
      onUpdate: drawFrame,
      onComplete: () => {
        this.scene.start('MineScene', { location: loc })
      },
    })
  }

  private setLocationHover(visual: LocationVisual, color: number) {
    const { loc, borderGraphics, innerRect } = visual
    const { x, y } = cellPosition(loc.row, loc.col)

    // Hide border strips
    borderGraphics.clear()

    // Expand inner rect to full cell size
    innerRect.setSize(CELL_SIZE, CELL_SIZE)
    innerRect.setPosition(x + CELL_SIZE / 2, y + CELL_SIZE / 2)
    innerRect.setFillStyle(color)
  }

  private setLocationNormal(visual: LocationVisual, color: number, innerSize: number) {
    const { loc, borderGraphics, innerRect } = visual
    const { x, y } = cellPosition(loc.row, loc.col)
    const fullSize = CELL_SIZE + CELL_SEPARATION * 2

    // Redraw border strips
    borderGraphics.clear()
    borderGraphics.fillStyle(color, 1)
    borderGraphics.fillRect(x - CELL_SEPARATION, y - CELL_SEPARATION, fullSize, CELL_SEPARATION)
    borderGraphics.fillRect(x - CELL_SEPARATION, y + CELL_SIZE, fullSize, CELL_SEPARATION)
    borderGraphics.fillRect(x - CELL_SEPARATION, y, CELL_SEPARATION, CELL_SIZE)
    borderGraphics.fillRect(x + CELL_SIZE, y, CELL_SEPARATION, CELL_SIZE)

    // Shrink inner rect back
    innerRect.setSize(innerSize, innerSize)
    innerRect.setPosition(x + CELL_SIZE / 2, y + CELL_SIZE / 2)
    innerRect.setFillStyle(color)
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  backgroundColor: COLORS.BOARD.BACKGROUND,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene, MineScene],
}

new Phaser.Game(config)
