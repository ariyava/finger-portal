import { useEffect, useRef, useState } from 'react';
import { Aperture, ArrowUpRight, Camera, Check, ChevronRight, Circle, CircleDot, FlipHorizontal, Hand as HandIcon, HelpCircle, Maximize, MousePointer2, Play, RotateCcw, ScanLine, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Square, Triangle, X } from 'lucide-react';
import { EFFECTS, FILTER_EFFECTS, combinations, comboKey, sharedKey, sharedEffect } from './core/effects';
import { FINGER_NAMES, FINGER_SHORT, TIP_IDS } from './core/types';
import type { Finger, FingerRef, GestureScope, Settings } from './core/types';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './core/settings';
import { PortalRuntime } from './core/runtime';
import type { RuntimeStatus } from './core/runtime';
import { PhotoTimer } from './core/photo-timer';
import { screenshot, startRecording } from './core/capture';

const INITIAL:RuntimeStatus={mode:'idle',busy:false,error:'',notice:'',fps:0,trackingFps:0,hands:[],gestures:[],gpu:false,quality:'high'};
type Modal='settings'|'mappings'|'guide'|null;
const SLIDERS:{key:keyof Settings;label:string;min:number;max:number;step:number;format:(v:number)=>string}[]=[
  {key:'sensitivity',label:'Gesture sensitivity',min:.6,max:1.6,step:.05,format:v=>`${v.toFixed(2)}×`},
  {key:'contactDistance',label:'Fingertip contact distance',min:.12,max:.65,step:.01,format:v=>`${v.toFixed(2)} palms`},
  {key:'activationDelay',label:'Hold to arm',min:100,max:1000,step:20,format:v=>`${v} ms`},
  {key:'releaseSensitivity',label:'Closing threshold',min:1,max:1.7,step:.05,format:v=>`${v.toFixed(2)}×`},
  {key:'intensity',label:'Effect intensity',min:0,max:1,step:.01,format:v=>`${Math.round(v*100)}%`},
  {key:'glow',label:'Edge glow',min:0,max:1.5,step:.01,format:v=>`${Math.round(v*100)}%`},
  {key:'feather',label:'Boundary feathering',min:.001,max:.05,step:.001,format:v=>`${Math.round(v*1000)}‰`},
  {key:'speed',label:'Animation speed',min:.1,max:2,step:.05,format:v=>`${v.toFixed(2)}×`},
  {key:'particles',label:'Particle density',min:0,max:1,step:.01,format:v=>`${Math.round(v*100)}%`},
  {key:'smoothing',label:'Tracking smoothing',min:0,max:.85,step:.01,format:v=>`${Math.round(v*100)}%`},
];
function PortalMark({small=false}:{small?:boolean}) {
  return <svg className={small?'portal-mark small':'portal-mark'} viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="m24 3 18 10.5v21L24 45 6 34.5v-21L24 3Z" stroke="currentColor" strokeWidth="1.6"/><path d="m24 11 11 6.5v13L24 37l-11-6.5v-13L24 11Z" stroke="currentColor" strokeWidth="1.4"/><path d="m24 18 5 3v6l-5 3-5-3v-6l5-3Z" fill="currentColor"/></svg>;
}
function Shape({count,color}:{count:number;color:string}) {
  return <svg viewBox="0 0 44 44" className="effect-shape" style={{color}} fill="none" aria-hidden="true">{count===3?<path d="m22 8 16 28H6L22 8Z" fill="currentColor" fillOpacity=".06" stroke="currentColor" strokeWidth="1.2"/>:<><path d="m12 9 25 5-5 23L7 30l5-21Z" fill="currentColor" fillOpacity=".06" stroke="currentColor" strokeWidth="1.2"/><path d="m12 9 20 28M37 14 7 30" stroke="currentColor" opacity=".22"/></>}</svg>;
}
function Toggle({checked,onChange,label}:{checked:boolean;onChange:()=>void;label:string}) {
  return <button type="button" className={`toggle ${checked?'on':''}`} role="switch" aria-checked={checked} aria-label={label} onClick={onChange}><span/></button>;
}
export default function App() {
  const [settings,setSettings]=useState(loadSettings);
  const [status,setStatus]=useState<RuntimeStatus>(INITIAL);
  const [count,setCount]=useState(3);
  const [previewScope,setPreviewScope]=useState<GestureScope>('single');
  const [mappingCount,setMappingCount]=useState(3);
  const [selected,setSelected]=useState<Finger[]>([0,1,3]);
  const [modal,setModal]=useState<Modal>(null);
  const [toast,setToast]=useState('');
  const [recording,setRecording]=useState(false);
  const [photoDelay,setPhotoDelay]=useState(3);
  const [photoRemaining,setPhotoRemaining]=useState(0);
  const photoTimer=useRef(new PhotoTimer());
  const [recordSeconds,setRecordSeconds]=useState(0);
  const [debugSpread,setDebugSpread]=useState(100);
  const canvas=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null);
  const runtime=useRef<PortalRuntime|null>(null),recorder=useRef<MediaRecorder|null>(null);
  const settingsRef=useRef(settings);settingsRef.current=settings;
  const dragging=useRef<FingerRef|null>(null);
  const previewMembers:FingerRef[]=count===3?[{handId:99,finger:0},{handId:99,finger:1},{handId:100,finger:1}]:[{handId:99,finger:0},{handId:99,finger:1},{handId:100,finger:0},{handId:100,finger:1}];
  const effectId=previewScope==='shared'?(status.mode==='camera'?status.gestures.find(g=>g.scope==='shared')?.effect:undefined)??sharedEffect(previewMembers,settings):settings.mappings[comboKey(selected)];
  const effect=EFFECTS[effectId];
  const running=status.mode!=='idle';
  const active=status.gestures.find(g=>g.state==='ACTIVE'||g.state==='OPENING');
  const focused=active??status.gestures[0];
  const notify=(message:string)=>setToast(message);
  const openMappings=()=>{setMappingCount(count);setModal('mappings');};

  useEffect(()=>{
    if(!canvas.current)return;
    try {runtime.current=new PortalRuntime(canvas.current,settingsRef.current,setStatus);}
    catch(error){setStatus(s=>({...s,error:`Rendering could not start: ${String(error)}`}));}
    return ()=>{if(recorder.current?.state!=='inactive')recorder.current?.stop();runtime.current?.dispose();runtime.current=null;};
  },[]);
  useEffect(()=>{
    if(runtime.current)runtime.current.settings=settings;
    if(!saveSettings(settings))setToast('Browser storage is unavailable. Settings will last for this session.');
  },[settings]);
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(''),3600);return ()=>clearTimeout(t);},[toast]);
  useEffect(()=>{
    if(!recording)return;
    const t=setInterval(()=>setRecordSeconds(s=>s+1),1000);
    return ()=>clearInterval(t);
  },[recording]);
  useEffect(()=>{if(status.mode==='idle'&&recorder.current?.state==='recording')recorder.current.stop();},[status.mode]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden&&recorder.current?.state==='recording')recorder.current.stop();};
    document.addEventListener('visibilitychange',hidden);return ()=>document.removeEventListener('visibilitychange',hidden);
  },[]);
  const patch=<K extends keyof Settings>(key:K,value:Settings[K])=>setSettings(s=>({...s,[key]:value}));
  const stopRecord=()=>{if(recorder.current?.state==='recording')recorder.current.stop();};
  const configureSimulator=(scope:GestureScope,n:number,fingers:Finger[])=>{
    if(status.mode!=='simulator')return;
    runtime.current?.engine.clear();
    if(scope==='shared')runtime.current?.simulator.selectShared(n,performance.now(),settings.activationDelay);
    else runtime.current?.simulator.select(fingers,performance.now(),settings.activationDelay);
    setDebugSpread(100);
  };
  const choose=(fingers:Finger[])=>{setSelected(fingers);setCount(fingers.length);configureSimulator('single',fingers.length,fingers);};
  const chooseCount=(n:number)=>{const fingers=combinations(n)[0];setCount(n);setSelected(fingers);configureSimulator(previewScope,n,fingers);};
  const chooseScope=(scope:GestureScope)=>{setPreviewScope(scope);configureSimulator(scope,count,selected);};
  const chooseSharedEffect=(id:number)=>{setSettings(s=>({...s,sharedAuto:false,mappings:{...s.mappings,[sharedKey(count)]:id}}));runtime.current?.engine.setSharedEffect(id,count);configureSimulator('shared',count,selected);};
  const simulate=()=>{
    stopRecord();runtime.current?.simulate();
    if(previewScope==='shared')runtime.current?.simulator.selectShared(count,performance.now(),settings.activationDelay);
    else runtime.current?.simulator.select(selected,performance.now(),settings.activationDelay);
    setDebugSpread(100);
  };
  const cameraAction=()=>{
    stopRecord();if(status.mode==='camera'||status.busy)runtime.current?.stop();else void runtime.current?.startCamera();
  };
  const cancelPhoto=()=>{photoTimer.current.cancel();setPhotoRemaining(0);};
  useEffect(()=>{photoTimer.current.cancel();setPhotoRemaining(0);},[status.mode]);
  useEffect(()=>{
    const hidden=()=>{if(document.hidden){photoTimer.current.cancel();setPhotoRemaining(0);}};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){photoTimer.current.cancel();setPhotoRemaining(0);}};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('keydown',escape);
    return ()=>{photoTimer.current.cancel();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('keydown',escape);};
  },[]);
  const capture=()=>{
    if(!running||!canvas.current)return;
    if(photoTimer.current.active){cancelPhoto();return;}
    photoTimer.current.start(photoDelay,setPhotoRemaining,()=>{
      if(canvas.current&&runtime.current?.status.mode!=='idle'&&!document.hidden){screenshot(canvas.current);notify('PNG captured. Check your downloads.');}
    });
  };
  const record=()=>{
    if(recording){stopRecord();return;}
    if(!canvas.current)return;
    try{recorder.current=startRecording(canvas.current,()=>{setRecording(false);notify('Recording saved to your downloads.');});setRecording(true);setRecordSeconds(0);}
    catch(error){notify((error as Error).message);}
  };
  const fullscreen=()=>{if(document.fullscreenElement)void document.exitFullscreen();else void stage.current?.requestFullscreen().catch(()=>notify('Fullscreen is unavailable in this browser.'));};
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if((event.target as HTMLElement).matches('input,select,textarea,button')||event.ctrlKey||event.metaKey||event.altKey)return;
      if(event.key==='Escape')setModal(null);
      if(event.code==='KeyC')runtime.current?.clear();
      if(event.code==='KeyF')fullscreen();
      if(event.code==='KeyS'&&running)capture();
    };
    window.addEventListener('keydown',key);return ()=>window.removeEventListener('keydown',key);
  },[running,photoDelay]);
  useEffect(()=>{
    if(!modal)return;
    const prev=document.activeElement as HTMLElement;
    const dialog=document.querySelector<HTMLDivElement>('[role="dialog"]');
    const elements=()=>Array.from(dialog?.querySelectorAll<HTMLElement>('button,input,select,[tabindex="0"]')??[]);
    elements()[0]?.focus();
    const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape')setModal(null);
      if(e.key==='Tab'){const els=elements(),first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    };
    document.addEventListener('keydown',key);return ()=>{document.removeEventListener('keydown',key);prev?.focus();};
  },[modal]);
  const pointer=(event:React.PointerEvent<HTMLCanvasElement>,begin=false)=>{
    if(status.mode!=='simulator'||!canvas.current||!runtime.current)return;
    const rect=canvas.current.getBoundingClientRect(),ratio=canvas.current.width/canvas.current.height;
    const width=Math.min(rect.width,rect.height*ratio),height=width/ratio;
    const box={width,height,left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2};
    const p={x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};
    if(begin){
      const sim=runtime.current.simulator;
      const hands=new Map(sim.hands(performance.now()).map(h=>[h.id,h]));
      const nearest=sim.participants.map(m=>{const p0=hands.get(m.handId)!.landmarks[TIP_IDS[m.finger]];return {m,d:Math.hypot((p0.x-p.x)*box.width,(p0.y-p.y)*box.height)};}).sort((a,b)=>a.d-b.d)[0];
      if(nearest&&nearest.d<50){dragging.current=nearest.m;canvas.current.setPointerCapture(event.pointerId);}
    }
    if(dragging.current!==null)runtime.current.simulator.drag(dragging.current.finger,{x:Math.max(.015,Math.min(.985,p.x)),y:Math.max(.015,Math.min(.985,p.y))},dragging.current.handId);
  };
  const reset=()=>{setSettings({...DEFAULT_SETTINGS,mappings:{...DEFAULT_SETTINGS.mappings}});runtime.current?.clear();notify('Default settings and all portal mappings restored.');};

  return <div className="app-shell">
    <aside className="rail" aria-label="Main navigation">
      <button className="brand-symbol" title="Finger Portal studio" onClick={()=>setModal(null)}><PortalMark small/></button>
      <div className="rail-nav">
        <button className={!modal?'rail-item selected':'rail-item'} title="Studio" onClick={()=>setModal(null)}><ScanLine size={20}/><span>Studio</span></button>
        <button className={modal==='mappings'?'rail-item selected':'rail-item'} title="Gesture mappings" onClick={openMappings}><HandIcon size={20}/><span>Gestures</span></button>
        <button className={modal==='settings'?'rail-item selected':'rail-item'} title="Settings" onClick={()=>setModal('settings')}><SlidersHorizontal size={20}/><span>Settings</span></button>
      </div>
      <button className="rail-item rail-help" title="How it works" onClick={()=>setModal('guide')}><HelpCircle size={20}/><span>Guide</span></button>
      <div className="rail-version">FP / 02</div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="wordmark">finger<span>portal</span><span className="beta">EXPERIMENTAL</span></div><div className="privacy"><ShieldCheck size={14}/><span>On your device. In your control.</span><i/></div></header>
      <main>
        <div className="page-heading"><div><div className="eyebrow"><span/> INTERACTIVE REALITY LAB</div><h1>A little space for the <em>impossible.</em></h1><p>Bring your fingertips together. Pull a new reality apart.</p></div><button className="text-button how-button" onClick={()=>setModal('guide')}>How it works <ArrowUpRight size={15}/></button></div>
        <div className="studio-layout">
          <section className="studio-column" aria-label="AR studio">
            <div className="camera-stage" ref={stage}>
              <canvas ref={canvas} width={1280} height={720} aria-label="Real-time camera and AR effects. In simulator mode, drag the fingertip markers." onPointerDown={e=>pointer(e,true)} onPointerMove={e=>pointer(e)} onPointerUp={()=>{dragging.current=null;}} onPointerCancel={()=>{dragging.current=null;}}/>
              {photoRemaining>0&&<div className="photo-countdown" role="status" aria-live="polite"><span className="photo-count">{photoRemaining}</span><span>PHOTO IN {photoRemaining} SECONDS</span><button onClick={cancelPhoto}>Cancel photo · Esc</button></div>}
              <div className="stage-grain" aria-hidden="true"/>
              <div className="stage-top"><div className={`live-pill ${running?'is-live':''}`}><span/>{status.mode==='camera'?'LIVE CAMERA':status.mode==='simulator'?'SIMULATOR':'CAMERA OFF'}</div><div className="stage-label">{status.mode==='simulator'?'SYNTHETIC LANDMARKS':status.mode==='camera'?'LOCAL PROCESSING':'YOUR REALITY, REIMAGINED'}</div></div>
              {!running&&<div className="camera-onboarding"><div className="portal-orbit"><div className="orbit o1"/><div className="orbit o2"/><div className="orbit o3"/><PortalMark/></div><div className="eyebrow">THE EXTRAORDINARY IS IN YOUR HANDS</div><h2>Open a different<br/><span>reality.</span></h2><p>Your camera. Your fingers. A whole new dimension.<br/>No downloads of frames. No cloud processing.</p><button className="primary-button start-button" disabled={status.busy} onClick={cameraAction}><Camera size={17}/>{status.busy?'Starting camera…':'Enable camera'}<ArrowUpRight size={16}/></button><button className="simulator-link" onClick={simulate}><Play size={11} fill="currentColor"/> Explore without a camera</button></div>}
              {running&&<><div className="stage-cross cross-tl"/><div className="stage-cross cross-tr"/><div className="stage-cross cross-bl"/><div className="stage-cross cross-br"/>{focused&&<div className="gesture-live"><span style={{background:EFFECTS[focused.effect].color}}/>{focused.scope==='shared'?'Two hands · ':''}{EFFECTS[focused.effect].name}<small>{focused.state.replaceAll('_',' ')}</small></div>}</>}
              <div className="stage-bottom"><span><span className={`status-dot ${running?'green':''}`}/>{status.busy?'Loading local hand model…':status.mode==='simulator'?'Drag the markers to reshape your portal':status.mode==='camera'?status.hands.length?`${status.hands.length} ${status.hands.length===1?'hand':'hands'} detected`:'Bring your hands into view':'Waiting for your hands'}</span><span>{running?`${status.fps} FPS`: 'WEBCAM → WONDER'}<button title="Toggle fullscreen (F)" aria-label="Fullscreen" onClick={fullscreen}><Maximize size={15}/></button></span></div>
            </div>
            {(status.error||status.notice)&&<div className={status.error?'notice error':'notice'} role={status.error?'alert':'status'}>{status.error||status.notice}{status.error&&<button onClick={simulate}>Use simulator <ChevronRight size={13}/></button>}</div>}
            <div className="camera-controls"><div className="controls-left"><button className={status.mode==='camera'?'camera-button active':'camera-button'} onClick={cameraAction} disabled={!runtime.current&&!!status.error}>{status.mode==='camera'||status.busy?<Square size={14}/>:<Camera size={16}/>}<span>{status.mode==='camera'||status.busy?'Stop camera':'Start camera'}</span></button><div className="control-divider"/><button className={`icon-control ${settings.mirror?'active':''}`} aria-pressed={settings.mirror} title="Mirror camera" aria-label="Mirror camera" onClick={()=>patch('mirror',!settings.mirror)}><FlipHorizontal size={17}/></button><button className={`icon-control ${settings.markers?'active':''}`} aria-pressed={settings.markers} title="Fingertip markers" aria-label="Fingertip markers" onClick={()=>patch('markers',!settings.markers)}><CircleDot size={17}/></button><button className={`icon-control ${settings.skeleton?'active':''}`} aria-pressed={settings.skeleton} title="Hand skeleton" aria-label="Hand skeleton" onClick={()=>patch('skeleton',!settings.skeleton)}><HandIcon size={17}/></button></div><div className="controls-right"><button className="icon-control" disabled={!running} title="Save screenshot (S)" aria-label="Save screenshot" onClick={capture}><Camera size={17}/></button><button className={`record-button ${recording?'recording':''}`} disabled={!running} aria-label={recording?'Stop recording':'Start recording'} title={recording?'Stop and save recording':'Record composited video'} onClick={record}>{recording?<Square size={12} fill="currentColor"/>:<Circle size={12}/>}<span>{recording?`${Math.floor(recordSeconds/60)}:${String(recordSeconds%60).padStart(2,'0')}`:'Record'}</span></button><div className="control-divider"/><button className="icon-control clear-button" title="Clear effects (C)" onClick={()=>{runtime.current?.clear();notify('Active effects cleared. Gather your fingers to start again.');}}><RotateCcw size={15}/><span>Clear</span></button></div></div>
            {running&&<div className="photo-timer-controls"><label htmlFor="photo-delay">Photo timer</label><select id="photo-delay" value={photoDelay} disabled={photoRemaining>0} onChange={e=>setPhotoDelay(+e.target.value)}><option value="0">Off · instant</option><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="10">10 seconds</option></select><button onClick={capture}><Camera size={14}/>{photoRemaining>0?'Cancel photo':photoDelay?'Take timed photo':'Take photo'}</button><span>{photoRemaining>0?`${photoRemaining}s remaining`:'Includes your AR effects'}</span></div>}
            {status.mode==='simulator'&&<div className="debug-bar"><div><MousePointer2 size={14}/><strong>Simulator</strong><span>Real gesture engine · synthetic input</span></div><label>Spread<input aria-label="Simulated fingertip spread" type="range" min="0" max="100" value={debugSpread} onChange={e=>{const value=+e.target.value;setDebugSpread(value);runtime.current?.simulator.setOpening(value/100);}}/></label><button onClick={()=>{runtime.current?.engine.clear();runtime.current?.simulator.gather(performance.now(),settings.activationDelay);setDebugSpread(100);}}>Gather & open</button><button onClick={()=>{runtime.current?.simulator.close();setDebugSpread(0);}}>Close</button><button title="Exit simulator" aria-label="Exit simulator" onClick={()=>{stopRecord();runtime.current?.stop();}}><X size={14}/></button></div>}
            <div className="instruction-strip"><div className="instruction"><div className="step-icon"><CircleDot size={17}/></div><div><span>01 / GATHER</span><p>Gather 3 or 4 fingertips</p></div></div><ChevronRight className="step-arrow" size={15}/><div className="instruction"><div className="step-icon"><Sparkles size={17}/></div><div><span>02 / HOLD</span><p>Wait for the light to arm</p></div></div><ChevronRight className="step-arrow" size={15}/><div className="instruction"><div className="step-icon"><Aperture size={17}/></div><div><span>03 / OPEN</span><p>Spread apart. Bend reality.</p></div></div></div>
            <div className="telemetry"><span><i/> {status.mode==='simulator'?'SIMULATED INPUT':status.mode==='camera'?'CAMERA CONNECTED':'SYSTEM READY'}</span><span>{status.gpu?'WEBGL 2':'CANVAS FALLBACK'}<b>·</b>{running?status.quality.toUpperCase():'ADAPTIVE QUALITY'}<b>·</b>{status.mode==='camera'?`${status.trackingFps} TRACKING FPS`:'100% LOCAL'}</span></div>
            {!!status.hands.length&&<div className="tracking-readout">{status.hands.map(h=>{const g=status.gestures.find(g=>g.handIds.includes(h.id));return <div key={h.id}><HandIcon size={12}/><span>{h.handedness==='Simulated'?'SYNTHETIC HAND':`HAND ${h.id}`}</span><strong>{g?g.members.filter(m=>m.handId===h.id).map(m=>FINGER_SHORT[m.finger]).join(' + '):'ALL 21 LANDMARKS'}</strong><span>{g?.scope==='shared'?'SHARED · ':''}{g?.state.replaceAll('_',' ')??'IDLE'}</span><small title="MediaPipe handedness classification score. This is not per-landmark confidence.">{h.handedness==='Simulated'?'SIMULATED':`${Math.round(h.confidence*100)}% CLASSIFICATION`}</small></div>;})}</div>}
          </section>
          <aside className="effects-panel" aria-label="Effects library">
            <div className="panel-heading"><div><Sparkles size={15}/><h2>Explore portals</h2></div><span>15</span></div>
            <p className="panel-subtitle">Three or four fingertips. One hand or both.</p>
            <div className="mode-tabs scope-tabs" aria-label="Gesture source">{(['single','shared'] as const).map(scope=><button key={scope} aria-pressed={previewScope===scope} className={previewScope===scope?'selected':''} onClick={()=>chooseScope(scope)}><HandIcon size={13}/>{scope==='single'?'One hand':'Two hands'}</button>)}</div>
            <div className="mode-tabs" aria-label="Gesture size">{[3,4].map(n=><button key={n} className={count===n?'selected':''} aria-pressed={count===n} onClick={()=>chooseCount(n)}>{n===3?<Triangle size={13}/>:<PortalMark small/>}{n} fingers total</button>)}</div>
            {previewScope==='shared'&&<button className="mapping-button" aria-pressed={settings.sharedAuto} onClick={()=>{patch('sharedAuto',!settings.sharedAuto);runtime.current?.clear();configureSimulator('shared',count,selected);notify('Gather and open a new gesture to apply the selection mode.');}}>{settings.sharedAuto?'Automatic by fingers':'Manual filter override'}<RotateCcw size={13}/></button>}
            {previewScope==='shared'&&<p className="shared-hint">{count===4?'Touch thumb to thumb and index to index. Hold, then open both hands.':'Gather two fingertips from one hand and one from the other. Hold, then spread.'} Camera recognizes both modes automatically.</p>}
            <div className="section-label"><span>{previewScope==='shared'?'SHARED BETWEEN TWO HANDS':count===3?'TRIANGULAR FILTERS':'REALITY PORTALS'}</span><span>{previewScope==='shared'?'15 FILTERS':count===4?'05 GESTURES':'10 GESTURES'}</span></div>
            <div className="effects-list">{previewScope==='shared'?FILTER_EFFECTS.map(e=><button key={e.id} className={`effect-card ${effectId===e.id?'selected':''}`} onClick={()=>chooseSharedEffect(e.id)} style={{'--effect-color':e.color} as React.CSSProperties} aria-pressed={effectId===e.id}><div className="effect-art"><Shape count={count} color={e.color}/></div><div className="effect-card-info"><strong>{e.name}</strong><span>2 HANDS / {count} FINGERTIPS</span></div>{effectId===e.id?<div className="selected-check"><Check size={11}/></div>:<ChevronRight size={14}/>}</button>):combinations(count).map(fingers=>{
              const id=settings.mappings[comboKey(fingers)],e=EFFECTS[id],picked=comboKey(fingers)===comboKey(selected);
              return <button key={comboKey(fingers)} className={`effect-card ${picked?'selected':''}`} onClick={()=>choose(fingers)} style={{'--effect-color':e.color} as React.CSSProperties} aria-pressed={picked}><div className="effect-art"><Shape count={count} color={e.color}/></div><div className="effect-card-info"><strong>{e.name}</strong><span>{fingers.map(f=>FINGER_SHORT[f]).join(' + ')}<i> / </i>{fingers.map(f=>FINGER_NAMES[f]).join(' · ')}</span></div>{picked?<div className="selected-check"><Check size={11}/></div>:<ChevronRight className="effect-chevron" size={14}/>}</button>;
            })}</div>
            <div className="selected-effect"><div className="section-label"><span>{previewScope==='shared'?'SHARED GESTURE':'SELECTED GESTURE'}</span><span style={{color:effect.color}}>●</span></div><div className="finger-tokens">{previewScope==='shared'?(count===3?['H1·T','H1·I','H2·I']:['H1·T','H1·I','H2·T','H2·I']).map(label=><span key={label} className="on shared-token">{label}</span>):FINGER_SHORT.map((name,f)=><span key={name} className={selected.includes(f as Finger)?'on':''}>{name}</span>)}<ChevronRight size={13}/><strong style={{color:effect.color}}>{count===3?'TRIANGLE':'PORTAL'}</strong></div><p>{effect.note}</p><div className="intensity-label"><label htmlFor="intensity">Intensity</label><span>{Math.round(settings.intensity*100)}%</span></div><input id="intensity" type="range" min="0" max="1" step=".01" value={settings.intensity} onChange={e=>patch('intensity',+e.target.value)}/></div>
            <button className="mapping-button" onClick={openMappings}><Settings2 size={14}/><span>Customize gesture mappings</span><ArrowUpRight size={13}/></button>
          </aside>
        </div>
        <div className="bottom-note"><span><ShieldCheck size={13}/> Your camera never leaves your browser.</span><span>MADE OF LIGHT. CONTROLLED BY YOU.<PortalMark small/></span></div>
      </main>
    </div>
    {toast&&<div className="toast" role="status"><Check size={15}/>{toast}</div>}
    {modal&&<div className="modal-backdrop" onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}><div className={`modal ${modal==='mappings'?'wide':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><div className="eyebrow">YOUR INSTRUMENT</div><h2 id="modal-title">{modal==='settings'?'Fine-tune your reality.':modal==='mappings'?'Give every gesture a world.':'A new kind of hands-on.'}</h2></div><button className="icon-control" aria-label="Close dialog" onClick={()=>setModal(null)}><X size={20}/></button></div>
      {modal==='settings'&&<><p className="modal-description">Small adjustments. A more natural connection. Changes save automatically on this device.</p><div className="settings-toggles">{(['tracking','mirror','markers','skeleton'] as const).map((key,i)=><div key={key}><span>{['Hand tracking','Mirror camera','Fingertip markers','Hand skeleton'][i]}</span><Toggle checked={settings[key]} label={key} onChange={()=>{patch(key,!settings[key]);if(key==='tracking')runtime.current?.clear();}}/></div>)}</div><div className="settings-grid">{SLIDERS.map(s=><label key={s.key} className="setting-slider"><span>{s.label}<output>{s.format(settings[s.key] as number)}</output></span><input type="range" min={s.min} max={s.max} step={s.step} value={settings[s.key] as number} onChange={e=>patch(s.key,+e.target.value as never)}/></label>)}</div><label className="quality-select">Rendering quality<select value={settings.quality} onChange={e=>patch('quality',e.target.value as Settings['quality'])}><option value="auto">Adaptive (recommended)</option><option value="high">High · 1280 × 720</option><option value="medium">Medium · 960 × 540</option><option value="low">Low · 640 × 360</option></select></label><div className="modal-footer"><button className="text-button" onClick={reset}><RotateCcw size={14}/> Reset all defaults</button><button className="primary-button" onClick={()=>setModal(null)}><Check size={14}/> Done</button></div></>}
      {modal==='mappings'&&<><p className="modal-description">Only three- and four-finger portals are enabled. Assign effects for each single-hand combination and for shared gestures. Changes save automatically.</p><div className="mode-tabs mapping-tabs">{[3,4].map(n=><button key={n} className={mappingCount===n?'selected':''} onClick={()=>setMappingCount(n)}>{n} fingers · one hand</button>)}</div><div className="mapping-rows">{combinations(mappingCount).map(fingers=><label className="mapping-row" key={comboKey(fingers)}><span className="mapping-combo"><span className="mapping-symbol">{fingers.map(f=>FINGER_SHORT[f]).join(' + ')}</span><small>{fingers.map(f=>FINGER_NAMES[f]).join(' · ')}</small></span><select aria-label={`Effect for ${fingers.map(f=>FINGER_NAMES[f]).join(' + ')}`} value={settings.mappings[comboKey(fingers)]} onChange={e=>setSettings(s=>({...s,mappings:{...s.mappings,[comboKey(fingers)]:+e.target.value}}))}>{FILTER_EFFECTS.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select></label>)}</div><h3 className="shared-mapping-heading">Shared between two hands</h3><div className="mapping-rows">{[3,4].map(n=><label className="mapping-row" key={n}><span className="mapping-combo"><span className="mapping-symbol">{n} fingertips total</span><small>{n===3?'2 + 1 across both hands':'2 + 2 or 3 + 1 across both hands'}</small></span><select aria-label={`Two-hand ${n}-finger effect`} value={settings.mappings[sharedKey(n)]} onChange={e=>{setSettings(s=>({...s,sharedAuto:false,mappings:{...s.mappings,[sharedKey(n)]:+e.target.value}}));runtime.current?.engine.setSharedEffect(+e.target.value,n);}}>{FILTER_EFFECTS.map(e=><option value={e.id} key={e.id}>{e.name}</option>)}</select></label>)}</div><div className="modal-footer"><button className="text-button" onClick={()=>{patch('mappings',{...DEFAULT_SETTINGS.mappings});notify('Default portal mappings restored.');}}><RotateCcw size={14}/> Reset mappings</button><button className="primary-button" onClick={()=>setModal(null)}><Check size={14}/> Done</button></div></>}
      {modal==='guide'&&<><p className="modal-description">Finger Portal turns your webcam into a local AR instrument. A few small movements are all it takes.</p><div className="guide-steps">{[{n:'01',title:'Gather, then hold',text:'Bring 3 or 4 fingertips close together, on one hand or across both hands. Hold for roughly half a second until the markers glow.'},{n:'02',title:'Open a little space',text:'Separate the same fingers. Three make a triangle, and four create a flexible portal. Two fingertips never activate an effect.'},{n:'03',title:'Shape it. Then close it.',text:'Move your fingers to reshape the effect. Bring them together to dissolve it. Both hands can also share one connected portal.'}].map(step=><div key={step.n}><span>{step.n}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></div>)}</div><div className="guide-tip"><HandIcon size={22}/><p>Start with <strong>thumb + index + middle</strong>. For two hands, touch thumb to thumb and index to index, hold, then open the hands. Keep your full hand in view, use even lighting, and avoid overlapping hands. Turn on the skeleton to inspect tracking.</p></div><p className="fine-print">Thermal, infrared and X-ray effects are artistic simulations of RGB video. They do not measure temperature, detect infrared radiation, or reveal anatomy. Simulator landmarks are synthetic; no camera is used. Keyboard: C clear · F fullscreen · S screenshot.</p><div className="modal-footer"><button className="text-button" onClick={()=>{setModal(null);simulate();}}><Play size={13}/> Try the simulator</button><button className="primary-button" onClick={()=>setModal(null)}>Got it <ArrowUpRight size={14}/></button></div></>}
    </div></div>}
  </div>;
}
