<script lang="ts">
  import { completeRoom } from '../state/run';
  import { t } from '../i18n';
</script>

<section class="rest">
  <header class="rest-header">
    <h2>🔥 {t('map.kind.rest')}</h2>
    <button type="button" class="leave" onclick={completeRoom}>{t('room.leave')}</button>
  </header>

  <div class="scene">
    <div class="emoji">🔥</div>
    <p>{t('rest.tagline')}</p>
  </div>
</section>

<style>
  .rest {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: radial-gradient(ellipse at center, #1c1410 0%, #0a0a0e 70%);
    padding: 16px 20px;
    min-height: 0;
  }
  .rest-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
    color: #ddd;
  }
  h2 :global(.emoji),
  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
  }
  .scene {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    text-align: center;
  }
  .emoji {
    font-size: 6rem;
    line-height: 1;
    filter: drop-shadow(0 0 24px rgba(255, 120, 60, 0.6));
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
    padding: 10px 18px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 40px;
  }
  .leave:hover {
    background: #4a4a58;
    border-color: #ffcc44;
  }
</style>
