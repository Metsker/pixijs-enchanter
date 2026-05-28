<script lang="ts">
  import { completeRoom } from '../state/run';
  import { t } from '../i18n';
</script>

<section class="placeholder">
  <div class="card">
    <div class="emoji">🛒</div>
    <h2>{t('map.kind.shop')}</h2>
    <p>{t('shop.placeholder')}</p>
    <button type="button" class="cta" onclick={completeRoom}>{t('room.leave')}</button>
  </div>
</section>

<style>
  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #14141a;
  }
  .card {
    background: #1c1c24;
    border: 1px solid #3a3a48;
    border-radius: 12px;
    padding: 26px 32px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 280px;
  }
  .emoji {
    font-family: 'Noto Color Emoji', 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif;
    font-size: 3rem;
    line-height: 1;
  }
  h2 {
    margin: 0;
    font-weight: 600;
  }
  p {
    margin: 0;
    color: #aab;
  }
  .cta {
    appearance: none;
    background: #3a3a48;
    border: 1px solid #4a4a58;
    color: #fff;
    border-radius: 8px;
    padding: 12px 20px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    min-height: 44px;
  }
  .cta:hover {
    background: #4a4a58;
    border-color: #ffcc44;
  }
</style>
