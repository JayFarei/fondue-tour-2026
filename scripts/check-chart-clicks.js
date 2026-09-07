// Run with playwright-cli run-code --filename scripts/check-chart-clicks.js
// Load the roadbook URL first. This tests real pointer clicks without moving the mouse.
async (page) => {
  const starts = [0, 457.4, 796.6, 1127.6, 1366];
  const targets = starts.map((km) => km / 1408.4 * 3236);
  const results = [];
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [1440, 390, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.reload();
    await page.locator('.journey-scroll').evaluate((e) => e.scrollTo({ left: 0, behavior: 'instant' }));
    const forward = page.locator('.journey-next-preview');
    const back = page.locator('.journey-previous');
    await forward.scrollIntoViewIfNeeded();
    const forwardBox = await forward.locator('svg').boundingBox();
    const backBox = await back.locator('svg').boundingBox();
    const checkBox = async () => {
      for (const [button, before] of [[forward.locator('svg'), forwardBox], [back.locator('svg'), backBox]]) {
        const after = await button.boundingBox();
        assert(after && Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1 && Math.abs(after.width - before.width) < 1, `${width}px: click target moved`);
      }
    };
    const clickAndCheck = async (box, day) => {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      // Reduced motion makes arrival immediate, while a frame allows React to settle.
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const left = await page.locator('.journey-scroll').evaluate((e) => e.scrollLeft);
      assert(Math.abs(left - targets[day]) < 3, `${width}px: expected day ${day + 1} at ${targets[day].toFixed(1)}px; got ${left}px`);
      await checkBox();
    };
    for (let day = 1; day <= 4; day++) await clickAndCheck(forwardBox, day);
    assert(await forward.isDisabled(), 'Next must stay in place, disabled at the end');
    await clickAndCheck(forwardBox, 4);
    for (let day = 3; day >= 0; day--) await clickAndCheck(backBox, day);
    assert(await back.isDisabled(), 'Back must be disabled at the start');
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, scrollbar: getComputedStyle(document.querySelector('.journey-scroll')).scrollbarWidth }));
    assert(!layout.overflow && layout.scrollbar === 'none', 'Unexpected overflow or visible scrollbar');
    results.push({ width, forwardDays: 4, backwardDays: 4, fixedClickTargets: true });
  }
  // Rapid repeated clicks must queue days, not be reinterpreted mid-animation.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const forward = page.locator('.journey-next-preview');
  const back = page.locator('.journey-previous');
  const forwardBox = await forward.locator('svg').boundingBox();
  const backBox = await back.locator('svg').boundingBox();
  for (let i = 0; i < 4; i++) await page.mouse.click(forwardBox.x + forwardBox.width / 2, forwardBox.y + forwardBox.height / 2);
  await page.waitForFunction((target) => Math.abs(document.querySelector('.journey-scroll').scrollLeft - target) < 3, targets[4]);
  for (let i = 0; i < 4; i++) await page.mouse.click(backBox.x + backBox.width / 2, backBox.y + backBox.height / 2);
  await page.waitForFunction(() => document.querySelector('.journey-scroll').scrollLeft < 3);
  // A manual pan re-establishes the current day before the next click.
  await page.locator('.journey-scroll').evaluate((e) => e.scrollTo({ left: 1500, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('.journey-chart-nav').getAttribute('data-current-day') === '1');
  await page.mouse.click(forwardBox.x + forwardBox.width / 2, forwardBox.y + forwardBox.height / 2);
  await page.waitForFunction((target) => Math.abs(document.querySelector('.journey-scroll').scrollLeft - target) < 3, targets[2]);
  results.push({ rapidClicks: 'forward and back passed', manualPanThenNext: 'passed' });
  return results;
}
