export function download(blob:Blob,name:string) {
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
export function screenshot(canvas:HTMLCanvasElement) {
  canvas.toBlob(blob=>{if(blob)download(blob,`finger-portal-${stamp()}.png`);},'image/png');
}
export function startRecording(canvas:HTMLCanvasElement,onStop:()=>void) {
  if(!canvas.captureStream || typeof MediaRecorder==='undefined')throw new Error('Video recording is not available in this browser. Try Chrome or Edge.');
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'].find(m=>MediaRecorder.isTypeSupported(m));
  if(!mime)throw new Error('No supported video recording format was found.');
  const stream=canvas.captureStream(30);const chunks:Blob[]=[];
  let recorder:MediaRecorder;
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5_000_000});}catch(error){stream.getTracks().forEach(t=>t.stop());throw error;}
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(chunks.length)download(new Blob(chunks,{type:mime}),`finger-portal-${stamp()}.${mime.includes('mp4')?'mp4':'webm'}`);onStop();};
  recorder.onerror=()=>{if(recorder.state!=='inactive')recorder.stop();};
  recorder.start(500);return recorder;
}
