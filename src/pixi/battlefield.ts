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
  applyDamage,
  applyDamageToPlayer,
  applyStatusToEnemy,
  applyStatusToPlayer,
  applyTauntLock,
  healPlayer,
  killEnemy,
  setPlayerMaxHp,
  tickStatuses,
  tickTargetLock,
  type FightState,
} from '../state/fight';
import { playerEffects, playerProcs, playerProfile } from '../state/player-profile';
import { simSpeed } from '../state/sim-speed';
import type { AttackProfile } from '../domain/attack-profile';
import type { DefenceProfile } from '../domain/defence-profile';
import { ENEMY_CATALOGUE } from '../domain/enemy-catalogue';
import type { Fighter } from '../domain/fighter';
import type { StatusType } from '../domain/enchant';
import type { ProcTrigger } from '../domain/gem';
import { type ResolvedProc } from '../domain/gem-resolution';
import { STATUS_DEFS } from '../domain/status';
import { addRewardGold } from '../state/rewards';
import { playProcSfx, playStatusSfx, sfx } from '../audio/sfx';

// Context for a proc firing: the optional event anchor a reactive
// trigger carries (the corpse for on-kill, the crit target for on-crit,
// the attacker for on-hit-taken) so targeting can focus on it. Empty
// for the self-firing timer / continuous triggers.
interface ProcContext {
  anchorId?: string;
}

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
  // Player-only cyan overlay on the HP bar showing the absorb shield
  // (Bulwark). Stays empty for enemies (they carry no shield).
  shieldFill: Graphics;
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
  // Smoothly-eased HP fraction used by drawHpBar. Eases each frame
  // toward fighter.hp / fighter.maxHp so the bar slides instead of
  // snapping when damage / heal lands.
  displayedHpFrac: number;
  // Smoothly-eased shield fraction (playerShield / maxHp) for the shield
  // overlay; eases toward the live absorb pool like displayedHpFrac.
  displayedShieldFrac: number;
  // Thin attack-cooldown progress bar below the HP bar. Filled as
  // the cooldown drains toward 0 (gold for player, red for enemies).
  cooldownBar: Graphics;
  // Player-only: a row of small radial gauges (one per proc with a cooldown)
  // shown ABOVE the status row. Each fills as its proc nears firing. procSig
  // (joined proc source ids) detects when the set of procs changed so the
  // slots are rebuilt; otherwise they're updated in place each frame.
  procRow: Container;
  procRadials: { ring: Graphics; emoji: Text }[];
  procSig: string;
}

export class Battlefield {
  private app!: Application;
  private views = new Map<string, FighterView>();
  private targetRing!: Graphics;
  private unsubscribe?: () => void;
  private unsubProfile?: () => void;
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
  // Adrenaline / speed-burst-on-kill: any gem stat declaring the kind
  // sets this to (now + durationSec) on a kill. While now < value
  // the player's attack interval is scaled by (1 - bonusFraction).
  // Single global window - the strongest burst overrides.
  private adrenalineUntil = 0;
  private adrenalineBonus = 0;
  // Razor Wit / on-dodge-damage-buff: dodge sets the window; while
  // active landDamage adds bonus to the player's damage. Single
  // global window; strongest buff wins.
  private dodgeBuffUntil = 0;
  private dodgeBuffBonus = 0;
  // Mirror Image (mirror-charge): one stored decoy that absorbs the
  // next hit. Charge regenerates after intervalSec while a mirror-
  // charge enchant is equipped.
  private mirrorCharge = 0;
  private mirrorChargeTimer = 0;
  // Lichcrown (on-kill-aura): after a kill, a random aura status is
  // armed and inflicted on attackers (at the same 15% rate as armor
  // auras) while the timer holds.
  private lichcrownAura: StatusType | null = null;
  private lichcrownUntil = 0;
  // Stoic (stoic): a queue of DoT-style payments owed to the player.
  // Each entry drips perSec damage per frame until remainingSec
  // expires.
  private delayedPlayerDamage: { perSec: number; remainingSec: number; accumulator: number }[] = [];
  // Camera shake: scratch offset applied to stage position. Kicked
  // by big moments (crit, kill, player hit) and decays each tick.
  private shakeIntensity = 0;
  // Per-enemy taunt cooldowns (seconds). Each enemy with a taunt
  // entry in the catalogue counts down from intervalSec; on 0 it
  // yanks the player's target onto itself and locks it for
  // durationSec via applyTauntLock.
  private tauntCooldowns = new Map<string, number>();
  // Gem proc engine: the central scheduler for active procs (see
  // docs/gems.md § The proc engine). Each entry pairs a resolved proc
  // with its remaining cooldown. Built when a fight becomes active
  // (buildProcs) and cleared when it ends. In onTick the self-driving
  // triggers run off `remaining`: `timer` drains it and fires + resets
  // at 0; `continuous` treats cooldownSec as a tick interval and fires
  // on that cadence. The reactive triggers (`on-kill` / `on-crit` /
  // `on-hit-taken`) ignore `remaining` and fire from combat events via
  // fireProcsForTrigger.
  private activeProcs: { proc: ResolvedProc; remaining: number }[] = [];
  // Player shield (Bulwark): an absorb pool that soaks incoming damage
  // before it reaches HP. Refilled by shield procs; the damage path in
  // fireEnemyAttack drains it first, and the death pause leaves it be.
  private playerShield = 0;
  // Proc self-buff window (Time Warp): a buff payload sets this to
  // (now + durationSec) and stores the attack-speed bonus. While now <
  // value the player's attack interval is scaled by 1/(1 + bonus). Kept
  // separate from the on-kill adrenaline window so the two stack
  // cleanly; the strongest buff wins.
  private procBuffUntil = 0;
  private procBuffBonus = 0;

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
    // Live-refresh combat profile whenever equipped gear changes,
    // including mid-fight (the player is allowed to swap items in
    // combat). Updates maxHp / hp clamp via setPlayerMaxHp so a
    // Vitality unequip can't leave the player above their cap.
    this.unsubProfile = playerProfile.subscribe((p) => {
      this.attack = p.attack;
      this.defence = p.defence;
      const live = get(fight);
      if (live.inFight && live.player.maxHp !== p.defence.maxHp) {
        setPlayerMaxHp(p.defence.maxHp);
      }
    });

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
    const shieldFill = new Graphics();
    const cooldownBar = new Graphics();
    const statusRow = new Container();
    statusRow.eventMode = 'none';
    const procRow = new Container();
    procRow.eventMode = 'none';

    // shieldFill sits above hpFill so the absorb pool overlays the health.
    container.addChild(emojiText, hpBg, hpFill, shieldFill, cooldownBar, statusRow, procRow);

    // No manual targeting: enemies aren't clickable. The engine auto-picks the
    // target (fight.ts sets it on start, retargets when one dies, and a taunt
    // can force it); the target ring just shows who's currently being hit.

