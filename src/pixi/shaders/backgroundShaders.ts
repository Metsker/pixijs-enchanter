// Procedural backdrops for the game's scenes. Each variant is a fragment shader
// plus a small palette of vec3 colour uniforms; the runner (shaderBackground.ts)
// supplies uTime + uResolution and drives them per frame. Keeping the look here
// (GLSL + palette) and the plumbing in the runner means a new scene background
// is just another entry in BACKGROUNDS. The calm non-battle scenes run at 30fps;
// the battle variant opts into 60fps (see `fps`) for its faster motion.

// Shared vertex shader: a clip-space pass-through. The runner feeds a single
// [-1,1] quad, so this needs none of Pixi's transform uniforms - the quad fills
// the viewport whatever the stage transform, and never reflows on resize.
export const BACKGROUND_VERTEX = /* glsl */ `#version 300 es
precision highp float;

in vec2 aPosition;
in vec2 aUV;
out vec2 vUv;

void main() {
  // Read the UV attribute (MeshGeometry always supplies one) so Pixi doesn't
  // warn about an unused geometry attribute; it matches aPosition*0.5+0.5.
  vUv = aUV;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Shared value-noise + fbm, prepended to every variant's fragment. Uses uTime
// (declared by each fragment) only indirectly via the callers.
const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * valueNoise(p);
    p *= 2.02;
    amp *= 0.5;
  }
  return sum;
}
`;

// One drifting speck per grid cell - reused for dust motes, embers, and stars.
// `speed` 0 makes it a stationary twinkle; >0 makes it rise and fade out before
// it wraps at the cell's top, so it never pops. `thresh` controls sparsity
// (only cells whose hash exceeds it host a speck). Needs NOISE_GLSL + uTime.
const PARTICLES_GLSL = /* glsl */ `
float particles(vec2 p, float scale, float speed, float size, float thresh, float seed) {
  vec2 sp = p * scale;
  vec2 cell = floor(sp);
  vec2 g = fract(sp);
  float r = hash(cell + seed);
  float r2 = hash(cell + seed + 3.7);
  float moving = step(0.0001, speed);
  float on = step(thresh, r);
  float y = mix(r2, fract(r2 + uTime * speed), moving);
  vec2 pos = vec2(fract(r * 7.0), y);
  float pt = smoothstep(size, 0.0, length(g - pos));
  // Fade in at the bottom of the cell and out near the top (only when moving).
  float edge = mix(1.0, smoothstep(0.0, 0.2, y) * smoothstep(1.0, 0.8, y), moving);
  float tw = 0.6 + 0.4 * sin(uTime * 1.2 + r2 * 6.2831);
  return on * pt * edge * tw;
}
`;

