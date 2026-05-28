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
import {
  fight,
  setTarget,
  applyDamage,
  applyDamageToPlayer,
  applyStatusToEnemy,
  applyStatusToPlayer,
  healPlayer,
  killEnemy,
  tickStatuses,
  type FightState,
} from '../state/fight';
import { playerEnchants, playerProfile } from '../state/player-profile';
import type { AttackProfile } from '../domain/attack-profile';
import type { DefenceProfile } from '../domain/defence-profile';
import { ENEMY_CATALOGUE } from '../domain/enemy-catalogue';
import type { Fighter } from '../domain/fighter';
import type { StatusType } from '../domain/enchant';
import { STATUS_DEFS } from '../domain/status';

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

interface FighterView {
  fighter: Fighter;
  container: Container;
  emojiText: Text;
  hpBg: Graphics;
  hpFill: Graphics;
  // Anchor position set by layout(). Lunge/knockback tweens move
  // container.x off this anchor, but the target ring (and anything else
  // that should sit still) reads from here so it doesn't bug out.
  homeX: number;
  homeY: number;
  // Status icons row sits above the HP bar; the per-status Text
  // objects are cached so we redraw fades each sync instead of
  // recreating them every frame.
  statusRow: Container;
  statusIcons: Map<StatusType, Text>;
}

export class Battlefield {
  private app!: Application;
  private views = new Map<string, FighterView>();
  private targetRing!: Graphics;
  private unsubscribe?: () => void;
  private resizeListener?: () => void;
  // Snapshot of the player's attack + defence profile taken at fight
  // start (and refreshed on equipped changes between fights). Equip is
  // blocked mid-combat so the snapshot is stable for the duration of
  // any one fight. Combat hooks (fireAttack, fireEnemyAttack, regen
  // tick) all read from these two fields so adding a new enchant
  // effect kind means editing the resolver, never the battlefield.
  private attack!: AttackProfile;
  private defence!: DefenceProfile;
  private cooldown = 0;
  // Regen drip below 1 hp/tick accumulates here until it rounds up to
  // a whole hit point we can actually apply.
  private regenAccum = 0;
  private damageNumbers = new Set<Text>();
  // Per-enemy attack cooldowns (seconds), keyed by Fighter id. Each tick
  // we decrement and fire an attack-on-player when the cooldown hits 0.
  private enemyCooldowns = new Map<string, number>();
  // Tracks the previous sync's inFight flag so we can detect the
  // false → true transition and re-snapshot the player profile.
  private prevInFight = false;
  // Adrenaline / speed-burst-on-kill: any enchant declaring the kind
  // sets this to (now + durationSec) on a kill. While now < value
  // the player's attack interval is scaled by (1 - bonusFraction).
  // Single global window - the strongest burst overrides.
  private adrenalineUntil = 0;
  private adrenalineBonus = 0;

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

