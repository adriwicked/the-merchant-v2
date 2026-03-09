import Phaser from 'phaser'
import { GameLocation } from './locations'
import { MAP_HEIGHT, MAP_WIDTH } from './config'
import { inventory } from './inventory'
import { irisIn, irisOut } from './transitions'
import {
  getMineState, generateMineLayout, findPlayerStart,
  explode, canMoveTo, MineState,
} from './mine-model'
import { MineView } from './mine-view'

const MOVE_COOLDOWN = 150
const BOMB_FUSE_MS = 2000

/**
 * Thin controller for the mine scene.
 * Owns no visual objects — delegates rendering to MineView.
 * Owns no data transforms — delegates to mine-model functions.
 */
export class MineScene extends Phaser.Scene {
  private view!: MineView
  private mineState!: MineState
  private playerRow = 0
  private playerCol = 0
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private lastMoveTime = 0
  private currentLocation!: GameLocation

  constructor() {
    super('MineScene')
  }

  init(data: { location: GameLocation }) {
    this.currentLocation = data.location
  }

  create() {
    // ── Model: get or generate persistent mine data ──────────────────
    this.mineState = getMineState(this.currentLocation)

    if (this.mineState.grid.length === 0) {
      this.mineState.grid = generateMineLayout()
    }

    // ── View: create visuals from grid data ──────────────────────────
    this.view = new MineView(this)
    this.view.create(this.mineState.grid)
    this.view.updateInventoryText(inventory.bombs, inventory.goldNuggets)

    // Recreate nugget visuals from persistent state
    for (const key of this.mineState.nuggetPositions) {
      const [r, c] = key.split(',').map(Number)
      this.view.createNugget(r, c)
    }

    // Player start position
    const start = findPlayerStart(this.mineState.grid)
    this.playerRow = start.row
    this.playerCol = start.col
    this.view.movePlayer(this.playerRow, this.playerCol)

    // Torch flicker animation
    this.view.startTorchFlicker()

    // ── Input ────────────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys()

    this.input.keyboard!.on('keydown-SPACE', () => this.plantBomb())
    this.input.keyboard!.on('keydown-ESC', () => this.exitMine())

    // Iris-in transition
    const centerRow = Math.floor(MAP_HEIGHT / 2)
    const centerCol = Math.floor(MAP_WIDTH / 2)
    irisIn(this, { originRow: centerRow, originCol: centerCol })
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

    if (canMoveTo(this.mineState.grid, newRow, newCol)) {
      this.playerRow = newRow
      this.playerCol = newCol
      this.view.movePlayer(newRow, newCol)
      this.lastMoveTime = now

      this.tryPickupNugget(newRow, newCol)
    }
  }

  // ── Actions ────────────────────────────────────────────────────────

  private plantBomb() {
    if (inventory.bombs <= 0) return

    inventory.bombs--
    this.view.updateInventoryText(inventory.bombs, inventory.goldNuggets)

    const bombRow = this.playerRow
    const bombCol = this.playerCol
    const destroyBomb = this.view.showBomb(bombRow, bombCol)

    this.time.delayedCall(BOMB_FUSE_MS, () => {
      destroyBomb()

      // Model: compute explosion (mutates grid, returns what changed)
      const result = explode(this.mineState.grid, bombRow, bombCol)

      // Model: register new nuggets in persistent state
      for (const { r, c } of result.newNuggets) {
        const key = `${r},${c}`
        if (!this.mineState.nuggetPositions.has(key)) {
          this.mineState.nuggetPositions.add(key)
          this.view.createNugget(r, c)
        }
      }

      // View: redraw everything after explosion
      this.view.onExplosion(this.mineState.grid, result.converted, result.newWalls)
    })
  }

  private tryPickupNugget(row: number, col: number) {
    const key = `${row},${col}`
    if (!this.mineState.nuggetPositions.has(key)) return

    this.mineState.nuggetPositions.delete(key)
    this.view.destroyNugget(row, col)

    inventory.goldNuggets++
    this.view.updateInventoryText(inventory.bombs, inventory.goldNuggets)
  }

  private exitMine() {
    const centerRow = Math.floor(MAP_HEIGHT / 2)
    const centerCol = Math.floor(MAP_WIDTH / 2)

    irisOut(this, {
      originRow: centerRow,
      originCol: centerCol,
      onComplete: () => this.scene.start('GameScene'),
    })
  }
}