// --- Map: a calm, dark indigo nebula drifting upward with sparse stars. ------
const MAP_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 finalColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform vec3 uNebula;
${NOISE_GLSL}
void main() {
  vec2 uv = vUv;
  vec2 p = uv;
  p.x *= uResolution.x / max(uResolution.y, 1.0); // square up the noise

  // Base wash: darkest at the foot of the map, a shade cooler toward the top.
  vec3 col = mix(uColorBottom, uColorTop, smoothstep(0.0, 1.0, uv.y));

  // Slow, domain-warped clouds drifting upward. The warp (one extra fbm fed back
  // into the next) gives organic curl without anything moving fast.
  float t = uTime * 0.025;
  vec2 q = p * 1.5;
  q.y -= t;
  float w = fbm(q + t * 0.5);
  float n = fbm(q + vec2(w, w * 0.6));
  float clouds = smoothstep(0.32, 0.95, n);
  col += uNebula * clouds * 0.24;

  // Sparse round stars on a grid, each twinkling on its own slow phase. Faded
  // out toward the bottom so they read as distant sky rather than ground.
  vec2 sp = p * 38.0;
  vec2 cell = floor(sp);
  vec2 g = fract(sp) - 0.5;
  float r = hash(cell);
  // A SECOND, independent hash drives each star's twinkle phase and rate. The
  // existence test step(0.975, r) leaves every visible star with r in a tiny
  // band near 1.0, so deriving the phase from r made them all breathe in unison;
  // r2 spans the full 0..1 range, and a per-star rate keeps them from re-syncing.
  float r2 = hash(cell + 41.7);
  float twinkle = 0.55 + 0.45 * sin(uTime * (0.4 + r2 * 0.8) + r2 * 6.2831);
  float star = smoothstep(0.09, 0.0, length(g)) * step(0.975, r) * twinkle;
  star *= smoothstep(0.15, 0.85, uv.y);
  col += vec3(0.8, 0.92, 1.0) * star * 0.6;

  // Gentle vignette - corners ~half brightness - to frame the map content.
  float d = distance(uv, vec2(0.5, 0.5));
  col *= 0.55 + 0.45 * smoothstep(0.95, 0.3, d);

  finalColor = vec4(col, 1.0);
}
`;

// --- Shop: cool teal merchant haze with slow-rising pale cyan dust motes. ----
const SHOP_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 finalColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform vec3 uGlow;
${NOISE_GLSL}
${PARTICLES_GLSL}
void main() {
  vec2 uv = vUv;
  vec2 p = uv;
  p.x *= uResolution.x / max(uResolution.y, 1.0);

  // Cool teal wash, a touch brighter toward the top.
  vec3 col = mix(uColorTop, uColorBottom, smoothstep(0.0, 1.0, uv.y));

  // Slow teal haze drifting sideways - motes of light hanging in the air.
  float t = uTime * 0.02;
  vec2 q = p * 1.3;
  q.x += t;
  float w = fbm(q + t * 0.4);
  float haze = fbm(q + vec2(w, w * 0.5));
  col += uGlow * smoothstep(0.35, 0.95, haze) * 0.22;

  // Pale cyan dust motes drifting slowly upward.
  float motes = particles(p, 28.0, 0.05, 0.10, 0.965, 1.0);
  col += vec3(0.6, 0.9, 1.0) * motes * 0.5;

  // Gentle vignette to frame the pane.
  float d = distance(uv, vec2(0.5, 0.5));
  col *= 0.55 + 0.45 * smoothstep(0.95, 0.3, d);

  finalColor = vec4(col, 1.0);
}
`;

