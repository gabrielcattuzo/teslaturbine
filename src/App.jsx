import { useState, useEffect, useRef, useCallback } from "react";

const FLUIDS = {
  ar: { label: "Ar", rho: 1.225, mu: 1.81e-5, color: "#6366f1" },
};

const R0_FIXO = 0.0075; 

const ETA_MAX_PROTOTIPO = 40.0; 

function calcTurbina(p) {
  const fl  = FLUIDS[p.fluid];
  const R   = (p.diam / 2) / 1000;
  const r0  = R0_FIXO;
  const gap = p.gap / 1000;
  const omega = p.rpm * 2 * Math.PI / 60;
  const deltaP = p.pres * 1e5;
  const nGaps = p.disks - 1;
  const aBico = Math.PI * ((p.bico / 1000) / 2) ** 2;
  const Q = p.flow / 1000 / 60;

  const vIn  = Q / aBico;
  const vtip = omega * R;

  const P_in = deltaP * Q + 0.5 * fl.rho * Q * vIn * vIn;

  const N = 300, dr = (R - r0) / N;
  let torqueCalc = 0;
  for (let i = 0; i <= N; i++) {
    const ri = r0 + i * dr;
    torqueCalc += fl.mu * (vIn * R / (ri * ri) - omega) / gap * 2 * Math.PI * ri * dr * ri;
  }
  torqueCalc *= 2 * nGaps;

  const T_max = omega > 0 ? P_in / omega : Infinity;
  const torque = torqueCalc >= 0 ? Math.min(torqueCalc, T_max) : torqueCalc;
  const modeloCouetteExtrapolado = torqueCalc > T_max;

  const P_out = Math.max(torque * omega, 0);

  const vAx      = Q / Math.max(Math.PI * r0 * r0, 1e-9);
  const pLossCin  = 0.5 * fl.rho * Q * Math.max(vIn - vtip, 0) ** 2;
  const pLossAx   = 0.5 * fl.rho * Q * vAx ** 2;
  const pLossMec  = P_out * 0.12;
  const pLossVaz  = P_in * 0.05;
  const pLossVisc = Math.max(P_in - P_out - pLossCin - pLossAx - pLossMec - pLossVaz, 0);

  const Re = fl.rho * vIn * gap / fl.mu;
  const regime = Re < 2300 ? "laminar" : Re < 4000 ? "transicional" : "turbulento";

  const etaRaw = P_in > 0 ? (torque > 0 ? Math.min(P_out / P_in * 100, 99) : 0) : 0;

  const etaLimitado = etaRaw > ETA_MAX_PROTOTIPO;
  const eta = Math.min(etaRaw, ETA_MAX_PROTOTIPO);

  return {
    vIn, vtip, Q, torque, P_out, P_in, Re, eta, etaRaw,
    fDrag: Math.abs(torque) / ((R + r0) / 2),
    modo: torque >= 0 ? "MOTOR" : "FREIO",
    modeloCouetteExtrapolado,
    etaLimitado,
    regime,
    losses: {
      visc: pLossVisc, cin: pLossCin, ax: pLossAx,
      mec: pLossMec, vaz: pLossVaz,
      total: pLossCin + pLossAx + pLossMec + pLossVaz + pLossVisc
    },
  };
}

function curvaRPM(p) {
  const pts = [];
  for (let rpm = 100; rpm <= 5000; rpm += 100) {
    const r = calcTurbina({ ...p, rpm });
    pts.push({ rpm, eta: r.eta, P_out: r.P_out });
  }
  return pts;
}

function curvaDiscos(p) {
  const pts = [];
  for (let d = 2; d <= 12; d++) {
    const r = calcTurbina({ ...p, disks: d });
    pts.push({ d, eta: r.eta });
  }
  return pts;
}

function curvaPotenciaRPM(p) {
  const pts = [];
  for (let rpm = 100; rpm <= 5000; rpm += 100) {
    const r = calcTurbina({ ...p, rpm });
    pts.push({ rpm, P_in: r.P_in, P_out: r.P_out });
  }
  return pts;
}

function curvaPotenciaPres(p) {
  const pts = [];
  for (let pres = 1.5; pres <= 6; pres += 0.25) {
    const r = calcTurbina({ ...p, pres });
    pts.push({ pres: +pres.toFixed(2), P_in: r.P_in, P_out: r.P_out, eta: r.eta });
  }
  return pts;
}

