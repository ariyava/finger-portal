export type Finger = 0 | 1 | 2 | 3 | 4;
export type GestureState = 'IDLE' | 'FINGERS_GATHERED' | 'ARMED' | 'OPENING' | 'ACTIVE' | 'CLOSING';
export type Point = { x: number; y: number; z?: number; id?: number };
export type Hand = { id: number; landmarks: Point[]; confidence: number; handedness: string; aspect: number };
export type FingerRef = { handId: number; finger: Finger };
export type GestureScope = 'single' | 'shared';
export type Gesture = {
  id: string; scope: GestureScope; handIds: number[]; members: FingerRef[];
  contactPairs?: [number, number][];
  handId: number; state: GestureState; fingers: Finger[]; effect: number;
  points: Point[]; origin: Point; opacity: number; since: number; lastSeen: number; closingFrom?: number;
};
export type Settings = {
  sharedAuto: boolean;
  mirror: boolean; tracking: boolean; markers: boolean; skeleton: boolean;
  sensitivity: number; contactDistance: number; activationDelay: number;
  releaseSensitivity: number; intensity: number; glow: number; feather: number;
  speed: number; particles: number; smoothing: number;
  quality: 'auto' | 'high' | 'medium' | 'low'; mappings: Record<string, number>;
};
export const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'] as const;
export const FINGER_SHORT = ['T', 'I', 'M', 'R', 'P'] as const;
export const TIP_IDS = [4, 8, 12, 16, 20] as const;
