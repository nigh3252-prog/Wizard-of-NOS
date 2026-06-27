/* PASS 10.9: Mini planner board crop HUD.
   Rebased on the known-working Pass 10 fixed-crew Tetris file.
   This is visual-only: it hides old portrait ammo pips and renders a tiny,
   clipped, scrolling version of the actual 12-row Tetris board behind the
   right-side character portraits. It intentionally does not touch WizardActions
   or the Pass 6 combat driver, so fire/reload/special behavior remains owned by
   the working combat path. */

(function installStarterBaseSecondsSelector(){
  function syncStarterBaseSecondsUI(){
    const value=(typeof pass9StarterTimelineSecondsPerCard==='function')?pass9StarterTimelineSecondsPerCard():4;
    const sel=document.getElementById('starterBaseSecondsSelect');
    const ro=document.getElementById('starterBaseSecondsReadout');
    if(sel)sel.value=String(value);
    if(ro)ro.textContent=value+'s';
    return value;
  }
  function recalcStarterTimelineFromSetting(reason){
    try{if(window.__wizardPass9SyncCardLibraryToPlanner)window.__wizardPass9SyncCardLibraryToPlanner({source:reason||'starter-seconds-change'});}catch(_){}
    try{
      const store=window.__wizardTimelinePlanStore;
      if(store&&store.getSnapshot&&store.setSnapshot){
        const snap=store.getSnapshot();
        if(snap&&typeof pass9RecalculateSnapshotStarterTimeline==='function'){
          pass9RecalculateSnapshotStarterTimeline(snap);
          store.setSnapshot(snap,reason||'starter-seconds-change');
        }
      }
    }catch(e){console.warn('Starter base timeline recalc failed',e);}
    try{if(typeof pass6CaptureCurrentPlan==='function'&&pass6TetrominoCombat&&pass6TetrominoCombat.captured)pass6CaptureCurrentPlan();}catch(_){}
  }
  window.__wizardStarterBaseSeconds={sync:syncStarterBaseSecondsUI,recalculate:recalcStarterTimelineFromSetting};
  setTimeout(()=>{
    const sel=document.getElementById('starterBaseSecondsSelect');
    syncStarterBaseSecondsUI();
    if(sel)sel.addEventListener('change',()=>{
      const value=wizardSetStarterTimelineSecondsPerCard(sel.value);
      syncStarterBaseSecondsUI();
      recalcStarterTimelineFromSetting('starter-seconds-menu');
      try{if(typeof addLog==='function')addLog('Starter base timeline set to '+value+'s per Starter card.');}catch(_){}
    });
  },0);
})();

