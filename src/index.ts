import Phaser from 'phaser'
import { LocationType, GameLocation } from './locations'
import { MineScene } from './mine-scene'
import { getWorldModel } from './world-model'
import { WorldView } from './world-view'
import { CANVAS_WIDTH, CANVAS_HEIGHT, COLORS } from './config'
import { irisOut } from './transitions'

class GameScene extends Phaser.Scene {
  private view!: WorldView

  constructor() {
    super('GameScene')
  }

  create() {
    this.cameras.main.setBackgroundColor(COLORS.BOARD.BACKGROUND)

    const model = getWorldModel()
    this.view = new WorldView(this, model)
    this.view.create()

    // Wire up input on location visuals
    for (const visual of this.view.getLocationVisuals()) {
      visual.hitZone.on('pointerover', () => {
        this.view.setLocationHover(visual)
      })
      visual.hitZone.on('pointerout', () => {
        this.view.setLocationNormal(visual)
      })

      if (visual.loc.type === LocationType.MINE) {
        visual.hitZone.on('pointerdown', () => {
          this.enterMine(visual.loc)
        })
      }
    }
  }

  private enterMine(loc: GameLocation) {
    this.view.hideLocations()

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
