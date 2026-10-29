import { fragment, vertex } from './shaders';
import type { Gesture, Hand, Settings, Point } from '../core/types';
import { EFFECTS } from '../core/effects';
import { mirrorPoint, center, signedArea } from '../core/geometry';
import { TIP_IDS, FINGER_SHORT } from '../core/types';

const LINKS = [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
export class PortalRenderer {
  readonly gpu: boolean;
  private gpuCanvas = document.createElement('canvas');
  private gl: WebGL2RenderingContext | null;
  private program?: WebGLProgram;
  private texture?: WebGLTexture;
  private locations = new Map<string, WebGLUniformLocation | null>();
  private ctx: CanvasRenderingContext2D;
  private lost = false;
  constructor(private canvas: HTMLCanvasElement, onContextLoss: () => void) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.gl = this.gpuCanvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    this.gpu = !!this.gl;
    if (!this.gl) return;
    const gl = this.gl;
    try {
    const shader = (type: number, source: string) => {
      const sh = gl.createShader(type)!; gl.shaderSource(sh, source); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'Shader compilation failed');
      return sh;
    };
    const vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment);
    const program = gl.createProgram()!; gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'GPU initialization failed');
    this.program = program; gl.useProgram(program);
    this.texture = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.gpuCanvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; onContextLoss(); });
    } catch (error) {
      console.warn('WebGL effects unavailable; using reduced Canvas rendering.', error);
      gl.getExtension('WEBGL_lose_context')?.loseContext(); this.gl=null; this.gpu=false;
    }
  }
  private uniform(name: string) {
    if (!this.locations.has(name)) this.locations.set(name, this.gl!.getUniformLocation(this.program!, name));
    return this.locations.get(name)!;
  }
  resize(width: number) {
    if (this.canvas.width === width && this.gpuCanvas.width === width) return;
    this.canvas.width = this.gpuCanvas.width = width;
    this.canvas.height = this.gpuCanvas.height = Math.round(width * 9 / 16);
  }
  render(source: HTMLVideoElement | HTMLCanvasElement, gestures: Gesture[], hands: Hand[], settings: Settings, time: number, mirror: boolean) {
    const { width: w, height: h } = this.canvas, ctx = this.ctx;
    const sourceW = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const sourceH = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if (!sourceW || !sourceH) return;
    const crop = sourceW/sourceH > w/h ? [w/h/(sourceW/sourceH),1] : [1,(sourceW/sourceH)/(w/h)];
    const active = gestures.filter(g => g.opacity > 0 && (g.points.length >= 3 && g.points.length <= 4 && Math.abs(signedArea(g.points)) > .00002)).slice(0,2);
    const transform = (p: Point) => mirrorPoint(p, mirror);
    const pointsOf = (g: Gesture) => {
      const c = g.state === 'OPENING' ? g.origin : center(g.points);
      const amount = g.state === 'CLOSING' ? g.opacity : g.state === 'OPENING' ? .3+.7*g.opacity : 1;
      return g.points.map(p => transform({ ...p, x: c.x+(p.x-c.x)*amount, y:c.y+(p.y-c.y)*amount }));
    };
    if (this.gl && !this.lost) {
      const gl = this.gl;
      gl.viewport(0,0,w,h); gl.useProgram(this.program!); gl.bindTexture(gl.TEXTURE_2D,this.texture!);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      gl.uniform2f(this.uniform('uResolution'),w,h); gl.uniform2f(this.uniform('uCrop'),crop[0],crop[1]);
      gl.uniform1i(this.uniform('uCamera'),0); gl.uniform1i(this.uniform('uMirror'),mirror ? 1 : 0);
      gl.uniform1f(this.uniform('uTime'),time*.001*settings.speed);
      for (const [name,value] of Object.entries({ uIntensity:settings.intensity,uGlow:settings.glow,uFeather:settings.feather,uParticles:settings.particles })) gl.uniform1f(this.uniform(name),value);
      const points = new Float32Array(16), colors = new Float32Array(6), counts = new Int32Array(2), ids = new Int32Array(2), alphas = new Float32Array(2);
      active.forEach((g,i) => {
        pointsOf(g).forEach((p,j) => { points[i*8+j*2]=p.x; points[i*8+j*2+1]=p.y; });
        counts[i]=g.points.length; ids[i]=g.effect; alphas[i]=g.opacity;
        const color = EFFECTS[g.effect].color;
        for (let k=0;k<3;k++) colors[i*3+k]=parseInt(color.slice(1+k*2,3+k*2),16)/255;
      });
      gl.uniform2fv(this.uniform('uPoints[0]'),points); gl.uniform3fv(this.uniform('uColors[0]'),colors);
      gl.uniform1iv(this.uniform('uCounts[0]'),counts); gl.uniform1iv(this.uniform('uEffects[0]'),ids); gl.uniform1fv(this.uniform('uAlphas[0]'),alphas);
      gl.drawArrays(gl.TRIANGLES,0,3); ctx.drawImage(this.gpuCanvas,0,0);
    } else {
      // Reduced Canvas fallback: still respects polygon clipping and camera mirroring.
      ctx.save(); if (mirror) { ctx.translate(w,0); ctx.scale(-1,1); }
      const sw=sourceW*crop[0], sh=sourceH*crop[1];
      ctx.drawImage(source,(sourceW-sw)/2,(sourceH-sh)/2,sw,sh,0,0,w,h); ctx.restore();
      for (const g of active) {
        const ps=pointsOf(g); ctx.save(); ctx.globalAlpha=g.opacity*settings.intensity;
        ctx.beginPath(); ps.forEach((p,i)=>i ? ctx.lineTo(p.x*w,p.y*h) : ctx.moveTo(p.x*w,p.y*h));
        if(ps.length>2) {
          ctx.closePath(); ctx.save(); ctx.clip();
          ctx.filter=g.effect===10 ? 'grayscale(1) contrast(1.6)' : g.effect===15 ? 'invert(1) hue-rotate(180deg)' : `saturate(2.7) hue-rotate(${g.effect*31+time*.02}deg)`;
          if(mirror) {ctx.translate(w,0);ctx.scale(-1,1);}
          ctx.drawImage(source,(sourceW-sw)/2,(sourceH-sh)/2,sw,sh,0,0,w,h); ctx.restore();
        }
        ctx.strokeStyle=EFFECTS[g.effect].color;ctx.shadowColor=ctx.strokeStyle;ctx.shadowBlur=16*settings.glow;ctx.lineWidth=1.5;ctx.stroke();ctx.restore();
      }
    }
    ctx.save();
    for (const hand of hands) {
      const g = gestures.find(g=>g.handIds.includes(hand.id)), hot = g?.state==='ARMED' || g?.state==='ACTIVE';
      const ordinal = [...hands].sort((a,b)=>a.id-b.id).findIndex(h=>h.id===hand.id)+1;
      if (settings.skeleton) {
        ctx.strokeStyle='rgba(210,240,220,.25)';ctx.lineWidth=.8;
        for (const chain of LINKS) {ctx.beginPath();chain.forEach((id,i)=>{const p=transform(hand.landmarks[id]);i ? ctx.lineTo(p.x*w,p.y*h):ctx.moveTo(p.x*w,p.y*h);});ctx.stroke();}
      }
      if(settings.markers) TIP_IDS.forEach((id,f)=>{
        const p=transform(hand.landmarks[id]);
        const selected = hot && g?.members.some(m=>m.handId===hand.id && m.finger===f);
        ctx.beginPath();ctx.arc(p.x*w,p.y*h,selected ? 3.5 : 2.5,0,Math.PI*2);ctx.fillStyle=selected ? '#c3f87d':'#e4f1ee';
        ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;
        ctx.font=`${Math.max(9,w/105)}px monospace`;ctx.fillStyle='rgba(225,240,232,.7)';ctx.fillText(`${hands.length>1 ? `H${ordinal}·` : ''}${FINGER_SHORT[f]}`,p.x*w+8,p.y*h-7);
      });
    }
    ctx.restore();
  }
  dispose() {
    if(this.gl) { this.gl.deleteTexture(this.texture!);this.gl.deleteProgram(this.program!);this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  }
}
