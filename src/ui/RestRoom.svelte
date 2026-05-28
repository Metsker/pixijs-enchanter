<script lang="ts">
  import { completeRoom } from '../state/run';
  import { t } from '../i18n';
</script>

<section class="rest">
  <div class="scene">
    <div class="emoji">🔥</div>
    <h2>{t('map.kind.rest')}</h2>
    <p>{t('rest.tagline')}</p>
  </div>
  <button type="button" class="leave" onclick={completeRoom}>{t('room.leave')}</button>
</section>

<style>
  .rest {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    background: radial-gradient(ellipse at center, #1c1410 0%, #0a0a0e 70%);
    padding: 24px;
  }
  .scene {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 6rem;
    line-height: 1;
    filter: drop-shadow(0 0 24px rgba(255, 120, 60, 0.6));
  }
  h2 {
    margin: 0;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: #aab;
    max-width: 38ch;
  }
  .leave {
    appearance: none;
    background: #3a3a48;
    border: 1px solid #4a4a58;
    color: #fff;
    border-radius: 8px;
    padding: 12px 24px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
  }
  .leave:hover {
    background: #4a4a58;
    border-color: #ffcc44;
  }
</style>
