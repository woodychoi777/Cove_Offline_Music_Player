import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { playableFlac } from './fixtures.mjs';

test('sleep timer: presets, actual audio stop, queue/drafts, cancellation, pending load, locales and focus', { skip: !process.env.RUN_BROWSER_TESTS, timeout: 90000 }, async t => {
  const module = process.env.PLAYWRIGHT_MODULE || 'playwright';
  const { chromium } = await import(module);
  const { expect } = await import(module.startsWith('/') ? pathToFileURL(join(module, '..', 'test.mjs')).href : 'playwright/test');
  const root = await mkdtemp(join(tmpdir(), 'cove-sleep-timer-')), out = join(root, 'evidence'); await mkdir(out);
  const server = spawn(process.execPath, ['src/server.mjs'], { env: { ...process.env, PORT: '49683', SORISEOJAE_DATA_DIR: join(root, 'data') }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill('SIGTERM'));
  await new Promise((ok,no) => { const timer = setTimeout(() => no(Error('server timeout')), 10000); server.stdout.on('data', b => { if (String(b).includes('프로토타입:')) { clearTimeout(timer); ok(); } }); server.on('exit', c => { clearTimeout(timer); no(Error('server '+c)); }); });
  const url = 'http://127.0.0.1:49683', originals = [], tracks = [];
  for (let i = 0; i < 2; i++) {
    const bytes = playableFlac({ title: 'Timer sample '+(i+1), artist: 'Cove sample', seconds: 24, frequency: 330+i*110 }); originals.push(bytes);
    const staged = await (await fetch(url+'/api/stage', { method:'POST', headers:{'x-file-name':i+'.flac'}, body:bytes })).json();
    tracks.push(await (await fetch(url+'/api/commit', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({importId:staged.importId,metadata:{lrcText:'[00:00]Sample lyrics\n[00:12]Next line'}}) })).json());
  }
  const aacBytes = await readFile(new URL('./fixtures/aac-tone.m4a',import.meta.url));
  const stagedAac = await (await fetch(url+'/api/stage',{method:'POST',headers:{'x-file-name':'long-audio.m4a'},body:aacBytes})).json();
  const aac = await (await fetch(url+'/api/commit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({importId:stagedAac.importId})})).json();
  const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--mute-audio'] }); t.after(() => browser.close());
  const page = await browser.newPage({ locale:'ko-KR', viewport:{width:1280,height:900} }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  t.after(async () => { await page.screenshot({path:join(out,'last-state.png')}).catch(()=>{}); });
  await page.addInitScript(ids => {
    const queueIds = JSON.parse(sessionStorage.getItem('timerQueueIds') || 'null') || ids;
    localStorage.setItem('soriseojae.queue', JSON.stringify({ids:queueIds,index:0,source:'Timer test',repeat:'off',shuffle:false}));
    window.__timerShift = 0; const now = Date.now; Date.now = () => now()+window.__timerShift;
    const ok = value => Promise.resolve({ok:true,value});
    window.coveAlarm = {get:()=>ok({config:{enabled:false,time:'07:00',tracks:[null,null,null],volumes:[.2,.45,.7],classicId:null,classicVolume:.25},wake:{}}),ready:()=>ok(null),stop:()=>ok(true),onEvent:fn=>window.__sleepAlarmEvent=fn};
    const Native = AudioContext; window.__timerContexts = [];
    window.AudioContext = class extends Native {
      constructor(...args) { super(...args); window.__timerContexts.push(this); }
      createGain() { const gain=super.createGain(),connect=gain.connect.bind(gain); gain.connect=(...args)=>{ if(args[0]===this.destination){ this.__meter=this.createAnalyser(); connect(this.__meter); } return connect(...args); };return gain; }
    };
  }, tracks.map(row => row.id));
  await page.route('**/api/state',async route=>{const response=await route.fetch(),state=await response.json();state.tracks.find(row=>row.id===aac.id).durationMs=4*3600_000;await route.fulfill({response,json:state});});
  await page.goto(url);
  const trigger = page.locator('#sleep-timer-open'), panel = page.locator('#sleep-timer-panel');
  const queue = () => page.evaluate(() => JSON.parse(localStorage.getItem('soriseojae.queue')));
  const shift = minutes => page.evaluate(ms => window.__timerShift += ms, minutes*60_000);
  const rms = () => page.evaluate(() => { const meter=window.__timerContexts[0].__meter,data=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length); });
  await page.locator('#mini-play').click(); await expect.poll(rms).toBeGreaterThan(.01);
  await page.locator('#mini-track').click(); await page.locator('[data-comments]').click(); await page.locator('#comment-text').fill('Timer preserves this draft'); await page.keyboard.press('Escape');
  await trigger.focus(); await trigger.press('Enter'); await expect(panel).toBeVisible(); await expect(trigger).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Tab'); await expect(panel.locator('[data-sleep-minutes="10"]')).toBeFocused(); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  for (const minutes of [10,15,25,55]) {
    await trigger.click(); await panel.locator(`[data-sleep-minutes="${minutes}"]`).click(); await expect(trigger).toHaveClass(/is-active/); await expect(trigger).toBeFocused();
    await expect(trigger.locator('[data-timer-badge]')).toHaveText(String(minutes)); await expect(panel).toBeHidden();
  }
  await trigger.click(); await page.locator('#sleep-timer-cancel').click(); await expect(trigger).not.toHaveClass(/is-active/); await expect.poll(rms).toBeGreaterThan(.01);
  await trigger.click(); await panel.locator('[data-sleep-minutes="10"]').click();
  await page.locator('#mini-shuffle').click(); await page.locator('#mini-repeat').click(); await page.locator('#mini-next').click(); await expect(page.locator('#mini-player')).toHaveAttribute('data-playback-status','재생 중');
  await expect.poll(async()=>Number(await page.locator('#mini-seek').inputValue())).toBeGreaterThan(.2);
  const before = await queue(); await shift(10);
  await expect(page.locator('#mini-player')).toHaveAttribute('data-playback-status','일시정지'); await expect.poll(rms).toBeLessThan(.0001); await expect(trigger).not.toHaveClass(/is-active/);
  assert.deepEqual(await queue(), before); const position = Number(await page.locator('#mini-seek').inputValue()); assert(position > 0 && position < 5);
  await page.locator('#mini-play').click(); await expect.poll(rms).toBeGreaterThan(.01); assert(Number(await page.locator('#mini-seek').inputValue()) >= position);
  await page.locator('#mini-prev').click(); await page.locator('[data-comments]').click(); await expect(page.locator('#comment-text')).toHaveValue('Timer preserves this draft'); await page.keyboard.press('Escape');
  // Cancel while audio is still loading, then release the request: it must stay paused.
  await page.reload(); let release, reached=false, delivered=false;
  const pattern=`**/api/tracks/${tracks[0].id}/audio`;
  await page.route(pattern, async route => { reached=true; await new Promise(ok=>release=ok); await route.continue().catch(() => {}); delivered=true; });
  await trigger.click(); await panel.locator('[data-sleep-minutes="15"]').click(); await page.locator('#mini-play').click(); await expect.poll(()=>reached).toBe(true); await shift(15);
  await expect(page.locator('#mini-player')).toHaveAttribute('data-playback-status','일시정지'); release(); await expect.poll(()=>delivered).toBe(true); await page.unroute(pattern);
  await expect(trigger).not.toHaveClass(/is-active/); await expect(page.locator('#mini-play')).toHaveAttribute('aria-label','재생');
  await trigger.click(); await panel.locator('[data-sleep-minutes="25"]').click(); await page.reload(); await expect(trigger).not.toHaveClass(/is-active/);
  await trigger.click(); await panel.locator('[data-sleep-minutes="55"]').click();
  await page.evaluate(ids => window.__sleepAlarmEvent({type:'start',token:'timer-alarm-test',config:{enabled:true,time:'07:00',tracks:[ids[0],ids[1],ids[0]],volumes:[.2,.45,.7],classicId:ids[1],classicVolume:.25}}), tracks.map(row=>row.id));
  await expect(page.locator('#alarm-ringing-dialog')).toBeVisible(); await expect(trigger).toBeDisabled(); await expect(trigger).not.toHaveClass(/is-active/);
  await shift(55); await expect(page.locator('#mini-player')).toHaveAttribute('data-playback-status','재생 중');
  await page.evaluate(()=>window.__sleepAlarmEvent({type:'dismiss',token:'timer-alarm-test'})); await expect(trigger).toBeEnabled(); await expect(page.locator('#alarm-ringing-dialog')).toBeHidden();
  // Long AAC uses the streaming engine; expiry must release that media too.
  await page.evaluate(id=>sessionStorage.setItem('timerQueueIds',JSON.stringify([id])),aac.id);
  await page.reload();await page.locator('#mini-play').click();await expect(page.locator('#mini-player')).toHaveAttribute('data-playback-status','재생 중');
  await trigger.click();await panel.locator('[data-sleep-minutes="10"]').click();await shift(10);
  await expect(page.locator('#mini-player')).toHaveAttribute('data-playback-status','일시정지');await expect.poll(rms).toBeLessThan(.0001);
  assert.equal((await queue()).ids[0],aac.id);
  for (const [locale,name] of [['en','Sleep timer'],['zh','定时停止播放'],['ja','スリープタイマー'],['ko','재생 중지 타이머']]) {
    await page.evaluate(value=>localStorage.setItem('soriseojae.language',value),locale);await page.reload();await expect(trigger).toHaveAttribute('aria-label',name);
    await page.setViewportSize({width:1280,height:900}); await page.locator('#settings-open').click();
    await expect(page.locator('#settings-dialog [id^="sleep-timer"]')).toHaveCount(0);
    await page.locator('#settings-dialog [data-dialog-close]').click();
    await trigger.click(); await panel.locator('[data-sleep-minutes="25"]').click();
    for (const [width,height] of [[1280,900],[390,700],[320,640],[600,434]]) {
      await page.setViewportSize({width,height}); await page.emulateMedia({colorScheme:width===1280?'light':'dark'}); await trigger.click(); await expect(panel).toBeVisible();
      assert(await panel.evaluate(el=>{const r=el.getBoundingClientRect(),p=document.querySelector('#mini-player').getBoundingClientRect();return r.left>=8&&r.right<=innerWidth-8&&r.top>=0&&r.bottom<=p.top-6;}));
      assert(await trigger.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(locale==='ko') await page.screenshot({path:join(out,`sleep-timer-${width}.png`)});
      await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
      await page.locator('#settings-open').click();
      await expect(page.locator('#settings-dialog [id^="sleep-timer"]')).toHaveCount(0);
      await expect(page.locator('#settings-dialog [data-dialog-close]')).toBeInViewport();
      if(locale==='ko') await page.screenshot({path:join(out,`sleep-settings-${width}.png`)});
      await page.keyboard.press('Escape');
    }
  }
  for(let i=0;i<tracks.length;i++) assert.deepEqual(await readFile(join(root,'data/library',tracks[i].managedPath)),originals[i]);
  assert.deepEqual(await readFile(join(root,'data/library',aac.managedPath)),aacBytes);
  await page.unroute('**/api/state');
  assert.deepEqual(errors,[]);await writeFile(join(out,'results.json'),JSON.stringify({presets:4,actualOutputStopped:true,queueAndPositionPreserved:true,draftPreserved:true,pendingLoadCancelled:true,reloadClears:true,wakeAlarmProtected:true,settingsTimerRemoved:true,longAacTimer:true,locales:4,layouts:4,errors},null,2));console.log('Sleep timer evidence: '+out);
});
