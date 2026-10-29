import { useEffect, useRef, useState } from 'react';
import { PortalRenderer } from './render/renderer';
import { EFFECTS, FILTER_EFFECTS, ALL_COMBINATIONS } from './core/effects';
import { GestureEngine } from './core/gestures';
import { Simulator } from './core/simulator';
import { sanitizeSettings } from './core/settings';
import { orderPolygon, center } from './core/geometry';
import type { Gesture, Point } from './core/types';

type Row={name:string;passed:boolean;detail:string};
export default function Diagnostics() {
  const [rows,setRows]=useState<Row[]>([]),[done,setDone]=useState(false);
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    let cancelled=false,worker:Worker|undefined;
    const renderer=new PortalRenderer(canvas.current!,()=>{});
    const run=async()=>{
      const results:Row[]=[];
      const add=(name:string,passed:boolean,detail:string)=>{results.push({name,passed,detail});if(!cancelled)setRows([...results]);};
      renderer.resize(640);
      const fixture=document.createElement('canvas');fixture.width=640;fixture.height=360;
      const c=fixture.getContext('2d')!;
      const gradient=c.createLinearGradient(0,0,640,360);gradient.addColorStop(0,'#c33d78');gradient.addColorStop(.5,'#6dab8d');gradient.addColorStop(1,'#345fea');c.fillStyle=gradient;c.fillRect(0,0,640,360);
      for(let x=0;x<640;x+=40)for(let y=0;y<360;y+=40){c.fillStyle=(x+y)%80===0?'#ffffff22':'#00000022';c.fillRect(x,y,40,40);}
      const s={...sanitizeSettings({}),markers:false,skeleton:false,glow:0,particles:0,intensity:1};
      const pixels=()=>canvas.current!.getContext('2d')!.getImageData(0,0,640,360).data;
      const sample=(image:Uint8ClampedArray,x:number,y:number)=>Array.from(image.slice((y*640+x)*4,(y*640+x)*4+3));
      const diff=(a:number[],b:number[])=>a.reduce((v,n,i)=>v+Math.abs(n-b[i]),0);
      renderer.render(fixture,[],[],s,1200,false);const base=pixels();
      add('WebGL2 shader compilation',renderer.gpu,renderer.gpu?'GPU shader program linked successfully.':'GPU unavailable; pixel checks would only cover the fallback.');
      add('Full-size camera texture',diff(sample(base,590,310),sample(c.getImageData(0,0,640,360).data,590,310))<=3,'Reference source reaches the far corner of the output canvas.');
      const signatures=new Set<string>();
      for(const [index,{id}] of FILTER_EFFECTS.entries()) {
        const count=ALL_COMBINATIONS[index].length;
        const shape:Point[]=count===3?[{x:.5,y:.17},{x:.23,y:.79},{x:.77,y:.79}]:[{x:.23,y:.2},{x:.77,y:.2},{x:.77,y:.8},{x:.23,y:.8}];
        const g:Gesture={id:'diagnostic',scope:'single',handIds:[1],members:ALL_COMBINATIONS[index].map(finger=>({handId:1,finger})),handId:1,state:'ACTIVE',fingers:ALL_COMBINATIONS[index],effect:id,points:orderPolygon(shape),origin:center(shape),opacity:1,since:0,lastSeen:0};
        renderer.render(fixture,[g],[],s,1200,false);const image=pixels();
        const unchanged=diff(sample(base,30,25),sample(image,30,25))<=3&&diff(sample(base,600,330),sample(image,600,330))<=3;
        let inside=0;const signature:number[]=[];
        for(const [x,y] of [[280,180],[320,180],[350,180],[300,210]]){const value=sample(image,x,y);inside+=diff(value,sample(base,x,y));signature.push(...value);}
        signatures.add(signature.join(','));
        add(`${index+1}. ${EFFECTS[id].name}`,renderer.gpu&&unchanged&&inside>5,`Outside pixels unchanged: ${unchanged}. Interior pixel change: ${inside}.`);
      }
      add('Distinct appearances',signatures.size===15,`${signatures.size} distinct sampled shader outputs across 15 filters.`);
      const ps=orderPolygon([{x:.08,y:.2},{x:.4,y:.3},{x:.12,y:.8}]);
      const g:Gesture={id:'diagnostic',scope:'single',handIds:[1],members:[{handId:1,finger:0},{handId:1,finger:1},{handId:1,finger:3}],handId:1,state:'ACTIVE',fingers:[0,1,3],effect:11,points:ps,origin:center(ps),opacity:1,since:0,lastSeen:0};
      renderer.render(fixture,[],[],s,1500,true);const mirroredBase=pixels();
      renderer.render(fixture,[g],[],s,1500,true);const mirrored=pixels();
      add('Mirrored geometry alignment',diff(sample(mirrored,520,170),sample(mirroredBase,520,170))>10&&diff(sample(mirrored,100,170),sample(mirroredBase,100,170))<=3,'Mirrored portal moves to the opposite side with the camera.');
      renderer.render(fixture,[{...g,opacity:0}],[],s,1500,false);const clear=pixels();
      add('Zero-opacity cleanup',diff(sample(clear,100,170),sample(base,100,170))<=3,'A fully dissolved portal restores the source pixels.');
      for(const [count,bridge] of [[3,false],[4,false],[4,true]] as const) {
        const engine=new GestureEngine(),sim=new Simulator();sim.selectShared(count,0,s.activationDelay,bridge);sim.setOpening(0);
        engine.update(sim.hands(0),0,s);engine.update(sim.hands(1000),1000,s);sim.setOpening(1);
        engine.update(sim.hands(1100),1100,s);const active=engine.update(sim.hands(1300),1300,s);
        renderer.render(fixture,active,[],s,1500,false);const shared=pixels();
        const bounded=diff(sample(base,30,25),sample(shared,30,25))<=3;
        const changed=diff(sample(base,320,180),sample(shared,320,180))>5;
        add(`Shared ${count}-finger ${bridge?'paired-contact':'cluster'} portal`,active.length===1&&active[0].state==='ACTIVE'&&active[0].handIds.length===2&&bounded&&changed,`One connected portal; both hand IDs; interior changed: ${changed}; exterior unchanged: ${bounded}.`);
      }
      const pairEngine=new GestureEngine(),pairSim=new Simulator();pairSim.select([0,1],0,s.activationDelay);pairSim.setOpening(0);
      pairEngine.update(pairSim.hands(0),0,s);const pairResult=pairEngine.update(pairSim.hands(1000),1000,s);
      add('Two-finger activation removed',pairResult.length===0,'Two fingertips cannot arm or create an effect.');
      renderer.render(fixture,[],[],s,1500,false);
      add('Screenshot encoding',canvas.current!.toDataURL('image/png').startsWith('data:image/png;base64,'),'Composited output encodes to PNG.');
      add('Recording API available',typeof MediaRecorder!=='undefined'&&typeof canvas.current!.captureStream==='function','MediaRecorder and canvas captureStream are available.');
      try {
        const result=await new Promise<string>((resolve,reject)=>{
          worker=new Worker('/hand-worker.js');
          const timeout=setTimeout(()=>reject(new Error('Model worker timed out after 30 seconds.')),30000);
          worker.onerror=()=>{clearTimeout(timeout);reject(new Error('Worker failed to load.'));};
          worker.onmessage=async e=>{
            if(e.data.type==='error'){clearTimeout(timeout);reject(new Error(e.data.message));}
            if(e.data.type==='ready'){
              const bitmap=await createImageBitmap(fixture);worker!.postMessage({type:'frame',bitmap,timestamp:performance.now()},[bitmap]);
            }
            if(e.data.type==='result'){clearTimeout(timeout);resolve(`${e.data.landmarks.length} hands in synthetic non-hand fixture; real model inference completed.`);}
          };
          worker.postMessage({type:'init',origin:location.origin});
        });
        add('Local MediaPipe worker + actual inference',true,result);
      } catch(error){add('Local MediaPipe worker + actual inference',false,String(error));}
      worker?.terminate();
      if(!cancelled)setDone(true);
    };
    void run().catch(error=>{if(!cancelled){setRows(r=>[...r,{name:'Diagnostic error',passed:false,detail:String(error)}]);setDone(true);}});
    return ()=>{cancelled=true;worker?.terminate();renderer.dispose();};
  },[]);
  return <main className="diagnostics"><a href="/">← Back to Finger Portal</a><h1>Finger Portal diagnostics</h1><p>Real browser GPU pixel checks and local model inference. No camera requested.</p><canvas ref={canvas}/><h2 data-testid="diagnostic-result">{done?`${rows.filter(r=>r.passed).length}/${rows.length} checks passed`:'Running browser checks…'}</h2><ol>{rows.map(r=><li key={r.name} className={r.passed?'pass':'fail'}><strong>{r.passed?'PASS':'FAIL'} · {r.name}</strong><p>{r.detail}</p></li>)}</ol><p>Physical webcam gesture acceptance still requires a person and camera.</p></main>;
}
