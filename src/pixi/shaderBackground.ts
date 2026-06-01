import { Application, Mesh, MeshGeometry, Shader, UniformGroup, type Ticker } from 'pixi.js';
import {
  BACKGROUNDS,
  BACKGROUND_VERTEX,
  type BackgroundDef,
  type BackgroundVariant,
} from './shaders/backgroundShaders';

// Paints a calm, animated procedural backdrop behind a non-battle scene
// (currently the run map). One transparent Pixi Application per mount renders a
// single full-screen quad; the look is chosen by `variant` (see
// backgroundShaders.ts) and only uTime / uResolution are driven here. The
// canvas is transparent, so the scene's CSS gradient shows through as a fallback
// if WebGL is unavailable or before init resolves.
export class ShaderBackground {
  private app!: Application;
  private uniforms!: UniformGroup;
  private time = 0;
  private resizeListener?: () => void;
  private variant!: BackgroundVariant;

  async init(parent: HTMLElement, variant: BackgroundVariant): Promise<void> {
    this.variant = variant;
    const def: BackgroundDef = BACKGROUNDS[variant];

    this.app = new Application();
    await this.app.init({
      resizeTo: parent,
      backgroundAlpha: 0,
      // A soft cloud field gains nothing from MSAA, and a blurry backdrop needs
      // no retina - resolution 1 keeps the fill cheap (and cool) on mobile.
      antialias: false,
      resolution: 1,
      autoDensity: true,
      // Only a `gl` program is provided, so force the WebGL renderer.
      preference: 'webgl',
    });
    parent.appendChild(this.app.canvas);

    // Calm scenes cap at 30fps (drifting clouds gain nothing from 60, and the
    // halved rate halves the GPU cost). The battle variant opts into 60 for its
    // faster motion. Cheap either way - this runs at resolution 1.
    this.app.ticker.maxFPS = def.fps ?? 30;

    // uTime + uResolution (driven here) merged with the variant's palette. A
    // plain (non-UBO) group so the WebGL path binds each uniform by name
    // straight into the fragment shader.
    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uResolution: {
        value: new Float32Array([this.app.renderer.width, this.app.renderer.height]),
        type: 'vec2<f32>',
      },
      ...def.uniforms,
    });

    const shader = Shader.from({
      gl: { vertex: BACKGROUND_VERTEX, fragment: def.fragment },
      resources: { bgUniforms: this.uniforms },
    });

    // One clip-space quad. The vertex shader passes aPosition straight to
    // gl_Position, so it fills the viewport regardless of stage transform and
    // never needs reflowing on resize - only uResolution changes.
    const geometry = new MeshGeometry({
      positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });

    const mesh = new Mesh({ geometry, shader });
    mesh.eventMode = 'none';
    this.app.stage.addChild(mesh);

    this.resizeListener = () => {
      // Reassign (not mutate) so the uniform group re-uploads the new size.
      this.uniforms.uniforms.uResolution = new Float32Array([
        this.app.renderer.width,
        this.app.renderer.height,
      ]);
    };
    this.app.renderer.on('resize', this.resizeListener);

    this.app.ticker.add(this.onTick);

    // Expose the app on window in dev so the live scene/ticker can be inspected
    // from the page (per the workspace's Playwright testing guidance).
    if (import.meta.env.DEV) {
      const reg = ((window as unknown as { __bg?: Record<string, Application> }).__bg ??= {});
      reg[variant] = this.app;
    }
  }

  private onTick = (ticker: Ticker): void => {
    // Accumulate scaled delta (not performance.now) so the drift pauses with the
    // ticker and never grows large enough to lose float precision in the noise.
    this.time += ticker.deltaMS / 1000;
    this.uniforms.uniforms.uTime = this.time;
  };

  destroy(): void {
    this.app.ticker.remove(this.onTick);
    if (this.resizeListener) this.app.renderer.off('resize', this.resizeListener);
    if (import.meta.env.DEV) {
      const reg = (window as unknown as { __bg?: Record<string, Application> }).__bg;
      if (reg) delete reg[this.variant];
    }
    // `{ removeView: true }` (not `true`) so we DON'T release Pixi's global
    // resources on teardown: the TexturePool is a shared singleton, and on the
    // battle screen the fighters' Pixi app renders alongside this one - clearing
    // the pool here would crash that app's Text.destroy (returnTexture into a
    // wiped pool). The destroyed renderer frees its own GPU resources regardless.
    this.app.destroy({ removeView: true }, { children: true, texture: true });
  }
}
