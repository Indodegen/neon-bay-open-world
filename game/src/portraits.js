// Portraits for NEON BAY's talkers: stylized faces drawn procedurally on a
// canvas, so dialog has a face without any image files.
export function drawPortrait(canvas, who) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  // Backdrop: neon gradient per character.
  const bg = ctx.createLinearGradient(0, 0, W, H);
  if (who === 'vera') { bg.addColorStop(0, '#3d0a2e'); bg.addColorStop(1, '#ff2e88'); }
  else if (who === 'rico') { bg.addColorStop(0, '#1a1a2e'); bg.addColorStop(1, '#d21f3c'); }
  else if (who === 'mara') { bg.addColorStop(0, '#0a1e3d'); bg.addColorStop(1, '#4d9fff'); }
  else { bg.addColorStop(0, '#222222'); bg.addColorStop(1, '#666666'); }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * 0.52;
  // Shoulders / outfit.
  ctx.fillStyle = who === 'mara' ? '#1a2a4a' : who === 'rico' ? '#3a2a2a' : '#5e1038';
  ctx.beginPath();
  ctx.moveTo(cx - 34, H);
  ctx.quadraticCurveTo(cx - 30, cy + 26, cx, cy + 24);
  ctx.quadraticCurveTo(cx + 30, cy + 26, cx + 34, H);
  ctx.closePath();
  ctx.fill();
  // Neck + head.
  ctx.fillStyle = who === 'rico' ? '#8a5a3b' : '#e8b88a';
  ctx.fillRect(cx - 7, cy + 12, 14, 14);
  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, Math.PI * 2);
  ctx.fill();
  // Hair.
  if (who === 'vera') {
    ctx.fillStyle = '#1a0a12';
    ctx.beginPath();
    ctx.arc(cx, cy - 6, 26, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - 26, cy - 8, 10, 34);
    ctx.fillRect(cx + 16, cy - 8, 10, 34);
  } else if (who === 'rico') {
    ctx.fillStyle = '#222222';
    ctx.beginPath();
    ctx.arc(cx, cy - 4, 25, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    // Scar.
    ctx.strokeStyle = '#c98a6a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 14, cy - 8);
    ctx.lineTo(cx - 6, cy + 4);
    ctx.stroke();
  } else if (who === 'mara') {
    // Police cap.
    ctx.fillStyle = '#16233d';
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 25, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - 25, cy - 12, 50, 8);
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(cx - 4, cy - 11, 8, 6);
  }
  // Sunglasses for Vera, eyes for the others.
  if (who === 'vera') {
    ctx.fillStyle = '#111111';
    ctx.beginPath();
    ctx.ellipse(cx - 10, cy - 2, 8, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 10, cy - 2, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2e88';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Gold earring.
    ctx.strokeStyle = '#ffd23e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + 24, cy + 6, 4, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(cx - 9, cy - 2, 2.6, 0, Math.PI * 2);
    ctx.arc(cx + 9, cy - 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 11);
    ctx.lineTo(cx + 6, cy + 11);
    ctx.stroke();
    if (who === 'mara') {
      ctx.fillStyle = '#ffd23e';
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('CBPD', cx, cy + 34);
    }
  }
}
