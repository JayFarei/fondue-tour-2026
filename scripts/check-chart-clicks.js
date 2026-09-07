// playwright-cli run-code --filename scripts/check-chart-clicks.js (load the site first)
async (page) => {
  const offsets = [0,457.4,796.6,1127.6,1366].map(km=>km/1408.4*3236);
  const labels = ['Wed 09','Thu 10','Fri 11','Sat 12','Sun 13'];
  const assert = (ok,msg) => { if(!ok) throw new Error(msg); };
  const results=[];
  await page.emulateMedia({reducedMotion:'reduce'});
  for (const width of [1495,390,1920]) {
    await page.setViewportSize({width,height:1000});
    await page.reload();
    const scroller=page.locator('.journey-scroll');
    await scroller.evaluate(e=>e.scrollTo({left:0,behavior:'instant'}));
    const button=page.locator('.journey-next-preview');
    await button.scrollIntoViewIfNeeded();
    const arrow=await button.locator('svg').boundingBox();
    const visited=[];
    for(let step=0;step<6;step++){
      const view=await scroller.evaluate(e=>({left:e.scrollLeft,width:e.clientWidth,max:e.scrollWidth-e.clientWidth}));
      if(view.left>=view.max-3){assert(await button.isDisabled(),'End button must be disabled');break;}
      const next=offsets.findIndex(n=>n>view.left+view.width-68+1);
      const expected=next<0?'Lugano':labels[next];
      assert(await button.innerText()===expected,`${width}: expected first unseen day ${expected}, got ${await button.innerText()}`);
      const position=await button.locator('svg').boundingBox();
      assert(Math.abs(position.x-arrow.x)<1&&Math.abs(position.y-arrow.y)<1,'Arrow moved');
      await page.mouse.click(arrow.x+arrow.width/2,arrow.y+arrow.height/2);
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      const actual=await scroller.evaluate(e=>e.scrollLeft);
      assert(Math.abs(actual-Math.min(view.max,next<0?view.max:offsets[next]))<3,'Wrong click destination');
      const gap=await scroller.evaluate(e=>e.getBoundingClientRect().right-document.querySelector('.journey-plot').getBoundingClientRect().right);
      assert(gap<1,'Blank space at chart end');
      visited.push(expected);
    }
    const back=page.locator('.journey-previous');
    const backArrow=await back.locator('svg').boundingBox();
    for(let i=0;i<6&&!(await back.isDisabled());i++){
      await page.mouse.click(backArrow.x+backArrow.width/2,backArrow.y+backArrow.height/2);
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      const position=await back.locator('svg').boundingBox();
      assert(Math.abs(position.x-backArrow.x)<1,'Back arrow moved');
    }
    assert(await scroller.evaluate(e=>e.scrollLeft)<3,'Back did not reach start');
    results.push({width,visited,fixedArrows:true,noBlankEnd:true});
  }
  return results;
}