    return {
      fighter,
      container,
      emojiText,
      hpBg,
      hpFill,
      shieldFill,
      homeX: 0,
      homeY: 0,
      statusRow,
      statusIcons: new Map(),
      displayedHpFrac: fighter.maxHp > 0 ? fighter.hp / fighter.maxHp : 0,
      displayedShieldFrac: 0,
      cooldownBar,
      procRow,
      procRadials: [],
      procSig: '',
    };
  }

  private onTick = (ticker: Ticker): void => {
    const state = get(fight);
    if (!state.inFight || state.enemies.length === 0) return;
    // Pause all combat (player attacks, enemy attacks, regen) the
    // moment the player hits 0 HP so the death animation plays
    // uninterrupted by trailing enemy swings.
    if (state.player.hp <= 0) return;

    // Fast-forward: scale combat time by the player's chosen sim speed so the
    // fight logic advances faster (rendering still runs at the display rate).
    const dt = (ticker.deltaMS / 1000) * get(simSpeed);

    // Player auto-attack. A frozen player swings slower per
    // STATUS_DEFS.freeze.attackIntervalMul applied per-frame, so the
    // slowdown is felt throughout the freeze window (not just on the
    // next reset). Adrenaline speeds attacks up for a few seconds
    // after a kill via a smaller-interval reset.
    this.cooldown -= dt / this.freezeMulFor(state.player);
    if (this.cooldown <= 0) {
      this.fireAttack(state);
      const now = performance.now() / 1000;
      const adrenalineMul = now < this.adrenalineUntil ? 1 - this.adrenalineBonus : 1;
      // Time Warp buff: +bonus attack speed shortens the interval by
      // 1/(1 + bonus), stacking multiplicatively with adrenaline.
      const buffMul = now < this.procBuffUntil ? 1 / (1 + this.procBuffBonus) : 1;
      this.cooldown = this.attack.interval * adrenalineMul * buffMul;
    }

    // Gem proc engine: drive the two self-firing triggers. `timer`
    // procs drain `remaining` by dt and fire + reset when it hits 0;
    // `continuous` procs (orbit / aura) treat cooldownSec as a tick
    // interval and fire on that cadence while in combat. Reactive
    // triggers fire from combat events, not here.
    for (const entry of this.activeProcs) {
      if (entry.proc.trigger !== 'timer' && entry.proc.trigger !== 'continuous') continue;
      const interval = Math.max(0.05, entry.proc.cooldownSec);
      entry.remaining -= dt;
      if (entry.remaining <= 0) {
        this.fireProc(entry.proc, state, {});
        entry.remaining += interval;
      }
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

    // Stoic: drip queued delayed damage onto the player. Each entry
    // pays out perSec until remainingSec expires.
    if (this.delayedPlayerDamage.length > 0) {
      const playerView = this.views.get(state.player.id);
      for (const entry of this.delayedPlayerDamage) {
        entry.remainingSec -= dt;
        entry.accumulator += entry.perSec * dt;
        if (entry.accumulator >= 1) {
          const dmg = Math.floor(entry.accumulator);
          entry.accumulator -= dmg;
          applyDamageToPlayer(dmg);
          if (playerView && !playerView.container.destroyed) {
            this.spawnFloatNumber(playerView, `-${dmg}`, '#ff5252', 22);
          }
        }
      }
      this.delayedPlayerDamage = this.delayedPlayerDamage.filter((e) => e.remainingSec > 0);
    }

    // Cooldown bars: player gold, enemies red. Filled as the cooldown
    // drains toward 0. Player bar reads from this.cooldown; enemies
    // pull from the per-id map.
    const playerView = this.views.get(state.player.id);
    if (playerView && !playerView.container.destroyed) {
      const interval = Math.max(0.01, this.attack.interval);
      const progress = Math.max(0, Math.min(1, 1 - this.cooldown / interval));
      this.drawCooldownBar(playerView, progress, 0xffcc44);
    }
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const def = ENEMY_CATALOGUE[enemy.name];
      if (!def) continue;
      // Match the cooldown ring to the difficulty-scaled attack cadence.
      const cdInterval = enemy.interval ?? def.interval;
      const cd = this.enemyCooldowns.get(enemy.id) ?? cdInterval;
      const interval = Math.max(0.01, cdInterval);
      const progress = Math.max(0, Math.min(1, 1 - cd / interval));
      const ev = this.views.get(enemy.id);
      if (ev && !ev.container.destroyed) this.drawCooldownBar(ev, progress, 0xff5252);
    }

    // HP-bar ease + camera shake decay run every frame regardless of
    // who's attacking - they're pure-visual.
    const hpLerp = 1 - Math.exp(-dt * 25);
    for (const view of this.views.values()) {
      const target = view.fighter.maxHp > 0 ? view.fighter.hp / view.fighter.maxHp : 0;
      const delta = target - view.displayedHpFrac;
      if (Math.abs(delta) < 0.0005) {
        if (view.displayedHpFrac !== target) {
          view.displayedHpFrac = target;
          this.drawHpBar(view);
        }
      } else {
        view.displayedHpFrac += delta * hpLerp;
        this.drawHpBar(view);
      }

      // Player shield overlay: ease the displayed shield toward the live
      // absorb pool (this.playerShield) and redraw it when it moves. Drawn
      // separately from the HP bar so a shield top-up at full HP still shows.
      if (view.fighter.kind === 'player') {
        const sTarget = view.fighter.maxHp > 0 ? this.playerShield / view.fighter.maxHp : 0;
        const sDelta = sTarget - view.displayedShieldFrac;
        if (Math.abs(sDelta) < 0.0005) {
          if (view.displayedShieldFrac !== sTarget) {
            view.displayedShieldFrac = sTarget;
            this.drawShieldBar(view);
          }
        } else {
          view.displayedShieldFrac += sDelta * hpLerp;
          this.drawShieldBar(view);
        }
        // Proc cooldown radials track live each frame (remaining drains in the
        // proc tick), so redraw them every frame.
        this.drawProcRadials(view);
      }
    }
    if (this.shakeIntensity > 0) {
      // Decay reaches 0 in ~0.3s regardless of starting intensity so
      // the shake feels punchy instead of dragging.
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 100);
      const mag = this.shakeIntensity;
      this.app.stage.x = (Math.random() - 0.5) * mag * 2;
      this.app.stage.y = (Math.random() - 0.5) * mag * 2;
    } else if (this.app.stage.x !== 0 || this.app.stage.y !== 0) {
      this.app.stage.x = 0;
      this.app.stage.y = 0;
    }

    // Mirror Image: regenerate a decoy charge after intervalSec while
    // the gem is equipped (max 1 charge).
    for (const eff of get(playerEffects)) {
      if (eff.kind !== 'mirror-charge') continue;
      if (this.mirrorCharge >= eff.maxCharges) {
        this.mirrorChargeTimer = 0;
        continue;
      }
      this.mirrorChargeTimer += dt;
      if (this.mirrorChargeTimer >= eff.intervalSec) {
        this.mirrorCharge = Math.min(eff.maxCharges, this.mirrorCharge + 1);
        this.mirrorChargeTimer = 0;
      }
    }

    // Per-enemy attacks: each enemy fires on its own catalogue-defined
    // interval, dealing its catalogue damage to the player.
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const def = ENEMY_CATALOGUE[enemy.name];
      if (!def) continue;
      // Difficulty-scaled interval is baked onto the Fighter at creation
      // (makeFighters); fall back to the catalogue for any unscaled enemy.
      const interval = enemy.interval ?? def.interval;
      const current = this.enemyCooldowns.get(enemy.id) ?? interval;
      // Frozen enemies drain their cooldown at 1/freezeMul rate so
      // the slowdown is continuous, not just on the next reset.
      const next = current - dt / this.freezeMulFor(enemy);
      if (next <= 0) {
        this.fireEnemyAttack(enemy, def);
        this.enemyCooldowns.set(enemy.id, interval);
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

    // Taunt schedule: each enemy that has a taunt entry counts down
    // from intervalSec; on trigger, lock the player's target onto
    // the taunter for durationSec via applyTauntLock + show a 🎯
    // float above the taunter.
    for (const enemy of state.enemies) {
      if (enemy.hp <= 0) continue;
      const def = ENEMY_CATALOGUE[enemy.name];
      const taunt = def?.taunt;
      if (!taunt) continue;
      const current = this.tauntCooldowns.get(enemy.id) ?? taunt.intervalSec;
      const next = current - dt;
      if (next <= 0) {
        applyTauntLock(enemy.id, taunt.durationSec);
        const view = this.views.get(enemy.id);
        if (view && !view.container.destroyed) {
          this.spawnFloatNumber(view, '🎯 Taunt', '#ff5252', 26);
        }
        this.tauntCooldowns.set(enemy.id, taunt.intervalSec);
      } else {
        this.tauntCooldowns.set(enemy.id, next);
      }
    }
    if (this.tauntCooldowns.size > state.enemies.length) {
      const live = new Set(state.enemies.map((e) => e.id));
      for (const id of this.tauntCooldowns.keys()) {
        if (!live.has(id)) this.tauntCooldowns.delete(id);
      }
    }

    // Age the taunt lock so it expires after durationSec (or when
    // the taunter dies).
    tickTargetLock(dt);
  };


  private fireAttack(state: FightState): void {
    if (!state.targetId) return;
    const target = state.enemies.find((e) => e.id === state.targetId);
    if (!target || target.hp <= 0) return;

    const view = this.views.get(state.targetId);
    if (!view || view.container.destroyed) return;

    this.playAttackSwing(view);
    sfx.swing();

    // Enemy dodge: the catalogue defines a per-enemy dodge chance; when it
    // procs the swing animations still play but no damage lands. The slash is
    // the whiffed-swing visual, kept for the basic attack only.
    if (this.tryDodge(target, view)) {
      this.spawnSlash(view);
      return;
    }

    this.landDamage(state, target, view, /* isExtraStrike */ false);

    // Multistrike: each effect rolls independently; on a proc the
    // attack fires a second time at the same target. Cheap recursion -
    // the second land skips the swing animation and the dodge / mults
    // roll fresh so the visual reads as a flurry.
    for (const eff of get(playerEffects)) {
      if (eff.kind === 'multistrike-chance' && Math.random() < eff.chance) {
        const live = get(fight).enemies.find((e) => e.id === target.id);
        if (live && live.hp > 0) {
          this.landDamage(state, live, view, true);
        }
      }
    }
  }

  // Roll `target`'s dodge (enemies carry a per-catalogue dodge chance). On a
  // dodge: float "Miss", play the dodge sfx, and return true so the caller
  // skips its damage. Used by the basic attack AND every effect-damage path
  // (procs / chain / splash / counter / thorns), so a dodgy enemy like the
  // Harpy evades ALL incoming damage, not just auto-attacks.
  private tryDodge(target: Fighter, view: FighterView | undefined): boolean {
    const dodge = ENEMY_CATALOGUE[target.name]?.dodge ?? 0;
    if (dodge <= 0 || Math.random() >= dodge) return false;
    if (view && !view.container.destroyed) {
      this.spawnFloatNumber(view, 'Miss', '#aaaaaa', 28);
    }
    sfx.dodge();
    return true;
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
    const effects = get(playerEffects);

    // Vorpal Edge: every attack crits, crit multiplier replaced by
    // the effect's reduced value. First matching effect wins.
    let critChance = this.attack.critChance;
    let critMul = this.attack.critMultiplier;
    for (const eff of effects) {
      if (eff.kind === 'all-crit-replace-mul') {
        critChance = 1;
        critMul = eff.replacedMul;
      }
    }
    const isCrit = critChance > 0 && Math.random() < critChance;
    let dmg = isCrit ? this.attack.damage * critMul : this.attack.damage;

    // Conditional / scaling damage modifiers. Multiplicative bonuses
    // stack as (1 + sum) so two Berserker stacks don't compound into
    // an explosion; flat adders (Resonant Hum, Doryani) sum into the
    // base before mult.
    let flatBonus = 0;
    let bonusFraction = 0;
    const targetFrac = target.maxHp > 0 ? target.hp / target.maxHp : 0;
    const playerFrac =
      state.player.maxHp > 0 ? state.player.hp / state.player.maxHp : 1;

    for (const eff of effects) {
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
    // Razor Wit: while the post-dodge window is active, every hit
    // gets a flat damage boost.
    if (performance.now() / 1000 < this.dodgeBuffUntil) {
      bonusFraction += this.dodgeBuffBonus;
    }
    dmg = (dmg + flatBonus) * (1 + bonusFraction);

    // Shocked targets take takeDamageMul more damage from every
    // source. Stacks multiplicatively with crit / bonuses.
    const shockMul = target.statuses?.shock ? STATUS_DEFS.shock.takeDamageMul ?? 1 : 1;

    // Avatar of [Element] / Prism: each conversion fraction is the
    // share of the player's physical damage that bypasses the
    // enemy's flat physical resist. Enemy resist applies only to the
    // unconverted physical portion.
    let convertedFraction = 0;
    for (const eff of effects) {
      if (eff.kind === 'convert-physical-rolled' || eff.kind === 'convert-physical-random') {
        convertedFraction += eff.fraction;
      }
    }
    convertedFraction = Math.min(1, convertedFraction);
    // Difficulty-scaled resist is baked onto the Fighter (makeFighters);
    // fall back to the catalogue value for any unscaled enemy.
    const enemyResist = target.resist ?? ENEMY_CATALOGUE[target.name]?.resist ?? 0;
    const resistMul = 1 - (1 - convertedFraction) * enemyResist;

    const damage = Math.max(1, Math.round(dmg * shockMul * resistMul));

    if (isCrit) {
      this.spawnFloatNumber(view, `-${damage}!`, '#ffd84a', 40);
    } else {
      this.spawnDamageNumber(view, damage);
    }
    this.playHitFlash(view);
    if (!isExtraStrike) this.playHitReact(view);
    this.spawnSlash(view);

    applyDamage(target.id, damage);
    // Pick the swing's sound based on what the hit did. Killing
    // blow gets the heavier sfx.kill; sfx.death from playDeath
    // still layers in to wail for the corpse.
    const afterApply = get(fight).enemies.find((e) => e.id === target.id);
    const killed = !!afterApply && afterApply.hp <= 0;
    if (killed) {
      sfx.kill();
      this.shakeKick(28);
    } else if (isCrit) {
      sfx.crit();
      this.shakeKick(16);
    } else {
      sfx.hit();
      this.shakeKick(6);
    }

    // On-crit trigger: the auto-attack crit fires on-crit procs (Vault
    // Strike echoes the crit). Anchored on the struck target so a
    // nearest-targeting echo focuses there.
    if (isCrit) {
      this.fireProcsForTrigger('on-crit', get(fight), { anchorId: target.id });
    }

    // Knockback: per-effect roll, on proc push the target's next
    // attack out by durationSec.
    for (const eff of effects) {
      if (eff.kind === 'knockback-on-hit' && Math.random() < eff.chance) {
        const current = this.enemyCooldowns.get(target.id) ?? 0;
        this.enemyCooldowns.set(target.id, current + eff.durationSec);
        this.spawnFloatNumber(view, '👊', '#aaaaaa', 28);
      }
    }

    // Weapon status-on-hit (Pyroclasm burn, Frostbite freeze, etc.).
    // Independent rolls per effect; landed statuses get a tiny icon
    // float on the target so the proc reads.
    for (const eff of effects) {
      if (eff.kind === 'status-on-hit' && Math.random() < eff.chance) {
        applyStatusToEnemy(target.id, eff.status);
        const def = STATUS_DEFS[eff.status];
        this.spawnFloatNumber(view, def.emoji, def.color, 28);
        playStatusSfx(eff.status);
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
          sfx.heal();
        }
      }
    }

    // Splash (Sweeping Edge): a fraction of the landed damage hits
    // every other alive enemy. The grounded-only flag skips flying
    // enemies like Harpy.
    for (const eff of effects) {
      if (eff.kind !== 'splash-add') continue;
      const splash = Math.max(1, Math.round(damage * eff.fraction));
      for (const other of state.enemies) {
        if (other.id === target.id || other.hp <= 0) continue;
        if (eff.flag === 'grounded-only' && ENEMY_CATALOGUE[other.name]?.loc === 'flying') {
          continue;
        }
        const otherView = this.views.get(other.id);
        if (!otherView || otherView.container.destroyed) continue;
        if (this.tryDodge(other, otherView)) continue;
        this.spawnFloatNumber(otherView, `-${splash}`, '#cbd5ff', 26);
        this.playHitFlash(otherView);
        applyDamage(other.id, splash);
      }
    }

    // Chain (Conduction): a flat-damage bolt jumps from the target
    // to up to N nearest OTHER alive enemies, ranked by horizontal
    // distance from the target's home position.
    for (const eff of effects) {
      if (eff.kind !== 'chain-add') continue;
      const targetHomeX = this.views.get(target.id)?.homeX ?? 0;
      const candidates = state.enemies
        .filter((e) => e.id !== target.id && e.hp > 0)
        .map((e) => ({ e, dx: Math.abs((this.views.get(e.id)?.homeX ?? 0) - targetHomeX) }))
        .sort((a, b) => a.dx - b.dx)
        .slice(0, eff.targets);
      for (const { e } of candidates) {
        const ev = this.views.get(e.id);
        if (!ev || ev.container.destroyed) continue;
        if (this.tryDodge(e, ev)) continue;
        this.spawnFloatNumber(ev, `⚡-${eff.damage}`, '#ffd84a', 26);
        this.playHitFlash(ev);
        applyDamage(e.id, eff.damage);
      }
    }

    // Adrenaline / speed-burst-on-kill: if this hit dropped the
    // target to 0 HP, arm the post-kill speed window. Strongest
    // burst wins (longest remaining time stays).
    const after = get(fight).enemies.find((e) => e.id === target.id);
    if (after && after.hp <= 0) {
      let bestBonus = 0;
      let bestDuration = 0;
      for (const eff of effects) {
        if (eff.kind === 'speed-burst-on-kill' && eff.bonusFraction > bestBonus) {
          bestBonus = eff.bonusFraction;
          bestDuration = eff.durationSec;
        }
      }
      if (bestBonus > 0) {
        this.adrenalineBonus = bestBonus;
        const now = performance.now() / 1000;
        this.adrenalineUntil = Math.max(this.adrenalineUntil, now + bestDuration);
      }

      // Lichcrown: gain a random aura status for durationSec. While
      // armed, the aura-on-hit pass in fireEnemyAttack inflicts it
      // on attackers at the same rate as armor auras.
      for (const eff of effects) {
        if (eff.kind !== 'on-kill-aura') continue;
        const all: StatusType[] = ['burn', 'freeze', 'shock', 'poison', 'bleed'];
        const pick = all[Math.floor(Math.random() * all.length)];
        this.lichcrownAura = pick;
        const now = performance.now() / 1000;
        this.lichcrownUntil = Math.max(this.lichcrownUntil, now + eff.durationSec);
        const sd = STATUS_DEFS[pick];
        const playerView = this.views.get(state.player.id);
        if (playerView && !playerView.container.destroyed) {
          this.spawnFloatNumber(playerView, `${sd.emoji} aura`, sd.color, 26);
        }
      }
    }
  }

  // Build the active proc list for a fresh fight: resolve every
  // equipped item's sockets into procs and seed each with a FULL
  // cooldown so timer procs land their first cast after one interval
  // (not instantly) and continuous procs wait one tick before their
  // first hit. Reactive procs (on-kill / on-crit / on-hit-taken) carry
  // their cooldown too but ignore it - they fire from combat events.
  private buildProcs(): void {
    this.activeProcs = [];

    // Seed the engine from the player's currently-equipped gems: every
    // item's sockets resolve to procs (player-profile.ts § playerProcs).
    for (const proc of get(playerProcs)) {
      this.activeProcs.push({ proc, remaining: Math.max(0.05, proc.cooldownSec) });
    }
  }

  // Fire every active proc bound to a given trigger. The reactive
  // triggers (on-kill / on-crit / on-hit-taken) route through here from
  // their combat-event sites; they ignore their own cooldown (the
  // catalogue defines them cooldown 0 anyway). `ctx` carries the event
  // anchor - the corpse for on-kill, the crit target for on-crit, the
  // attacker for on-hit-taken - so targeting can prefer it.
  private fireProcsForTrigger(trigger: ProcTrigger, state: FightState, ctx: ProcContext): void {
    for (const entry of this.activeProcs) {
      if (entry.proc.trigger !== trigger) continue;
      this.fireProc(entry.proc, state, ctx);
    }
  }

  // Fire one proc. Damage payloads pick target(s) and deal damage (with
  // an optional crit roll + riders + kill); heal / shield / buff / gold
  // payloads act on the player. Each payload kind owns its visual.
  // `extraCasts` (Echo) reschedules the whole fire after repeatDelaySec.
  // `ctx` is the reactive event anchor (see fireProcsForTrigger).
  private fireProc(proc: ResolvedProc, state: FightState, ctx: ProcContext): void {
    switch (proc.payload.kind) {
      case 'damage':
        this.fireDamageProc(proc, proc.payload.damage, state, ctx);
        break;
      case 'heal':
        this.fireHealProc(proc, proc.payload.fraction, state);
        break;
      case 'shield':
        this.fireShieldProc(proc, proc.payload.fraction, state);
        break;
      case 'buff':
        this.fireBuffProc(proc, proc.payload.attackSpeedAdd, proc.payload.durationSec, state);
        break;
      case 'gold':
        this.fireGoldProc(proc, proc.payload.chance, state);
        break;
    }

    // Echo: fire the proc again after repeatDelaySec, once per extra
    // cast. The follow-ups re-read the live fight state so they target
    // whatever is still alive at the time.
    for (let i = 1; i <= proc.extraCasts; i++) {
      const single: ResolvedProc = { ...proc, extraCasts: 0 };
      gsap.delayedCall(proc.repeatDelaySec * i, () => {
        const live = get(fight);
        if (!live.inFight || live.player.hp <= 0) return;
        this.fireProc(single, live, ctx);
      });
    }
  }

  // Select the proc's target(s) among alive enemies per targeting +
  // count. A reactive anchor (corpse / crit target / attacker) is
  // preferred when present: `nearest` ranks distance from it, the
  // others still honour their mode but treat it as the natural focus.
  private selectTargets(proc: ResolvedProc, state: FightState, ctx: ProcContext): Fighter[] {
    const alive = state.enemies.filter((e) => e.hp > 0);
    if (alive.length === 0) return [];

    const anchorX =
      (ctx.anchorId ? this.views.get(ctx.anchorId)?.homeX : undefined) ??
      this.views.get(state.player.id)?.homeX ??
      0;

    if (proc.targeting === 'all') return alive;
    if (proc.targeting === 'nearest') {
      return [...alive]
        .sort(
          (a, b) =>
            Math.abs((this.views.get(a.id)?.homeX ?? 0) - anchorX) -
            Math.abs((this.views.get(b.id)?.homeX ?? 0) - anchorX),
        )
        .slice(0, Math.max(1, proc.count));
    }
    // random: distinct uniform picks.
    const pool = [...alive];
    const picks: Fighter[] = [];
    const n = Math.min(Math.max(1, proc.count), pool.length);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }
    return picks;
  }

  // Damage payload: hit each selected target, rolling crit if the proc
  // is critable (Lethal), applying riders, and killing on a lethal
  // blow. Mirrors the Conduction chain in landDamage - spawnFloatNumber
  // + playHitFlash + applyDamage per target - plus the proc's visual.
  private fireDamageProc(
    proc: ResolvedProc,
    baseDamage: number,
    state: FightState,
    ctx: ProcContext,
  ): void {
    const targets = this.selectTargets(proc, state, ctx);
    if (targets.length === 0) return;

    // One sound per proc fire (not per target), mapped to the proc's visual.
    playProcSfx(proc.visual);

    const playerView = this.views.get(state.player.id);
    const originX = playerView?.homeX ?? 0;
    const originY = (playerView?.homeY ?? 0) - EMOJI_SIZE * 0.5;

    for (const target of targets) {
      const view = this.views.get(target.id);
      if (!view || view.container.destroyed) continue;

      // A dodgy target (Harpy) evades the proc outright - no damage, no riders.
      if (this.tryDodge(target, view)) continue;

      // Crit roll: procs only crit when a crit support (Lethal) granted
      // canCrit. The auto-attack's crit multiplier is reused.
      const isCrit = proc.canCrit && proc.critChance > 0 && Math.random() < proc.critChance;
      const damage = Math.max(1, Math.round(baseDamage * (isCrit ? this.attack.critMultiplier : 1)));

      this.spawnProcVisual(proc, view, originX, originY);
      this.spawnFloatNumber(
        view,
        `${proc.emoji}-${damage}${isCrit ? '!' : ''}`,
        isCrit ? '#ffd84a' : '#ffe08a',
        isCrit ? 38 : 28,
      );
      this.playHitFlash(view);

      applyDamage(target.id, damage);

      // Riders: each accumulated status the proc carries lands on the
      // target (e.g. Igniting's Burn, Chilling's Freeze).
      for (const status of proc.riders) {
        applyStatusToEnemy(target.id, status);
      }

      // Lethal blow handling is centralised in playDeath: applyDamage's
      // store write fires the sync subscriber synchronously, which sees
      // the enemy at 0 HP and runs playDeath -> killEnemy + the on-kill
      // trigger. So we don't call killEnemy here (it would be a no-op
      // on an already-removed enemy).
    }
  }

  // Heal payload (Sanctuary): restore a fraction of the player's max HP
  // and float a green number + soft glow on the player.
  private fireHealProc(proc: ResolvedProc, fraction: number, state: FightState): void {
    if (state.player.hp <= 0) return;
    const heal = Math.round(state.player.maxHp * fraction);
    if (heal <= 0) return;
    healPlayer(heal);
    const playerView = this.views.get(state.player.id);
    if (playerView && !playerView.container.destroyed) {
      this.spawnGlow(playerView, 0x7fe57f);
      this.spawnFloatNumber(playerView, `${proc.emoji}+${heal}`, '#7fe57f', 30);
      sfx.heal();
    }
  }

  // Shield payload (Bulwark): top the absorb pool up to a fraction of
  // max HP (never lowers an already-larger pool) and glow the player.
  private fireShieldProc(proc: ResolvedProc, fraction: number, state: FightState): void {
    if (state.player.hp <= 0) return;
    const amount = Math.round(state.player.maxHp * fraction);
    if (amount <= 0) return;
    this.playerShield = Math.max(this.playerShield, amount);
    const playerView = this.views.get(state.player.id);
    if (playerView && !playerView.container.destroyed) {
      this.spawnGlow(playerView, 0x6fb8ff);
      this.spawnFloatNumber(playerView, `${proc.emoji}+${amount}`, '#6fb8ff', 30);
      sfx.shimmer();
    }
  }

  // Buff payload (Time Warp): arm the proc-buff attack-speed window for
  // durationSec. Strongest bonus / longest window wins, like adrenaline.
  private fireBuffProc(
    proc: ResolvedProc,
    attackSpeedAdd: number,
    durationSec: number,
    state: FightState,
  ): void {
    const now = performance.now() / 1000;
    if (attackSpeedAdd >= this.procBuffBonus || now >= this.procBuffUntil) {
      this.procBuffBonus = attackSpeedAdd;
    }
    this.procBuffUntil = Math.max(this.procBuffUntil, now + durationSec);
    const playerView = this.views.get(state.player.id);
    if (playerView && !playerView.container.destroyed) {
      this.spawnGlow(playerView, 0xffe08a);
      this.spawnFloatNumber(playerView, `${proc.emoji} +${Math.round(attackSpeedAdd * 100)}%`, '#ffe08a', 28);
      sfx.powerup();
    }
  }

  // Gold payload (Midas Burst): on a `chance` roll, award bonus gold to
  // the pending-rewards chest and float a coin + gold glow on the player
  // (the catalogue's ✨ visual for this proc).
  private fireGoldProc(proc: ResolvedProc, chance: number, state: FightState): void {
    if (Math.random() >= chance) return;
    const bonus = 25 + Math.floor(Math.random() * 26); // 25-50 placeholder
    addRewardGold(bonus);
    const playerView = this.views.get(state.player.id);
    if (playerView && !playerView.container.destroyed) {
      this.spawnGlow(playerView, 0xffd84a);
      this.spawnFloatNumber(playerView, `${proc.emoji}+${bonus}`, '#ffd84a', 30);
      sfx.coin();
    }
  }

  // Map a proc's visual id to its primitive. Damage procs only - heal /
  // shield / buff own their glow inline. The strike-line / drifting-orb
  // primitives travel from the player origin; the rest anchor on the
  // struck view.
  private spawnProcVisual(
    proc: ResolvedProc,
    view: FighterView,
    originX: number,
    originY: number,
  ): void {
    switch (proc.visual) {
      case 'expanding-ring':
        this.spawnExpandingRing(view);
        break;
      case 'falling-body':
        this.spawnFallingBody(view);
        break;
      case 'drifting-orb':
        this.spawnDriftingOrb(originX, originY, view);
        break;
      case 'orbiting-sprite':
        this.spawnOrbitingSprite(view);
        break;
      case 'glow':
        this.spawnGlow(view, 0xffe08a);
        break;
      case 'strike-line':
      default:
        this.spawnStrikeLine(view);
        break;
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
    // Difficulty-scaled damage is baked onto the Fighter (makeFighters);
    // fall back to the catalogue value for any unscaled enemy.
    const damage = enemy.damage ?? def.damage;
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

    const effects = get(playerEffects);

    // Mirror Image: a stored decoy absorbs the next hit outright.
    // Consumed before the dodge/DR/thorns chain so nothing else
    // triggers - it's a clean skip.
    if (this.mirrorCharge > 0) {
      this.mirrorCharge--;
      this.spawnFloatNumber(playerView, '🪞', '#cbd5ff', 28);
      return;
    }

    // Player dodge: if the player dodges, no damage, no thorns - just
    // a "Miss" float over the player. The enemy's lunge still plays
    // so the attempt still reads on-screen. On a dodge we also fire
    // Counter Attack (deal % of player damage to attacker) and arm
    // the Razor Wit on-dodge damage buff window.
    if (this.defence.dodge > 0 && Math.random() < this.defence.dodge) {
      this.spawnFloatNumber(playerView, 'Dodge', '#aaaaaa', 28);
      sfx.dodge();
      for (const eff of effects) {
        if (
          eff.kind === 'counter-attack' &&
          enemyView &&
          !enemyView.container.destroyed &&
          !this.tryDodge(enemy, enemyView)
        ) {
          const reflect = Math.max(1, Math.round(this.attack.damage * eff.fraction));
          this.spawnDamageNumber(enemyView, reflect);
          this.playHitFlash(enemyView);
          applyDamage(enemy.id, reflect);
        }
        if (eff.kind === 'on-dodge-damage-buff' && eff.bonusFraction > this.dodgeBuffBonus) {
          this.dodgeBuffBonus = eff.bonusFraction;
          this.dodgeBuffUntil = performance.now() / 1000 + eff.durationSec;
        }
      }
      return;
    }

    // Flat damage reduction. Shock on the player amplifies first; then
    // Defiance adds conditional DR while low-HP; then Resilient halves
    // single hits above its threshold.
    const playerShockMul = state.player.statuses?.shock ? STATUS_DEFS.shock.takeDamageMul ?? 1 : 1;
    let incoming = Math.round(damage * playerShockMul);
    let dr = this.defence.damageReduction;
    const playerHpFrac =
      state.player.maxHp > 0 ? state.player.hp / state.player.maxHp : 1;
    for (const eff of effects) {
      if (eff.kind === 'damage-reduction-low-hp' && playerHpFrac <= eff.threshold) {
        dr += eff.amount;
      }
    }
    if (dr > 0) {
      incoming = Math.max(1, Math.round(incoming * (1 - Math.min(0.95, dr))));
    }
    for (const eff of effects) {
      if (eff.kind === 'big-hit-reduction' && incoming > eff.threshold) {
        incoming = Math.max(1, Math.round(incoming * (1 - eff.reductionFraction)));
      }
    }

    // Per-element resist: enemies have a typed damageType in the
    // catalogue; the player's stacked Warding gives a fraction per
    // type. Final reduction is multiplicative with DR.
    const dmgType = ENEMY_CATALOGUE[enemy.name]?.damageType;
    const resistFrac = dmgType ? this.defence.resists[dmgType] ?? 0 : 0;
    if (resistFrac > 0) {
      incoming = Math.max(1, Math.round(incoming * (1 - resistFrac)));
    }

    // Stoic: split a fraction off the incoming hit into a delayed
    // DoT-style queue that drips over durationSec instead of
    // applying instantly. Strongest stoic wins (first match here).
    let stoicShift = 0;
    let stoicDur = 0;
    for (const eff of effects) {
      if (eff.kind === 'stoic' && eff.fraction > stoicShift) {
        stoicShift = eff.fraction;
        stoicDur = eff.durationSec;
      }
    }
    if (stoicShift > 0 && stoicDur > 0) {
      const delayed = Math.round(incoming * stoicShift);
      if (delayed > 0) {
        incoming -= delayed;
        this.delayedPlayerDamage.push({
          perSec: delayed / stoicDur,
          remainingSec: stoicDur,
          accumulator: 0,
        });
      }
    }

    // Player shield (Bulwark): the absorb pool soaks the hit before HP.
    // Whatever the shield can't cover spills through to applyDamageToPlayer.
    // A fully-absorbed hit shows a blue shield number instead of a red one.
    if (this.playerShield > 0 && incoming > 0) {
      const absorbed = Math.min(this.playerShield, incoming);
      this.playerShield -= absorbed;
      incoming -= absorbed;
      this.spawnFloatNumber(playerView, `🛡️-${absorbed}`, '#6fb8ff', 26);
    }

    if (incoming > 0) {
      this.spawnDamageNumber(playerView, incoming);
    }
    this.playHitFlash(playerView);
    this.playHitReact(playerView);
    this.spawnSlash(playerView);
    if (incoming > 0) applyDamageToPlayer(incoming);
    sfx.hit();
    this.shakeKick(14);

    // On-hit-taken trigger: reactive defence (Retaliate blasts the
    // attacker). Fires whenever the player actually takes a swing -
    // even one fully soaked by the shield - anchored on the attacker.
    this.fireProcsForTrigger('on-hit-taken', get(fight), { anchorId: enemy.id });

    // Enemy-applied status (e.g. Slime's poison): roll a flat 30%
    // chance per hit, respecting player's Hex Ward / Eternal Vigil.
    if (def.appliesStatus && Math.random() < 0.3 && this.playerCanBeStatused(def.appliesStatus)) {
      applyStatusToPlayer(def.appliesStatus);
      const sd = STATUS_DEFS[def.appliesStatus];
      this.spawnFloatNumber(playerView, sd.emoji, sd.color, 28);
    }

    // Armor aura-on-hit (Burn Aura, Frost Aura, etc.) + Reactive
    // Curse: each rolls independently and inflicts its status on the
    // attacking enemy. Reactive Curse picks a random status type.
    if (enemyView && !enemyView.container.destroyed) {
      for (const eff of effects) {
        if (eff.kind === 'aura-on-hit' && Math.random() < eff.chance) {
          applyStatusToEnemy(enemy.id, eff.status);
          const sd = STATUS_DEFS[eff.status];
          this.spawnFloatNumber(enemyView, sd.emoji, sd.color, 28);
        }
        if (eff.kind === 'reactive-status' && Math.random() < eff.chance) {
          const all = Object.keys(STATUS_DEFS) as StatusType[];
          const pick = all[Math.floor(Math.random() * all.length)];
          applyStatusToEnemy(enemy.id, pick);
          const sd = STATUS_DEFS[pick];
          this.spawnFloatNumber(enemyView, sd.emoji, sd.color, 28);
        }
      }
      // Lichcrown active aura: 15% chance per hit (matches armor
      // aura rate) to inflict the post-kill aura status.
      if (this.lichcrownAura && performance.now() / 1000 < this.lichcrownUntil) {
        if (Math.random() < 0.15) {
          applyStatusToEnemy(enemy.id, this.lichcrownAura);
          const sd = STATUS_DEFS[this.lichcrownAura];
          this.spawnFloatNumber(enemyView, sd.emoji, sd.color, 28);
        }
      }
    }

    // Thorns: flat reflect to the attacker. The attacker's hit flash
    // + damage number play so the player sees the reflect land - unless the
    // attacker (a dodgy enemy) evades it.
    if (
      this.defence.thornsFlat > 0 &&
      enemyView &&
      !enemyView.container.destroyed &&
      !this.tryDodge(enemy, enemyView)
    ) {
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
    for (const eff of get(playerEffects)) {
      if (eff.kind === 'status-immune') return false;
      if (eff.kind === 'status-resist-chance') totalResist += eff.chance;
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

  // Lightning bolt: a jagged Graphics polyline struck from above the
  // arena straight down onto the target view, then faded out and
  // destroyed. Used by Chain Lightning's strike-line proc visual.
  // Mirrors spawnSlash's conventions - a transient Graphics parented to
  // the stage, eventMode none, killed by a short gsap tween. The bolt
  // anchors to the view's homeX so a target mid-lunge still gets struck
  // where it stands.
  private spawnStrikeLine(view: FighterView): void {
    if (view.container.destroyed) return;
    const x = view.homeX;
    // Strike from well above the arena down to roughly head height.
    const topY = -EMOJI_SIZE;
    const bottomY = view.container.y - view.emojiText.height * 0.5;

    const bolt = new Graphics();
    bolt.eventMode = 'none';
    this.app.stage.addChild(bolt);

    // Pre-bake a jagged path top -> bottom with random horizontal
    // jitter at each segment so every strike reads a little different.
    const segments = 8;
    const points: { x: number; y: number }[] = [{ x, y: topY }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      points.push({ x: x + (Math.random() - 0.5) * 36, y: topY + (bottomY - topY) * t });
    }
    points.push({ x, y: bottomY });

    bolt.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) bolt.lineTo(points[i].x, points[i].y);
    // Wide soft underglow first, bright thin core on top - same
    // two-pass stroke trick as spawnSlash.
    bolt.stroke({ color: 0xaad4ff, width: 9, cap: 'round', join: 'round', alpha: 0.7 });
    bolt.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) bolt.lineTo(points[i].x, points[i].y);
    bolt.stroke({ color: 0xffffff, width: 3, cap: 'round', join: 'round', alpha: 1 });

    gsap.to(bolt, {
      alpha: 0,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: () => {
        if (!bolt.destroyed) bolt.destroy();
      },
    });
  }

  // Expanding ring: a single hollow circle drawn once at the view's
  // home position, then scaled up + faded out and destroyed. Used by
  // nova / explosion / aura-pulse procs (Frost Nova, Soul Reap, Searing
  // Aura, Retaliate). Cheap and self-cleaning - no per-frame redraw.
  private spawnExpandingRing(view: FighterView): void {
    if (view.container.destroyed) return;
    const cx = view.homeX;
    const cy = view.homeY - view.emojiText.height * 0.5;

    const ring = new Graphics();
    ring.eventMode = 'none';
    ring.x = cx;
    ring.y = cy;
    ring.circle(0, 0, 30).stroke({ color: 0xbfe0ff, width: 6, alpha: 0.9 });
    ring.circle(0, 0, 30).stroke({ color: 0xffffff, width: 2, alpha: 1 });
    ring.scale.set(0.4, 0.4);
    this.app.stage.addChild(ring);

    gsap.to(ring.scale, { x: 2.6, y: 2.6, duration: 0.35, ease: 'power2.out' });
    gsap.to(ring, {
      alpha: 0,
      duration: 0.35,
      ease: 'power2.in',
      onComplete: () => {
        if (!ring.destroyed) ring.destroy();
      },
    });
  }

  // Falling body: a glowing blob drops from above the arena onto the
  // target, then flashes a quick impact ring and is destroyed. Used by
  // Meteor's falling-body proc visual.
  private spawnFallingBody(view: FighterView): void {
    if (view.container.destroyed) return;
    const x = view.homeX;
    const impactY = view.container.y - view.emojiText.height * 0.5;
    const topY = -EMOJI_SIZE;

    const body = new Graphics();
    body.eventMode = 'none';
    body.circle(0, 0, 18).fill({ color: 0xff8c3a, alpha: 0.95 });
    body.circle(0, 0, 10).fill({ color: 0xffe08a, alpha: 1 });
    body.x = x;
    body.y = topY;
    this.app.stage.addChild(body);

    gsap.to(body, {
      y: impactY,
      duration: 0.32,
      ease: 'power2.in',
      onComplete: () => {
        if (!body.destroyed) body.destroy();
        if (!view.container.destroyed) this.spawnExpandingRing(view);
      },
    });
  }

  // Drifting orb: a soft glowing dot travels from (fromX, fromY) - the
  // player origin - to the target view, then fades on arrival. Used by
  // homing / spirit procs (Spirit Bolt).
  private spawnDriftingOrb(fromX: number, fromY: number, view: FighterView): void {
    if (view.container.destroyed) return;
    const toX = view.homeX;
    const toY = view.container.y - view.emojiText.height * 0.5;

    const orb = new Graphics();
    orb.eventMode = 'none';
    orb.circle(0, 0, 14).fill({ color: 0xb98cff, alpha: 0.7 });
    orb.circle(0, 0, 7).fill({ color: 0xffffff, alpha: 1 });
    orb.x = fromX;
    orb.y = fromY;
    this.app.stage.addChild(orb);

    const tl = gsap.timeline({
      onComplete: () => {
        if (!orb.destroyed) orb.destroy();
      },
    });
    tl.to(orb, { x: toX, y: toY, duration: 0.3, ease: 'power1.in' });
    tl.to(orb, { alpha: 0, duration: 0.12, ease: 'power2.in' }, '>-0.05');
  }

  // Orbiting sprite: a blade arc drawn once at a random angle around the
  // target, swept a quarter-turn and faded out. Stands in for a
  // persistent orbital weapon on each continuous tick (Whirlblade).
  // Drawn at the target so each tick reads as the blade biting there.
  private spawnOrbitingSprite(view: FighterView): void {
    if (view.container.destroyed) return;
    const cx = view.homeX;
    const cy = view.container.y - view.emojiText.height * 0.5;
    const radius = Math.max(40, view.emojiText.width * 0.6);

    const blade = new Graphics();
    blade.eventMode = 'none';
    blade.x = cx;
    blade.y = cy;
    blade.rotation = Math.random() * Math.PI * 2;
    blade.arc(0, 0, radius, -0.5, 0.5).stroke({ color: 0xdfe7ff, width: 7, cap: 'round', alpha: 0.9 });
    blade.arc(0, 0, radius, -0.5, 0.5).stroke({ color: 0xffffff, width: 2, cap: 'round', alpha: 1 });
    this.app.stage.addChild(blade);

    gsap.to(blade, { rotation: blade.rotation + Math.PI * 0.6, duration: 0.3, ease: 'power1.out' });
    gsap.to(blade, {
      alpha: 0,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: () => {
        if (!blade.destroyed) blade.destroy();
      },
    });
  }

  // Soft glow on the player (or any view): a filled disc behind the
  // emoji that pulses out and fades. Used by heal / buff / shield procs
  // (Sanctuary, Time Warp, Bulwark) - tinted per payload by the caller.
  private spawnGlow(view: FighterView, color: number): void {
    if (view.container.destroyed) return;
    const cx = view.homeX;
    const cy = view.homeY - view.emojiText.height * 0.5;

    const glow = new Graphics();
    glow.eventMode = 'none';
    glow.x = cx;
    glow.y = cy;
    glow.circle(0, 0, view.emojiText.height * 0.6).fill({ color, alpha: 0.5 });
    glow.scale.set(0.7, 0.7);
    // Behind the fighters so the emoji reads on top of the glow.
    this.app.stage.addChildAt(glow, 0);

    gsap.to(glow.scale, { x: 1.4, y: 1.4, duration: 0.5, ease: 'power2.out' });
    gsap.to(glow, {
      alpha: 0,
      duration: 0.5,
      ease: 'power2.in',
      onComplete: () => {
        if (!glow.destroyed) glow.destroy();
      },
    });
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
    if (view.fighter.kind === 'enemy') {
      sfx.death();
      // On-kill trigger: fire BEFORE killEnemy removes the corpse from
      // the store, anchored on the corpse, so Soul Reap can burst at it
      // and Midas Burst can roll its gold. The corpse is already at 0
      // HP so selectTargets skips it and only the remaining live
      // enemies are eligible. Any further deaths recurse through here
      // with a shrinking alive list, so it terminates.
      this.fireProcsForTrigger('on-kill', get(fight), { anchorId: id });
      killEnemy(id);
    } else {
      sfx.playerDeath();
      this.shakeKick(40);
    }

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
      this.dodgeBuffUntil = 0;
      this.dodgeBuffBonus = 0;
      this.mirrorCharge = 0;
      this.mirrorChargeTimer = 0;
      this.lichcrownAura = null;
      this.lichcrownUntil = 0;
      this.delayedPlayerDamage.length = 0;
      this.shakeIntensity = 0;
      this.tauntCooldowns.clear();
      this.playerShield = 0;
      this.procBuffUntil = 0;
      this.procBuffBonus = 0;
      // Build the gem proc engine from the equipped gear so its timer /
      // continuous procs start ticking and reactive procs are armed.
      this.buildProcs();
    }
    // Tear down the proc engine the moment the fight ends so no procs
    // fire into a dead/absent enemy list between fights.
    if (!state.inFight && this.prevInFight) {
      this.activeProcs = [];
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
    const ratio = Math.max(0, Math.min(1, view.displayedHpFrac));
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

  // Cyan absorb-shield overlay drawn on top of the player's HP bar. Width is
  // the shield as a fraction of max HP (clamped to the bar), so a full 20%
  // Bulwark shield reads as a cyan band over the left of the green. A thin
  // brighter edge marks where the shield ends. Empty when there's no shield.
  private drawShieldBar(view: FighterView): void {
    view.shieldFill.clear();
    const frac = Math.max(0, Math.min(1, view.displayedShieldFrac));
    if (frac <= 0.0005) return;
    const x = -HP_BAR_WIDTH / 2;
    const y = -view.emojiText.height - HP_BAR_HEIGHT - 28;
    const w = HP_BAR_WIDTH * frac;
    view.shieldFill
      .roundRect(x, y, w, HP_BAR_HEIGHT, 3)
      .fill({ color: 0x66ccff, alpha: 0.85 })
      .rect(x + w - 2, y, 2, HP_BAR_HEIGHT)
      .fill({ color: 0xd6f2ff, alpha: 0.95 });
  }

  // A row of small radial cooldown gauges - one per player proc that HAS a
  // cooldown (timer / continuous; reactive procs have cooldownSec 0 and are
  // skipped). Sits in its own lane ABOVE the status row so the two never
  // overlap. Each gauge fills clockwise from empty (just fired) to full
  // (ready), with the proc's emoji in the centre. Player-only.
  private drawProcRadials(view: FighterView): void {
    if (view.fighter.kind !== 'player') return;
    // Show procs with a real cooldown CYCLE: timer abilities + continuous auras
    // (Whirlblade / Searing Aura). NOT reactive procs (on-kill like Midas Burst,
    // on-crit like Vault Strike, on-hit-taken like Retaliate) - they fire on an
    // event. We MUST key off the trigger, not cooldownSec: cooldownAt() clamps
    // every resolved cooldown up to MIN_COOLDOWN_SEC (0.3s), so even a base-0
    // reactive proc reads as cooldownSec > 0 and would wrongly appear.
    const procs = this.activeProcs.filter(
      (e) => e.proc.trigger === 'timer' || e.proc.trigger === 'continuous',
    );
    const sig = procs.map((e) => e.proc.sourceDefId).join('|');
    if (sig !== view.procSig) {
      for (const r of view.procRadials) {
        r.ring.destroy();
        r.emoji.destroy();
      }
      view.procRadials = [];
      view.procRow.removeChildren();
      for (const e of procs) {
        const ring = new Graphics();
        const emoji = new Text({
          text: e.proc.emoji,
          style: new TextStyle({ fontFamily: EMOJI_FONT_STACK, fontSize: 11, padding: 2 }),
        });
        emoji.anchor.set(0.5, 0.5);
        emoji.eventMode = 'none';
        view.procRow.addChild(ring, emoji);
        view.procRadials.push({ ring, emoji });
      }
      view.procSig = sig;
    }
    if (procs.length === 0) return;

    const R = 9;
    const spacing = R * 2 + 7;
    // One lane above the status row (statusRow.y = -h - HP_BAR_HEIGHT - 32,
    // its icons reach ~20px up); -63 clears them.
    const y = -view.emojiText.height - HP_BAR_HEIGHT - 63;
    let x = -((procs.length - 1) * spacing) / 2;
    for (let i = 0; i < procs.length; i++) {
      const { proc, remaining } = procs[i];
      const frac = Math.max(0, Math.min(1, 1 - remaining / proc.cooldownSec));
      const slot = view.procRadials[i];
      this.drawRadial(slot.ring, x, y, R, frac);
      slot.emoji.x = x;
      slot.emoji.y = y;
      x += spacing;
    }
  }

  // Draw one radial gauge: a dark disc, a readiness wedge filling clockwise
  // from 12 o'clock (blue while charging, green when ready), and a rim.
  private drawRadial(g: Graphics, cx: number, cy: number, r: number, frac: number): void {
    g.clear();
    g.circle(cx, cy, r).fill({ color: 0x0e1118, alpha: 0.92 });
    if (frac > 0.001) {
      const start = -Math.PI / 2;
      const end = start + frac * Math.PI * 2;
      const ready = frac >= 0.999;
      g.moveTo(cx, cy)
        .arc(cx, cy, r - 1, start, end)
        .lineTo(cx, cy)
        .fill({ color: ready ? 0x66dd77 : 0x5aa0ff, alpha: ready ? 0.6 : 0.5 });
    }
    g.circle(cx, cy, r).stroke({ width: 1.5, color: 0x4a5a70 });
  }

  // Thin attack-cooldown bar slotted just below the HP bar. Same
  // width, 4px tall. Fills from left to right as the cooldown drains
  // toward zero; on the next swing it snaps back to 0 width.
  private drawCooldownBar(view: FighterView, progress: number, color: number): void {
    const x = -HP_BAR_WIDTH / 2;
    const y = -view.emojiText.height - 22;
    const h = 4;
    view.cooldownBar.clear();
    view.cooldownBar.roundRect(x, y, HP_BAR_WIDTH, h, 2).fill(0x1a1a22);
    if (progress > 0) {
      view.cooldownBar.roundRect(x, y, HP_BAR_WIDTH * progress, h, 2).fill(color);
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
    // ring around with them. A taunt lock on this enemy paints the
    // ring red to telegraph that click-override is suppressed.
    const locked =
      !!state.targetLock && state.targetLock.enemyId === state.targetId;
    const color = locked ? 0xff5252 : 0xffcc44;
    this.targetRing
      .ellipse(view.homeX, view.homeY + 6, 62, 14)
      .stroke({ color, width: 3, alpha: 0.9 });
  }

  private refreshProfile(): void {
    const p = get(playerProfile);
    this.attack = p.attack;
    this.defence = p.defence;
  }

  // Public-ish helper for combat hooks: bumps the shake intensity to
  // at least `amount`. Stronger kicks override weaker ones already in
  // flight so two crits in a row don't double-bump linearly.
  private shakeKick(amount: number): void {
    if (amount > this.shakeIntensity) this.shakeIntensity = amount;
  }

  destroy(): void {
    this.app.ticker.remove(this.onTick);
    this.unsubscribe?.();
    this.unsubProfile?.();
    if (this.resizeListener) this.app.renderer.off('resize', this.resizeListener);
    // Nuke every in-flight GSAP tween before destroying the Pixi objects
    // they reference: hit-flash filters, attack swings, knockbacks,
    // slashes, damage numbers, death scale/alpha tweens, etc. Anything
    // less is whack-a-mole.
    gsap.globalTimeline.clear();
    this.damageNumbers.clear();
    this.enemyCooldowns.clear();
    this.activeProcs = [];
    this.app.destroy(true, { children: true, texture: true });
    this.views.clear();
  }
}
