import {
  Application,
  ColorMatrixFilter,
  Container,
  Graphics,
  Text,
  TextStyle,
  type Ticker,
} from 'pixi.js';
import { get } from 'svelte/store';
import gsap from 'gsap';
import { fight, setTarget, applyDamage, removeEnemy, type FightState } from '../state/fight';
import { resolveProfile, type AttackProfile } from '../domain/attack-profile';
import type { Enchantment } from '../domain/enchant';
import { SHARPNESS } from '../domain/enchant-catalogue';
import type { Fighter } from '../domain/fighter';

const EMOJI_FONT_STACK = [
  'Noto Color Emoji',
  'Apple Color Emoji',
  'Segoe UI Emoji',
  'sans-serif',
];

const UI_FONT_STACK = ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'];

const EMOJI_SIZE = 96;
const HP_BAR_WIDTH = 120;
const HP_BAR_HEIGHT = 10;
const DEATH_DURATION = 0.3;
const DAMAGE_NUMBER_DURATION = 0.8;

// Step 3 placeholder: one Sharpness enchant on a single weapon item.
// A later step replaces this with the real equipped-inventory store.
const HARDCODED_INVENTORY: Enchantment[] = [SHARPNESS];

interface FighterView {
  fighter: Fighter;
  container: Container;
  emojiText: Text;
  hpBg: Graphics;
  hpFill: Graphics;
}

export class Battlefield {
  private app!: Application;
  private views = new Map<string, FighterView>();
  private targetRing!: Graphics;
  private unsubscribe?: () => void;
  private resizeListener?: () => void;
  private profile!: AttackProfile;
  private cooldown = 0;
  private damageNumbers = new Set<Text>();

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: parent,
      // Transparent canvas: the parent .battlefield div paints its own
      // CSS gradient + vignette behind the Pixi scene.
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    parent.appendChild(this.app.canvas);

    const initial = get(fight);
    const allEmojis = [initial.player, ...initial.enemies].map((f) => f.emoji).join('');
    await document.fonts.load(`${EMOJI_SIZE}px "Noto Color Emoji"`, allEmojis);

    this.targetRing = new Graphics();
    this.targetRing.eventMode = 'none';
    this.app.stage.addChild(this.targetRing);

    this.buildViews(initial);

    this.profile = resolveProfile(HARDCODED_INVENTORY);
    this.cooldown = this.profile.interval;

    this.unsubscribe = fight.subscribe((state) => this.sync(state));

    this.resizeListener = () => this.layout(get(fight));
    this.app.renderer.on('resize', this.resizeListener);

