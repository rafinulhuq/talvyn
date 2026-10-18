"use client";

import { useEffect, useRef } from "react";

interface Point3D {
  x: number;
  y: number;
  z: number;
}

export function GeometricCanvas3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || 800);
    let height = (canvas.height = canvas.parentElement?.clientHeight || 600);

    // Mouse coordinates for dynamic 3D camera rotation
    let targetRotX = 0;
    let targetRotY = 0;
    let currentRotX = 0.4;
    let currentRotY = 0.4;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / width - 0.5;
      const y = (e.clientY - rect.top) / height - 0.5;
      targetRotY = x * 1.5;
      targetRotX = -y * 1.5;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const handleResize = () => {
      if (!canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener("resize", handleResize);

    // Define 3D Hypercube / Tesseract Wireframe Vertices
    const size = Math.min(width, height) * 0.22;
    const vertices: Point3D[] = [];

    // Outer cube
    for (let x = -1; x <= 1; x += 2) {
      for (let y = -1; y <= 1; y += 2) {
        for (let z = -1; z <= 1; z += 2) {
          vertices.push({ x: x * size, y: y * size, z: z * size });
        }
      }
    }

    // Inner cube (Tesseract projection)
    const innerSize = size * 0.52;
    for (let x = -1; x <= 1; x += 2) {
      for (let y = -1; y <= 1; y += 2) {
        for (let z = -1; z <= 1; z += 2) {
          vertices.push({ x: x * innerSize, y: y * innerSize, z: z * innerSize });
        }
      }
    }

    // Outer cube edges
    const edges: [number, number][] = [
      [0, 1], [1, 3], [3, 2], [2, 0],
      [4, 5], [5, 7], [7, 6], [6, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
      // Inner cube edges
      [8, 9], [9, 11], [11, 10], [10, 8],
      [12, 13], [13, 15], [15, 14], [14, 12],
      [8, 12], [9, 13], [10, 14], [11, 15],
      // Connecting hyper-edges between outer and inner
      [0, 8], [1, 9], [2, 10], [3, 11],
      [4, 12], [5, 13], [6, 14], [7, 15],
    ];

    // Background floating particle matrix
    const particleCount = 45;
    const particles: (Point3D & { vx: number; vy: number; vz: number })[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: (Math.random() - 0.5) * width * 1.4,
        y: (Math.random() - 0.5) * height * 1.4,
        z: (Math.random() - 0.5) * 600,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        vz: (Math.random() - 0.5) * 0.4,
      });
    }

    let time = 0;

    const render = () => {
      time += 0.008;

      // Smooth camera interpolation
      currentRotX += (targetRotX - currentRotX) * 0.05;
      currentRotY += (targetRotY - currentRotY) * 0.05;

      const autoRotY = time * 0.5 + currentRotY;
      const autoRotX = time * 0.3 + currentRotX;

      ctx.clearRect(0, 0, width, height);

      const fov = 450;
      const centerX = width / 2;
      const centerY = height / 2;

      // Render Floating 3D Background Particles
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.z += p.vz;

        if (p.x < -width) p.x = width;
        if (p.x > width) p.x = -width;
        if (p.y < -height) p.y = height;
        if (p.y > height) p.y = -height;

        const depth = fov / (fov + p.z + 400);
        if (depth > 0) {
          const px = centerX + p.x * depth;
          const py = centerY + p.y * depth;
          const radius = Math.max(0.8, 1.8 * depth);
          ctx.beginPath();
          ctx.arc(px, py, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Project vertices to 2D
      const projected = vertices.map((v) => {
        // Rotate Y
        const cosY = Math.cos(autoRotY);
        const sinY = Math.sin(autoRotY);
        let x1 = v.x * cosY - v.z * sinY;
        let z1 = v.x * sinY + v.z * cosY;

        // Rotate X
        const cosX = Math.cos(autoRotX);
        const sinX = Math.sin(autoRotX);
        let y2 = v.y * cosX - z1 * sinX;
        let z2 = v.y * sinX + z1 * cosX;

        // Projection
        const scale = fov / (fov + z2 + 300);
        return {
          x: centerX + x1 * scale,
          y: centerY + y2 * scale,
          z: z2,
          scale,
        };
      });

      // Draw wireframe edges
      ctx.lineWidth = 1.25;
      edges.forEach(([i, j]) => {
        const p1 = projected[i];
        const p2 = projected[j];
        if (!p1 || !p2) return;

        const avgDepth = (p1.z + p2.z) / 2;
        const alpha = Math.max(0.15, Math.min(0.9, (avgDepth + 200) / 400));

        ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });

      // Draw vertex joints (dark block nodes)
      projected.forEach((p, idx) => {
        const isInner = idx >= 8;
        const nodeRadius = isInner ? 2.5 * p.scale : 4 * p.scale;
        const nodeAlpha = Math.max(0.3, Math.min(0.95, (p.z + 200) / 400));

        ctx.fillStyle = `rgba(0, 0, 0, ${nodeAlpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.2, nodeRadius), 0, Math.PI * 2);
        ctx.fill();

        // High-tech node ping ring
        if (idx === 0 || idx === 8) {
          ctx.strokeStyle = `rgba(0, 0, 0, ${nodeAlpha * 0.4})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(4, nodeRadius * 2.2), 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-80">
      <canvas ref={canvasRef} className="w-full h-full block" />
      {/* Background Matrix Grid Overlay */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0, 0, 0, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.05) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 40%, transparent 85%)",
        }}
      />
    </div>
  );
}
