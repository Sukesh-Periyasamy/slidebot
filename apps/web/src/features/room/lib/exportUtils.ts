export function downloadJson(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportRoomSnapshot(roomId: string, token: string) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/rooms/${roomId}/snapshot`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) throw new Error('Failed to fetch snapshot');
  const data = await res.json();
  downloadJson(`snapshot-${roomId}-${Date.now()}.json`, data);
}

export async function exportRoomReplay(roomId: string, token: string) {
  const res = await fetch(`${import.meta.env.VITE_API_URL}/api/v1/rooms/${roomId}/replay`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });
  if (!res.ok) throw new Error('Failed to fetch replay');
  const data = await res.json();
  downloadJson(`replay-${roomId}-${Date.now()}.slidereplay`, data);
}

export function drawAnnotationsToContext(
  ctx: CanvasRenderingContext2D,
  annotations: any[],
  width: number,
  height: number
) {
  for (const ann of annotations) {
    const { data, color, strokeWidth, opacity } = ann;
    ctx.globalAlpha = opacity ?? 1;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = strokeWidth ?? 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const px = (val: number, axis: 'x' | 'y') => val * (axis === 'x' ? width : height);

    if (data.tool === 'freehand' && data.points && data.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(px(data.points[0], 'x'), px(data.points[1], 'y'));
      for (let i = 2; i < data.points.length; i += 2) {
        ctx.lineTo(px(data.points[i], 'x'), px(data.points[i + 1], 'y'));
      }
      ctx.stroke();
    } else if (data.tool === 'highlight') {
      ctx.globalAlpha = (opacity ?? 1) * 0.3;
      ctx.fillRect(px(data.x, 'x'), px(data.y, 'y'), px(data.width, 'x'), px(data.height, 'y'));
    } else if (data.tool === 'text') {
      ctx.font = `${px(data.fontSize, 'y')}px Inter, system-ui, sans-serif`;
      ctx.fillText(data.content, px(data.x, 'x'), px(data.y, 'y'));
    } else if (data.tool === 'arrow') {
      const fromX = px(data.startX, 'x');
      const fromY = px(data.startY, 'y');
      const toX = px(data.endX, 'x');
      const toY = px(data.endY, 'y');
      
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      // Arrow head
      const headlen = 10;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6));
      ctx.lineTo(toX, toY);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1.0;
}
