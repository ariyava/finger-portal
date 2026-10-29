/// <reference lib="webworker" />
type MpHandLandmarker = import('@mediapipe/tasks-vision').HandLandmarker;
declare const Vision: {FilesetResolver:typeof import('@mediapipe/tasks-vision').FilesetResolver;HandLandmarker:typeof import('@mediapipe/tasks-vision').HandLandmarker};

let detector: MpHandLandmarker | undefined;
self.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  if(data.type==='init') {
    try {
      importScripts(`${data.origin}/vendor/vision_bundle.js`);
      const { FilesetResolver, HandLandmarker } = Vision;
      const files = await FilesetResolver.forVisionTasks(`${data.origin}/wasm`);
      const options = { runningMode:'VIDEO' as const, numHands:2, minHandDetectionConfidence:.55, minHandPresenceConfidence:.55, minTrackingConfidence:.5 };
      let delegate = 'GPU';
      try { detector=await HandLandmarker.createFromOptions(files,{...options,baseOptions:{ modelAssetPath:`${data.origin}/models/hand_landmarker.task`, delegate:'GPU' }}); }
      catch { delegate='CPU';detector=await HandLandmarker.createFromOptions(files,{...options,baseOptions:{modelAssetPath:`${data.origin}/models/hand_landmarker.task`,delegate:'CPU'}}); }
      self.postMessage({type:'ready',delegate});
    } catch(error) { self.postMessage({type:'error',message:`Hand tracking could not start. Check that the local model exists, then run npm run setup:models. ${String(error)}`}); }
  }
  if(data.type==='frame') {
    const bitmap=data.bitmap as ImageBitmap;
    try {
      if(!detector) throw new Error('Hand model is not ready.');
      const start=performance.now();
      const result=detector.detectForVideo(bitmap,data.timestamp);
      self.postMessage({type:'result',landmarks:result.landmarks,handedness:result.handedness,duration:performance.now()-start});
    } catch(error) { self.postMessage({type:'error',message:`Tracking interrupted: ${String(error)}`}); }
    finally { bitmap.close(); }
  }
};