function curvaPotenciaGap(p) {
  const pts = [];
  for (let gap = 1.0; gap <= 5; gap += 0.1) {
    const r = calcTurbina({ ...p, gap: +gap.toFixed(1) });
    pts.push({ gap: +gap.toFixed(1), P_in: r.P_in, P_out: r.P_out, eta: r.eta });
  }
  return pts;
}

function curvaEtaFlow(p) {
  const pts = [];
  for (let flow = 1; flow <= 20; flow += 0.5) {
    const r = calcTurbina({ ...p, flow });
    pts.push({ flow, eta: r.eta, P_out: r.P_out });
  }
  return pts;
}

function makeParticle(R) {
  return { r: R * 0.97, theta: -0.3 + Math.random() * 0.25, life: 0,
    maxLife: 110 + Math.random() * 80, speed: 0.016 + Math.random() * 0.012 };
}

function DualChart({ data, xKey, y1Key, y2Key, xLabel, yLabel, color1, color2, label1, label2, curX }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    const pad = { t: 28, r: 12, b: 28, l: 46 };
    const gW = W - pad.l - pad.r, gH = H - pad.t - pad.b;
    ctx.clearRect(0, 0, W, H);
    const xs  = data.map(d => d[xKey]);
    const y1s = data.map(d => d[y1Key]);
    const y2s = data.map(d => d[y2Key]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const allY = [...y1s, ...y2s];
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY, 0.01);
    
    const yLow  = minY > 0 ? 0 : minY;
    const yHigh = maxY * 1.08; 
    const tx = x => pad.l + ((x - minX) / (maxX - minX)) * gW;
    const ty = y => pad.t + gH - ((y - yLow) / (yHigh - yLow)) * gH;

    ctx.strokeStyle = "#f1f5f9"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (i / 4) * gH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + gW, y); ctx.stroke();
      ctx.fillStyle = "#94a3b8"; ctx.font = "9px system-ui";
      const val = yHigh - (i / 4) * (yHigh - yLow);
      ctx.fillText(val.toFixed(1), 2, y + 3);
    }
    ctx.fillStyle = "#94a3b8"; ctx.font = "9px system-ui";
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const v = minX + f * (maxX - minX);
      ctx.fillText(typeof v === "number" && v < 10 ? v.toFixed(1) : Math.round(v), tx(v) - 8, H - 6);
    });
    ctx.fillText(xLabel, W / 2 - 10, H - 1);
    ctx.save(); ctx.translate(10, pad.t + gH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0); ctx.restore();

    [[color1, label1], [color2, label2]].forEach(([c, l], i) => {
      ctx.fillStyle = c; ctx.fillRect(pad.l + i * 90, 4, 14, 8);
      ctx.fillStyle = "#64748b"; ctx.font = "9px system-ui";
      ctx.fillText(l, pad.l + i * 90 + 18, 12);
    });

    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(tx(d[xKey]), ty(d[y1Key])) : ctx.lineTo(tx(d[xKey]), ty(d[y1Key])); });
    ctx.lineTo(tx(xs[xs.length-1]), pad.t + gH); ctx.lineTo(pad.l, pad.t + gH); ctx.closePath();
    const gr1 = ctx.createLinearGradient(0, pad.t, 0, pad.t + gH);
    gr1.addColorStop(0, color1 + "25"); gr1.addColorStop(1, color1 + "00");
    ctx.fillStyle = gr1; ctx.fill();

    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(tx(d[xKey]), ty(d[y2Key])) : ctx.lineTo(tx(d[xKey]), ty(d[y2Key])); });
    ctx.lineTo(tx(xs[xs.length-1]), pad.t + gH); ctx.lineTo(pad.l, pad.t + gH); ctx.closePath();
    const gr2 = ctx.createLinearGradient(0, pad.t, 0, pad.t + gH);
    gr2.addColorStop(0, color2 + "25"); gr2.addColorStop(1, color2 + "00");
    ctx.fillStyle = gr2; ctx.fill();

    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(tx(d[xKey]), ty(d[y1Key])) : ctx.lineTo(tx(d[xKey]), ty(d[y1Key])); });
    ctx.strokeStyle = color1; ctx.lineWidth = 2; ctx.stroke();

    ctx.beginPath();
    data.forEach((d, i) => { i === 0 ? ctx.moveTo(tx(d[xKey]), ty(d[y2Key])) : ctx.lineTo(tx(d[xKey]), ty(d[y2Key])); });
    ctx.strokeStyle = color2; ctx.lineWidth = 2; ctx.stroke();

    if (curX !== undefined) {
      const x = tx(curX);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + gH);
      ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
  }, [data, xKey, y1Key, y2Key, color1, color2, curX]);
  return <canvas ref={ref} width={300} height={145} style={{ width:"100%", height:"auto" }} />;
}

