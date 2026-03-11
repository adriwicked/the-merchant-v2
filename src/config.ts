export const CANVAS_WIDTH = 600
export const CANVAS_HEIGHT = 600
export const CELL_SIZE = 10
export const CELL_SEPARATION = 2
export const BORDER_WIDTH = 3
export const MAP_WIDTH = 45
export const MAP_HEIGHT = 45

export const GRID_PIXEL_WIDTH = MAP_WIDTH * (CELL_SIZE + CELL_SEPARATION) + CELL_SEPARATION
export const GRID_PIXEL_HEIGHT = MAP_HEIGHT * (CELL_SIZE + CELL_SEPARATION) + CELL_SEPARATION
export const OFFSET_X = (CANVAS_WIDTH - GRID_PIXEL_WIDTH) / 2
export const OFFSET_Y = (CANVAS_HEIGHT - GRID_PIXEL_HEIGHT) / 2

export const COLORS = {
  BOARD: {
    BACKGROUND: 0x3c3c3c,
    BORDER: 0x777777,
  },
  LOCATIONS: {
    CITY: 0xdd3333,
    MINE: 0xc0b8b0,
  },
}

export function tweakColor(color: number): number {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff

  const factor = (Math.random() * 0.1 + 0.95) * (Math.random() * 0.1 + 0.95)

  return (
    (Math.min(Math.round(r * factor), 255) << 16) |
    (Math.min(Math.round(g * factor), 255) << 8) |
    Math.min(Math.round(b * factor), 255)
  )
}

export function desaturate(color: number, amount: number): number {
  const r = (color >> 16) & 0xff
  const g = (color >> 8) & 0xff
  const b = color & 0xff
  const gray = Math.round(r * 0.299 + g * 0.587 + b * 0.114)

  const nr = Math.round(r + (gray - r) * amount)
  const ng = Math.round(g + (gray - g) * amount)
  const nb = Math.round(b + (gray - b) * amount)

  return (nr << 16) | (ng << 8) | nb
}

/** Returns the pixel x,y for the top-left of a cell at (row, col) */
export function cellPosition(row: number, col: number): { x: number; y: number } {
  return {
    x: OFFSET_X + CELL_SEPARATION + col * (CELL_SIZE + CELL_SEPARATION),
    y: OFFSET_Y + CELL_SEPARATION + row * (CELL_SIZE + CELL_SEPARATION),
  }
}
