export const vertex = `#version 300 es
precision highp float;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const fragment = `#version 300 es
precision highp float;
uniform sampler2D uCamera;
uniform vec2 uResolution;
uniform vec2 uCrop;
uniform bool uMirror;
uniform float uTime, uIntensity, uGlow, uFeather, uParticles;
uniform vec2 uPoints[8];
uniform int uCounts[2];
uniform int uEffects[2];
uniform float uAlphas[2];
uniform vec3 uColors[2];
out vec4 outColor;
const float PI = 3.14159265;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
vec3 palette(float t) { return .52 + .48 * cos(6.28318 * (t + vec3(0.0,.33,.67))); }
vec3 camera(vec2 uv) {
  if (uMirror) uv.x = 1.0 - uv.x;
  return texture(uCamera, clamp((uv-.5)*uCrop+.5, vec2(.001), vec2(.999))).rgb;
}
float lum(vec3 c) { return dot(c, vec3(.2126,.7152,.0722)); }
vec3 thermal(float t) {
  vec3 c = mix(vec3(.015,.025,.19), vec3(.39,.015,.58), smoothstep(.05,.32,t));
  c = mix(c, vec3(.95,.045,.1), smoothstep(.28,.55,t));
  c = mix(c, vec3(1.0,.68,.025), smoothstep(.5,.78,t));
  return mix(c, vec3(1.0,.99,.83), smoothstep(.78,1.0,t));
}
float edge(vec2 uv) {
  vec2 d = 1.6/uResolution;
  return length(vec2(lum(camera(uv+vec2(d.x,0)))-lum(camera(uv-vec2(d.x,0))), lum(camera(uv+vec2(0,d.y)))-lum(camera(uv-vec2(0,d.y)))));
}
vec3 effect(int id, vec2 uv, vec2 local) {
  float t = uTime, y = lum(camera(uv));
  vec3 c = camera(uv);
  float scan = .82 + .18*sin(uv.y*uResolution.y*1.25-t*3.0);
  float noise = hash(floor(uv*uResolution)+floor(t*12.0));
  if (id == 10) {
    float l = clamp((y-.5)*1.65+.5,0.0,1.0);
    return vec3(l)*(1.0-.18*length(local)) + (noise-.5)*.035;
  }
  if (id == 11 || id == 22) {
    vec2 p = uv;
    if (id == 22) p.x += .006*sin(p.y*95.0+t*2.0);
    return thermal(clamp(lum(camera(p))*.98+edge(p)*.45,0.0,1.0)) * (id == 22 ? .94+.06*sin(uv.y*120.0-t*3.0) : 1.0);
  }
  if (id == 12) return vec3(.36,1.0,.43)*clamp(pow(y,.65)*1.35,0.0,1.0)*scan + (noise-.5)*.065;
  if (id == 13 || id == 21) {
    float k = id == 21 ? 1.8 : 1.0;
    vec2 p = uv + vec2(sin(uv.y*19.0+t),cos(uv.x*15.0+t*.7))*.009*k;
    vec3 refractC = vec3(camera(p+vec2(.009*k,0)).r,camera(p).g,camera(p-vec2(.009*k,0)).b);
    return mix(refractC, refractC*palette(uv.x*.8+uv.y*.4+t*.08)*2.1, id == 21 ? .83 : .62);
  }
  if (id == 14) {
    vec2 p = uv + .012*vec2(sin(uv.y*28.0+t),cos(uv.x*23.0-t));
    vec3 rgb = vec3(camera(p+vec2(.012,0)).r,camera(p).g,camera(p-vec2(.012,0)).b);
    return rgb*palette(y+length(local)*.9-t*.09)*2.3;
  }
  if (id == 15) return vec3(.25,.72,1.0)*pow(1.0-y,1.4)+vec3(.35,.6,.8)*edge(uv)*2.0;
  if (id == 16 || id == 23) {
    float band = hash(vec2(floor(uv.y*45.0),floor(t*5.0)));
    float offset = (band-.5)*.055*step(.72,band);
    vec2 p = uv+vec2(offset,0);
    vec3 rgb = vec3(camera(p+vec2(.012,0)).r,camera(p).g,camera(p-vec2(.012,0)).b);
    if (id == 23) rgb = mix(rgb,vec3(.12,.95,.8)*y+vec3(.6,.05,.8)*edge(p),.65);
    return rgb*scan+step(.985,noise)*.08;
  }
  if (id == 17) return vec3(.12,.68,1.0)*(y*.8+edge(uv)*2.2)*scan+vec3(.02,.1,.15)*smoothstep(.95,1.0,sin(uv.y*18.0-t));
  if (id == 18) {
    vec2 p=uv+.018*vec2(sin(uv.y*20.0+t*1.1),cos(uv.x*22.0+t*.8));
    return camera(p)*(.9+.4*palette(sin(p.x*5.0+p.y*5.0)+t*.05));
  }
  if (id == 19) {
    float wave = sin(uv.x*9.0+t*.5)+sin(uv.y*11.0-t*.4);
    float curtain = pow(.5+.5*sin(uv.y*7.0+wave*1.7),3.0);
    return c*.45+palette(uv.x*.2+t*.035)*curtain*.85+vec3(.15,.6,.5)*edge(uv);
  }
  if (id == 20) {
    float a=atan(local.y,local.x), r=length(local);
    vec2 p=local+vec2(sin(a*3.0+r*8.0-t*.3),cos(a*2.0-r*7.0+t*.2))*.2;
    float cloud=sin(p.x*5.0+p.y*3.0+t*.15)*sin(p.y*6.0-p.x*2.0);
    float stars=pow(hash(floor((uv+vec2(t*.0006,0))*vec2(540,340))),95.0);
    return vec3(.035,.025,.09)+palette(cloud*.3+.6)*pow(max(0.0,cloud),2.0)*.65+stars*.9+c*.08;
  }
  if (id == 24) {
    float a=atan(local.y,local.x)+t*.06;
    float sector=PI/3.0;
    a=abs(mod(a,sector*2.0)-sector);
    vec2 p=vec2(cos(a),sin(a))*length(local);
    p=fract(p*.55+.5);
    return camera(p)*palette(length(local)*.5-t*.07)*2.0;
  }
  return c;
}
float segment(vec2 p, vec2 a, vec2 b, out float along) {
  vec2 ba=b-a;
  along=clamp(dot(p-a,ba)/max(dot(ba,ba),.0000001),0.0,1.0);
  return length(p-a-ba*along);
}
void main() {
  vec2 uv=vec2(gl_FragCoord.x/uResolution.x,1.0-gl_FragCoord.y/uResolution.y);
  float aspect=uResolution.x/uResolution.y;
  vec2 p=uv*vec2(aspect,1.0);
  vec3 result=camera(uv);
  for (int h=0;h<2;h++) {
    int n=uCounts[h]; float alpha=uAlphas[h];
    if(n<3 || n>4 || alpha<=0.0) continue;
    int offset=h*4; int id=uEffects[h]; vec3 color=uColors[h];
    {
      bool inside=false; float boundary=10.0; vec2 regionCenter=vec2(0);
      for (int i=0;i<4;i++) {
        if(i>=n) break;
        vec2 a=uPoints[offset+i]*vec2(aspect,1.0);
        vec2 b=uPoints[offset+((i+1)%n)]*vec2(aspect,1.0);
        float along; boundary=min(boundary,segment(p,a,b,along)); regionCenter+=a/float(n);
        if((a.y>p.y)!=(b.y>p.y) && p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
      }
      // Feather entirely inwards. Filter contribution is exactly zero outside.
      float mask=inside ? smoothstep(0.0,max(uFeather,1.0/uResolution.y),boundary) : 0.0;
      if(mask>0.0) result=mix(result,effect(id,uv,(p-regionCenter)*3.0),mask*alpha*uIntensity);
      float rim=exp(-boundary*640.0)*.65;
      float halo=exp(-boundary*125.0)*uGlow*.22;
      float particles=pow(max(0.0,sin(uv.x*270.0+uv.y*190.0-uTime*2.0)),42.0)*exp(-boundary*95.0)*uParticles*.25;
      result+=(color*(rim+halo+particles))*alpha;
    }
  }
  outColor=vec4(result,1);
}`;