function MiniChart({ data, xKey, yKey, xLabel, yLabel, color, curX }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext("2d");
    const W = c.width, H = c.height;
    const pad = { t: 12, r: 12, b: 28, l: 42 };
    const gW = W - pad.l - pad.r, gH = H - pad.t - pad.b;
    ctx.clearRect(0, 0, W, H);
    const xs = data.map(d => d[xKey]), ys = data.map(d => d[yKey]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const maxY = Math.max(...ys, 0.01);
    const tx = x => pad.l + ((x - minX) / (maxX - minX)) * gW;
    const ty = y => pad.t + gH - (y / maxY) * gH;
    ctx.strokeStyle = "#f1f5f9"; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (i / 4) * gH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + gW, y); ctx.stroke();
      ctx.fillStyle = "#94a3b8"; ctx.font = "9px system-ui";
      ctx.fillText((maxY * (1 - i / 4)).toFixed(1), 2, y + 3);
    }
    ctx.fillStyle = "#94a3b8"; ctx.font = "9px system-ui";
    [0, 0.25, 0.5, 0.75, 1].forEach(f => {
      const v = minX + f * (maxX - minX);
      ctx.fillText(Math.round(v), tx(v) - 8, H - 6);
    });
    ctx.fillText(xLabel, W / 2 - 10, H - 1);
    ctx.save(); ctx.translate(10, pad.t + gH / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0); ctx.restore();
    ctx.beginPath();
    data.forEach((d, i) => { const x = tx(d[xKey]), y = ty(d[yKey]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.lineTo(tx(xs[xs.length-1]), pad.t + gH);
    ctx.lineTo(pad.l, pad.t + gH); ctx.closePath();
    const gr = ctx.createLinearGradient(0, pad.t, 0, pad.t + gH);
    gr.addColorStop(0, color + "30"); gr.addColorStop(1, color + "00");
    ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath();
    data.forEach((d, i) => { const x = tx(d[xKey]), y = ty(d[yKey]); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
    if (curX !== undefined) {
      const x = tx(curX);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + gH);
      ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
    }
  }, [data, xKey, yKey, color, curX]);
  return <canvas ref={ref} width={300} height={130} style={{ width: "100%", height: "auto" }} />;
}

function ParamInput({ label, id, value, min, max, step, unit, onChange, hint }) {
  const [draft, setDraft] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setDraft(String(value)); }, [value, focus]);
  function commit(raw) {
    const n = parseFloat(raw.replace(",", "."));
    if (!isNaN(n)) {
      const v = parseFloat(Math.min(max, Math.max(min, n)).toFixed(10));
      onChange(v);
      setDraft(String(v));
    } else {
      setDraft(String(value));
    }
    setFocus(false);
  }
  function kd(e) {
    if (e.key === "Enter") e.target.blur();
    if (e.key === "Escape") { setDraft(String(value)); setFocus(false); }
    if (e.key === "ArrowUp") { e.preventDefault(); const v = Math.min(max, parseFloat((value+step).toFixed(10))); onChange(v); setDraft(String(v)); }
    if (e.key === "ArrowDown") { e.preventDefault(); const v = Math.max(min, parseFloat((value-step).toFixed(10))); onChange(v); setDraft(String(v)); }
  }
  const pct = ((value - min) / (max - min) * 100).toFixed(1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <label htmlFor={id} style={{ fontSize:12, color:"#64748b", fontWeight:500 }}>
          {label}
          {hint && <span style={{ marginLeft:4, fontSize:10, color:"#94a3b8" }}>({hint})</span>}
        </label>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <input type="text" inputMode="decimal" value={focus ? draft : String(value)}
            onFocus={() => { setFocus(true); setDraft(String(value)); }}
            onChange={e => setDraft(e.target.value)}
            onBlur={e => commit(e.target.value)} onKeyDown={kd}
            style={{ width:60, padding:"3px 7px", textAlign:"right",
              background: focus ? "#eff6ff" : "#f8fafc",
              border:`1.5px solid ${focus ? "#6366f1" : "#e2e8f0"}`,
              borderRadius:6, color:"#1e293b", fontFamily:"monospace",
              fontSize:13, fontWeight:600, outline:"none", transition:"all 0.15s" }} />
          <span style={{ fontSize:11, color:"#94a3b8", width:38 }}>{unit}</span>
        </div>
      </div>
      <div style={{ position:"relative", height:5, borderRadius:3, background:"#e2e8f0" }}>
        <div style={{ position:"absolute", left:0, top:0, height:"100%", borderRadius:3,
          width:`${pct}%`, background:"linear-gradient(90deg,#6366f1,#818cf8)", transition:"width 0.1s" }} />
        <input id={id} type="range" min={min} max={max} step={step} value={value}
          onChange={e => { onChange(Number(e.target.value)); setFocus(false); }}
          style={{ position:"absolute", inset:0, width:"100%", opacity:0, cursor:"pointer", margin:0 }} />
      </div>
    </div>
  );
}

