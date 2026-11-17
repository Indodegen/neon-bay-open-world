// HUD: cash, wanted stars, health, speed, mission objective, 2D-canvas minimap, toasts.
export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.cash = document.getElementById('cash');
    this.stars = document.getElementById('stars');
    this.health = document.getElementById('healthfill');
    this.speed = document.getElementById('speed');
    this.objTitle = document.getElementById('obj-title');
    this.objText = document.getElementById('obj-text');
    this.objSub = document.getElementById('obj-sub');
    this.toast = document.getElementById('toast');
    this.map = document.getElementById('minimap');
    this.mctx = this.map.getContext('2d');
    this.toastTimer = 0;
  }
  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }
  showToast(text, ms = 2600) {
    this.toast.textContent = text;
    this.toast.style.opacity = 1;
    this.toastTimer = ms / 1000;
  }
  update(dt, game) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.style.opacity = 0;
    }
    this.cash.textContent = '$' + game.player.cash.toLocaleString('en-US');
    const w = game.police.wanted;
    let s = '';
    for (let i = 0; i < 5; i++) s += `<span class="${i < w ? '' : 'off'}">★</span>`;
    this.stars.innerHTML = s;
    this.health.style.width = Math.max(0, game.player.health) + '%';
    const mph = game.player.inCar ? Math.abs(game.player.inCar.speed) * 2.2 : 0;
    this.speed.innerHTML = Math.round(mph) + '<small> MPH</small>';
    const o = game.missions.objectiveText();
    this.objTitle.textContent = o.title;
    this.objText.textContent = o.text;
    this.objSub.textContent = o.sub;
    this.drawMinimap(game);
  }
  drawMinimap(game) {
    const g = this.mctx, S = 200, C = 100;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(C, C, 98, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#0d1430'; g.fillRect(0, 0, S, S);
    const toMap = (x, z) => [C + (x / 300) * 96, C + (z / 300) * 96];
    // Ocean + beach on the east edge.
    g.fillStyle = '#1e6f9e'; g.fillRect(196, 0, 4, S);
    g.fillStyle = '#e8cf9a'; g.fillRect(190, 0, 6, S);
    // Roads.
    g.strokeStyle = '#3d4454'; g.lineWidth = 5;
    for (let i = -5; i <= 5; i++) {
      const p = (i * 52 / 300) * 96;
      g.beginPath(); g.moveTo(C + p, 4); g.lineTo(C + p, 196); g.stroke();
      g.beginPath(); g.moveTo(4, C + p); g.lineTo(196, C + p); g.stroke();
    }
    // Mission marker.
    const m = game.missions.current();
    if (m && game.missions.marker) {
      const [mx, mz] = toMap(game.missions.marker.position.x, game.missions.marker.position.z);
      g.fillStyle = '#ffd23f';
      g.beginPath(); g.arc(mx, mz, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
    }
    // Traffic (grey), police (blue/red), player (green arrow).
    for (const car of game.traffic.cars) {
      const [x, z] = toMap(car.mesh.position.x, car.mesh.position.z);
      g.fillStyle = '#9aa3b2'; g.fillRect(x - 2, z - 2, 4, 4);
    }
    for (const cop of game.police.cars) {
      const [x, z] = toMap(cop.mesh.position.x, cop.mesh.position.z);
      g.fillStyle = '#3b82f6'; g.beginPath(); g.arc(x, z, 4, 0, Math.PI * 2); g.fill();
    }
    const pp = game.player.inCar ? game.player.inCar.mesh.position : game.player.mesh.position;
    const [px, pz] = toMap(pp.x, pp.z);
    const ang = game.player.inCar ? game.player.inCar.angle : game.player.angle;
    g.save();
    g.translate(px, pz); g.rotate(Math.atan2(Math.sin(ang), Math.cos(ang)) * -1 + Math.PI);
    g.fillStyle = '#2ed573';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(-6, 6); g.closePath(); g.fill();
    g.restore();
    g.restore();
  }
}
