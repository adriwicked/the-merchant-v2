import Phaser from 'phaser'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: {
    create: create,
    update: update
  }
}

const game = new Phaser.Game(config)

function create(this: Phaser.Scene) {
  // Crear un rectángulo simple para probar
  const graphics = this.make.graphics({ x: 0, y: 0, add: false })
  graphics.fillStyle(0x42a5f5, 1)
  graphics.fillRect(100, 100, 200, 200)
  this.add.existing(graphics)

  console.log('The Merchant V2 - Game initialized with Phaser 3!')
}

function update() {
  // Update logic
}

// Manejar redimensionamiento de ventana
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth, window.innerHeight)
})
