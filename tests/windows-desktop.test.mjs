import test from 'node:test';import assert from 'node:assert/strict';import{mkdtemp,mkdir,readFile,writeFile}from'node:fs/promises';import{tmpdir}from'node:os';import{join,resolve,isAbsolute}from'node:path';import{pathToFileURL}from'node:url';import{playableFlac}from'./fixtures.mjs';
test('Windows packaged app: first window, local import/playback, settings and no native Mac media bridge',{skip:process.platform!=='win32'||!process.env.RUN_WINDOWS_TESTS,timeout:90000},async t=>{
 const module=process.env.PLAYWRIGHT_MODULE||'playwright';const{_electron}=await import(isAbsolute(module)?pathToFileURL(module).href:module);const{expect}=await import(module.startsWith('/')||/^[A-Z]:/i.test(module)?pathToFileURL(join(module,'..','test.mjs')).href:'playwright/test');
 const root=await mkdtemp(join(tmpdir(),'cove-win-')),data=join(root,'data'),profile=join(root,'profile');
 await Promise.all([mkdir(data),mkdir(profile)]);
 await writeFile(join(profile,'library.json'),JSON.stringify({language:'en'}));
 const app=await _electron.launch({executablePath:resolve('dist/Cove-win32-x64/Cove.exe'),args:['--mute-audio'],env:{...process.env,COVE_DATA_DIR:data,COVE_PROFILE_DIR:profile}});
 t.after(async()=>{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{});await app.close().catch(()=>{});});
 const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await expect(page.getByRole('heading',{name:'Today',exact:true})).toBeVisible();
 assert.equal(await app.evaluate(({Menu})=>Menu.getApplicationMenu()),null);
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMenuBarVisible()),false);
 await page.keyboard.press('Alt');assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMenuBarVisible()),false);
 assert.equal(await page.evaluate(()=>window.covePlatform),'win32');assert.equal(await page.evaluate(()=>window.coveMedia),undefined);
 // Today is in the initial HTML. Wait for the renderer to load the library and bind navigation.
 await expect(page.locator('#import-library-path')).not.toHaveText('');
 await page.locator('#main-content').focus();await page.keyboard.press('Control+o');
 await expect(page.locator('[data-view="import"]')).toBeVisible();
 const bytes=playableFlac({title:'Windows 검사',seconds:12});
 await page.locator('#file-input').setInputFiles({name:'한글 음악.flac',mimeType:'audio/flac',buffer:bytes});
 await expect(page.locator('#import-complete')).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.locator('#import-complete h2')).toHaveText('Added to library: 1');
 await page.locator('#open-imported').click();await page.locator('#library-grid [data-row-play]').first().click();await expect(page.locator('#mini-play')).toHaveAttribute('aria-label','Pause');await page.locator('#mini-play').click();
 const url=new URL(page.url()).origin,state=await page.request.get(url+'/api/state').then(r=>r.json());const track=await page.request.get(url+'/api/tracks/'+state.tracks[0].id).then(r=>r.json());assert.deepEqual(await readFile(join(data,'library',track.managedPath)),bytes);
 await page.locator('#settings-open').click();await expect(page.locator('.settings-signature')).toHaveText('Made by woodychoi777');await expect(page.locator('#language-setting')).toHaveValue('en');await page.locator('#alarm-open').click();await expect(page.locator('.alarm-help')).toContainText('Windows wake from sleep is unsupported');await page.keyboard.press('Escape');await expect(page.locator('#app-quit')).toBeVisible();
 await expect(page.locator('#settings-dialog [id^="sleep-timer"]')).toHaveCount(0);await page.keyboard.press('Escape');
 await page.keyboard.press('Control+=');await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomLevel())).toBe(.5);
 await page.keyboard.press('Control+0');await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.getZoomLevel())).toBe(0);
 await page.keyboard.press('F11');await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(true);
 await page.keyboard.press('F11');await expect.poll(()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen())).toBe(false);
 await page.addInitScript(()=>{window.__sleepShift=0;const now=Date.now;Date.now=()=>now()+window.__sleepShift;});await page.reload();
 for(const minutes of [10,15,25,55]){await page.locator('#sleep-timer-open').click();await page.locator(`[data-sleep-minutes="${minutes}"]`).click();await expect(page.locator('[data-timer-badge]')).toHaveText(String(minutes));}
 await page.locator('#sleep-timer-open').click();await page.locator('#sleep-timer-cancel').click();await expect(page.locator('#sleep-timer-open')).not.toHaveClass(/is-active/);
 await page.locator('#mini-play').click();await expect(page.locator('#mini-play')).toHaveAttribute('aria-label','Pause');
 await expect.poll(async()=>Number(await page.locator('#mini-seek').inputValue())).toBeGreaterThan(.1);
 await page.locator('#sleep-timer-open').click();await page.locator('[data-sleep-minutes="10"]').click();await page.evaluate(()=>window.__sleepShift=600000);
 await expect(page.locator('#mini-play')).toHaveAttribute('aria-label','Play');await expect(page.locator('#sleep-timer-open')).not.toHaveClass(/is-active/);assert(Number(await page.locator('#mini-seek').inputValue())>.1);
 await mkdir('dist/windows-verification',{recursive:true});await page.screenshot({path:'dist/windows-verification/player.png'});
 await page.locator('#sleep-timer-open').click();await page.screenshot({path:'dist/windows-verification/timer.png'});await page.keyboard.press('Escape');
 await page.locator('#settings-open').click();await page.screenshot({path:'dist/windows-verification/settings.png'});
 assert.deepEqual(errors,[]);await writeFile('dist/windows-verification/results.json',JSON.stringify({menuRemoved:true,altDoesNotRestoreMenu:true,keyboardImport:true,zoomAndFullscreen:true,sleepPresets:4,sleepTimerExpired:true,settingsTimerAbsent:true,sourcePreserved:true,errors},null,2));
 const closed=app.waitForEvent('close');await page.locator('#app-quit').click();await closed;

});
