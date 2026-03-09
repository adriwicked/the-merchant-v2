import Phaser from 'phaser'
import { TERRAIN_COLORS } from './map'
import { LocationType, GameLocation } from './locations'
import { WorldModel } from './world-model'
import {
  CELL_SIZE, CELL_SEPARATION, BORDER_WIDTH,
  MAP_WIDTH, MAP_HEIGHT, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT,
  OFFSET_X, OFFSET_Y, COLORS, tweakColor, cellPosition,
} from './config'

const WATER_ANIMATION_INTERVAL = 2000
const INNER_LOCATION_SIZE = CELL_SIZE * 0.6

interface LocationVisual {
  loc: GameLocation
  baseColor: number
  borderGraphics: Phaser.GameObjects.Graphics
  innerRect: Phaser.GameObjects.Rectangle
  hitZone: Phaser.GameObjects.Zone
}

/**
 * Renders the world map from a WorldModel. Manages terrain tiles, water animation,
 * and location visuals (cities/mines). No game logic — pure presentation.
 */
export class WorldView {
  private scene: Phaser.Scene
  private model: WorldModel
  private waterGraphics!: Phaser.GameObjects.Graphics
  private waterBaseColors: Map<string, number> = new Map()
  private locationVisuals: Array<LocationVisual> = []

  constructor(scene: Phaser.Scene, model: WorldModel) {
    this.scene = scene
    this.model = model
  }

  /** Draw the full world: border, terrain, water, locations. */
  create(): void {
    this.drawBoard()
    this.drawTerrain()
    this.drawWater()
    this.startWaterAnimation()
    this.drawLocations()
  }

  /** Returns the location visuals so the controller can wire up input. */
  getLocationVisuals(): Array<LocationVisual> {
    return this.locationVisuals
  }

  /** Set a location to its hover state: full cell filled. */
  setLocationHover(visual: LocationVisual): void {
    const { loc, baseColor, borderGraphics, innerRect } = visual
    const { x, y } = cellPosition(loc.row, loc.col)

    borderGraphics.clear()
    innerRect.setSize(CELL_SIZE, CELL_SIZE)
    innerRect.setPosition(x + CELL_SIZE / 2, y + CELL_SIZE / 2)
    innerRect.setFillStyle(baseColor)
  }

  /** Set a location to its normal state: border + small inner square. */
  setLocationNormal(visual: LocationVisual): void {
    const { loc, baseColor, borderGraphics, innerRect } = visual
    const { x, y } = cellPosition(loc.row, loc.col)
    const fullSize = CELL_SIZE + CELL_SEPARATION * 2

    borderGraphics.clear()
    borderGraphics.fillStyle(baseColor, 1)
    borderGraphics.fillRect(x - CELL_SEPARATION, y - CELL_SEPARATION, fullSize, CELL_SEPARATION)
    borderGraphics.fillRect(x - CELL_SEPARATION, y + CELL_SIZE, fullSize, CELL_SEPARATION)
    borderGraphics.fillRect(x - CELL_SEPARATION, y, CELL_SEPARATION, CELL_SIZE)
    borderGraphics.fillRect(x + CELL_SIZE, y, CELL_SEPARATION, CELL_SIZE)

    innerRect.setSize(INNER_LOCATION_SIZE, INNER_LOCATION_SIZE)
    innerRect.setPosition(x + CELL_SIZE / 2, y + CELL_SIZE / 2)
    innerRect.setFillStyle(baseColor)
  }

  /** Hide all location visuals (used before iris-out transition). */
  hideLocations(): void {
    for (const v of this.locationVisuals) {
      v.borderGraphics.setVisible(false)
      v.innerRect.setVisible(false)
      v.hitZone.disableInteractive()
    }
  }

  // ── Private rendering methods ──────────────────────────────────────

  private drawBoard(): void {
    const gfx = this.scene.add.graphics()

    // Border rectangle behind the grid
    gfx.fillStyle(COLORS.BOARD.BORDER, 1)
    gfx.fillRect(
      OFFSET_X - BORDER_WIDTH,
      OFFSET_Y - BORDER_WIDTH,
      GRID_PIXEL_WIDTH + BORDER_WIDTH * 2,
      GRID_PIXEL_HEIGHT + BORDER_WIDTH * 2,
    )

    // Background behind cells (visible as cell separation)
    gfx.fillStyle(COLORS.BOARD.BACKGROUND, 1)
    gfx.fillRect(OFFSET_X, OFFSET_Y, GRID_PIXEL_WIDTH, GRID_PIXEL_HEIGHT)
  }

  private drawTerrain(): void {
    const gfx = this.scene.add.graphics()
    const { terrain, waterCells } = this.model

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (waterCells.has(`${row},${col}`)) continue

        const { x, y } = cellPosition(row, col)
        const color = tweakColor(TERRAIN_COLORS[terrain[row][col]])
        gfx.fillStyle(color, 1)
        gfx.fillRect(x, y, CELL_SIZE, CELL_SIZE)
      }
    }
  }

  private drawWater(): void {
    this.waterGraphics = this.scene.add.graphics()
    const { terrain, waterCells } = this.model

    // Compute and cache base colors for each water cell
    this.waterBaseColors.clear()
    for (const key of waterCells) {
      const [row, col] = key.split(',').map(Number)
      const baseColor = tweakColor(TERRAIN_COLORS[terrain[row][col]])
      this.waterBaseColors.set(key, baseColor)

      const { x, y } = cellPosition(row, col)
      this.waterGraphics.fillStyle(baseColor, 1)
      this.waterGraphics.fillRect(x, y, CELL_SIZE, CELL_SIZE)
    }
  }

  private startWaterAnimation(): void {
    this.scene.time.addEvent({
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

  private drawLocations(): void {
    this.locationVisuals = []

    for (const loc of this.model.locations) {
      const { x, y } = cellPosition(loc.row, loc.col)
      const baseColor = loc.type === LocationType.CITY ? COLORS.LOCATIONS.CITY : COLORS.LOCATIONS.MINE
      const centerX = x + CELL_SIZE / 2
      const centerY = y + CELL_SIZE / 2
      const fullSize = CELL_SIZE + CELL_SEPARATION * 2

      // Border graphics for the separation strips
      const borderGfx = this.scene.add.graphics()
      borderGfx.fillStyle(baseColor, 1)
      borderGfx.fillRect(x - CELL_SEPARATION, y - CELL_SEPARATION, fullSize, CELL_SEPARATION)
      borderGfx.fillRect(x - CELL_SEPARATION, y + CELL_SIZE, fullSize, CELL_SEPARATION)
      borderGfx.fillRect(x - CELL_SEPARATION, y, CELL_SEPARATION, CELL_SIZE)
      borderGfx.fillRect(x + CELL_SIZE, y, CELL_SEPARATION, CELL_SIZE)

      // Inner square
      const innerRect = this.scene.add.rectangle(centerX, centerY, INNER_LOCATION_SIZE, INNER_LOCATION_SIZE, baseColor)

      // Invisible hit zone covering the full cell + border area
      const hitZone = this.scene.add.zone(
        x - CELL_SEPARATION + fullSize / 2,
        y - CELL_SEPARATION + fullSize / 2,
        fullSize,
        fullSize,
      ).setInteractive({ useHandCursor: true })

      this.locationVisuals.push({ loc, baseColor, borderGraphics: borderGfx, innerRect, hitZone })
    }
  }
}
