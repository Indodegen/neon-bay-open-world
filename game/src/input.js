// Keyboard + mouse input, shared by player, vehicles and camera.
export class Input {
  constructor(canvas) {
    this.keys = {};
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseDown = false; this.clicked = false;
    this.dragging = false; this.lastX = 0; this.lastY = 0;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true; this.clicked = true; this.dragging = true;
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    addEventListener('mouseup', () => { this.mouseDown = false; this.dragging = false; });
    addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this.lastX; this.mouseDY += e.clientY - this.lastY;
      this.lastX = e.clientX; this.lastY = e.clientY;
    });
    addEventListener('blur', () => { this.keys = {}; this.mouseDown = false; this.dragging = false; });
  }
  get down() { return this.keys.KeyW || this.keys.ArrowUp; }
  get up() { return this.keys.KeyS || this.keys.ArrowDown; }
  get left() { return this.keys.KeyA || this.keys.ArrowLeft; }
  get right() { return this.keys.KeyD || this.keys.ArrowRight; }
  get sprint() { return !!this.keys.ShiftLeft || !!this.keys.ShiftRight; }
  get brake() { return !!this.keys.Space; }
  consumeClick() { const c = this.clicked; this.clicked = false; return c; }
  consumeDrag() { const dx = this.mouseDX, dy = this.mouseDY; this.mouseDX = 0; this.mouseDY = 0; return { dx, dy }; }
  pressed(code) { const p = !!this.keys[code]; if (p) this.keys[code] = false; return p; }
}
