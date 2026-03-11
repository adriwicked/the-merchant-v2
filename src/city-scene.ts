import Phaser from 'phaser'
import { GameLocation } from './locations'
import { MAP_HEIGHT, MAP_WIDTH } from './config'
import { irisIn, irisOut } from './transitions'
import { getCityState, canMoveToCity } from './city-model'
import { CityView } from './city-view'

const MOVE_COOLDOWN = 150

export class CityScene extends Phaser.Scene {
  private view!: CityView
  private playerRow = 0
  private playerCol = 0
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private lastMoveTime = 0
  private fromCityLocation!: GameLocation

  constructor() {
    super('CityScene')
  }

  init(data: { location: GameLocation }) {
    this.fromCityLocation = data.location
  }

  create(): void {
    const cityState = getCityState()

    this.view = new CityView(this)
    this.view.create(cityState.grid, cityState.npcPositions, cityState.counters)

    this.playerRow = cityState.startRow
    this.playerCol = cityState.startCol
    this.view.movePlayer(this.playerRow, this.playerCol)

    this.cursors = this.input.keyboard!.createCursorKeys()
    this.input.keyboard!.on('keydown-ESC', () => this.exitCity())

    const centerRow = Math.floor(MAP_HEIGHT / 2)
    const centerCol = Math.floor(MAP_WIDTH / 2)
    irisIn(this, { originRow: centerRow, originCol: centerCol })
  }

  update(): void {
    const now = Date.now()
    if (now - this.lastMoveTime < MOVE_COOLDOWN) return

    let dr = 0
    let dc = 0

    if (this.cursors.up.isDown) dr = -1
    else if (this.cursors.down.isDown) dr = 1
    else if (this.cursors.left.isDown) dc = -1
    else if (this.cursors.right.isDown) dc = 1

    if (dr === 0 && dc === 0) return

    const cityState = getCityState()
    const nextRow = this.playerRow + dr
    const nextCol = this.playerCol + dc

    if (canMoveToCity(cityState.grid, nextRow, nextCol)) {
      this.playerRow = nextRow
      this.playerCol = nextCol
      this.view.movePlayer(nextRow, nextCol)
      this.lastMoveTime = now
    }
  }

  private exitCity(): void {
    const centerRow = Math.floor(MAP_HEIGHT / 2)
    const centerCol = Math.floor(MAP_WIDTH / 2)

    irisOut(this, {
      originRow: centerRow,
      originCol: centerCol,
      onComplete: () => this.scene.start('GameScene', { fromCity: this.fromCityLocation }),
    })
  }
}
