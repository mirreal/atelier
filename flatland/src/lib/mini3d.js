/* ============================================================
   迷你三维库 —— 手写透视投影 + 网格切片
   世界坐标：x/y 是平面国的地面，z 是「向上」。
   注意：是向上，不是向北。
   ============================================================ */
(function () {
  'use strict';
  const U = WB.util;
  const M = (window.WB.m3 = {});

  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L]; };
  M.sub = sub; M.cross = cross; M.dot = dot; M.norm = norm;

  /* 相机：返回 project(p) -> {x,y,z} 或 null（在身后） */
  M.cam = function (eye, target, fovDeg, W, H) {
    const f = norm(sub(target, eye));
    let up = [0, 0, 1];
    if (Math.abs(dot(f, up)) > 0.999) up = [0, 1, 0];
    const r = norm(cross(f, up));
    const u = cross(r, f);
    const focal = (H / 2) / Math.tan((fovDeg * Math.PI) / 360);
    return {
      eye, f, r, u, focal, W, H,
      project(p) {
        const d = sub(p, eye);
        const cz = dot(d, f);
        if (cz <= 0.05) return null;
        return { x: W / 2 + (dot(d, r) / cz) * focal, y: H / 2 - (dot(d, u) / cz) * focal, z: cz };
      },
    };
  };

  /* ---------------- 网格构造（面均为三角形，坐标以原点为中心） ---------------- */
  M.box = function (sx, sy, sz) {
    const x = sx / 2, y = sy / 2, z = sz / 2;
    const verts = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
                   [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
    const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
                   [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    return { verts, faces };
  };

  M.sphere = function (r, nu, nv) {
    nu = nu || 22; nv = nv || 14;
    const verts = [], faces = [];
    for (let i = 0; i <= nv; i++) {
      const phi = (Math.PI * i) / nv;
      for (let j = 0; j < nu; j++) {
        const th = (2 * Math.PI * j) / nu;
        verts.push([r * Math.sin(phi) * Math.cos(th), r * Math.sin(phi) * Math.sin(th), r * Math.cos(phi)]);
      }
    }
    const idx = (i, j) => i * nu + (j % nu);
    for (let i = 0; i < nv; i++) {
      for (let j = 0; j < nu; j++) {
        const a = idx(i, j), b = idx(i, j + 1), c = idx(i + 1, j + 1), d = idx(i + 1, j);
        faces.push([a, b, c], [a, c, d]);
      }
    }
    return { verts, faces };
  };

  M.cylinder = function (r, h, n) {
    n = n || 26;
    const verts = [], faces = [];
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        verts.push([r * Math.cos(a), r * Math.sin(a), k ? h / 2 : -h / 2]);
      }
    }
    const bot = i => i % n, top = i => n + (i % n);
    for (let i = 0; i < n; i++) {
      faces.push([bot(i), bot(i + 1), top(i + 1)], [bot(i), top(i + 1), top(i)]);
      faces.push([0, bot(i + 1), bot(i)]);
      faces.push([n, top(i), top(i + 1)]);
    }
    return { verts, faces };
  };

  /* 圆锥：顶点在下、底面在上（这样向上穿越时是「点→长大→突然消失」） */
  M.cone = function (r, h, n, apexDown) {
    n = n || 26;
    const verts = [], faces = [];
    const zTop = apexDown ? h / 2 : -h / 2;
    const zApex = apexDown ? -h / 2 : h / 2;
    const zBase = apexDown ? h / 2 : -h / 2;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      verts.push([r * Math.cos(a), r * Math.sin(a), zBase]);
    }
    verts.push([0, 0, zApex]);
    const apex = n;
    for (let i = 0; i < n; i++) {
      if (apexDown) faces.push([i, (i + 1) % n, apex]);
      else faces.push([(i + 1) % n, i, apex]);
      faces.push([0, i, (i + 1) % n]);
    }
    return { verts, faces };
  };

  /* 正四面体：边长 s，重心在原点 */
  M.tetra = function (s) {
    const k = s / (2 * Math.SQRT2);
    const verts = [[k, k, k], [k, -k, -k], [-k, k, -k], [-k, -k, k]];
    const faces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];
    return { verts, faces };
  };

  /* 棱柱：把一个二维多边形沿 z 拉伸（第六章「有厚度」的那个东西） */
  M.prism = function (poly2d, h, baseZ) {
    const n = poly2d.length, z0 = baseZ === undefined ? 0 : baseZ, z1 = z0 + h;
    const verts = [], faces = [];
    poly2d.forEach(p => verts.push([p[0], p[1], z0]));
    poly2d.forEach(p => verts.push([p[0], p[1], z1]));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([i, j, n + j], [i, n + j, n + i]);
      faces.push([0, j, i]);
      faces.push([n, n + i, n + j]);
    }
    return { verts, faces };
  };

  /* ---------------- 变换 ---------------- */
  /* R 为 3x3 旋转矩阵（行优先），t 为平移 */
  M.xform = function (mesh, R, t) {
    t = t || [0, 0, 0];
    const verts = mesh.verts.map(p => {
      let q;
      if (R) q = [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2],
                  R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2],
                  R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]];
      else q = [p[0], p[1], p[2]];
      return [q[0] + t[0], q[1] + t[1], q[2] + t[2]];
    });
    return { verts, faces: mesh.faces };
  };

  /* 把向量 v 转到 +z 轴的正交矩阵（立方体沿体对角线穿过平面用得上）。
     返回的三行是一组正交基；由于是正交矩阵，直接当 xform 的 R 用即可把
     物体的 v 方向转到 +z。 */
  M.alignZ = function (v) {
    const z = norm(v);
    const a = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const x = norm(cross(a, z));
    const y = cross(z, x);
    return [x, y, z];
  };
  M.transpose = R => [[R[0][0], R[1][0], R[2][0]], [R[0][1], R[1][1], R[2][1]], [R[0][2], R[1][2], R[2][2]]];

  /* ---------------- 切片：平面 z = z0 与网格的交线 ---------------- */
  M.slice = function (mesh, z0) {
    const V = mesh.verts, F = mesh.faces, raw = [];
    for (let k = 0; k < F.length; k++) {
      const f = F[k];
      const p = [V[f[0]], V[f[1]], V[f[2]]];
      const d = [p[0][2] - z0, p[1][2] - z0, p[2][2] - z0];
      for (let i = 0; i < 3; i++) {
        const a = p[i], b = p[(i + 1) % 3], da = d[i], db = d[(i + 1) % 3];
        if ((da > 0 && db < 0) || (da < 0 && db > 0)) {
          const t = da / (da - db);
          raw.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        } else if (Math.abs(da) < 1e-9) raw.push([a[0], a[1]]);
      }
    }
    const uniq = [];
    for (let i = 0; i < raw.length; i++) {
      let dup = false;
      for (let j = 0; j < uniq.length; j++) {
        if (Math.abs(raw[i][0] - uniq[j][0]) < 1e-6 && Math.abs(raw[i][1] - uniq[j][1]) < 1e-6) { dup = true; break; }
      }
      if (!dup) uniq.push(raw[i]);
    }
    if (uniq.length < 3) return [];
    let cx = 0, cy = 0;
    uniq.forEach(p => { cx += p[0]; cy += p[1]; });
    cx /= uniq.length; cy /= uniq.length;
    uniq.sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
    return uniq;
  };

  /* 去重后的边列表（画线框用） */
  M.edges = function (mesh) {
    const seen = {}, out = [];
    mesh.faces.forEach(f => {
      for (let i = 0; i < 3; i++) {
        const a = f[i], b = f[(i + 1) % 3];
        const key = Math.min(a, b) + ':' + Math.max(a, b);
        if (seen[key]) continue;
        seen[key] = 1;
        out.push([mesh.verts[a], mesh.verts[b]]);
      }
    });
    return out;
  };

  /* 绘制一个网格：面按深度排序后做半透明填充 + 线框 */
  M.drawMesh = function (ctx, cam, mesh, opt) {
    opt = opt || {};
    const proj = mesh.verts.map(p => cam.project(p));
    const faces = [];
    for (let k = 0; k < mesh.faces.length; k++) {
      const f = mesh.faces[k];
      const a = proj[f[0]], b = proj[f[1]], c = proj[f[2]];
      if (!a || !b || !c) continue;
      faces.push({ a, b, c, z: (a.z + b.z + c.z) / 3 });
    }
    faces.sort((p, q) => q.z - p.z);
    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      ctx.beginPath();
      ctx.moveTo(f.a.x, f.a.y); ctx.lineTo(f.b.x, f.b.y); ctx.lineTo(f.c.x, f.c.y); ctx.closePath();
      if (opt.fill) { ctx.fillStyle = opt.fill; ctx.fill(); }
      if (opt.face) {
        const sh = U.clamp(1 - f.z / (opt.depth || 16), 0.05, 1);
        ctx.fillStyle = opt.face(sh);
        ctx.fill();
      }
    }
    if (opt.stroke) {
      ctx.strokeStyle = opt.stroke;
      ctx.lineWidth = opt.lw || 1;
      ctx.beginPath();
      M.edges(mesh).forEach(e => {
        const a = cam.project(e[0]), b = cam.project(e[1]);
        if (!a || !b) return;
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      });
      ctx.stroke();
    }
  };

  /* 在地面上画网格（平面国的地面） */
  M.drawGrid = function (ctx, cam, half, step, color, color2) {
    for (let v = -half; v <= half + 1e-6; v += step) {
      const major = Math.abs(v % (step * 5)) < 1e-6;
      ctx.strokeStyle = major ? color2 : color;
      ctx.lineWidth = major ? 1.2 : 1;
      const pairs = [[[-half, v, 0], [half, v, 0]], [[v, -half, 0], [v, half, 0]]];
      pairs.forEach(pr => {
        const a = cam.project(pr[0]), b = cam.project(pr[1]);
        if (!a || !b) return;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });
    }
  };
})();
