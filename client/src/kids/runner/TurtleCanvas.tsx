import { useEffect, useRef } from "react";
import { TurtleDrawing } from "./protocol";
import { describeDrawing } from "./runPython";

const SIZE = 400;
const ANIMATION_FRAMES = 90;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Turtle coordinates have (0, 0) in the middle and y pointing up; the canvas has (0, 0) top-left and y pointing down.
const toCanvas = (x: number, y: number): [number, number] => [SIZE / 2 + x, SIZE / 2 - y];

function drawTurtleHead(ctx: CanvasRenderingContext2D, x: number, y: number, heading: number) {
  const [cx, cy] = toCanvas(x, y);
  const r = (-heading * Math.PI) / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(r);
  ctx.fillStyle = "#15803d";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-7, 7);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-7, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function TurtleCanvas({ drawing }: { drawing: TurtleDrawing }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = SIZE * ratio;
    canvas.height = SIZE * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const { lines, dots, bg, turtles } = drawing;
    const total = lines.length;
    const perFrame = prefersReducedMotion() ? Math.max(total, 1) : Math.max(1, Math.ceil(total / ANIMATION_FRAMES));
    let drawn = 0;
    let frame = 0;

    function paint() {
      ctx!.clearRect(0, 0, SIZE, SIZE);
      ctx!.fillStyle = bg ?? "#ffffff";
      ctx!.fillRect(0, 0, SIZE, SIZE);
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      for (let i = 0; i < drawn; i++) {
        const [x1, y1, x2, y2, colour, size] = lines[i];
        ctx!.strokeStyle = colour;
        ctx!.lineWidth = size;
        ctx!.beginPath();
        ctx!.moveTo(...toCanvas(x1, y1));
        ctx!.lineTo(...toCanvas(x2, y2));
        ctx!.stroke();
      }
      if (drawn >= total) {
        for (const [x, y, size, colour] of dots) {
          ctx!.fillStyle = colour;
          ctx!.beginPath();
          ctx!.arc(...toCanvas(x, y), size / 2, 0, Math.PI * 2);
          ctx!.fill();
        }
        for (const [x, y, heading] of turtles) drawTurtleHead(ctx!, x, y, heading);
      } else {
        const [, , x2, y2] = lines[drawn - 1] ?? [0, 0, 0, 0];
        drawTurtleHead(ctx!, x2, y2, 0);
      }
    }

    function step() {
      drawn = Math.min(total, drawn + perFrame);
      paint();
      if (drawn < total) frame = requestAnimationFrame(step);
    }
    step();
    return () => cancelAnimationFrame(frame);
  }, [drawing]);

  return <canvas ref={canvasRef} className="turtle-canvas" role="img" aria-label={describeDrawing(drawing, 0)} />;
}