    this.refreshProfile();
    this.cooldown = this.attack.interval;

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
        // Color-emoji glyphs (Noto COLRv1) often paint above the reported
        // ascender; without padding Pixi's canvas-to-texture upload clips
        // a sliver off the top of hair/horns/crowns.
        padding: 8,
      }),
    });
    emojiText.anchor.set(0.5, 1);

    const hpBg = new Graphics();
    const hpFill = new Graphics();
    const statusRow = new Container();
    statusRow.eventMode = 'none';

    container.addChild(emojiText, hpBg, hpFill, statusRow);

    if (fighter.kind === 'enemy') {
      container.eventMode = 'static';
      container.cursor = 'pointer';
      container.on('pointertap', () => setTarget(fighter.id));
    }

    return {
      fighter,
      container,
      emojiText,
      hpBg,
      hpFill,
      homeX: 0,
      homeY: 0,
      statusRow,
      statusIcons: new Map(),
    };
  }

  private onTick = (ticker: Ticker): void => {
    const state = get(fight);
    if (!state.inFight || state.enemies.length === 0) return;
    // Pause all combat (player attacks, enemy attacks, regen) the
    // moment the player hits 0 HP so the death animation plays
    // uninterrupted by trailing enemy swings.
    if (state.player.hp <= 0) return;

    const dt = ticker.deltaMS / 1000;

    // Player auto-attack. A frozen player swings slower per
    // STATUS_DEFS.freeze.attackIntervalMul; Adrenaline speeds them up
    // for a few seconds after a kill.
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.fireAttack(state);
      const adrenalineMul =
        performance.now() / 1000 < this.adrenalineUntil ? 1 - this.adrenalineBonus : 1;
      this.cooldown = this.attack.interval * this.freezeMulFor(state.player) * adrenalineMul;
    }

    // Regeneration: drip player HP back over time (sub-1 hp/tick
    // accumulates so 50hp/sec at 60fps still ticks correctly).
    if (this.defence.hpRegenPerSec > 0 && state.player.hp > 0 && state.player.hp < state.player.maxHp) {
      this.regenAccum += this.defence.hpRegenPerSec * dt;
      if (this.regenAccum >= 1) {
        const heal = Math.floor(this.regenAccum);
        this.regenAccum -= heal;
        healPlayer(heal);
      }
    }

    // Statuses: age every active burn/bleed/poison/freeze/shock,
    // apply whole-hp DoT ticks, and float a coloured number on the
    // target view for each tick that landed.
    const events = tickStatuses(dt);
    for (const ev of events) {
      const view = this.views.get(ev.targetId);
      if (!view || view.container.destroyed) continue;
      const def = STATUS_DEFS[ev.status];
      this.spawnFloatNumber(view, `${def.emoji} -${ev.amount}`, def.color, 22);
    }

    // Per-enemy attacks: each enemy fires on its own catalogue-defined
    // interval, dealing its catalogue damage to the player.
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const def = ENEMY_CATALOGUE[enemy.name];
      if (!def) continue;
      const current = this.enemyCooldowns.get(enemy.id) ?? def.interval;
      const next = current - dt;
      if (next <= 0) {
        this.fireEnemyAttack(enemy, def);
        this.enemyCooldowns.set(enemy.id, def.interval * this.freezeMulFor(enemy));
      } else {
        this.enemyCooldowns.set(enemy.id, next);
      }
    }
    // Drop stale entries for enemies that no longer exist.
    if (this.enemyCooldowns.size > state.enemies.length) {
      const live = new Set(state.enemies.map((e) => e.id));
      for (const id of this.enemyCooldowns.keys()) {
        if (!live.has(id)) this.enemyCooldowns.delete(id);
      }
    }
  };


  private fireAttack(state: FightState): void {
    if (!state.targetId) return;
    const target = state.enemies.find((e) => e.id === state.targetId);
    if (!target || target.hp <= 0) return;

    const view = this.views.get(state.targetId);
    if (!view || view.container.destroyed) return;

    this.playAttackSwing(view);

    // Enemy dodge: the catalogue defines a per-enemy dodge chance;
    // when it procs the swing animations still play (swing + slash)
    // but no damage lands and we float "Miss" instead.
    const enemyDef = ENEMY_CATALOGUE[target.name];
    const enemyDodge = enemyDef?.dodge ?? 0;
    if (enemyDodge > 0 && Math.random() < enemyDodge) {
      this.spawnFloatNumber(view, 'Miss', '#aaaaaa', 28);
      this.spawnSlash(view);
      return;
    }

    this.landDamage(state, target, view, /* isExtraStrike */ false);

    // Multistrike: each enchant rolls independently; on a proc the
    // attack fires a second time at the same target. Cheap recursion -
    // the second land skips the swing animation and the dodge / mults
    // roll fresh so the visual reads as a flurry.
    for (const enchant of get(playerEnchants)) {
      for (const eff of enchant.effects) {
        if (eff.kind === 'multistrike-chance' && Math.random() < eff.chance) {
          const live = get(fight).enemies.find((e) => e.id === target.id);
          if (live && live.hp > 0) {
            this.landDamage(state, live, view, true);
          }
        }
      }
    }
  }

  // Applies a single landed hit: rolls crit, runs the equipped
  // damage modifiers (Smite / Bane / Berserker / Resonant Hum / etc.),
  // applies shock + thorns + lifesteal + on-hit statuses, and triggers
  // post-kill speed bursts. Extracted so Multistrike can fire it twice
  // without copy-pasting all the modifier code.
  private landDamage(
    state: FightState,
    target: Fighter,
    view: FighterView,
    isExtraStrike: boolean,
  ): void {
    const enchants = get(playerEnchants);
    const isCrit = this.attack.critChance > 0 && Math.random() < this.attack.critChance;
    let dmg = isCrit ? this.attack.damage * this.attack.critMultiplier : this.attack.damage;

    // Conditional / scaling damage modifiers. Multiplicative bonuses
    // stack as (1 + sum) so two Berserker stacks don't compound into
    // an explosion; flat adders (Resonant Hum, Doryani) sum into the
    // base before mult.
    let flatBonus = 0;
    let bonusFraction = 0;
    const targetFrac = target.maxHp > 0 ? target.hp / target.maxHp : 0;
    const playerFrac =
      state.player.maxHp > 0 ? state.player.hp / state.player.maxHp : 1;

    for (const enchant of enchants) {
      for (const eff of enchant.effects) {
        switch (eff.kind) {
          case 'damage-vs-high-hp':
            if (targetFrac >= eff.threshold) bonusFraction += eff.bonusFraction;
            break;
          case 'damage-vs-low-hp':
            if (targetFrac <= eff.threshold) bonusFraction += eff.bonusFraction;
            break;
          case 'damage-mul-low-hp': {
            // Berserker: +perPercentMissing per 10% HP missing, capped.
            const missing = Math.max(0, 1 - playerFrac);
            const stacks = Math.floor(missing * 10);
            bonusFraction += Math.min(eff.cap, stacks * eff.perPercentMissing);
            break;
          }
          case 'damage-from-max-hp':
            flatBonus += state.player.maxHp * eff.fractionOfMaxHp;
            break;
          case 'damage-per-max-hp':
            // Doryani's Heart: +eff.perHundred per +100 max HP.
            bonusFraction += (state.player.maxHp / 100) * eff.perHundred;
            break;
        }
      }
    }
    dmg = (dmg + flatBonus) * (1 + bonusFraction);

    // Shocked targets take takeDamageMul more damage from every
    // source. Stacks multiplicatively with crit / bonuses.
    const shockMul = target.statuses?.shock ? STATUS_DEFS.shock.takeDamageMul ?? 1 : 1;
    const damage = Math.max(1, Math.round(dmg * shockMul));

    if (isCrit) {
      this.spawnFloatNumber(view, `-${damage}!`, '#ffd84a', 40);
    } else {
      this.spawnDamageNumber(view, damage);
    }
    this.playHitFlash(view);
    if (!isExtraStrike) this.playHitReact(view);
    this.spawnSlash(view);
    applyDamage(target.id, damage);

    // Knockback: per-enchant roll, on proc push the target's next
    // attack out by durationSec.
    for (const enchant of enchants) {
      for (const eff of enchant.effects) {
        if (eff.kind === 'knockback-on-hit' && Math.random() < eff.chance) {
          const current = this.enemyCooldowns.get(target.id) ?? 0;
          this.enemyCooldowns.set(target.id, current + eff.durationSec);
          this.spawnFloatNumber(view, '👊', '#aaaaaa', 28);
        }
      }
    }

    // Weapon status-on-hit (Pyroclasm burn, Frostbite freeze, etc.).
    // Independent rolls per effect; landed statuses get a tiny icon
    // float on the target so the proc reads.
    for (const enchant of enchants) {
      for (const eff of enchant.effects) {
        if (eff.kind === 'status-on-hit' && Math.random() < eff.chance) {
          applyStatusToEnemy(target.id, eff.status);
          const def = STATUS_DEFS[eff.status];
          this.spawnFloatNumber(view, def.emoji, def.color, 28);
        }
      }
    }

    // Vampiric / Lifedrain: heal the player by a fraction of damage
    // dealt. Numbers float green above the player so the heal is
    // visible in the chaos.
    if (this.attack.lifesteal > 0 && state.player.hp > 0) {
      const heal = Math.round(damage * this.attack.lifesteal);
      if (heal > 0) {
        healPlayer(heal);
        const playerView = this.views.get(state.player.id);
        if (playerView && !playerView.container.destroyed) {
          this.spawnFloatNumber(playerView, `+${heal}`, '#7fe57f', 28);
        }
      }
    }

    // Adrenaline / speed-burst-on-kill: if this hit dropped the
    // target to 0 HP, arm the post-kill speed window. Strongest
    // burst wins (longest remaining time stays).
    const after = get(fight).enemies.find((e) => e.id === target.id);
    if (after && after.hp <= 0) {
      let bestBonus = 0;
      let bestDuration = 0;
      for (const enchant of enchants) {
        for (const eff of enchant.effects) {
          if (eff.kind === 'speed-burst-on-kill' && eff.bonusFraction > bestBonus) {
            bestBonus = eff.bonusFraction;
            bestDuration = eff.durationSec;
          }
        }
      }
      if (bestBonus > 0) {
        this.adrenalineBonus = bestBonus;
        const now = performance.now() / 1000;
        this.adrenalineUntil = Math.max(this.adrenalineUntil, now + bestDuration);
      }
    }
  }

  // Symmetric to fireAttack: an enemy lands a hit on the Player. Applies
  // damage, plays the same flash + recoil + slash + floating number combo
  // on the Player's view. Takes the full EnemyDef so this method can
  // read appliesStatus (Slime's poison) along with damage.
  private fireEnemyAttack(
    enemy: Fighter,
    def: { damage: number; appliesStatus?: StatusType },
  ): void {
    const damage = def.damage;
    const state = get(fight);
    if (state.player.hp <= 0) return;
    // Re-check the enemy against the LIVE store: the snapshot in onTick may
    // be stale if the player's attack this same tick killed this enemy.
    const liveEnemy = state.enemies.find((e) => e.id === enemy.id);
    if (!liveEnemy || liveEnemy.hp <= 0) return;
    const playerView = this.views.get(state.player.id);
    if (!playerView || playerView.container.destroyed) return;
    const enemyView = this.views.get(enemy.id);

    // Enemy lunges toward the player (symmetric to player lunge).
    if (enemyView && !enemyView.container.destroyed) {
      const originalX = enemyView.container.x;
      const dx = enemyView.container.x > playerView.container.x ? -28 : 28;
      gsap.killTweensOf(enemyView.container, 'x');
      const tl = gsap.timeline();
      tl.to(enemyView.container, { x: originalX + dx, duration: 0.08, ease: 'power2.out' });
      tl.to(enemyView.container, { x: originalX, duration: 0.18, ease: 'power2.inOut' });
    }

    // Player dodge: if the player dodges, no damage, no thorns - just
    // a "Miss" float over the player. The enemy's lunge still plays
    // so the attempt still reads on-screen.
    if (this.defence.dodge > 0 && Math.random() < this.defence.dodge) {
      this.spawnFloatNumber(playerView, 'Dodge', '#aaaaaa', 28);
      return;
    }

    // Flat damage reduction from Fortitude etc. Shock on the player
    // amplifies the incoming hit before DR is applied. Resists / big-
    // hit / low-hp modifiers will plug in here in a follow-up depth
    // pass.
    const playerShockMul = state.player.statuses?.shock ? STATUS_DEFS.shock.takeDamageMul ?? 1 : 1;
    let incoming = Math.round(damage * playerShockMul);
    if (this.defence.damageReduction > 0) {
      incoming = Math.max(1, Math.round(incoming * (1 - this.defence.damageReduction)));
    }

    this.spawnDamageNumber(playerView, incoming);
    this.playHitFlash(playerView);
    this.playHitReact(playerView);
    this.spawnSlash(playerView);
    applyDamageToPlayer(incoming);

    // Enemy-applied status (e.g. Slime's poison): roll a flat 30%
    // chance per hit, respecting player's Hex Ward / Eternal Vigil.
    if (def.appliesStatus && Math.random() < 0.3 && this.playerCanBeStatused(def.appliesStatus)) {
      applyStatusToPlayer(def.appliesStatus);
      const sd = STATUS_DEFS[def.appliesStatus];
      this.spawnFloatNumber(playerView, sd.emoji, sd.color, 28);
    }

    // Armor aura-on-hit (Burn Aura, Frost Aura, etc.): each rolls
    // independently and inflicts its status on the attacking enemy.
    if (enemyView && !enemyView.container.destroyed) {
      for (const enchant of get(playerEnchants)) {
        for (const eff of enchant.effects) {
          if (eff.kind === 'aura-on-hit' && Math.random() < eff.chance) {
            applyStatusToEnemy(enemy.id, eff.status);
            const sd = STATUS_DEFS[eff.status];
            this.spawnFloatNumber(enemyView, sd.emoji, sd.color, 28);
          }
        }
      }
    }

    // Thorns: flat reflect to the attacker. The attacker's hit flash
    // + damage number play so the player sees the reflect land.
    if (this.defence.thornsFlat > 0 && enemyView && !enemyView.container.destroyed) {
      const reflect = this.defence.thornsFlat;
      this.spawnDamageNumber(enemyView, reflect);
      this.playHitFlash(enemyView);
      applyDamage(enemy.id, reflect);
    }
  }

  // Status resist roll for the player: Eternal Vigil makes them
  // immune outright; otherwise sum every Hex Ward stack and roll.
  // Returns true if the status should land.
  private playerCanBeStatused(_status: StatusType): boolean {
    let totalResist = 0;
    for (const enchant of get(playerEnchants)) {
      for (const eff of enchant.effects) {
        if (eff.kind === 'status-immune') return false;
        if (eff.kind === 'status-resist-chance') totalResist += eff.chance;
      }
    }
    if (totalResist <= 0) return true;
    return Math.random() >= Math.min(1, totalResist);
  }

  // Multiplier on `interval` for an attacker who's currently frozen.
  // 1.0 = unaffected; 1.6 = swings 60% slower while the freeze lasts.
  private freezeMulFor(f: Fighter): number {
    return f.statuses?.freeze ? STATUS_DEFS.freeze.attackIntervalMul ?? 1 : 1;
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

  // Brief red tint on the target's emoji via a ColorMatrixFilter whose
  // alpha fades from 1 to 0 over ~200ms. Applied to the emoji Text only
  // so the HP bar stays its normal colour. Filter is removed on
  // completion so they don't accumulate.
  private playHitFlash(view: FighterView): void {
    if (view.container.destroyed) return;
    const cm = new ColorMatrixFilter();
    cm.tint(0xff3030, false);
    cm.alpha = 1;
    view.emojiText.filters = [cm];
    gsap.to(cm, {
      alpha: 0,
      duration: 0.2,
      ease: 'power2.out',
      onComplete: () => {
        if (!view.container.destroyed) view.emojiText.filters = [];
      },
    });
  }

  // Horizontal knockback to telegraph the hit: the emoji jolts a few
  // pixels away from the player, then springs back with an elastic
  // ease. Operates on view.emojiText.x so the HP bar (a sibling
  // Graphics in view.container) doesn't move with it.
  private playHitReact(view: FighterView): void {
    if (view.container.destroyed) return;
    const playerView = this.views.get(get(fight).player.id);
    if (!playerView) return;
    const dx = view.container.x > playerView.container.x ? 14 : -14;

    gsap.killTweensOf(view.emojiText, 'x');
    view.emojiText.x = 0;
    const tl = gsap.timeline();
    tl.to(view.emojiText, { x: dx, duration: 0.08, ease: 'power2.out' });
    tl.to(view.emojiText, { x: 0, duration: 0.3, ease: 'elastic.out(1, 0.5)' });
  }

  // Vertical slash: the line redraws each tween tick growing from the
  // top point downward, then fades out. Looks like a slash being struck
  // through the character in one swift motion.
  private spawnSlash(view: FighterView): void {
    if (view.container.destroyed) return;
    const cx = view.container.x;
    const cy = view.container.y - view.emojiText.height * 0.5;
    const halfH = view.emojiText.height * 0.55;

    const slash = new Graphics();
    slash.eventMode = 'none';
    slash.x = cx;
    slash.y = cy;
    // Full 360° random rotation so consecutive hits read with variety.
    slash.rotation = Math.random() * Math.PI * 2;
    this.app.stage.addChild(slash);

    const state = { progress: 0 };
    const redraw = (): void => {
      slash.clear();
      const endY = -halfH + state.progress * (halfH * 2);
      slash
        .moveTo(0, -halfH)
        .lineTo(0, endY)
        .stroke({ color: 0xffeebb, width: 8, cap: 'round', alpha: 0.85 });
      slash
        .moveTo(0, -halfH)
        .lineTo(0, endY)
        .stroke({ color: 0xffffff, width: 2, cap: 'round', alpha: 1 });
    };

    const tl = gsap.timeline({
      onComplete: () => {
        if (!slash.destroyed) slash.destroy();
      },
    });
    tl.to(state, { progress: 1, duration: 0.12, ease: 'power2.out', onUpdate: redraw });
    tl.to(slash, { alpha: 0, duration: 0.22, ease: 'power2.in' });
  }

  private spawnDamageNumber(view: FighterView, amount: number): void {
    this.spawnFloatNumber(view, `-${amount}`, '#ff5252', 32);
  }

  // Generic floating number / label above a fighter view. Used for
  // damage, crits, dodges ("Miss"), and lifesteal heals. Same upward
  // drift + fade-out animation regardless of payload.
  private spawnFloatNumber(view: FighterView, label: string, color: string, fontSize: number): void {
    const text = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: UI_FONT_STACK,
        fontSize,
        fontWeight: 'bold',
        fill: color,
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

  // Same death visual for player and enemies: scale to 0 + fade out
  // with a back-in ease. Enemies are removed from fight state via
  // killEnemy (rolls loot, frees the slot). The player has no such
  // bookkeeping - run.ts handles the run-lost transition on its own
  // ~timer~ matching DEATH_DURATION.
  private playDeath(view: FighterView): void {
    if (view.container.destroyed) return;
    view.container.eventMode = 'none';

    const id = view.fighter.id;
    if (view.fighter.kind === 'enemy') killEnemy(id);

    // Stop any in-flight hit-react / enemy-lunge tweens so the death
    // animation takes over cleanly.
    gsap.killTweensOf(view.container);
    gsap.killTweensOf(view.emojiText);
    gsap.killTweensOf(view.emojiText.scale);
    view.emojiText.x = 0;
    view.emojiText.rotation = 0;
    view.emojiText.scale.set(1, 1);

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
    // Resnap player profile + reset cooldowns at every fresh fight start
    // so equipment changes in the prior Map / Rest screen apply now.
    if (state.inFight && !this.prevInFight) {
      this.refreshProfile();
      this.cooldown = this.attack.interval;
      this.regenAccum = 0;
      this.adrenalineUntil = 0;
      this.adrenalineBonus = 0;
    }
    this.prevInFight = state.inFight;

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
      this.drawStatusRow(view);

      if (prevHp > 0 && next.hp <= 0) {
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
      player.homeX = w * 0.2;
      player.homeY = groundY;
      player.container.x = player.homeX;
      player.container.y = player.homeY;
    }

    const enemyCount = state.enemies.length;
    const startX = w * 0.55;
    const endX = w * 0.9;
    state.enemies.forEach((enemy, i) => {
      const view = this.views.get(enemy.id);
      if (!view) return;
      view.homeX =
        enemyCount === 1
          ? (startX + endX) / 2
          : startX + ((endX - startX) / (enemyCount - 1)) * i;
      view.homeY = groundY;
      view.container.x = view.homeX;
      view.container.y = view.homeY;
    });

    for (const view of this.views.values()) {
      this.drawHpBar(view);
    }
    this.drawTargetRing(state);
  }

  private drawHpBar(view: FighterView): void {
    const ratio = view.fighter.maxHp > 0 ? view.fighter.hp / view.fighter.maxHp : 0;
    const x = -HP_BAR_WIDTH / 2;
    // Lifted clear of the emoji head + a bit more so the squash/rotation
    // hit-react can't cover the bar.
    const y = -view.emojiText.height - HP_BAR_HEIGHT - 28;

    view.hpBg.clear().roundRect(x, y, HP_BAR_WIDTH, HP_BAR_HEIGHT, 3).fill(0x2a2a34);

    view.hpFill.clear();
    if (ratio > 0) {
      view.hpFill
        .roundRect(x, y, HP_BAR_WIDTH * ratio, HP_BAR_HEIGHT, 3)
        .fill(view.fighter.kind === 'player' ? 0x55cc66 : 0xcc4444);
    }
  }

  // Row of small emoji icons (🔥🩸☠️❄️⚡) above the HP bar
  // showing which statuses are currently applied. Icon alpha fades
  // from 1 down to 0.35 as remainingSec drains, so the player can
  // see at a glance which DoTs are about to expire. Icons are
  // cached per status to avoid recreating Text objects every frame
  // (sync fires every tick because tickStatuses writes the store).
  private drawStatusRow(view: FighterView): void {
    const statuses = view.fighter.statuses ?? {};
    const active = Object.keys(statuses) as StatusType[];

    for (const [key, icon] of view.statusIcons) {
      if (!(key in statuses)) {
        icon.destroy();
        view.statusIcons.delete(key);
      }
    }

    for (const key of active) {
      const inst = statuses[key];
      const def = STATUS_DEFS[key];
      if (!inst || !def) continue;
      let icon = view.statusIcons.get(key);
      if (!icon) {
        icon = new Text({
          text: def.emoji,
          style: new TextStyle({
            fontFamily: EMOJI_FONT_STACK,
            fontSize: 20,
            padding: 4,
          }),
        });
        icon.anchor.set(0.5, 1);
        icon.eventMode = 'none';
        view.statusRow.addChild(icon);
        view.statusIcons.set(key, icon);
      }
      const durationFrac = Math.max(0, Math.min(1, inst.remainingSec / def.durationSec));
      icon.alpha = 0.35 + durationFrac * 0.65;
    }

    // Center the row above the HP bar.
    const visible: Text[] = [];
    for (const key of active) {
      const icon = view.statusIcons.get(key);
      if (icon) visible.push(icon);
    }
    const spacing = 22;
    const totalWidth = Math.max(0, (visible.length - 1) * spacing);
    let x = -totalWidth / 2;
    for (const icon of visible) {
      icon.x = x;
      x += spacing;
    }
    view.statusRow.y = -view.emojiText.height - HP_BAR_HEIGHT - 32;
  }

  private drawTargetRing(state: FightState): void {
    this.targetRing.clear();
    if (!state.targetId) return;
    const view = this.views.get(state.targetId);
    if (!view || view.container.destroyed) return;

    // Anchor to the view's home position so attack-swing lunges and
    // knockbacks slide the enemy off the ring instead of dragging the
    // ring around with them.
    this.targetRing
      .ellipse(view.homeX, view.homeY + 6, 62, 14)
      .stroke({ color: 0xffcc44, width: 3, alpha: 0.9 });
  }

  private refreshProfile(): void {
    const p = get(playerProfile);
    this.attack = p.attack;
    this.defence = p.defence;
  }

  destroy(): void {
    this.app.ticker.remove(this.onTick);
    this.unsubscribe?.();
    if (this.resizeListener) this.app.renderer.off('resize', this.resizeListener);
    // Nuke every in-flight GSAP tween before destroying the Pixi objects
    // they reference: hit-flash filters, attack swings, knockbacks,
    // slashes, damage numbers, death scale/alpha tweens, etc. Anything
    // less is whack-a-mole.
    gsap.globalTimeline.clear();
    this.damageNumbers.clear();
    this.enemyCooldowns.clear();
    this.app.destroy(true, { children: true, texture: true });
    this.views.clear();
  }
}
