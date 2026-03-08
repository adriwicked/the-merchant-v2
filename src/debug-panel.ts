import { MapParams, DEFAULT_PARAMS, Terrain, TERRAIN_LABELS, TERRAIN_COLORS } from './map'

interface DebugPanelCallbacks {
  /** Called when threshold sliders change — same noise, just re-classify */
  onParamsChange: (params: MapParams) => void
  /** Called when noise sliders change or "New Seed" is pressed — regenerate noise grid */
  onNewSeed: (params: MapParams) => void
}

function terrainColorHex(terrain: Terrain): string {
  const num = TERRAIN_COLORS[terrain]
  return '#' + num.toString(16).padStart(6, '0')
}

const BASE_TERRAIN_ORDER = [
  Terrain.DEEP_WATER,
  Terrain.MEDIUM_WATER,
  Terrain.LOW_GRASS,
  Terrain.HIGH_GRASS,
  Terrain.DIRT,
]

const SHORE_TERRAIN_ORDER = [
  Terrain.SEA_SHORE,
]

export function createDebugPanel(callbacks: DebugPanelCallbacks): { destroy: () => void } {
  const params: MapParams = structuredClone(DEFAULT_PARAMS)

  const panel = document.createElement('div')
  panel.id = 'debug-panel'
  panel.innerHTML = `
    <style>
      #debug-panel {
        position: fixed;
        top: 10px;
        right: 10px;
        width: 280px;
        background: rgba(20, 20, 20, 0.95);
        border: 1px solid #555;
        border-radius: 6px;
        padding: 12px;
        color: #ddd;
        font-family: 'SF Mono', 'Consolas', monospace;
        font-size: 11px;
        z-index: 9999;
        max-height: calc(100vh - 20px);
        overflow-y: auto;
        user-select: none;
      }
      #debug-panel h3 {
        margin: 0 0 10px;
        font-size: 13px;
        color: #fff;
        border-bottom: 1px solid #444;
        padding-bottom: 6px;
      }
      #debug-panel h4 {
        margin: 10px 0 6px;
        font-size: 11px;
        color: #aaa;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      #debug-panel .slider-row {
        display: flex;
        align-items: center;
        margin-bottom: 5px;
        gap: 6px;
      }
      #debug-panel .slider-row .color-dot {
        width: 10px;
        height: 10px;
        border-radius: 2px;
        flex-shrink: 0;
      }
      #debug-panel .slider-row label {
        flex: 0 0 85px;
        font-size: 10px;
        color: #bbb;
      }
      #debug-panel .slider-row input[type="range"] {
        flex: 1;
        height: 4px;
        -webkit-appearance: none;
        appearance: none;
        background: #444;
        border-radius: 2px;
        outline: none;
      }
      #debug-panel .slider-row input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #ccc;
        cursor: pointer;
      }
      #debug-panel .slider-row .value {
        flex: 0 0 38px;
        text-align: right;
        font-size: 10px;
        color: #888;
        font-variant-numeric: tabular-nums;
      }
      #debug-panel .btn-row {
        display: flex;
        gap: 6px;
        margin-top: 10px;
      }
      #debug-panel button {
        flex: 1;
        padding: 5px 8px;
        border: 1px solid #555;
        border-radius: 3px;
        background: #333;
        color: #ddd;
        font-size: 10px;
        cursor: pointer;
        font-family: inherit;
      }
      #debug-panel button:hover {
        background: #444;
      }
      #debug-panel .output-box {
        margin-top: 8px;
        padding: 8px;
        background: #111;
        border: 1px solid #333;
        border-radius: 3px;
        font-size: 10px;
        color: #8f8;
        white-space: pre;
        line-height: 1.4;
        display: none;
        max-height: 200px;
        overflow-y: auto;
      }
    </style>
    <h3>Map Tuner</h3>

    <h4>Noise (regenerates seed)</h4>
    <div id="noise-sliders"></div>

    <h4>Base Terrain Thresholds</h4>
    <div id="base-sliders"></div>

    <h4>Shore Thresholds</h4>
    <div id="shore-sliders"></div>

    <div class="btn-row">
      <button id="btn-regen">New Seed</button>
      <button id="btn-export">Export Values</button>
    </div>
    <div id="export-output" class="output-box"></div>
  `
  document.body.appendChild(panel)

  const noiseContainer = panel.querySelector('#noise-sliders')!
  const baseContainer = panel.querySelector('#base-sliders')!
  const shoreContainer = panel.querySelector('#shore-sliders')!

  function makeSlider(
    container: Element,
    label: string,
    color: string | null,
    min: number,
    max: number,
    step: number,
    initialValue: number,
    onInput: (val: number) => void,
  ): HTMLInputElement {
    const row = document.createElement('div')
    row.className = 'slider-row'

    if (color) {
      row.innerHTML += `<span class="color-dot" style="background:${color}"></span>`
    }

    const lbl = document.createElement('label')
    lbl.textContent = label
    row.appendChild(lbl)

    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(initialValue)
    row.appendChild(input)

    const valSpan = document.createElement('span')
    valSpan.className = 'value'
    valSpan.textContent = initialValue.toFixed(step < 0.01 ? 3 : 2)
    row.appendChild(valSpan)

    input.addEventListener('input', () => {
      const v = parseFloat(input.value)
      valSpan.textContent = v.toFixed(step < 0.01 ? 3 : 2)
      onInput(v)
    })

    container.appendChild(row)
    return input
  }

  // Noise params — changing these regenerates the noise grid
  makeSlider(noiseContainer, 'Scale', null, 0.01, 0.2, 0.005, params.scale, (v) => {
    params.scale = v
    callbacks.onNewSeed(structuredClone(params))
  })
  makeSlider(noiseContainer, 'Octaves', null, 1, 8, 1, params.octaves, (v) => {
    params.octaves = v
    callbacks.onNewSeed(structuredClone(params))
  })
  makeSlider(noiseContainer, 'Lacunarity', null, 1, 4, 0.1, params.lacunarity, (v) => {
    params.lacunarity = v
    callbacks.onNewSeed(structuredClone(params))
  })
  makeSlider(noiseContainer, 'Persistence', null, 0.1, 1, 0.05, params.persistence, (v) => {
    params.persistence = v
    callbacks.onNewSeed(structuredClone(params))
  })
  makeSlider(noiseContainer, 'Radial Falloff', null, 0, 3, 0.05, params.radialFalloff, (v) => {
    params.radialFalloff = v
    callbacks.onParamsChange(structuredClone(params))
  })

  // Base terrain thresholds — only re-classify, same noise
  for (let i = 0; i < BASE_TERRAIN_ORDER.length; i++) {
    const terrain = BASE_TERRAIN_ORDER[i]
    const rangeEntry = params.baseRanges.find(r => r.terrain === terrain)!
    makeSlider(
      baseContainer,
      TERRAIN_LABELS[terrain],
      terrainColorHex(terrain),
      -1, 1, 0.01,
      rangeEntry.max,
      (v) => {
        rangeEntry.max = v
        callbacks.onParamsChange(structuredClone(params))
      },
    )
  }

  // Shore thresholds — only re-classify, same noise
  for (let i = 0; i < SHORE_TERRAIN_ORDER.length; i++) {
    const terrain = SHORE_TERRAIN_ORDER[i]
    const rangeEntry = params.shoreRanges.find(r => r.terrain === terrain)!
    makeSlider(
      shoreContainer,
      TERRAIN_LABELS[terrain],
      terrainColorHex(terrain),
      -1, 1, 0.01,
      rangeEntry.max,
      (v) => {
        rangeEntry.max = v
        callbacks.onParamsChange(structuredClone(params))
      },
    )
  }

  // New seed button — regenerates noise with current params
  panel.querySelector('#btn-regen')!.addEventListener('click', () => {
    callbacks.onNewSeed(structuredClone(params))
  })

  // Export button
  const exportOutput = panel.querySelector('#export-output') as HTMLElement
  panel.querySelector('#btn-export')!.addEventListener('click', () => {
    const baseStr = params.baseRanges
      .map(r => `  { max: ${r.max.toFixed(2)}, terrain: Terrain.${Terrain[r.terrain]} }`)
      .join(',\n')
    const shoreStr = params.shoreRanges
      .map(r => `  { max: ${r.max.toFixed(2)}, terrain: Terrain.${Terrain[r.terrain]} }`)
      .join(',\n')

    const output = [
      `scale: ${params.scale.toFixed(3)}`,
      `octaves: ${params.octaves}`,
      `lacunarity: ${params.lacunarity.toFixed(1)}`,
      `persistence: ${params.persistence.toFixed(2)}`,
      `radialFalloff: ${params.radialFalloff.toFixed(2)}`,
      ``,
      `baseRanges:`,
      baseStr,
      ``,
      `shoreRanges:`,
      shoreStr,
    ].join('\n')

    exportOutput.textContent = output
    exportOutput.style.display = 'block'
  })

  return {
    destroy() {
      panel.remove()
    }
  }
}