(function installPass109MiniPlannerBoardCrop(){
  if(window.__wizardPass109MiniPlannerBoardCropInstalled)return;
  window.__wizardPass109MiniPlannerBoardCropInstalled=true;

  const css=document.createElement('style');
  css.textContent=`
    .nosPortrait .nosAmmoMeter,.nosPortrait .nosAmmoSeg{display:none!important;visibility:hidden!important;opacity:0!important;}
    #miniTetrisTimelineHud{position:fixed;z-index:4;pointer-events:none;display:none;overflow:hidden;contain:layout style paint;border-radius:14px 0 0 14px;}
    #miniTetrisTimelineHud canvas{display:block;width:100%;height:100%;pointer-events:none;image-rendering:auto;}
    body.wizardMenuLayerOpen #miniTetrisTimelineHud{display:none!important;}
    #cardCol.nosCrew{z-index:5;}
  `;
  document.head.appendChild(css);

  const hud=document.createElement('div');
  hud.id='miniTetrisTimelineHud';
  hud.setAttribute('aria-hidden','true');
  const canvas=document.createElement('canvas');
  hud.appendChild(canvas);
  document.body.appendChild(hud);
  const ctx=canvas.getContext('2d');

  const SHAPES={
    I:[[0,1],[1,1],[2,1],[3,1]],
    O:[[1,1],[2,1],[1,2],[2,2]],
    T:[[1,0],[0,1],[1,1],[2,1]],
    S:[[1,0],[2,0],[0,1],[1,1]],
    Z:[[0,0],[1,0],[1,1],[2,1]],
    J:[[0,0],[0,1],[1,1],[2,1]],
    L:[[2,0],[0,1],[1,1],[2,1]]
  };
  const FIRE_TYPES=new Set(['S','J']);
  const RELOAD_TYPES=new Set(['O','L']);
  const MOD_TYPES=new Set(['I','T']);

  const C={
    bg:'rgba(15,20,30,.42)',
    bg2:'rgba(42,49,64,.32)',
    cell:'rgba(255,255,255,.060)',
    cellStroke:'rgba(255,255,255,.105)',
    cellHot:'rgba(255,244,194,.16)',
    sep:'rgba(255,230,166,.34)',
    playhead:'rgba(255,251,214,.82)',
    playheadGlow:'rgba(255,235,145,.28)',
    fireA:'rgba(244,88,82,.96)',
    fireB:'rgba(255,178,83,.94)',
    reloadA:'rgba(255,219,102,.94)',
    reloadB:'rgba(255,148,70,.90)',
    modA:'rgba(113,222,227,.90)',
    modB:'rgba(142,117,245,.92)',
    specialA:'rgba(183,112,255,.92)',
    specialB:'rgba(255,227,121,.92)',
    unknown:'rgba(230,235,225,.58)',
    icon:'rgba(255,255,245,.88)',
    label:'rgba(255,241,189,.74)',
    ammoMask:'rgba(9,14,22,.76)',
    ammoMaskStroke:'rgba(255,235,170,.24)'
  };

  let layout=null;
  let lastLayoutTime=0;
  let cellCache=null;
  let cellCachePieces=null;
  let cellCacheCount=-1;
  let cellCacheLength=-1;

  if(typeof window.__wizardMiniAmmoMaskEnabled!=="boolean")window.__wizardMiniAmmoMaskEnabled=false;
  const miniAmmoMaskBtn=document.getElementById('miniAmmoMaskBtn');
  function syncMiniAmmoMaskButton(){
    if(miniAmmoMaskBtn)miniAmmoMaskBtn.textContent='MINI AMMO MASK: '+(window.__wizardMiniAmmoMaskEnabled?'ON':'OFF');
  }
  window.__wizardSyncMiniAmmoMaskButton=syncMiniAmmoMaskButton;
  if(miniAmmoMaskBtn&&!miniAmmoMaskBtn.dataset.bound){
    miniAmmoMaskBtn.dataset.bound='1';
    miniAmmoMaskBtn.addEventListener('click',()=>{
      window.__wizardMiniAmmoMaskEnabled=!window.__wizardMiniAmmoMaskEnabled;
      syncMiniAmmoMaskButton();
      try{if(typeof saveSettings==='function')saveSettings();else localStorage.setItem('wizardMiniAmmoMaskEnabled',JSON.stringify(window.__wizardMiniAmmoMaskEnabled));}catch(_){ }
      try{computeLayout(true);drawMiniBoard();}catch(_){ }
    });
  }
  syncMiniAmmoMaskButton();

  function runtimeState(){
    try{const api=window.__wizardPass6TetrominoCombat;if(api&&api.state)return api.state;}catch(_){ }
    return null;
  }
  function normCells(cells){
    if(!cells.length)return[];
    const minX=Math.min(...cells.map(c=>c[0])),minY=Math.min(...cells.map(c=>c[1]));
    return cells.map(([x,y])=>[x-minX,y-minY]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
  }
  function rotCells(cells,turns){
    let out=cells.map(c=>[c[0],c[1]]);
    const safe=((turns%4)+4)%4;
    for(let i=0;i<safe;i++)out=normCells(out.map(([x,y])=>[3-y,x]));
    return normCells(out);
  }
  function cellsForPiece(piece){return rotCells(SHAPES[piece&&piece.type]||[],Number(piece&&piece.rotation)||0);}
  function absoluteCells(piece){
    return cellsForPiece(piece).map(([x,y])=>({piece,column:(Number(piece.row)||0)+y,lane:(Number(piece.col)||0)+x}));
  }
  function mod(n,m){return ((n%m)+m)%m;}
  function roundedRect(c,x,y,w,h,r){
    r=Math.max(0,Math.min(r,w/2,h/2));
    c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
  }
  function visiblePortraits(){
    const active=((window.__wizardPass10Crew&&window.__wizardPass10Crew.getIndexes)?window.__wizardPass10Crew.getIndexes():((typeof activeCrewChars==='function')?activeCrewChars():[])).filter(Number.isInteger);
    const activeSet=new Set(active);
    return Array.from(document.querySelectorAll('.nosPortrait[data-char-index]'))
      .filter(el=>el&&el.offsetParent!==null)
      .map(el=>({el,rect:el.getBoundingClientRect(),charIdx:Number(el.dataset.charIndex)}))
      .filter(p=>p.rect.width>10&&p.rect.height>10&&(!activeSet.size||activeSet.has(p.charIdx)))
      .sort((a,b)=>{const ai=active.indexOf(a.charIdx),bi=active.indexOf(b.charIdx);return (ai<0?99:ai)-(bi<0?99:bi)||a.rect.top-b.rect.top||a.rect.left-b.rect.left;})
      .slice(0,Math.max(1,Math.min(4,active.length||1)));
  }
  function computeLayout(force=false){
    const now=performance.now();
    if(!force&&layout&&now-lastLayoutTime<160)return layout;
    lastLayoutTime=now;
    const portraits=visiblePortraits();
    if(!portraits.length){layout=null;return null;}

    const pLeft=Math.min(...portraits.map(p=>p.rect.left));
    const pRight=Math.max(...portraits.map(p=>p.rect.right));
    const pTop=Math.min(...portraits.map(p=>p.rect.top));
    const pBottom=Math.max(...portraits.map(p=>p.rect.bottom));
    const pW=Math.max(34,portraits.reduce((s,p)=>s+p.rect.width,0)/portraits.length);
    const pH=Math.max(34,portraits.reduce((s,p)=>s+p.rect.height,0)/portraits.length);

    // Narrow crop: keep the existing mini-board look close to the original
    // four-column preview, with only enough world-side room for compact vertical ammo pips.
    const leftReach=pW*1.30;
    const hudLeft=Math.max(0,Math.floor(pLeft-leftReach));
    const hudRight=Math.min(window.innerWidth,Math.ceil(pRight+5));
    const hudTop=Math.max(0,Math.floor(pTop-pH*.06));
    const hudBottom=Math.min(window.innerHeight,Math.ceil(pBottom+pH*.06));
    const w=Math.max(70,hudRight-hudLeft);
    const h=Math.max(130,hudBottom-hudTop);
    hud.style.left=hudLeft+'px';
    hud.style.top=hudTop+'px';
    hud.style.width=w+'px';
    hud.style.height=h+'px';

    const dpr=Math.max(1,Math.min(2.5,window.devicePixelRatio||1));
    const cw=Math.max(1,Math.round(w*dpr)),ch=Math.max(1,Math.round(h*dpr));
    if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
    ctx.setTransform(dpr,0,0,dpr,0,0);

    const centers=portraits.map(p=>({
      x:p.rect.left-hudLeft+p.rect.width/2,
      y:p.rect.top-hudTop+p.rect.height/2,
      rect:p.rect,
      charIdx:p.charIdx
    }));
    const gap=centers.length>1?centers[1].y-centers[0].y:pH+3;
    if(!centers.length){layout=null;return null;}

    // Make 3 Tetris lanes fit behind each portrait, with small gaps like the full planner board.
    const rowGap=Math.max(.8,Math.min(1.5,pH*.035));
    const cellH=Math.max(5,Math.min(12,(pH-rowGap*2)/3));
    const cellW=cellH;
    const colGap=Math.max(.8,Math.min(1.6,cellW*.13));
    const colPitch=cellW+colGap;
    const rowPitch=cellH+rowGap;

    const portraitLeft=pLeft-hudLeft;
    const portraitRight=pRight-hudLeft;
    const boardLeft=2;
    const boardRight=w-2;
    // Fixed playhead: one more mini-column left than Pass 10.28, without changing
    // the real action timing. Pass 6 still owns when actions actually resolve.
    const desiredPlayheadX=portraitLeft-colPitch*3.25;
    const playheadX=Math.max(boardLeft+colPitch*1.25,Math.min(boardRight-colPitch*1.25,desiredPlayheadX));
    // Compact vertical ammo pips sit just to the left of the fixed read line.
    const ammoX=Math.max(boardLeft+cellW*.75,Math.min(playheadX-colPitch*.72,portraitLeft-colPitch*3.95));

    layout={hudLeft,hudTop,w,h,dpr,centers,pW,pH,portraitLeft,portraitRight,boardLeft,boardRight,playheadX,ammoX,cellW,cellH,colGap,colPitch,rowGap,rowPitch};
    return layout;
  }
  function laneY(l,lane){
    const band=Math.max(0,Math.min((l.centers&&l.centers.length?l.centers.length:1)-1,Math.floor(lane/3)));
    const row=lane%3;
    return l.centers[band].y+(row-1)*l.rowPitch-l.cellH/2;
  }
  function kindForPiece(p){
    if(!p)return'unknown';
    if(p.actionType)return String(p.actionType);
    if(FIRE_TYPES.has(p.type))return'fire';
    if(RELOAD_TYPES.has(p.type))return'reload';
    if(MOD_TYPES.has(p.type))return'modifier';
    if(p.type==='Z')return'special';
    return'unknown';
  }
  function rebuildCells(state){
    const pieces=Array.isArray(state&&state.pieces)?state.pieces:[];
    const len=Math.max(1,Number(state&&state.planLengthColumns)||1);
    if(cellCache&&cellCachePieces===pieces&&cellCacheCount===pieces.length&&cellCacheLength===len)return cellCache;
    const cols=Array.from({length:len},()=>[]);
    for(const piece of pieces){
      const kind=kindForPiece(piece);
      for(const cell of absoluteCells(piece)){
        if(cell.lane<0||cell.lane>=Math.max(3,(typeof pass6LaneCount==='function'?pass6LaneCount():12)))continue;
        const column=mod(cell.column,len);
        cols[column].push({piece,kind,column,lane:cell.lane,type:piece.type,modifierKey:piece.modifierKey||null,specialKey:piece.specialKey||null});
      }
    }
    cellCache=cols;cellCachePieces=pieces;cellCacheCount=pieces.length;cellCacheLength=len;
    return cols;
  }
  function exactCol(state){
    const len=Math.max(1,Number(state&&state.planLengthColumns)||1);
    const secondsPer=Math.max(.1,Number(state&&state.timelineSecondsPerRow)||1);
    const frames=Number(state&&state.clockFrames)||0;
    let ex=(frames/60/secondsPer)%len;
    if(ex<0)ex+=len;
    return ex;
  }
  function gradientFor(kind,x,y,w,h){
    const g=ctx.createLinearGradient(x,y,x+w,y+h);
    if(kind==='fire'){g.addColorStop(0,C.fireA);g.addColorStop(1,C.fireB);}
    else if(kind==='reload'){g.addColorStop(0,C.reloadA);g.addColorStop(1,C.reloadB);}
    else if(kind==='modifier'){g.addColorStop(0,C.modA);g.addColorStop(1,C.modB);}
    else if(kind==='special'){g.addColorStop(0,C.specialA);g.addColorStop(1,C.specialB);}
    else {g.addColorStop(0,C.unknown);g.addColorStop(1,C.unknown);}
    return g;
  }
  function iconFor(cell){
    if(cell.kind==='fire')return '▶';
    if(cell.kind==='reload')return '↻';
    if(cell.kind==='modifier')return '✦';
    if(cell.kind==='special')return '⚔';
    return '•';
  }
  function ammoSnapshot(crewIdx){
    try{
      if(window.WizardActions&&typeof window.WizardActions.getCrewCombatState==='function'){
        const s=window.WizardActions.getCrewCombatState(crewIdx)||{};
        if(s.error)throw new Error(s.error);
        const mag=Math.max(1,Number(s.mag)||1);
        const ammo=Math.max(0,Math.min(mag,Number(s.ammo)||0));
        return {ammo,mag,reloading:!!s.reloading,reloadTimer:Math.max(0,Number(s.reloadTimer)||0),weaponKey:s.weaponKey||'',error:null};
      }
      throw new Error('WizardActions.getCrewCombatState missing');
    }catch(err){
      return {ammo:0,mag:1,reloading:false,reloadTimer:0,weaponKey:'',error:err&&err.message?err.message:String(err)};
    }
  }
  function ammoPipCountForMag(mag){
    // The pip count is intentionally approximate: it communicates small / medium / large
    // magazines and then uses fill percentage, instead of trying to show one pip per round.
    mag=Math.max(1,Number(mag)||1);
    if(mag<=1)return 1;
    if(mag<=2)return 2;
    if(mag<=6)return 3;
    if(mag<=10)return 4;
    if(mag<=18)return 5;
    if(mag<=30)return 6;
    return 7; // Cap future high-MOL/magazine builds so the HUD never turns into a ruler.
  }
  function drawReloadGlyph(cx,cy,size,t){
    ctx.save();
    const r=Math.max(3,size*.56);
    ctx.translate(cx,cy);
    ctx.rotate((t||0)*.0045);
    ctx.strokeStyle='rgba(139,225,255,.96)';
    ctx.lineWidth=Math.max(1.15,size*.16);
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.arc(0,0,r,-Math.PI*.72,Math.PI*.82);
    ctx.stroke();
    ctx.fillStyle='rgba(139,225,255,.96)';
    ctx.beginPath();
    ctx.moveTo(r*.78,-r*.52);
    ctx.lineTo(r*1.22,-r*.18);
    ctx.lineTo(r*.70,r*.02);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function drawAmmoIndicators(l){
    if(!l||!l.centers||!l.centers.length)return;
    const x=Math.max(2,Number(l.ammoX)||2);
    const now=performance.now();
    for(let crewIdx=0;crewIdx<l.centers.length;crewIdx++){
      const snap=ammoSnapshot(crewIdx);
      const pipCount=ammoPipCountForMag(snap.mag);
      const bandH=Math.max(22,l.pH||36);
      const maxStackH=Math.max(18,Math.min(bandH*.86,l.rowPitch*3.05));
      const gap=Math.max(.8,Math.min(2.0,l.cellH*.13));
      const r=Math.max(1.65,Math.min(3.35,(maxStackH-gap*(pipCount-1))/(pipCount*2)));
      const step=r*2+gap;
      const stackH=pipCount*r*2+(pipCount-1)*gap;
      const yTop=l.centers[crewIdx].y-stackH/2;
      const filled=snap.mag>0
        ? (snap.ammo>0?Math.max(1,Math.min(pipCount,Math.ceil((snap.ammo/snap.mag)*pipCount))):0)
        : 0;

      ctx.save();
      ctx.globalAlpha=.96;
      const maskOn=!!window.__wizardMiniAmmoMaskEnabled;
      if(maskOn){
        // Optional readability mask: a compact backing plate for the ammo stack so
        // the pips read as a separate supply gauge instead of sitting directly on
        // the scrolling timeline cells.
        const maskPadX=Math.max(3,r*.95);
        const maskPadY=Math.max(4,r*1.15);
        ctx.fillStyle=C.ammoMask;
        roundedRect(ctx,x-r-maskPadX,yTop-maskPadY,r*2+maskPadX*2,stackH+maskPadY*2,Math.max(5,r+3));ctx.fill();
        ctx.strokeStyle=C.ammoMaskStroke;ctx.lineWidth=.75;
        roundedRect(ctx,x-r-maskPadX+.35,yTop-maskPadY+.35,r*2+maskPadX*2-.7,stackH+maskPadY*2-.7,Math.max(5,r+3));ctx.stroke();
      }else{
        ctx.fillStyle='rgba(16,22,32,.38)';
        roundedRect(ctx,x-r-2,yTop-3,r*2+4,stackH+6,Math.max(4,r+2));ctx.fill();
      }

      for(let i=0;i<pipCount;i++){
        // Draw full ammo at the top of the stack, empty at the bottom.
        const filledIndex=pipCount-1-i;
        const py=yTop+i*step+r;
        ctx.beginPath();ctx.arc(x,py,r,0,Math.PI*2);
        const isFilled=filledIndex<filled;
        ctx.fillStyle=isFilled?'rgba(255,215,95,.92)':'rgba(255,255,255,.115)';ctx.fill();
        ctx.strokeStyle=isFilled?'rgba(255,246,188,.58)':'rgba(255,255,255,.20)';ctx.lineWidth=.7;ctx.stroke();
      }

      if(snap.reloading){
        const cy=yTop+stackH/2;
        ctx.fillStyle='rgba(12,18,28,.42)';
        ctx.beginPath();ctx.arc(x,cy,Math.max(5,r*2.15),0,Math.PI*2);ctx.fill();
        drawReloadGlyph(x,cy,Math.max(8,r*3.0),now);
      }
      ctx.restore();
    }
  }
  function drawStatus(l,msg){
    hud.style.display='block';
    ctx.clearRect(0,0,l.w,l.h);
    ctx.fillStyle=C.bg;roundedRect(ctx,0,0,l.w,l.h,12);ctx.fill();
    ctx.fillStyle=C.label;ctx.font='800 8px system-ui,sans-serif';ctx.fillText(msg,5,Math.min(l.h-5,14));
  }
  function drawMiniBoard(){
    const l=computeLayout();
    if(!l){hud.style.display='none';return;}
    const state=runtimeState();
    if(!state||!state.captured){drawStatus(l,'No plan');return;}
    const pieces=Array.isArray(state.pieces)?state.pieces:[];
    if(!pieces.length){drawStatus(l,'Blank plan');return;}

    hud.style.display='block';
    ctx.clearRect(0,0,l.w,l.h);
    const firstY=laneY(l,0)-l.cellH*.65;
    const visibleLaneCount=Math.max(3,l.centers.length*3);
    const lastY=laneY(l,visibleLaneCount-1)+l.cellH*1.65;
    const boardTop=Math.max(0,firstY-2),boardH=Math.min(l.h,lastY)-boardTop;

    ctx.save();
    roundedRect(ctx,0,0,l.w,l.h,13);
    ctx.clip();

    const bg=ctx.createLinearGradient(0,0,l.w,0);
    bg.addColorStop(0,'rgba(18,24,34,.18)');
    bg.addColorStop(.50,C.bg);
    bg.addColorStop(1,'rgba(18,24,34,.50)');
    ctx.fillStyle=bg;ctx.fillRect(0,0,l.w,l.h);

    // A subtle left fade, so the board feels cropped into the world instead of a full panel.
    const fade=ctx.createLinearGradient(0,0,l.w*.65,0);
    fade.addColorStop(0,'rgba(255,255,255,.00)');
    fade.addColorStop(1,'rgba(255,255,255,.035)');
    ctx.fillStyle=fade;ctx.fillRect(0,0,l.w,l.h);

    const len=Math.max(1,Number(state.planLengthColumns)||1);
    const ex=exactCol(state);
    const base=Math.floor(ex);
    const frac=ex-base;
    const cellsByCol=rebuildCells(state);
    const back=Math.ceil((l.playheadX-l.boardLeft)/l.colPitch)+2;
    const forward=Math.ceil((l.boardRight-l.playheadX)/l.colPitch)+2;

    // Full planner-style rounded ghost cells.
    for(let offset=-back;offset<=forward;offset++){
      const x=l.playheadX+(offset-frac)*l.colPitch;
      if(x<-l.cellW||x>l.w+l.cellW)continue;
      for(let lane=0;lane<visibleLaneCount;lane++){
        const y=laneY(l,lane);
        const hot=Math.abs(offset)<.02;
        ctx.fillStyle=hot?C.cellHot:C.cell;
        roundedRect(ctx,x,y,l.cellW,l.cellH,Math.max(2,l.cellH*.28));ctx.fill();
        ctx.strokeStyle=C.cellStroke;ctx.lineWidth=.55;
        roundedRect(ctx,x+.25,y+.25,l.cellW-.5,l.cellH-.5,Math.max(2,l.cellH*.25));ctx.stroke();
      }
    }

    // Band dividers, matching the planner's 3-row character group idea.
    ctx.strokeStyle=C.sep;ctx.lineWidth=1;
    for(let band=1;band<l.centers.length;band++){
      const y=(laneY(l,band*3-1)+laneY(l,band*3))/2+l.cellH/2;
      ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(l.w,y);ctx.stroke();
    }

    // The playhead stays fixed; board cells scroll beneath it.
    ctx.fillStyle=C.playheadGlow;roundedRect(ctx,l.playheadX-1.5,boardTop,3,boardH,1.5);ctx.fill();
    ctx.strokeStyle=C.playhead;ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(l.playheadX,boardTop+2);ctx.lineTo(l.playheadX,boardTop+boardH-2);ctx.stroke();

    // Actual tetromino cells from the captured plan. Draw wrapped copies so loop seams are visible.
    for(let offset=-back;offset<=forward;offset++){
      const col=mod(base+offset,len);
      const x=l.playheadX+(offset-frac)*l.colPitch;
      if(x<-l.cellW||x>l.w+l.cellW)continue;
      for(const cell of cellsByCol[col]||[]){
        const y=laneY(l,cell.lane);
        const pad=Math.max(.7,l.cellW*.08);
        ctx.fillStyle=gradientFor(cell.kind,x,y,l.cellW,l.cellH);
        roundedRect(ctx,x+pad,y+pad,l.cellW-pad*2,l.cellH-pad*2,Math.max(2,l.cellH*.24));ctx.fill();
        ctx.strokeStyle='rgba(255,255,220,.45)';ctx.lineWidth=.55;
        roundedRect(ctx,x+pad+.25,y+pad+.25,l.cellW-pad*2-.5,l.cellH-pad*2-.5,Math.max(2,l.cellH*.20));ctx.stroke();
        if(l.cellW>=7){
          ctx.fillStyle=C.icon;
          ctx.font='900 '+Math.max(5,Math.floor(l.cellH*.70))+'px system-ui,sans-serif';
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(iconFor(cell),x+l.cellW/2,y+l.cellH/2+.15);
        }
      }
    }

    // Canvas overlay only: ammo pips sit beside the current moving mini-grid and
    // read live Pass 6 crew ammo. The grid itself is not resized or restyled.
    drawAmmoIndicators(l);
    ctx.restore();
  }
  function tick(){
    try{drawMiniBoard();}
    catch(err){try{console.warn('Pass 10.9 mini planner board crop failed',err);hud.style.display='none';}catch(_){ }}
    requestAnimationFrame(tick);
  }
  window.addEventListener('resize',()=>computeLayout(true),{passive:true});
  window.__wizardMiniTetrisTimelineHud={draw:drawMiniBoard,layout:()=>computeLayout(true),ammoSnapshot,element:hud,canvas,version:'pass10.54-single-source-ammo-debug'};
  requestAnimationFrame(tick);
})();
