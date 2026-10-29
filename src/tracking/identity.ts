import type { Point, Hand } from '../core/types';
import { center, distance } from '../core/geometry';

type Track = { hand: Hand; position: Point; velocity: Point; time: number };
type Detection = { landmarks: Point[]; handedness: string; confidence: number };
export class HandIdentityTracker {
  private tracks = new Map<number, Track>();
  private nextId = 1;
  reset() { this.tracks.clear(); this.nextId=1; }
  update(detections: Detection[], now: number, smoothing: number, aspect: number): Hand[] {
    for(const [id,t] of this.tracks) if(now-t.time>800) this.tracks.delete(id);
    const old=[...this.tracks.values()];
    const costs=detections.map(d=>old.map(t=>{
      const p=center([d.landmarks[0],d.landmarks[5],d.landmarks[17]]);
      const dt=Math.min(now-t.time,100);
      const predicted={x:t.position.x+t.velocity.x*dt,y:t.position.y+t.velocity.y*dt};
      return distance(p,predicted,aspect)+(d.handedness!==t.hand.handedness ? .3 : 0);
    }));
    // Exhaustive assignment for at most two hands; prevents result-array order swaps.
    let best: number[] = [], score=Infinity;
    const search=(i:number,used:Set<number>,indices:number[],total:number)=>{
      if(i===detections.length) {if(total<score){score=total;best=indices;}return;}
      search(i+1,used,[...indices,-1],total+.7);
      old.forEach((_,j)=>{if(!used.has(j)&&costs[i][j]<.7)search(i+1,new Set([...used,j]),[...indices,j],total+costs[i][j]);});
    };
    search(0,new Set(),[],0);
    return detections.map((d,i)=>{
      const prev=best[i]>=0 ? old[best[i]] : undefined;
      const position=center([d.landmarks[0],d.landmarks[5],d.landmarks[17]]);
      const dt=Math.max(1,now-(prev?.time??now));
      const landmarks=d.landmarks.map((p,j)=>{
        const last=prev?.hand.landmarks[j];
        // Reduce smoothing during quick motion to avoid a detached-looking overlay.
        const alpha=last ? Math.min(1,1-smoothing+distance(p,last,aspect)*3) : 1;
        return last ? {...p,x:last.x+(p.x-last.x)*alpha,y:last.y+(p.y-last.y)*alpha,z:(last.z??0)+((p.z??0)-(last.z??0))*alpha} : {...p};
      });
      const hand: Hand={id:prev?.hand.id??this.nextId++,landmarks,confidence:d.confidence,handedness:d.handedness,aspect};
      this.tracks.set(hand.id,{hand,position,velocity:prev ? {x:(position.x-prev.position.x)/dt,y:(position.y-prev.position.y)/dt} : {x:0,y:0},time:now});
      return hand;
    });
  }
}