    this.app.ticker.add(this.onTick);
  }

  private buildViews(state: FightState): void {
    for (const fighter of [state.player, ...state.enemies]) {
      const view = this.makeView(fighter);
      this.views.set(fighter.id, view);
      this.app.stage.addChild(view.container);
    }
    this.layout(state);
  }

  private makeView(fighter: Fighter): FighterView {
    const container = new Container();

    const emojiText = new Text({
      text: fighter.emoji,
      style: new TextStyle({
        fontFamily: EMOJI_FONT_STACK,
        fontSize: EMOJI_SIZE,
        fill: '#ffffff',
      }),
    });
    emojiText.anchor.set(0.5, 1);

    const hpBg = new Graphics();
    const hpFill = new Graphics();

    container.addChild(emojiText, hpBg, hpFill);

    if (fighter.kind === 'enemy') {
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.on('pointertap', () => setTarget(fighter.id));
    }

    return { fighter, container, emojiText, hpBg, hpFill };
  }

  private onTick = (ticker: Ticker): void => {
    const state = get(fight);
    if (!state.inFight || state.enemies.length === 0) return;

    this.cooldown -= ticker.deltaMS / 1000;
    if (this.cooldown <= 0) {
      this.fireAttack(state);
      this.cooldown = this.profile.interval;
    }
  };


  private fireAttack(state: FightState): void {
    if (!state.targetId) return;
    const target = state.enemies.find((e) => e.id === state.targetId);
    if (!target || target.hp <= 0) return;

    const view = this.views.get(state.targetId);
    if (!view || view.container.destroyed) return;

    this.playAttackSwing(view);
    this.spawnDamageNumber(view, this.profile.damage);
    this.playHitFlash(view);
    applyDamage(state.targetId, this.profile.damage);
  }

  // Quick lunge of the Player container toward the target, then snap back.
  // Cheap "I just swung" beat without any animation framework.
  private playAttackSwing(targetView: FighterView): void {
    const playerView = this.views.get(get(fight).player.id);
    if (!playerView || playerView.container.destroyed) return;
    const originalX = playerView.container.x;
    const dx = targetView.container.x > originalX ? 28 : -28;
    gsap.killTweensOf(playerView.container, 'x');
    const tl = gsap.timeline();
    tl.to(playerView.container, { x: originalX + dx, duration: 0.08, ease: 'power2.out' });
    tl.to(playerView.container, { x: originalX, duration: 0.18, ease: 'power2.inOut' });
  }

  // Brief red tint on the target via a ColorMatrixFilter whose alpha
  // fades from 1 to 0 over ~200ms. Filter is removed on completion so
  // it doesn't accumulate.
  private playHitFlash(view: FighterView): void {
    if (view.container.destroyed) return;
    const cm = new ColorMatrixFilter();
    cm.tint(0xff3030, false);
    cm.alpha = 1;
    view.container.filters = [cm];
    gsap.to(cm, {
      alpha: 0,
      duration: 0.2,
      ease: 'power2.out',
      onComplete: () => {
        if (!view.container.destroyed) view.container.filters = [];
      },
    });
  }

  private spawnDamageNumber(view: FighterView, amount: number): void {
    const text = new Text({
      text: amount.toString(),
      style: new TextStyle({
        fontFamily: UI_FONT_STACK,
        fontSize: 32,
        fontWeight: 'bold',
        fill: '#ffd866',
        stroke: { color: 0x000000, width: 4 },
      }),
    });
    text.anchor.set(0.5, 1);
    text.eventMode = 'none';
    text.x = view.container.x + (Math.random() - 0.5) * 40;
    text.y = view.container.y - view.emojiText.height - 24;
    this.app.stage.addChild(text);
    this.damageNumbers.add(text);

    gsap.to(text, {
      y: text.y - 70,
      alpha: 0,
      duration: DAMAGE_NUMBER_DURATION,
      ease: 'power2.out',
      onComplete: () => {
        this.damageNumbers.delete(text);
        if (!text.destroyed) text.destroy();
      },
    });
  }

  private playDeath(view: FighterView): void {
    if (view.container.destroyed) return;
    view.container.eventMode = 'none';

    const id = view.fighter.id;
    removeEnemy(id);

    gsap.to(view.container.scale, {
      x: 0,
      y: 0,
      duration: DEATH_DURATION,
      ease: 'back.in(2)',
    });
    gsap.to(view.container, {
      alpha: 0,
      duration: DEATH_DURATION,
      ease: 'power2.in',
      onComplete: () => {
        this.views.delete(id);
        if (!view.container.destroyed) view.container.destroy({ children: true });
      },
    });
  }

  private sync(state: FightState): void {
    const byId = new Map<string, Fighter>([
      [state.player.id, state.player],
      ...state.enemies.map((e) => [e.id, e] as const),
    ]);

    // Spawn views for any state fighters that don't yet have one (new fight
    // room entered OR a boss phase-spawn during combat).
    const newlyAdded: FighterView[] = [];
    for (const fighter of [state.player, ...state.enemies]) {
      if (this.views.has(fighter.id)) continue;
      const view = this.makeView(fighter);
      this.views.set(fighter.id, view);
      this.app.stage.addChild(view.container);
      newlyAdded.push(view);
    }
    if (newlyAdded.length > 0) {
      this.layout(state);
      // Mid-fight spawns (boss adds) get a fade + scale-in flourish so they
      // don't pop in stiffly. Initial fight build also runs this but with the
      // same nice entrance - cheap and consistent.
      for (const view of newlyAdded) {
        if (view.fighter.kind !== 'enemy') continue;
        view.container.alpha = 0;
        view.container.scale.set(0.4, 0.4);
        gsap.to(view.container, { alpha: 1, duration: 0.3, ease: 'power2.out' });
        gsap.to(view.container.scale, {
          x: 1,
          y: 1,
          duration: 0.45,
          ease: 'back.out(2.2)',
        });
      }
    }

    for (const view of this.views.values()) {
      const next = byId.get(view.fighter.id);
      if (!next) continue;

      const prevHp = view.fighter.hp;
      view.fighter = next;
      this.drawHpBar(view);

      if (prevHp > 0 && next.hp <= 0 && next.kind === 'enemy') {
        this.playDeath(view);
      }
    }
    this.drawTargetRing(state);
  }

  private layout(state: FightState): void {
    const w = this.app.screen.width;
    const h = this.app.screen.height;
    const groundY = h * 0.68;

    const player = this.views.get(state.player.id);
    if (player) {
      player.container.x = w * 0.2;
      player.container.y = groundY;
    }

    const enemyCount = state.enemies.length;
    const startX = w * 0.55;
    const endX = w * 0.9;
    state.enemies.forEach((enemy, i) => {
      const view = this.views.get(enemy.id);
      if (!view) return;
      view.container.x =
        enemyCount === 1
          ? (startX + endX) / 2
          : startX + ((endX - startX) / (enemyCount - 1)) * i;
      view.container.y = groundY;
    });

    for (const view of this.views.values()) {
      this.drawHpBar(view);
    }
    this.drawTargetRing(state);
  }

  private drawHpBar(view: FighterView): void {
    const ratio = view.fighter.maxHp > 0 ? view.fighter.hp / view.fighter.maxHp : 0;
    const x = -HP_BAR_WIDTH / 2;
    const y = -view.emojiText.height - HP_BAR_HEIGHT - 12;

    view.hpBg.clear().roundRect(x, y, HP_BAR_WIDTH, HP_BAR_HEIGHT, 3).fill(0x2a2a34);

    view.hpFill.clear();
    if (ratio > 0) {
      view.hpFill
        .roundRect(x, y, HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT, 3)
        .fill(view.fighter.kind === 'player' ? 0x55cc66 : 0xcc4444);
    }
  }

  private drawTargetRing(state: FightState): void {
    this.targetRing.clear();
    if (!state.targetId) return;
    const view = this.views.get(state.targetId);
    if (!view || view.container.destroyed) return;

    this.targetRing
      .ellipse(view.container.x, view.container.y + 6, 62, 14)
      .stroke({ color: 0xffcc44, width: 3, alpha: 0.9 });
  }

  destroy(): void {
    this.app.ticker.remove(this.onTick);
    this.unsubscribe?.();
    if (this.resizeListener) this.app.renderer.off('resize', this.resizeListener);
    for (const view of this.views.values()) {
      gsap.killTweensOf(view.container);
      gsap.killTweensOf(view.container.scale);
    }
    for (const text of this.damageNumbers) {
      gsap.killTweensOf(text);
    }
    this.damageNumbers.clear();
    this.app.destroy(true, { children: true, texture: true });
    this.views.clear();
  }
}
