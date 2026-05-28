import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { get } from 'svelte/store';
import { fight, setTarget, type FightState } from '../state/fight';
import type { Fighter } from '../domain/fighter';

const EMOJI_FONT_STACK = [
  'Noto Color Emoji',
  'Apple Color Emoji',
  'Segoe UI Emoji',
  'sans-serif',
];

const EMOJI_SIZE = 96;
const HP_BAR_WIDTH = 120;
const HP_BAR_HEIGHT = 10;

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

  async init(parent: HTMLElement): Promise<void> {
    this.app = new Application();
    await this.app.init({
      resizeTo: parent,
      backgroundColor: 0x14141a,
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

    this.unsubscribe = fight.subscribe((state) => this.sync(state));

    this.resizeListener = () => this.layout(get(fight));
    this.app.renderer.on('resize', this.resizeListener);
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

  private sync(state: FightState): void {
    const fightersById = new Map<string, Fighter>([
      [state.player.id, state.player],
      ...state.enemies.map((e) => [e.id, e] as const),
    ]);
    for (const view of this.views.values()) {
      const next = fightersById.get(view.fighter.id);
      if (next) view.fighter = next;
      this.drawHpBar(view);
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

    view.hpBg
      .clear()
      .roundRect(x, y, HP_BAR_WIDTH, HP_BAR_HEIGHT, 3)
      .fill(0x2a2a34);

    if (ratio > 0) {
      view.hpFill
        .clear()
        .roundRect(x, y, HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT, 3)
        .fill(view.fighter.kind === 'player' ? 0x55cc66 : 0xcc4444);
    } else {
      view.hpFill.clear();
    }
  }

  private drawTargetRing(state: FightState): void {
    this.targetRing.clear();
    if (!state.targetId) return;
    const view = this.views.get(state.targetId);
    if (!view) return;

    this.targetRing
      .ellipse(view.container.x, view.container.y + 6, 62, 14)
      .stroke({ color: 0xffcc44, width: 3, alpha: 0.9 });
  }

  destroy(): void {
    this.unsubscribe?.();
    if (this.resizeListener) this.app.renderer.off('resize', this.resizeListener);
    this.app.destroy(true, { children: true, texture: true });
    this.views.clear();
  }
}
