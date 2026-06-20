/* ════════ V2 INTRO + MOTION ORCHESTRATION ════════
 * Hero "Amsterdam" wordmark animation, scroll dock/undock, enter/skeleton motion.
 * Loaded after render.js — uses globals seD/hD/pD, drawSE/drawH/drawP,
 * drawGlobal, isHiddenExpired. The actual rendering boot runs in main.js (last).
 *
 * The wordmark scroll formula + wiring below are guarded by
 * tests/amsterdam-animation.test.js, which also checks the markup in
 * tracker.html and the .v2-wordmark rule + @keyframes v2wordIn in styles.css.
 */
(function(){
  var drawn={se:false,h:false,p:false}, statsDone=false, gTargets={};
  var settled=false, pending=[], pendingStats=false;
  /* ── Animation timing (edit these; dependent timers derive automatically) ── */
  var T={
    heroHold:2000,   // hero sits before auto-scrolling into the dashboard
    scroll:1900,     // hero -> dashboard auto-scroll duration
    cueScroll:1200,  // down-chevron click scroll
    backScroll:1000, // up-chevron (back to hero) scroll
    skeleton:300     // skeleton shimmer before each table renders in
  };
  T.safety   = T.scroll + 1500;               // force-render sections never scrolled into view
  T.fallback = T.heroHold + T.scroll + 2600;  // hard backup reveal if the hold timer fails
  if('scrollRestoration' in history) history.scrollRestoration='manual';

  function skelRow(c){var t='';for(var i=0;i<c;i++)t+='<td><div class="v2-skel"></div></td>';return '<tr>'+t+'</tr>';}
  function injectSkeletons(){
    var cols={'se-body':7,'h-body':10,'p-body':8};
    function vis(items){return items.filter(function(x){return !isHiddenExpired(x);}).length;}
    var rows={
      'se-body':Math.min(16,Math.max(2,vis(Object.values(seD.studios)))),
      'h-body': Math.min(16,Math.max(2,vis(Object.values(hD.listings)))),
      'p-body': Math.min(16,Math.max(1,vis(Object.values(pD.listings))))
    };
    Object.keys(cols).forEach(function(id){var tb=document.getElementById(id);if(!tb)return;
      var n=rows[id],r='';for(var i=0;i<n;i++)r+=skelRow(cols[id]);tb.innerHTML=r;});
  }
  function drawSection(key){
    if(drawn[key])return;drawn[key]=true;
    if(key==='se')drawSE();else if(key==='h')drawH();else drawP();
    var el=document.getElementById(key+'-body');if(!el)return;
    var rows=el.querySelectorAll('tr'), n=rows.length||1;
    // fewer listings reveal slower (more savoured), many reveal fast (Hausing benchmark)
    var step=Math.max(0.04, Math.min(0.25, 0.5/n));
    for(var i=0;i<rows.length;i++){ rows[i].style.animationDelay=(i*step).toFixed(3)+'s'; }
    el.classList.add('v2-stagger');
  }
  function computeGlobals(){
    drawGlobal();
    ['g-new','g-pnd','g-app','g-exp'].forEach(function(id){var el=document.getElementById(id);if(!el)return;
      gTargets[id]=parseInt(el.textContent,10)||0;el.textContent='0';});
  }
  function countUpGlobals(){
    if(statsDone)return;statsDone=true;
    [['g-new',850],['g-pnd',1000],['g-app',1000],['g-exp',1150]].forEach(function(p){
      var el=document.getElementById(p[0]);if(!el)return;var target=gTargets[p[0]]||0;
      if(target<=0){el.textContent=target;return;}
      var t0=performance.now();
      (function step(t){var kk=Math.min(1,(t-t0)/p[1]);
        el.textContent=Math.round(target*(1-Math.pow(1-kk,3)));
        if(kk<1)requestAnimationFrame(step);})(performance.now());
    });
  }
  function initFilterSliders(){
    document.querySelectorAll('.filters').forEach(function(bar){
      var slide=bar.querySelector('.fb-slide');
      if(!slide){slide=document.createElement('div');slide.className='fb-slide';bar.insertBefore(slide,bar.firstChild);}
      function move(){var on=bar.querySelector('.fb.on');if(!on){slide.style.opacity=0;return;}
        slide.style.opacity=1;slide.style.width=on.offsetWidth+'px';
        slide.style.transform='translate('+on.offsetLeft+'px,'+on.offsetTop+'px)';}
      bar.querySelectorAll('.fb').forEach(function(b){b.addEventListener('click',function(){setTimeout(move,0);});});
      bar._move=move;requestAnimationFrame(move);
    });
  }
  window.addEventListener('resize',function(){document.querySelectorAll('.filters').forEach(function(b){if(b._move)b._move();});});

  function setupObservers(){
    var statsWrap=document.querySelector('.global-stats-wrap');
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if(!en.isIntersecting)return;var el=en.target;io.unobserve(el);
        if(el===statsWrap){ if(settled){countUpGlobals();}else{pendingStats=true;} return; }
        var key=el.getAttribute('data-draw');
        if(settled){ setTimeout(function(){drawSection(key);},T.skeleton); }
        else if(pending.indexOf(key)<0){ pending.push(key); }
      });
    },{threshold:0.12,rootMargin:'0px 0px -8% 0px'});
    if(statsWrap)io.observe(statsWrap);
    [['se-body','se'],['h-body','h'],['p-body','p']].forEach(function(p){
      var tb=document.getElementById(p[0]);if(tb){tb.setAttribute('data-draw',p[1]);io.observe(tb);}});
  }

  function easeInOut(k){return k<.5?4*k*k*k:1-Math.pow(-2*k+2,3)/2;}
  function animateScrollTo(toY,dur,onstep,done){
    var fromY=window.pageYOffset,t0=performance.now(),fin=false;
    function finish(){ if(fin)return; fin=true; window.scrollTo(0,toY); if(done)done(); }
    (function step(t){ if(fin)return;
      var k=Math.min(1,(t-t0)/dur);var e=easeInOut(k);
      window.scrollTo(0,fromY+(toY-fromY)*e);
      if(onstep)onstep(k);
      if(k<1)requestAnimationFrame(step); else finish();
    })(performance.now());
    // Guarantee completion even if rAF is paused (hidden/background tab) or laggy,
    // so `animating` always clears and the dashboard can never get stuck unscrollable.
    setTimeout(finish, dur+250);
  }

  var hero=document.getElementById('v2-intro');
  var word=hero&&hero.querySelector('.v2-wordmark');
  function heroH(){return (hero&&hero.offsetHeight)||window.innerHeight;}
  function onHeroScroll(){
    if(!hero)return;
    var p=Math.min(1,Math.max(0,window.pageYOffset/heroH()));
    hero.style.opacity=String(1-p*0.85);
    hero.classList.toggle('v2-hide-cue',p>0.04);
    if(word&&p>0.001){word.style.animation='none';word.style.transform='translateY('+(8+p*66)+'%)';}
  }
  var animating=false, inHero=true, autoHold;

  // Dock = hero removed from the scroll flow so the dashboard bottoms out at 0 (no overshoot).
  function dock(){ if(hero)hero.style.display='none'; void document.body.offsetHeight; window.scrollTo(0,0); captureOff(); document.body.classList.add('v2-docked'); }
  function undock(){ document.body.classList.remove('v2-docked'); if(hero)hero.style.display=''; window.scrollTo(0,heroH()); captureOn(); }

  function settle(){
    if(settled)return;settled=true;
    if(pendingStats)setTimeout(countUpGlobals,200);
    pending.forEach(function(key,i){setTimeout(function(){drawSection(key);},T.skeleton+i*140);});
  }
  function goDown(){
    if(animating||!inHero)return;
    clearTimeout(autoHold); animating=true;
    animateScrollTo(heroH(),T.scroll,function(k){if(k>0.55)document.body.classList.add('v2-docked');},function(){animating=false;inHero=false;dock();settle();});
    setTimeout(function(){ // safety: render anything still pending/off-screen
      settle();countUpGlobals();['se','h','p'].forEach(function(key){drawSection(key);});
      document.querySelectorAll('.filters').forEach(function(b){if(b._move)b._move();});
    },T.safety);
  }
  function goUp(){
    if(animating||inHero)return;
    animating=true; undock();
    animateScrollTo(0,T.scroll,null,function(){animating=false;inHero=true;});
  }
  // onWheel/onTouchMove preventDefault ALL scroll to capture the hero->dashboard
  // descent. They're attached only in the hero/transition and removed once docked
  // (captureOff) — otherwise they'd block the dashboard's native scrolling.
  // Return to the hero is via the up-arrow button (goUp) only.
  var touchY=null;
  function onWheel(e){ e.preventDefault(); if(!animating && e.deltaY>0) goDown(); }
  function onTouchStart(e){ touchY=e.touches[0].clientY; }
  function onTouchMove(e){ e.preventDefault(); if(!animating && touchY!==null && (touchY-e.touches[0].clientY)>6) goDown(); }
  function onKey(e){ if(!animating && ['ArrowDown','PageDown',' ','Spacebar'].indexOf(e.key)>-1){ e.preventDefault(); goDown(); } }
  function captureOn(){
    window.addEventListener('wheel',onWheel,{passive:false});
    window.addEventListener('touchstart',onTouchStart,{passive:true});
    window.addEventListener('touchmove',onTouchMove,{passive:false});
    window.addEventListener('keydown',onKey);
  }
  function captureOff(){
    window.removeEventListener('wheel',onWheel);
    window.removeEventListener('touchstart',onTouchStart);
    window.removeEventListener('touchmove',onTouchMove);
    window.removeEventListener('keydown',onKey);
  }

  // Boot: pre-warm everything so the transition's first frame is jank-free
  window.scrollTo(0,0);
  injectSkeletons();
  computeGlobals();
  initFilterSliders();
  setupObservers();
  // Permanent passive listeners — never removed. Safari leaves the scroll area stale
  // after a display:none layout change UNLESS a wheel/scroll listener exists; these
  // keep its scroll path alive in the docked dashboard. Also drives the hero fade.
  window.addEventListener('scroll',onHeroScroll,{passive:true});
  window.addEventListener('wheel',function(){},{passive:true});
  captureOn();
  onHeroScroll();
  var backBtn=document.getElementById('v2-back');
  if(backBtn)backBtn.addEventListener('click',goUp);
  autoHold=setTimeout(goDown,T.heroHold);
  setTimeout(function(){if(inHero)goDown();},T.fallback); // hard fallback
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = {}; }