// --- Rest: a campfire camp - cool night above, firelight + rising embers below.
const REST_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 finalColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform vec3 uFire;
${NOISE_GLSL}
${PARTICLES_GLSL}
void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = uv;
  p.x *= aspect;

  // Night-to-ember vertical gradient: cool indigo up top, warm glow at the base.
  vec3 col = mix(uColorBottom, uColorTop, smoothstep(0.0, 1.0, uv.y));

  // Soft firelight rising from the bottom centre, breathing on two slow sines
  // so it flickers gently and irregularly rather than pulsing on a beat.
  float flicker = 0.85 + 0.15 * sin(uTime * 1.3) * sin(uTime * 0.7 + 1.3);
  vec2 fireCentre = vec2(aspect * 0.5, -0.05);
  float glow = smoothstep(0.9, 0.0, distance(p, fireCentre)) * flicker;
  col += uFire * glow * 0.55;

  // Thin smoke drifting up off the fire, only in the lower-middle band.
  float t = uTime * 0.03;
  vec2 q = p * 1.6;
  q.y -= t;
  float w = fbm(q + t * 0.5);
  float smoke = fbm(q + vec2(w, w * 0.6));
  col += uFire * 0.10 * smoothstep(0.55, 1.0, smoke) * smoothstep(0.0, 0.7, uv.y);

  // Rising embers near the fire, fading out as they climb.
  float embers = particles(p, 22.0, 0.18, 0.08, 0.975, 5.0) * smoothstep(0.95, 0.15, uv.y);
  col += vec3(1.0, 0.5, 0.18) * embers * 0.7;

  // Faint stars in the upper night sky.
  float stars = particles(p, 40.0, 0.0, 0.07, 0.98, 11.0) * smoothstep(0.45, 1.0, uv.y);
  col += vec3(1.0, 0.9, 0.72) * stars * 0.4;

  // Gentle vignette to frame the pane.
  float d = distance(uv, vec2(0.5, 0.5));
  col *= 0.55 + 0.45 * smoothstep(0.95, 0.3, d);

  finalColor = vec4(col, 1.0);
}
`;

// --- Armory: a cool blue vault with slow, vivid azure light shafts + dust motes.
const ARMORY_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 finalColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform vec3 uBeam;
${NOISE_GLSL}
${PARTICLES_GLSL}
void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = uv;
  p.x *= aspect;

  // Cool steel vault, a shade lighter near the top where the light enters.
  vec3 col = mix(uColorBottom, uColorTop, smoothstep(0.0, 1.0, uv.y));

  // Slow vertical light shafts: fbm stretched along Y banks into soft beams that
  // drift sideways. Strongest near the top, fading toward the floor.
  float drift = uTime * 0.02;
  float fade = smoothstep(0.0, 0.85, uv.y);
  float shaft = smoothstep(0.38, 0.9, fbm(vec2(p.x * 2.2 + drift, p.y * 0.35)));
  col += uBeam * shaft * fade * 0.42;
  // A finer, counter-drifting layer for depth.
  float shaft2 = smoothstep(0.5, 1.0, fbm(vec2(p.x * 4.6 - drift * 0.6, p.y * 0.5 + 3.0)));
  col += uBeam * shaft2 * fade * 0.24;

  // Dust motes drifting up through the light.
  float motes = particles(p, 32.0, 0.04, 0.09, 0.972, 7.0);
  col += vec3(0.5, 0.85, 1.0) * motes * 0.55;

  // Gentle vignette to frame the pane.
  float d = distance(uv, vec2(0.5, 0.5));
  col *= 0.55 + 0.45 * smoothstep(0.95, 0.3, d);

  finalColor = vec4(col, 1.0);
}
`;

