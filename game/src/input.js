// NEON BAY — input.js
// Keyboard + mouse state, with edge-triggered "just pressed" helpers so menus
// and actions fire once per key press. Also tracks the mouse in canvas space
// for aiming and for clicking menu buttons.

export class NeonInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.pressed = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    this.anyKey = false;

    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
      if (!this.keys[k]) this.pressed[k] = true;
      this.keys[k] = true;
      this.anyKey = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = {};
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
      this.mouseDown = true;
      this.mouseClicked = true;
      this.anyKey = true;
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  down(...names) {
    return names.some((n) => !!this.keys[n]);
  }

  justPressed(...names) {
    return names.some((n) => !!this.pressed[n]);
  }

  justClicked() {
    return this.mouseClicked;
  }

  endFrame() {
    this.pressed = {};
    this.mouseClicked = false;
    this.anyKey = false;
  }

  // Movement axes: -1..1, WASD plus arrows.
  moveX() {
    return (this.down('d', 'arrowright') ? 1 : 0) - (this.down('a', 'arrowleft') ? 1 : 0);
  }

  moveY() {
    return (this.down('s', 'arrowdown') ? 1 : 0) - (this.down('w', 'arrowup') ? 1 : 0);
  }
}
