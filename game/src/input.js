// input.js — Keyboard and mouse state for NEON BAY.
// One object owns every key and the mouse; the game reads it, never the DOM.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.mouse = { x: 0, y: 0, down: false, clicked: false };
    this.anyKey = false;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      this.keys.add(event.code);
      this.pressedKeys.add(event.code);
      this.anyKey = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });

    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = event.clientX - rect.left;
      this.mouse.y = event.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) {
        // Refresh the pointer position from the click itself: a click with
        // no prior mouse movement must still land where the user clicked.
        const rect = canvas.getBoundingClientRect();
        this.mouse.x = event.clientX - rect.left;
        this.mouse.y = event.clientY - rect.top;
        this.mouse.down = true;
        this.mouse.clicked = true;
      }
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.mouse.down = false;
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  isDown(code) {
    return this.keys.has(code);
  }

  // True only on the frame the key went down.
  wasPressed(code) {
    return this.pressedKeys.has(code);
  }

  axis(negativeCode, positiveCode) {
    let value = 0;
    if (this.isDown(negativeCode)) value -= 1;
    if (this.isDown(positiveCode)) value += 1;
    return value;
  }

  // Call at the end of every frame so edge-triggered presses fire once.
  endFrame() {
    this.pressedKeys.clear();
    this.mouse.clicked = false;
    this.anyKey = false;
  }
}