// --- Battle: a teal energy mist drifting steadily in ONE direction over a FIXED
// field of twinkling stars, with a slow ambient pulse. The mist is the only
// continuously moving layer - the background stars hold their positions. Still
// vignetted + held dark enough that HP bars, status icons, and damage numbers
// stay legible.
const BATTLE_FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 finalColor;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColorTop;
uniform vec3 uColorBottom;
uniform vec3 uEnergy;
uniform vec3 uStar;
${NOISE_GLSL}
${PARTICLES_GLSL}
void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 p = uv;
  p.x *= aspect;

  // Violet base matching the scene's purple gradient (lighter toward the top).
  vec3 col = mix(uColorBottom, uColorTop, smoothstep(0.0, 1.0, uv.y));

  // Teal energy mist drifting steadily in ONE direction (sideways across the
  // arena) - the only continuously moving layer. Two fbm layers at different
  // scales drift the SAME way (a slow base + a finer, faster overlay for depth)
  // so the mist reads as a single coherent current rather than churn.
  float t = uTime * 0.09;
  vec2 drift = vec2(-t, 0.0);
  vec2 q = p * 1.8 + drift;
  float w = fbm(q + drift * 0.5);
  float n = fbm(q + vec2(w, w * 0.7));
  col += uEnergy * smoothstep(0.3, 1.0, n) * 0.30;
  float n2 = fbm(p * 3.4 + drift * 1.6);
  col += uEnergy * smoothstep(0.6, 1.0, n2) * 0.12;

  // Background stars: a FIXED field of small specks twinkling in place (speed 0,
  // so they hold position while the mist drifts past). Coarse + finer/dimmer grid.
  float stars = particles(p, 26.0, 0.0, 0.06, 0.965, 13.0)
              + particles(p, 40.0, 0.0, 0.045, 0.975, 27.0) * 0.8;
  col += uStar * stars * 0.8;

  // Slow ambient pulse so the arena breathes with the fight.
  col *= 0.93 + 0.07 * sin(uTime * 0.9);

  // Stronger vignette than the calm scenes - keeps the busy combat UI readable.
  float d = distance(uv, vec2(0.5, 0.5));
  col *= 0.5 + 0.5 * smoothstep(1.0, 0.25, d);

  finalColor = vec4(col, 1.0);
}
`;

// A colour uniform spelled out as a Pixi vec3<f32> resource entry.
function rgb(r: number, g: number, b: number) {
  return { value: new Float32Array([r, g, b]), type: 'vec3<f32>' as const };
}

export interface BackgroundDef {
  fragment: string;
  // Palette uniforms merged into the runner's uniform group alongside the
  // driven uTime / uResolution. Names must match the fragment's `uniform`s.
  uniforms: Record<string, { value: Float32Array; type: 'vec3<f32>' }>;
  // Ticker cap for this variant's runner. Defaults to 30 (calm scenes); the
  // battle variant uses 60 so its faster motion stays smooth.
  fps?: number;
}

export const BACKGROUNDS = {
  // Cold teal-themed backdrops to match the cold UI chrome - EXCEPT the rest
  // camp, which stays warm on purpose (a warm refuge of firelight among the
  // cold scenes). They stay distinguishable by their cold hue: map = teal
  // night, shop = teal merchant haze, armory = cyan vault, battle = teal energy.
  map: {
    fragment: MAP_FRAGMENT,
    uniforms: {
      // Cold teal night sky: near-black at the foot rising to a deep teal
      // horizon, with a luminous teal nebula.
      uColorBottom: rgb(0.027, 0.043, 0.051),
      uColorTop: rgb(0.043, 0.094, 0.118),
      uNebula: rgb(0.14, 0.4, 0.46),
    },
  },
  shop: {
    fragment: SHOP_FRAGMENT,
    uniforms: {
      // Cold teal merchant tones (deep teal -> brighter teal) with a teal haze.
      uColorTop: rgb(0.035, 0.075, 0.094),
      uColorBottom: rgb(0.047, 0.118, 0.149),
      uGlow: rgb(0.14, 0.45, 0.5),
    },
  },
  rest: {
    fragment: REST_FRAGMENT,
    uniforms: {
      // WARM (intentional exception): dusk sky, glowing ember floor, firelight
      // orange - the rest camp is the one warm refuge in the cold palette.
      uColorTop: rgb(0.078, 0.051, 0.051),
      uColorBottom: rgb(0.118, 0.063, 0.035),
      uFire: rgb(1.0, 0.42, 0.13),
    },
  },
  armory: {
    fragment: ARMORY_FRAGMENT,
    uniforms: {
      // Cold cyan vault, lighter toward the top; vivid teal-cyan light shafts.
      uColorTop: rgb(0.039, 0.09, 0.125),
      uColorBottom: rgb(0.02, 0.047, 0.071),
      uBeam: rgb(0.24, 0.72, 0.82),
    },
  },
  battle: {
    fragment: BATTLE_FRAGMENT,
    fps: 60,
    uniforms: {
      // Cold teal gradient and a churning teal energy mist.
      uColorTop: rgb(0.055, 0.11, 0.137),
      uColorBottom: rgb(0.02, 0.039, 0.047),
      uEnergy: rgb(0.12, 0.42, 0.47),
      // Pale cool-white stars - both the fixed background field and the streaks.
      uStar: rgb(0.8, 0.92, 1.0),
    },
  },
} satisfies Record<string, BackgroundDef>;

export type BackgroundVariant = keyof typeof BACKGROUNDS;
