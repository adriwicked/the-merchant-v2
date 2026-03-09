import Phaser from 'phaser'
import { LocationType, GameLocation } from './locations'
import { MineScene } from './mine-scene'
import { getWorldModel } from './world-model'
import { WorldView } from './world-view'
import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS } from './config'
import { irisIn, irisOut } from './transitions'

class GameScene extends Phaser.Scene {
  private worldView!: WorldView
  private fromMine: GameLocation | null = null

  constructor() {
    super('GameScene')
  }

  init(data?: { fromMine?: GameLocation }) {
    this.fromMine = data?.fromMine ?? null
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.BOARD.BACKGROUND)

    const worldModel = getWorldModel()
    this.worldView = new WorldView(this, worldModel)
    this.worldView.create()

    // Wire up input on location visuals
    for (const visual of this.worldView.getLocationVisuals()) {
      visual.hitZone.on('pointerover', () => {
        this.worldView.setLocationHover(visual)
      })
      visual.hitZone.on('pointerout', () => {
        this.worldView.setLocationNormal(visual)
      })

      if (visual.loc.type === LocationType.MINE) {
        visual.hitZone.on('pointerdown', () => {
          this.enterMine(visual.loc)
        })
      }
    }

    // Iris-in transition when returning from a mine
    if (this.fromMine) {
      irisIn(this, { originRow: this.fromMine.row, originCol: this.fromMine.col })
    }
  }

  private enterMine(loc: GameLocation) {
    this.worldView.hideLocations()

    irisOut(this, {
      originRow: loc.row,
      originCol: loc.col,
      onComplete: () => {
        this.scene.start('MineScene', { location: loc })
      },
    })
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
