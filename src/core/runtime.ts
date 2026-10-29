import { GestureEngine } from './gestures';
import { Simulator, drawSimulator } from './simulator';
import { PortalRenderer } from '../render/renderer';
import { HandIdentityTracker } from '../tracking/identity';
import type { Settings, Gesture, Hand, Point } from './types';
export type RuntimeStatus={mode:'idle'|'camera'|'simulator';busy:boolean;error:string;notice:string;fps:number;trackingFps:number;hands:Hand[];gestures:Gesture[];gpu:boolean;quality:string};
export class PortalRuntime {
  readonly engine=new GestureEngine();
  readonly simulator=new Simulator();
  readonly renderer: PortalRenderer;
  readonly video=document.createElement('video');
  private identity=new HandIdentityTracker();
  private source=document.createElement('canvas');
  private worker?:Worker;
  private stream?:MediaStream;
  private frame=0;
  private session=0;
  private inflight=false;
  private ready=false;
  private hands:Hand[]=[];
  private lastDetection=0;
  private lastVideoTime=-1;
  private lastInference=0;
  private lastUi=0;
  private fpsStart=performance.now();
  private frames=0;
  private fps=0;
  private trackingFps=0;
  private autoWidth=1280;
  private disposed=false;
  status:RuntimeStatus={mode:'idle',busy:false,error:'',notice:'',fps:0,trackingFps:0,hands:[],gestures:[],gpu:false,quality:'high'};
  constructor(readonly canvas:HTMLCanvasElement,public settings:Settings,private notify:(status:RuntimeStatus)=>void) {
    this.renderer=new PortalRenderer(canvas,()=>{if(!this.disposed){this.status.notice='WebGL was interrupted. Reduced Canvas rendering is active. Restart the camera to retry.';}});
    this.status.gpu=this.renderer.gpu;
    if(!this.renderer.gpu)this.status.notice='WebGL2 unavailable: reduced Canvas effects are active.';
    this.source.width=960;this.source.height=540;
    this.video.muted=true;this.video.playsInline=true;
    document.addEventListener('visibilitychange',this.visibility);
    this.frame=requestAnimationFrame(this.tick);
  }
  private visibility=()=>{this.clear();this.hands=[];this.lastVideoTime=-1;};
  private emit() {this.notify({...this.status});}
  private release() {
    this.session++;this.worker?.terminate();this.worker=undefined;
    this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=undefined;
    this.video.pause();this.video.srcObject=null;this.ready=false;this.inflight=false;
    this.hands=[];this.identity.reset();this.engine.clear();this.lastVideoTime=-1;
  }
  stop() {this.release();this.status.mode='idle';this.status.busy=false;this.emit();}
  clear() {this.engine.clear();if(this.status.mode==='simulator')this.simulator.close();}
  simulate() {this.release();this.status.mode='simulator';this.status.error='';this.status.busy=false;this.simulator.gather(performance.now(),this.settings.activationDelay);this.emit();}
  async startCamera() {
    this.release();const session=this.session;
    this.status={...this.status,mode:'idle',error:'',busy:true};this.emit();
    try {
      if(!window.isSecureContext) throw new Error('The camera needs localhost or HTTPS. Open the app using npm run dev.');
      if(!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support webcam capture. Use a current Chrome or Edge browser.');
      const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:'user',frameRate:{ideal:30}},audio:false});
      if(session!==this.session){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;this.video.srcObject=stream;await this.video.play();
      if(session!==this.session)return;
      stream.getVideoTracks()[0].onended=()=>{this.stop();this.status.error='The camera disconnected. Reconnect it and start again.';this.emit();};
      this.worker=new Worker('/hand-worker.js');
      this.worker.onerror=()=>{if(session===this.session){this.status.busy=false;this.status.error='The tracking worker could not load. Restart the camera or check the local model files.';this.emit();}};
      this.worker.onmessage=event=>{
        if(session!==this.session)return;
        const data=event.data;
        if(data.type==='ready'){this.ready=true;this.status.busy=false;if(data.delegate==='CPU')this.status.notice='Hand tracking uses the CPU fallback; rendering stays on the GPU.';this.emit();}
        if(data.type==='error'){this.inflight=false;this.ready=false;this.hands=[];this.status.busy=false;this.status.error=data.message;this.emit();}
        if(data.type==='result') {
          this.inflight=false;
          const detectedAt=performance.now();
          const measured=this.lastDetection ? Math.min(30,1000/Math.max(1,detectedAt-this.lastDetection)) : 0;
          this.trackingFps=this.trackingFps ? this.trackingFps*.7+measured*.3 : measured;
          this.lastDetection=detectedAt;
          const srcAspect=this.video.videoWidth/this.video.videoHeight,aspect=16/9;
          const crop=srcAspect>aspect ? [aspect/srcAspect,1] : [1,srcAspect/aspect];
          const detections=(data.landmarks as Point[][]).map((lm,i)=>({
            landmarks:lm.map(p=>({...p,x:(p.x-.5)/crop[0]+.5,y:(p.y-.5)/crop[1]+.5})),
            handedness:data.handedness[i]?.[0]?.categoryName??'Unknown',confidence:data.handedness[i]?.[0]?.score??0,
          }));
          this.hands=this.identity.update(detections,this.lastDetection,this.settings.smoothing,aspect);
        }
      };
      this.worker.postMessage({type:'init',origin:location.origin});
      this.status.mode='camera';this.emit();
    } catch(error) {
      if(session!==this.session)return;
      this.release();this.status.mode='idle';this.status.busy=false;
      const name=(error as DOMException).name;
      this.status.error=name==='NotAllowedError' ? 'Camera access was denied. Allow camera access in your browser’s site settings, then try again.' : name==='NotFoundError' ? 'No camera was found. Connect a webcam, or explore the simulator.' : name==='NotReadableError' ? 'The camera is busy. Close other apps using it, then try again.' : String((error as Error).message??error);
      this.emit();
    }
  }
  private tick=(now:number)=>{
    if(this.disposed)return;
    this.frame=requestAnimationFrame(this.tick);
    if(document.hidden)return;
    const s=this.settings;
    const width=s.quality==='auto' ? this.autoWidth : s.quality==='high' ? 1280 : s.quality==='medium' ? 960 : 640;
    this.renderer.resize(width);this.status.quality=width===1280?'high':width===960?'medium':'low';
    let hands:Hand[]=[];
    if(this.status.mode==='simulator' && s.tracking) hands=this.simulator.hands(now);
    if(this.status.mode==='camera' && s.tracking) {
      if(now-this.lastDetection<200)hands=this.hands;
      if(this.ready && !this.inflight && this.video.readyState>=2 && now-this.lastInference>=33 && this.video.currentTime!==this.lastVideoTime) {
        this.inflight=true;this.lastInference=now;this.lastVideoTime=this.video.currentTime;
        const session=this.session;
        createImageBitmap(this.video).then(bitmap=>{
          if(session!==this.session || !this.worker || !this.settings.tracking){bitmap.close();this.inflight=false;return;}
          this.worker.postMessage({type:'frame',bitmap,timestamp:now},[bitmap]);
        }).catch(()=>{this.inflight=false;});
      }
    }
    const gestures=this.engine.update(hands,now,s);
    if(this.status.mode!=='camera')drawSimulator(this.source.getContext('2d')!,now);
    this.renderer.render(this.status.mode==='camera' ? this.video : this.source,gestures,hands,s,now,this.status.mode==='camera'&&s.mirror);
    this.frames++;
    if(now-this.fpsStart>1000) {
      this.fps=Math.round(this.frames*1000/(now-this.fpsStart));this.frames=0;this.fpsStart=now;
      if(s.quality==='auto' && this.fps<26 && this.autoWidth>640)this.autoWidth=this.autoWidth===1280 ? 960 : 640;
    }
    if(now-this.lastUi>160) {
      this.lastUi=now;this.status={...this.status,fps:this.fps,trackingFps:s.tracking&&now-this.lastDetection<500?Math.round(this.trackingFps):0,hands,gestures:gestures.map(g=>({...g}))};this.emit();
    }
  };
  dispose() {this.disposed=true;this.release();cancelAnimationFrame(this.frame);document.removeEventListener('visibilitychange',this.visibility);this.renderer.dispose();}
}
