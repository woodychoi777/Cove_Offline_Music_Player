import { SleepTimer } from './sleep-timer.js';
import { t } from './i18n.js';
import { closeMenus } from './ui.js';

export function setupSleepTimer({ player, alarmActive, onOpen, toast, formatTime }) {
  const button = document.querySelector('#sleep-timer-open');
  const panel = document.querySelector('#sleep-timer-panel');
  const remaining = document.querySelector('#sleep-timer-remaining');
  const badge = button.querySelector('[data-timer-badge]');
  const cancel = document.querySelector('#sleep-timer-cancel');
  const options = [...panel.querySelectorAll('[data-sleep-minutes]')];
  const close = () => { if (panel.matches(':popover-open')) panel.hidePopover(); };
  function render() {
    const active = timer.deadline !== null;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-label', button.title = active ? t('재생 중지 타이머 · {0} 남음', formatTime(timer.remainingSeconds)) : t('재생 중지 타이머'));
    badge.hidden = !active;
    if (active) badge.textContent = String(Math.ceil(timer.remainingSeconds / 60));
    remaining.hidden = !active;
    remaining.textContent = active ? t('{0} 후 재생 중지', formatTime(timer.remainingSeconds)) : '';
    cancel.hidden = !active;
    options.forEach(option => option.setAttribute('aria-pressed', String(active && timer.minutes === Number(option.dataset.sleepMinutes))));
  }
  const timer = new SleepTimer({ onChange: render, onExpire: () => {
    if (alarmActive()) return;
    // pause() also cancels an in-flight load and stops a scheduled next source.
    player.pause();
    toast(t('타이머가 끝나 재생을 멈췄습니다.'));
  } });
  for (const option of options) option.addEventListener('click', () => {
    timer.start(Number(option.dataset.sleepMinutes)); close(); button.focus({ preventScroll: true });
  });
  cancel.addEventListener('click', () => { timer.cancel(); close(); button.focus({ preventScroll: true }); });
  panel.addEventListener('beforetoggle', event => {
    if (event.newState === 'open') { closeMenus(); onOpen(); timer.check(); }
  });
  panel.addEventListener('toggle', () => button.setAttribute('aria-expanded', String(panel.matches(':popover-open'))));
  document.addEventListener('beforetoggle', event => {
    if (event.target !== panel && event.newState === 'open' && event.target.matches('dialog, [popover]')) close();
  }, true);
  const check = () => {
    const alarm = alarmActive();
    button.disabled = alarm;
    if (alarm) { if (timer.deadline !== null) timer.cancel(); close(); }
    else timer.check();
  };
  player.addEventListener('change', () => {
    // Playback emits frequently; the timer owns its own one-second UI clock.
    if (alarmActive() || button.disabled || (timer.deadline !== null && timer.remainingSeconds === 0)) check();
  });
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  render();
}