export default function App() {
  const [rpm,   setRpm]   = useState(938);
  const [diam,  setDiam]  = useState(120);
  const [disks, setDisks] = useState(8);
  const [gap,   setGap]   = useState(1.0);
  const [pres,  setPres]  = useState(2.0);
  const [flow,  setFlow]  = useState(5.0);
  const [bico,  setBico]  = useState(3.0);
  const fluid = "ar";
  const [running, setRunning] = useState(true);

  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const animRef   = useRef(null);
  const angleRef  = useRef(0);
  const frameRef  = useRef(0);
  const ptsRef    = useRef([]);
  const pRef      = useRef({});
  pRef.current = { rpm, diam, disks, gap, pres, flow, bico, fluid, running };

  const p   = { rpm, diam, disks, gap, pres, flow, bico, fluid };
  const res = calcTurbina(p);
  const chartRPM        = curvaRPM(p);
  const chartDiscos     = curvaDiscos(p);
  const chartPotRPM     = curvaPotenciaRPM(p);
  const chartPotPres    = curvaPotenciaPres(p);
  const chartPotGap     = curvaPotenciaGap(p);
  const chartEtaFlow    = curvaEtaFlow(p);
  const f  = (n, d) => isFinite(n) ? n.toFixed(d) : "—";
  const fi = n => isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : "—";
  const fl = FLUIDS[fluid];

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const p2 = pRef.current;
    const W = canvas.width, H = canvas.height, cx = W/2, cy = H/2;
    const Rpx = Math.min(W, H) * 0.40;
    ctx.clearRect(0, 0, W, H);
    const fl2 = FLUIDS[p2.fluid];
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(0, 0, W, H);
    const bgGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rpx*1.4);
    bgGrd.addColorStop(0, fl2.color+"18"); bgGrd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = bgGrd; ctx.fillRect(0, 0, W, H);
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, Rpx*(0.35+i*0.22), 0, Math.PI*2);
      ctx.strokeStyle = "#e2e8f0"; ctx.lineWidth = 0.8; ctx.stroke();
    }
    const show = Math.min(p2.disks, 10), sp = 4, tOff = (show-1)*sp;
    for (let d = show-1; d >= 0; d--) {
      const ox = d*sp*0.5-tOff*0.25, oy = d*sp*0.3-tOff*0.15;
      ctx.save(); ctx.translate(cx+ox, cy+oy);
      ctx.rotate(angleRef.current + (d%2===0?0:Math.PI/p2.disks));
      if (d === 0) { ctx.shadowColor = fl2.color+"60"; ctx.shadowBlur = 16; }
      ctx.beginPath(); ctx.arc(0, 0, Rpx, 0, Math.PI*2);
      const dg = ctx.createRadialGradient(-Rpx*0.2, -Rpx*0.2, 0, 0, 0, Rpx);
      dg.addColorStop(0, d===0?"#ffffff":"#f1f5f9");
      dg.addColorStop(0.7, d===0?"#e0e7ff":"#e2e8f0");
      dg.addColorStop(1, d===0?"#c7d2fe":"#cbd5e1");
      ctx.fillStyle = dg; ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = d===0 ? fl2.color : "#cbd5e1";
      ctx.lineWidth = d===0 ? 2 : 0.8; ctx.stroke();
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath(); ctx.arc(0, 0, Rpx*(0.22+i*0.15), 0, Math.PI*2);
        ctx.strokeStyle = d===0 ? fl2.color+"22" : "#e2e8f0";
        ctx.lineWidth = 0.5; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, Rpx*0.13, 0, Math.PI*2);
      const hg = ctx.createRadialGradient(0,0,0,0,0,Rpx*0.13);
      hg.addColorStop(0, fl2.color+"cc"); hg.addColorStop(1, fl2.color+"44");
      ctx.fillStyle = hg; ctx.fill();
      ctx.strokeStyle = fl2.color; ctx.lineWidth = 1; ctx.stroke();
      for (let s = 0; s < 6; s++) {
        const a = (s/6)*Math.PI*2;
        ctx.beginPath(); ctx.arc(Math.cos(a)*Rpx*0.27, Math.sin(a)*Rpx*0.27, Rpx*0.032, 0, Math.PI*2);
        ctx.fillStyle = "#94a3b8"; ctx.fill();
      }
      ctx.restore();
    }
    const nA = -0.28, nx = cx+Math.cos(nA)*Rpx*1.18, ny = cy+Math.sin(nA)*Rpx*1.18;
    ctx.save(); ctx.translate(nx, ny); ctx.rotate(nA+Math.PI*0.5);
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath(); ctx.moveTo(0,-10); ctx.lineTo(-5,3); ctx.lineTo(5,3); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.font = "10px system-ui"; ctx.fillStyle = "#f59e0b"; ctx.fillText("bico", nx+6, ny+3);
    ctx.fillStyle = "#10b981"; ctx.fillText("saída", cx+Rpx*0.15, cy+4);
    ctx.font = "bold 11px monospace"; ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center"; ctx.fillText(`${p2.rpm} RPM`, cx, cy-Rpx-8); ctx.textAlign = "left";
    frameRef.current++;
    if (p2.running && frameRef.current%3===0 && ptsRef.current.length<80)
      ptsRef.current.push(makeParticle((p2.diam/2)/1000));
    const scale = Rpx/((p2.diam/2)/1000);
    ptsRef.current = ptsRef.current.filter(pt => {
      pt.r -= (p2.diam/2)/1000*0.0025;
      pt.theta += (p2.rpm/60/60)*Math.PI*2*0.4+pt.speed; pt.life++;
      let al = 0.85;
      if (pt.life<10) al=pt.life/10*0.85; else if (pt.life>pt.maxLife-12) al=(pt.maxLife-pt.life)/12*0.85;
      ctx.save(); ctx.globalAlpha=al;
      ctx.beginPath(); ctx.arc(cx+pt.r*scale*Math.cos(pt.theta), cy+pt.r*scale*Math.sin(pt.theta), 3, 0, Math.PI*2);
      ctx.fillStyle = fl2.color; ctx.fill(); ctx.restore();
      return pt.r>(p2.diam/2)/1000*0.12 && pt.life<pt.maxLife;
    });
    if (p2.running) angleRef.current += (p2.rpm/60/60)*Math.PI*2*0.5;
    animRef.current = requestAnimationFrame(drawFrame);
  }, []);

  useEffect(() => { animRef.current = requestAnimationFrame(drawFrame); return () => cancelAnimationFrame(animRef.current); }, [drawFrame]);
  useEffect(() => {
    const c = canvasRef.current;
    const wrap = canvasWrapRef.current;
    if (!c || !wrap) return;
    let timer = null;
    const applySize = () => {
      const sz = Math.min(wrap.clientWidth, 380);
      if (c.width !== sz || c.height !== sz) {
        c.width = sz;
        c.height = sz;
      }
    };
    applySize();
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target !== wrap) continue;
        clearTimeout(timer);
        timer = setTimeout(applySize, 100);
      }
    });
    ro.observe(wrap);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  const reColor = { laminar:"#10b981", transicional:"#f59e0b", turbulento:"#ef4444" }[res.regime];
  const reLabel = { laminar:"Laminar ✓", transicional:"Transicional", turbulento:"Turbulento ✗" }[res.regime];

  const maxLoss = Math.max(...Object.values(res.losses).slice(0,5), 0.001);
  const lossItems = [
    { label:"Dissipação viscosa", v:res.losses.visc, c:"#f97316" },
    { label:"En. cinética (Δv)",  v:res.losses.cin,  c:"#6366f1" },
    { label:"Saída axial",        v:res.losses.ax,   c:"#8b5cf6" },
    { label:"Atrito mancais",     v:res.losses.mec,  c:"#94a3b8" },
    { label:"Vazamento carcaça",  v:res.losses.vaz,  c:"#ec4899" },
  ];

  const card = (extra={}) => ({
    background:"#ffffff", border:"1px solid #e2e8f0",
    borderRadius:12, padding:"14px 16px", ...extra
  });

  return (
    <div style={{ minHeight:"100vh", width:"100%", background:"#f1f5f9",
      color:"#1e293b", fontFamily:"system-ui,-apple-system,sans-serif" }}>

      <div style={{ background:"#ffffff", borderBottom:"1px solid #e2e8f0",
        padding:"0 24px", display:"flex", alignItems:"center", height:56, gap:16 }}>
        <div style={{ width:32, height:32, borderRadius:8, background:fl.color,
          display:"flex", alignItems:"center", justifyContent:"center",
          color:"#fff", fontWeight:700, fontSize:16, flexShrink:0 }}>T</div>
        <div>
          <div style={{ fontWeight:700, fontSize:15, lineHeight:1.2 }}>Turbina de Tesla</div>
          <div style={{ fontSize:11, color:"#94a3b8" }}>FOOT Prática · PUC-Campinas · Rice 1991</div>
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <button onClick={() => setRunning(r=>!r)}
            style={{ padding:"6px 14px", borderRadius:8, fontSize:13, fontWeight:600,
              cursor:"pointer", background: running ? "#fef3c7" : "#f0fdf4",
              border:`1.5px solid ${running?"#f59e0b":"#10b981"}`,
              color: running ? "#d97706" : "#059669" }}>
            {running ? "⏸ Pausar" : "▶ Iniciar"}
          </button>
          <div style={{ padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:700,
            background: res.modo==="MOTOR" ? "#f0fdf4" : "#fff1f2",
            border:`1.5px solid ${res.modo==="MOTOR"?"#10b981":"#ef4444"}`,
            color: res.modo==="MOTOR" ? "#059669" : "#ef4444" }}>
            {res.modo}
          </div>
        </div>
      </div>

      <div style={{ background:"#ffffff", borderBottom:"1px solid #e2e8f0",
        padding:"10px 24px", display:"grid",
        gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:0 }}>
        {[
          { label:"P entrada",   val:f(res.P_in,1),  unit:"W",   c:fl.color,  bg:fl.color+"12" },
          { label:"P saída",     val:f(res.P_out,2), unit:"W",   c:"#10b981", bg:"#f0fdf4" },
          { label:"Eficiência",  val:f(res.eta,1),   unit:"%",   c: res.etaLimitado ? "#f59e0b" : "#8b5cf6", bg: res.etaLimitado ? "#fef3c7" : "#faf5ff" },
          { label:"Reynolds",    val:fi(res.Re),     unit:"",    c:reColor,   bg:reColor+"12" },
          { label:"F arrasto",   val:f(res.fDrag,3), unit:"N",   c:"#f97316", bg:"#fff7ed" },
          { label:"Torque",      val:f(res.torque,4),unit:"N·m", c:"#64748b", bg:"#f8fafc" },
        ].map(s => (
          <div key={s.label} style={{ padding:"8px 16px", borderRight:"1px solid #f1f5f9",
            background:s.bg, display:"flex", flexDirection:"column", gap:2 }}>
            <div style={{ fontSize:10, color:"#94a3b8", fontWeight:500, textTransform:"uppercase", letterSpacing:"0.05em" }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:700, fontFamily:"monospace", color:s.c, lineHeight:1 }}>
              {s.val} <span style={{ fontSize:11, color:"#94a3b8", fontWeight:400 }}>{s.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        background:"#fef3c7", borderBottom:"1px solid #f59e0b40",
        padding: res.etaLimitado ? "8px 24px" : "0 24px",
        display:"flex", alignItems:"center", gap:10,
        maxHeight: res.etaLimitado ? 80 : 0,
        opacity: res.etaLimitado ? 1 : 0,
        overflow:"hidden",
        transition:"max-height 0.2s ease, opacity 0.15s ease, padding 0.2s ease",
        pointerEvents: res.etaLimitado ? "auto" : "none",
      }}>
        <span style={{ fontSize:16 }}>⚠</span>
        <span style={{ fontSize:12, color:"#92400e" }}>
          <strong>Parâmetros fora do regime experimental:</strong> o modelo de Couette (Rice, 1991)
          calculou η = {f(res.etaRaw, 1)}%, mas protótipos de CDs não excedem ~30%
          (Capata & Calabria, 2026). Eficiência limitada a {ETA_MAX_PROTOTIPO}%.
          Ajuste a combinação de parâmetros para um ponto de operação mais realista.
        </span>
      </div>

      <div style={{ padding:"20px 24px", display:"grid",
        gridTemplateColumns:"1fr 340px", gap:20, maxWidth:1400, margin:"0 auto" }}>

        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          <div style={{ ...card(), display:"flex", flexDirection:"column", gap:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div>
                <div style={{ fontWeight:600, fontSize:14 }}>Visualização do Escoamento</div>
                <div style={{ fontSize:12, color:"#94a3b8" }}>Fluido: {fl.label} · entrada tangencial pelo bico</div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                <div style={{ padding:"4px 10px", borderRadius:6, fontSize:11, fontWeight:600,
                  background:reColor+"15", color:reColor, border:`1px solid ${reColor}40` }}>
                  Re = {fi(res.Re)} · {reLabel}
                </div>
                {res.modeloCouetteExtrapolado && (
                  <div style={{ fontSize:10, color:"#ef4444", background:"#fff1f2",
                    padding:"2px 8px", borderRadius:4, border:"1px solid #ef444440" }}>
                    ⚠ cap de energia 1ª lei ativo
                  </div>
                )}
              </div>
            </div>
            <div ref={canvasWrapRef} style={{ overflow:"hidden" }}>
              <canvas ref={canvasRef} style={{ borderRadius:8, background:"#f8fafc", width:"100%", height:"auto", display:"block" }} />
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>

            <div style={card()}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>Eficiência × RPM</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8 }}>Ponto atual em laranja</div>
              <MiniChart data={chartRPM} xKey="rpm" yKey="eta" xLabel="RPM" yLabel="η (%)" color={fl.color} curX={rpm} />
            </div>

            <div style={card()}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>P entrada vs P saída × RPM</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8 }}>Comparação de potências</div>
              <DualChart data={chartPotRPM} xKey="rpm" y1Key="P_in" y2Key="P_out"
                xLabel="RPM" yLabel="W" color1="#6366f1" color2="#10b981"
                label1="P entrada" label2="P saída" curX={rpm} />
            </div>

            <div style={card()}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>P entrada vs P saída × Pressão</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8 }}>Influência de ΔP</div>
              <DualChart data={chartPotPres} xKey="pres" y1Key="P_in" y2Key="P_out"
                xLabel="bar" yLabel="W" color1="#6366f1" color2="#10b981"
                label1="P entrada" label2="P saída" curX={pres} />
            </div>

            <div style={card()}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>Eficiência × Pressão</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8 }}>η varia inversamente com ΔP</div>
              <MiniChart data={chartPotPres} xKey="pres" yKey="eta" xLabel="bar" yLabel="η (%)" color="#f97316" curX={pres} />
            </div>

            <div style={card()}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>P entrada vs P saída × Gap</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8 }}>Influência do espaçamento</div>
              <DualChart data={chartPotGap} xKey="gap" y1Key="P_in" y2Key="P_out"
                xLabel="mm" yLabel="W" color1="#6366f1" color2="#10b981"
                label1="P entrada" label2="P saída" curX={gap} />
            </div>

            <div style={card()}>
              <div style={{ fontWeight:600, fontSize:13, marginBottom:2 }}>Eficiência × Nº de Discos</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginBottom:8 }}>Configuração atual destacada</div>
              <MiniChart data={chartDiscos} xKey="d" yKey="eta" xLabel="Discos" yLabel="η (%)" color="#8b5cf6" curX={disks} />
            </div>

          </div>

          <div style={card()}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:12 }}>Balanço de Perdas Energéticas</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {lossItems.map(it => (
                  <div key={it.label} style={{ display:"flex", flexDirection:"column", gap:3 }}>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ fontSize:12, color:"#64748b", display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ width:8, height:8, borderRadius:2, background:it.c, display:"inline-block" }} />
                        {it.label}
                      </span>
                      <span style={{ fontSize:12, fontFamily:"monospace", fontWeight:600, color:it.c }}>
                        {f(it.v,2)} W
                      </span>
                    </div>
                    <div style={{ height:4, borderRadius:2, background:"#f1f5f9", overflow:"hidden" }}>
                      <div style={{ height:"100%", borderRadius:2, background:it.c, opacity:0.75,
                        width:`${Math.min(it.v/maxLoss*100,100).toFixed(1)}%`, transition:"width 0.3s" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ background:"#f8fafc", borderRadius:10, padding:14, display:"flex",
                flexDirection:"column", justifyContent:"center", gap:8 }}>
                {[
                  ["P entrada",    res.P_in,        fl.color],
                  ["P saída útil", res.P_out,       "#10b981"],
                  ["Perdas totais",res.losses.total, "#ef4444"],
                ].map(([lbl,val,c]) => (
                  <div key={lbl} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"6px 0", borderBottom:"1px solid #e2e8f0" }}>
                    <span style={{ fontSize:12, color:"#64748b" }}>{lbl}</span>
                    <span style={{ fontSize:15, fontFamily:"monospace", fontWeight:700, color:c }}>{f(val,2)} W</span>
                  </div>
                ))}
                <div style={{ marginTop:4, padding:"8px 10px",
                  background: res.etaLimitado ? "#fef3c7" : fl.color+"12",
                  borderRadius:8, border:`1px solid ${res.etaLimitado ? "#f59e0b" : fl.color}30` }}>
                  <div style={{ fontSize:10, color:"#94a3b8" }}>
                    EFICIÊNCIA GLOBAL {res.etaLimitado ? `(cap ${ETA_MAX_PROTOTIPO}%)` : ""}
                  </div>
                  <div style={{ fontSize:28, fontWeight:700,
                    color: res.etaLimitado ? "#d97706" : fl.color, fontFamily:"monospace" }}>
                    {f(res.eta,1)}<span style={{ fontSize:14 }}>%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div style={card()}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:14 }}>Parâmetros</div>
            <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
              <ParamInput label="Diâmetro do disco"  id="diam"  value={diam}  min={80}  max={300}  step={5}   unit="mm"     onChange={setDiam}  />
              <ParamInput label="Nº de discos"        id="disks" value={disks} min={2}   max={12}   step={1}   unit="discos" onChange={setDisks} hint="máx 12" />
              <ParamInput label="Espaçamento (e)"     id="gap"   value={gap}   min={1.0} max={5}    step={0.5} unit="mm"     onChange={setGap}   hint="mín 1.0 mm" />
              <ParamInput label="Diâmetro do bico"    id="bico"  value={bico}  min={2.5} max={8}    step={0.5} unit="mm"     onChange={setBico}  hint="mín 2.5 mm" />
              <ParamInput label="RPM medido"           id="rpm"   value={rpm}   min={100} max={3000} step={1}   unit="rpm"    onChange={setRpm}   hint="máx 3000" />
              <ParamInput label="Pressão de entrada"  id="pres"  value={pres}  min={1.5} max={6}    step={0.5} unit="bar"    onChange={setPres}  hint="mín 1.5 bar" />
              <ParamInput label="Vazão medida (Q)"    id="flow"  value={flow}  min={1.0} max={20}   step={0.5} unit="L/min"  onChange={setFlow}  />
            </div>
            <div style={{ marginTop:12, padding:"8px 10px", background:"#f8fafc",
              borderRadius:8, fontSize:11, color:"#94a3b8", lineHeight:1.6 }}>
              Clique no número para editar · ↑↓ para incrementar
            </div>
          </div>

          <div style={card()}>
            <div style={{ fontWeight:600, fontSize:14, marginBottom:12 }}>Resultados</div>
            <div style={{ display:"flex", flexDirection:"column" }}>
              {[
                ["v_in (bico)",       f(res.vIn,2)+" m/s",    fl.color],
                ["v_tip (borda)",     f(res.vtip,2)+" m/s",   "#64748b"],
                ["Força de arrasto",  f(res.fDrag,5)+" N",    "#f97316"],
                ["Torque",            f(res.torque,5)+" N·m", "#64748b"],
                ["P_in = ΔP·Q+½ρQv²",f(res.P_in,2)+" W",    fl.color],
                ["P_out = τ·ω",      f(res.P_out,3)+" W",    "#10b981"],
                ["Reynolds",          fi(res.Re),             reColor],
                ["η modelo (Rice)",  f(res.etaRaw,1)+" %",   "#94a3b8"],
                ["η efetiva",        f(res.eta,1)+" %",       res.etaLimitado ? "#d97706" : "#8b5cf6"],
              ].map(([lbl,val,c]) => (
                <div key={lbl} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
                  padding:"7px 0", borderBottom:"1px solid #f1f5f9" }}>
                  <span style={{ fontSize:12, color:"#64748b" }}>{lbl}</span>
                  <span style={{ fontSize:13, fontFamily:"monospace", fontWeight:600, color:c }}>{val}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop:10, fontSize:10, color:"#cbd5e1", lineHeight:1.6 }}>
              {fl.label} · ρ={fl.rho} kg/m³ · μ={fl.mu.toExponential(2)} Pa·s
              · cap={ETA_MAX_PROTOTIPO}%
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign:"center", padding:"12px", fontSize:11, color:"#cbd5e1",
        borderTop:"1px solid #e2e8f0", background:"#fff" }}>
        Modelo: Rice (1991) · integração numérica · vórtice livre · FOOT Prática PUC-Campinas 2026
      </div>
    </div>
  );
}