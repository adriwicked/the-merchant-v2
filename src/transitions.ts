import Phaser from 'phaser'
import {
  CELL_SIZE, CELL_SEPARATION, MAP_WIDTH, MAP_HEIGHT, cellPosition,
} from './config'

const IRIS_DURATION = 750
const IRIS_OVERLAY_COLOR = 0x2a2a2a
const IRIS_OVERLAY_DEPTH = 1000

type IrisDirection = 'in' | 'out'

interface IrisOptions {
  /** Row of the iris center (tile coordinates) */
  originRow: number
  /** Column of the iris center (tile coordinates) */
  originCol: number
  /** Called when the transition completes */
  onComplete?: () => void
}

/**
 * Compute Euclidean distance from every grid cell to (originRow, originCol),
 * and the maximum distance to any grid corner from that origin.
 */
function computeDistances(originRow: number, originCol: number) {
  const distances: number[][] = []
  for (let row = 0; row < MAP_HEIGHT; row++) {
    distances[row] = []
    for (let col = 0; col < MAP_WIDTH; col++) {
      distances[row][col] = Math.sqrt((row - originRow) ** 2 + (col - originCol) ** 2)
    }
  }

  const maxCornerDist = Math.max(
    Math.sqrt(originRow ** 2 + originCol ** 2),
    Math.sqrt(originRow ** 2 + (MAP_WIDTH - 1 - originCol) ** 2),
    Math.sqrt((MAP_HEIGHT - 1 - originRow) ** 2 + originCol ** 2),
    Math.sqrt((MAP_HEIGHT - 1 - originRow) ** 2 + (MAP_WIDTH - 1 - originCol) ** 2),
  )

  return { distances, maxCornerDist }
}

/**
 * Run an iris transition on the given scene.
 *
 * - `'out'` (closing): starts with nothing covered, darkens cells from outside
 *    inward until everything is covered.
 * - `'in'` (opening): starts fully covered, reveals cells from center outward.
 */
function playIris(
  scene: Phaser.Scene,
  direction: IrisDirection,
  options: IrisOptions,
): void {
  const { originRow, originCol, onComplete } = options
  const { distances, maxCornerDist } = computeDistances(originRow, originCol)

  const overlay = scene.add.graphics()
  overlay.setDepth(IRIS_OVERLAY_DEPTH)

  const pad = CELL_SEPARATION
  const darkSize = CELL_SIZE + pad * 2

  // iris-out: threshold goes from maxCornerDist -> 0 (cover from outside in)
  // iris-in:  threshold goes from 0 -> maxCornerDist (reveal from center out)
  const startThreshold = direction === 'out' ? maxCornerDist : 0
  const endThreshold = direction === 'out' ? 0 : maxCornerDist
  const progress = { threshold: startThreshold }

  const drawFrame = () => {
    overlay.clear()
    overlay.fillStyle(IRIS_OVERLAY_COLOR, 1)

    for (let row = 0; row < MAP_HEIGHT; row++) {
      for (let col = 0; col < MAP_WIDTH; col++) {
        if (distances[row][col] >= progress.threshold) {
          const { x, y } = cellPosition(row, col)
          overlay.fillRect(x - pad, y - pad, darkSize, darkSize)
        }
      }
    }
  }

  drawFrame()

  scene.tweens.add({
    targets: progress,
    threshold: endThreshold,
    duration: IRIS_DURATION,
    ease: 'Linear',
    onUpdate: drawFrame,
    onComplete: () => {
      if (direction === 'in') {
        overlay.destroy()
      }
      onComplete?.()
    },
  })
}

/**
 * Iris-out (closing): darkens cells from outside inward toward the origin.
 * Typically used before switching to another scene.
 */
export function irisOut(
  scene: Phaser.Scene,
  options: IrisOptions,
): void {
  playIris(scene, 'out', options)
}

/**
 * Iris-in (opening): reveals cells from origin outward.
 * Typically used when entering a new scene.
 */
export function irisIn(
  scene: Phaser.Scene,
  options: IrisOptions,
): void {
  playIris(scene, 'in', options)
}
