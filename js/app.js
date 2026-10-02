(function(){
  'use strict';
  const core=window.MinimumWageCheckerCore;
  const state={masters:null,minimumWage:null,wageByCode:null,rows:[],headers:[],results:[],encoding:'',fileName:'',page:1,pageSize:100};
  const $=id=>document.getElementById(id);
  const els={
    csvFile:$('csvFile'),analysisDate:$('analysisDate'),fileName:$('fileName'),fileMeta:$('fileMeta'),errorBox:$('errorBox'),resultSection:$('resultSection'),
    resultBody:$('resultBody'),filterStatus:$('filterStatus'),filterPublication:$('filterPublication'),filterPrefecture:$('filterPrefecture'),filterSearch:$('filterSearch'),
    prevPage:$('prevPage'),nextPage:$('nextPage'),pageInfo:$('pageInfo'),resultCaption:$('resultCaption'),downloadExcel:$('downloadExcel'),downloadCsv:$('downloadCsv'),downloadAttentionCsv:$('downloadAttentionCsv')
  };

  function todayLocal(){ const d=new Date(), p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
  els.analysisDate.value=todayLocal();

  function showError(msg){ els.errorBox.textContent=msg; els.errorBox.hidden=false; }
  function clearError(){ els.errorBox.hidden=true; els.errorBox.textContent=''; }
  function esc(v){ return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

  async function loadData(){
    const [masters,minimumWage]=await Promise.all([fetch('data/masters.json').then(r=>r.json()),fetch('data/minimum-wage.json').then(r=>r.json())]);
    state.masters=masters; state.minimumWage=minimumWage; state.wageByCode=core.buildLookup(minimumWage.records);
  }

  function decodeCsv(buffer){
    const bytes=new Uint8Array(buffer);
    if(bytes[0]===0xEF&&bytes[1]===0xBB&&bytes[2]===0xBF) return {text:new TextDecoder('utf-8').decode(bytes),encoding:'UTF-8 BOM'};
    try { return {text:new TextDecoder('utf-8',{fatal:true}).decode(bytes),encoding:'UTF-8'}; }
    catch(e){ return {text:new TextDecoder('shift_jis').decode(bytes),encoding:'CP932 / Shift_JIS'}; }
  }

  function parseCsv(text){
    const parsed=Papa.parse(text,{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.replace(/^\uFEFF/,'').trim()});
    const serious=(parsed.errors||[]).filter(e=>e.type!=='FieldMismatch');
    if(serious.length) throw new Error(`CSVè§£æžã‚¨ãƒ©ãƒ¼: ${serious[0].message}`);
    return {rows:parsed.data,headers:(parsed.meta.fields||[])};
  }

  function analyzeAll(){
    if(!state.rows.length) return;
    clearError();
    const missing=core.validateColumns(state.headers);
    if(missing.length){ showError(`å¿…è¦åˆ—ãŒä¸è¶³ã—ã¦ã„ã¾ã™: ${missing.join('ã€')}`); els.resultSection.hidden=true; return; }
    const analysisDate=els.analysisDate.value;
    state.results=state.rows.map((row,index)=>({row,index,result:core.analyzeRow(row,{masters:state.masters,wageByCode:state.wageByCode,analysisDate})}));
    state.page=1;
    updateSummary(); updateFilterOptions(); renderTable(); els.resultSection.hidden=false;
  }

  function updateSummary(){
    const results=state.results.map(x=>x.result);
    $('countTotal').textContent=results.length.toLocaleString('ja-JP');
    $('countUrgent').textContent=results.filter(r=>r.urgency==='ç·Šæ€¥').length.toLocaleString('ja-JP');
    $('countUpcoming').textContent=results.filter(r=>r.urgency==='æ”¹å®šå‰è¦å¯¾å¿œ').length.toLocaleString('ja-JP');
    $('countReview').textContent=results.filter(r=>r.overall==='è¦ç¢ºèª').length.toLocaleString('ja-JP');
    $('countOk').textContent=results.filter(r=>r.overall==='OK').length.toLocaleString('ja-JP');
    $('countExcluded').textContent=results.filter(r=>r.overall==='å¯¾è±¡å¤–').length.toLocaleString('ja-JP');
  }

  function fillSelect(el,values){
    const current=el.value;
    const first=el.options[0].outerHTML;
    el.innerHTML=first+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if([...el.options].some(o=>o.value===current)) el.value=current;
  }
  function updateFilterOptions(){
    fillSelect(els.filterPublication,[...new Set(state.results.map(x=>x.result.publication).filter(Boolean))].sort());
    fillSelect(els.filterPrefecture,[...new Set(state.results.map(x=>x.result.prefecture).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja')));
  }

  function filteredItems(){
    const status=els.filterStatus.value,pub=els.filterPublication.value,pref=els.filterPrefecture.value,q=els.filterSearch.value.trim().toLowerCase();
    return state.results.filter(item=>{
      const r=item.result,row=item.row;
      if(status==='attention' && !['æœ€ä½Žè³ƒé‡‘å‰²ã‚Œ','è¦ç¢ºèª'].includes(r.overall)) return false;
      if(status==='ng' && r.overall!=='æœ€ä½Žè³ƒé‡‘å‰²ã‚Œ') return false;
      if(status==='review' && r.overall!=='è¦ç¢ºèª') return false;
      if(status==='ok' && r.overall!=='OK') return false;
      if(status==='excluded' && r.overall!=='å¯¾è±¡å¤–') return false;
      if(pub!=='all' && r.publication!==pub) return false;
      if(pref!=='all' && r.prefecture!==pref) return false;
      if(q){ const hay=`${r.jobId} ${row['ä»•äº‹å']||''}`.toLowerCase(); if(!hay.includes(q)) return false; }
      return true;
    }).sort((a,b)=>priority(a.result)-priority(b.result)||a.index-b.index);
  }

  function priority(r){ const order={'ç·Šæ€¥':0,'æ”¹å®šå‰è¦å¯¾å¿œ':1,'è¦ç¢ºèªãƒ»å…¬é–‹ä¸­':2,'è¦ç¢ºèªãƒ»å…¬é–‹çŠ¶æ…‹ä¸æ˜Ž':3,'å…¬é–‹å‰è¦ä¿®æ­£':4,'å…¬é–‹å‰ç¢ºèª':5,'è¦ç¢ºèªãƒ»éžå…¬é–‹':6,'ï¼':7}; return order[r.urgency]??8; }
  function badgeClass(text){
    if(text==='NG'||text==='æœ€ä½Žè³ƒé‡‘å‰²ã‚Œ') return 'badge-ng'; if(text==='OK') return 'badge-ok'; if(text==='è¦ç¢ºèª') return 'badge-review'; if(text==='å¯¾è±¡ãªã—'||text==='å¯¾è±¡å¤–'||text==='ï¼') return 'badge-na';
    if(text==='ç·Šæ€¥') return 'badge-urgent'; if(text==='æ”¹å®šå‰è¦å¯¾å¿œ') return 'badge-upcoming'; if(text.startsWith('å…¬é–‹å‰')) return 'badge-prepublish'; if(text.startsWith('è¦ç¢ºèª')) return 'badge-review'; return 'badge-unknown';
  }
  function badge(text){ return `<span class="badge ${badgeClass(text)}">${esc(text)}</span>`; }
  function axisCell(a){ return `<td class="axis-cell">${badge(a.status)}<span class="axis-message" title="${esc(a.message)}">${esc(a.message)}</span></td>`; }

  function renderTable(){
    const items=filteredItems(),pages=Math.max(1,Math.ceil(items.length/state.pageSize)); if(state.page>pages) state.page=pages;
    const start=(state.page-1)*state.pageSize,pageItems=items.slice(start,start+state.pageSize);
    els.resultBody.innerHTML=pageItems.map(({row,result:r})=>`<tr>
      <td class="nowrap">${badge(r.urgency)}</td><td class="nowrap">${badge(r.overall)}</td><td class="nowrap">${esc(r.jobId)}</td>
      <td class="jobname">${esc(row['ä»•äº‹å']||'')}</td><td class="nowrap">${esc(r.publication)}</td><td class="nowrap">${esc(r.prefecture)}</td><td class="nowrap">${r.minimumWage?esc(Number(r.minimumWage).toLocaleString('ja-JP')+'å††'):'ï¼'}</td>
      ${axisCell(r.regular)}${axisCell(r.fixedOvertime)}${axisCell(r.trialRegular)}${axisCell(r.trialFixedOvertime)}
    </tr>`).join('');
    els.pageInfo.textContent=`${state.page} / ${pages}ï¼ˆ${items.length.toLocaleString('ja-JP')}ä»¶ï¼‰`;
    els.prevPage.disabled=state.page<=1; els.nextPage.disabled=state.page>=pages;
    els.resultCaption.textContent=`${items.length.toLocaleString('ja-JP')}ä»¶ã‚’è¡¨ç¤ºå¯¾è±¡ã«ã—ã¦ã„ã¾ã™ã€‚1ãƒšãƒ¼ã‚¸${state.pageSize}ä»¶ã€‚`;
  }

  function leftHeaders(){ return ['ç·Šæ€¥åº¦','ç·åˆåˆ¤å®š','æ±‚äººç®¡ç†ç•ªå·','å…¬é–‹çŠ¶æ…‹','é›‡ç”¨å½¢æ…‹','éƒ½å“åºœçœŒ','æœ€ä½Žè³ƒé‡‘','æ”¹å®šæ—¥','é€šå¸¸è³ƒé‡‘åˆ¤å®š','å›ºå®šæ®‹æ¥­åˆ¤å®š','è©¦ç”¨è³ƒé‡‘åˆ¤å®š','è©¦ç”¨å›ºå®šæ®‹æ¥­åˆ¤å®š','åŽšåŠ´çœURL']; }
  function leftValues(r){ return [r.urgency,r.overall,re.jobId,re.publication,re.employment,re.prefecture,re.minimumWage,re.effectiveDate,r.regular.message,re.fixedOvertime.message,re.trialRegular.message,re.trialFixedOvertime.message,re.sourceUrl]; }
  function originalHeadersForExport(){
    const set=new Set(leftHeaders()); return state.headers.filter(h=>!set.has(h));
  }
  function exportMatrix(items){
    const left=leftHeaders(),original=originalHeadersForExport();

    return {headers:[...left,...original],rows:items.map(({row,result:r})=>[...leftValues(r),...original.map(h=>row[h]??'')])};
  }
  function csvEscape(v){ const x=String(v??''); return /[",\r\n]/.test(x)?`"${x.replace(/"/g,'""')}"`:x; }
  function makeCsvText(matrix){ return [matrix.headers,...matrix.rows].map(r=>r.map(csvEscape).join(',')).•©½¥¸ qÉq¸œ¤ìô(€™Õ¹Ñ¥½¸‘½Ý¹±½…‘	±½ˆ¡‰±½ˆ±¹…µ”¥ì½¹ÍÐÕÉ°õUI0¹É•…Ñ•=‰©•ÑUI0¡‰±½ˆ¤±„õ‘½Õµ•¹Ð¹É•…Ñ•±•µ•¹Ð „œ¤ì„¹¡É•˜õÕÉ°í„¹‘½Ý¹±½…õ¹…µ”í‘½Õµ•¹Ð¹‰½‘ä¹…ÁÁ•¹‘¡¥±¡„¤í„¹±¥¬ ¤í„¹É•µ½Ù” ¤íÍ•ÑQ¥µ•½ÕÐ  ¤ôùUI0¹É•Ù½­•=‰©•ÑUI0¡ÕÉ°¤°ÄÀÀÀ¤ìô(€™Õ¹Ñ¥½¸‰…Í•9…µ” ¥ìÉ•ÑÕÉ¸€¡ÍÑ…Ñ”¹™¥±•9…µ•ñðÉ•ÍÕ±Ðœ¤¹É•Á±…” ½p¹ÍØ½¤°œœ¤¹É•Á±…” ½mqp¼è¨üˆðùñt½œ°|œ¤ìô(€™Õ¹Ñ¥½¸‘…Ñ•MÑ…µÀ ¥ìÉ•ÑÕÉ¸€¡•±Ì¹…¹…±åÍ¥Í…Ñ”¹Ù…±Õ•ññÑ½‘…å1½…° ¤¤¹É•Á±…” ¼´½œ°œœ¤ìô(€™Õ¹Ñ¥½¸‘½Ý¹±½…‘ÍØ¡¥Ñ•µÌ±ÍÕ™™¥à¥ì(€€€½¹ÍÐÑ•áÐõµ…­•ÍÙQ•áÐ¡•áÁ½ÉÑ5…ÑÉ¥à¡¥Ñ•µÌ¤¤ì(€€€½¹ÍÐÕ¹¥½‘”õ¹½‘¥¹œ¹ÍÑÉ¥¹Q½½‘”¡Ñ•áÐ¤±Í©¥Ìõ¹½‘¥¹œ¹½¹Ù•ÉÐ¡Õ¹¥½‘”±íÑ¼èM)%Lœ±™É½´èU9%=ô¤±‰åÑ•Ìõ¹•ÜU¥¹ÐáÉÉ…ä¡Í©¥Ì¤ì(€€€‘½Ý¹±½…‘	±½ˆ¡¹•Ü	±½ˆ¡m‰åÑ•Ít±íÑåÁ”èÑ•áÐ½ÍØí¡…ÉÍ•ÐõÍ¡¥™Ñ}©¥Ìô¤±€‘í‰…Í•9…µ” ¥õšr’ö;¢Î¦G–"“–ºi|‘í‘…Ñ•MÑ…µÀ ¥ô‘íÍÕ™™¥áñðœô¹ÍÙ€¤ì(€ô((€™Õ¹Ñ¥½¸‘•Ñ…¥±Y…±Õ”¡„±­•ä¥ì½¹ÍÐØõ„˜™…m­•åtìÉ•ÑÕÉ¸ÑåÁ•½˜Øôôô¹Õµ‰•Èœ˜™9Õµ‰•È¹¥Í¥¹¥Ñ”¡Ø¤ýØé¹Õ±°ìô(€…Íå¹Œ™Õ¹Ñ¥½¸‘½Ý¹±½…‘á•° ¥ì(€€€½¹ÍÐÝˆõ¹•Üá•±)L¹]½É­‰½½¬ ¤ìÝˆ¹É•…Ñ½Èôµ¥¹¥µÕ´µÝ…”µ¡•­•ÈœìÝˆ¹É•…Ñ•õ¹•Ü…Ñ” ¤ì(€€€½¹ÍÐÍÕµµ…ÉäõÝˆ¹…‘‘]½É­Í¡••Ð ŸŽ
×Ž{Ž«ŽrÌœ±íÙ¥•ÝÌémíÍÑ…Ñ”è™É½é•¸œ±åMÁ±¥ÐèÅõuô¤ì(€€€ÍÕµµ…Éä¹½±Õµ¹ÌõmíÝ¥‘Ñ èÈÑô±íÝ¥‘Ñ èÄÙõtìÍÕµµ…Éä¹…‘‘I½Ü¡lŸ¦‚žn°œ°Ÿ’îÛšVÀt¤ì½¹ÍÐÙ…±Ìõml–£šÆ’êëœœ±ÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹±•¹Ñ¡t±lŸšr’ö;¢Î¦G–&ËŽ
0œ±ÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹™¥±Ñ•È¡àôùà¹É•ÍÕ±Ð¹½Ù•É…±°ôôôŸšr’ö;¢Î¦G–&ËŽ
0œ¤¹±•¹Ñ¡t±lŸžÞ+’Tœ±ÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹™¥±Ñ•È¡àôùà¹É•ÍÕ±Ð¹ÕÉ•¹äôôôŸžÞ+š”œ¤¹±•¹Ñ¡t±lŸšRç–ºk–&7¢š–¾û–þpœ±ÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹™¥±Ñ•È¡àôùà¹É•ÍÕ±Ð¹ÕÉ•¹äôôôŸšRç–ºk–&7¢š–¾û–þpœ¤¹±•¹Ñ¡t±lŸ¢šžŠë¢ª4œ±ÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹™¥±Ñ•È¡àôùà¹É•ÍÕ±Ð¹½Ù•É…±°ôôôŸ¢šžŠë¢ª4œ¤¹±•¹Ñ¡t±l=,œ±ÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹™¥±Ñ•È¡àôùà¹É•ÍÕ±Ð¹½Ù•É…±°ôôô=,œ¤¹±•¹Ñ¡t±lŸ–¾û¢Æ‡–’X(ÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹™¥±Ñ•È¡àôùà¹É•ÍÕ±Ð¹½Ù•É…±°ôôôŸ–¾û¢Æ‡–’Xœ¤¹±•¹Ñ¡utì(€€€Ù…±Ì¹™½É… ¡ØôùÍÕµµ…Éä¹…‘‘I½Ü¡Ø¤¤ìÍÑå±•!•…‘•È¡ÍÕµµ…Éä¹•ÑI½Ü Ä¤¤ì(€€€ÍÕµµ…Éä¹…‘‘I½Ü¡mt¤ìÍÕµµ…Éä¹…‘‘I½Ü¡l¦÷¦O–êsžr3Œœ°Ÿšr’ö;¢Î¦G–&ËŽ
3’îÛšVÀt¤ìÍÑå±•!•…‘•È¡ÍÕµµ…Éä¹•ÑI½Ü¡ÍÕµµ…Éä¹É½Ý½Õ¹Ð¤¤ì(€€€½¹ÍÐ‰åAÉ•˜õíôìÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹™¥±Ñ•È¡àôùà¹É•ÍÕ±Ð¹½Ù•É…±°ôôôŸšr’ö;¢Î¦G–&ËŽ
0œ¤¹™½É… ¡àôù‰åAÉ•™mà¹É•ÍÕ±Ð¹ÁÉ•™•ÑÕÉ•tô¡‰åAÉ•™mà¹É•ÍÕ±Ð¹ÁÉ•™•ÑÕÉ•uñðÀ¤¬Ä¤ì(€€€=‰©•Ð¹•¹ÑÉ¥•Ì¡‰åAÉ•˜¤¹Í½ÉÐ ¡„±ˆ¤ôù‰lÅtµ…lÅuññ…lÁt¹±½…±•½µÁ…É”¡‰lÁt°©„œ¤¤¹™½É… ¡ØôùÍÕµµ…Éä¹…‘‘I½Ü¡Ø¤¤ì((€€€½¹ÍÐÝÌõÝˆ¹…‘‘]½É­Í¡••Ð Ÿ–"“–ºkžÖCšzpœ±íÙ¥•ÝÌémíÍÑ…Ñ”è™É½é•¸œ±áMÁ±¥ÐèÌ±åMÁ±¥ÐèÅõuô¤ì(€€€½¹ÍÐ‘•Ñ…¥±!•…‘•ÉÌõlŸ¦k–âãšf¦ZO¦†4£¢úóŽÿšÏ–ºhŠœ°Ÿ¦k–âãš¶“–ê_Ž#–2[žV«ŽG–öO’âxœ°Ÿ¦k–âã–ÚÇ¦†4£–:ÏŽ_Ž
¤œ°Ÿ–në–ºkšº/š–·šf¦ZO–6c’ú„œ°Ÿ–në–ºkšº/š–·–þ¢š–6c’ú„£¦®cŽšZä¤œ°Ÿ–në–ºkšº/š–·–Þ»¦†4£–:ÏŽ_Ž
¤œ°Ÿ¢¦›žR£šf¦ZO¦†4£¢úóŽÿšÏ–ºh¤œ°Ÿ¢¦›žR£šf¦ZO¦†4£–"—¦SšÏ–ºh¤œ°Ÿ¢¦›žR£–Þ»¦†4£–:ÏŽ_Ž
¤œ°Ÿ¢¦›žR£–në–ºkšº/š–·šf¦ZO–6c’ú„œ°Ÿ¢¦›žR£–në–ºkšº/š–·–þ¢š–6c’ú„£¦®cŽšZä¤œ°Ÿ¢¦›žR£–në–ºkšº/š–·–Þ»¦†4£–:ÏŽ_Ž
¤tì(€€€½¹ÍÐ¡•…‘•ÉÌõl¸¸¹±•™Ñ!•…‘•ÉÌ ¤°¸¸¹‘•Ñ…¥±!•…‘•ÉÌ°¸¸¹½É¥¥¹…±!•…‘•ÉÍ½ÉáÁ½ÉÐ ¥tìÝÌ¹…‘‘I½Ü¡¡•…‘•ÉÌ¤ìÍÑå±•!•…‘•È¡ÝÌ¹•ÑI½Ü Ä¤¤ìÝÌ¹…ÕÑ½¥±Ñ•Èõí™É½´éíÉ½ÜèÄ±½±Õµ¸èÅô±Ñ¼éíÉ½ÜèÄ±½±Õµ¸é¡•…‘•ÉÌ¹±•¹Ñ¡õôì(€€€ÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹Í½ÉÐ ¡„±ˆ¤ôùÁÉ¥½É¥Ñä¡„¹É•ÍÕ±Ð¤µÁÉ¥½É¥Ñä¡ˆ¹É•ÍÕ±Ð¥ññ„¹¥¹‘•àµˆ¹¥¹‘•à¤¹™½É…  ¡íÉ½Ü±É•ÍÕ±ÐéÉô¤ôùì(€€€€€½¹ÍÐ‘•Ñ…¥±Ìõm‘•Ñ…¥±Y…±Õ”¡È¹É•Õ±…È°¥¹±Õ‘•‘!½ÕÉ±äœ¤±‘•Ñ…¥±Y…±Õ”¡È¹É•Õ±…È°Í•Á…É…Ñ•!½ÕÉ±äœ¤±‘•Ñ…¥±Y…±Õ”¡È¹É•Õ±…È°‘¥™˜œ¤±‘•Ñ…¥±Y…±Õ”¡È¹™¥á•‘=Ù•ÉÑ¥µ”°™¥á•‘=Ù•ÉÑ¥µ•!½ÕÉ±äœ¤±‘•Ñ…¥±Y…±Õ”¡È¹™¥á•‘=Ù•ÉÑ¥µ”°É•ÅÕ¥É•‘=Ù•ÉÑ¥µ•!½ÕÉ±å5…àœ¤±‘•Ñ…¥±Y…±Õ”¡È¹™¥á•‘=Ù•ÉÑ¥µ”°™¥á•‘=Ù•ÉÑ¥µ•¥™˜œ¤±‘•Ñ…¥±Y…±Õ”¡È¹ÑÉ¥…±I•Õ±…È°¥¹±Õ‘•‘!½ÕÉ±äœ¤±‘•Ñ…¥±Y…±Õ”¡È¹ÑÉ¥…±I•Õ±…È°Í•Á…É…Ñ•!½ÕÉ±äœ¤±‘•Ñ…¥±Y…±Õ”¡È¹ÑÉ¥…±I•Õ±…È°‘¥™˜œ¤±‘•Ñ…¥±Y…±Õ”¡È¹ÑÉ¥…±¥á•‘=Ù•ÉÑ¥µ”°™¥á•‘=Ù•ÉÑ¥µ•!½ÕÉ±äœ¤±‘•Ñ…¥±Y…±Õ”¡È¹ÑÉ¥…±¥á•‘=Ù•ÉÑ¥µ”°É•ÅÕ¥É•‘=Ù•ÉÑ¥µ•!½ÕÉ±å5…àœ¤±‘•Ñ…¥±Y…±Õ”¡È¹ÑÉ¥…±¥á•‘=Ù•ÉÑ¥µ”°™¥á•‘=Ù•ÉÑ¥µ•¥™˜œ¥tì(€€€€€½¹ÍÐ•á•±I½ÜõÝÌ¹…‘‘I½Ü¡l¸¸¹±•™ÑY…±Õ•Ì¡È¤°¸¸¹‘•Ñ…¥±Ì°¸¸¹½É¥¥¹…±!•…‘•ÉÍ½ÉáÁ½ÉÐ ¤¹µ…À¡ ôùÉ½Ým¡tüüœœ¥t¤ì(€€€€€½±½ÉI•ÍÕ±ÑI½Ü¡•á•±I½Ü±È¤ì™½È¡±•ÐŒôÄÐíŒðôÈÔíŒ¬¬¤•á•±I½Ü¹•Ñ•±°¡Œ¤¹¹ÕµµÐôœŒ°ŒŒÀ¸Àœì(€€€€€¥˜¡È¹Í½ÕÉ•UÉ°¥ì½¹ÍÐ•±°õ•á•±I½Ü¹•Ñ•±° ÄÌ¤ì•±°¹Ù…±Õ”õíÑ•áÐèŸ–:k–*ÓžrŽkŽóŽ
àœ±¡åÁ•É±¥¹¬éÈ¹Í½ÕÉ•UÉ±ôì•±°¹™½¹Ðõí½±½Èéí…ÉˆèÄÜÕÌô±Õ¹‘•É±¥¹”éÑÉÕ•ôìô(€€€ô¤ì(€€€ÝÌ¹½±Õµ¹Ì¹™½É…  ¡½°±¤¤ôùì½°¹Ý¥‘Ñ õ¤ðÄÌýlÄÐ°ÄÐ°ÄÐ°ÄÐ°ÄÐ°ÄÈ°ÄÄ°ÄÈ°ÌÐ°ÌÐ°ÌÐ°ÌÐ°Äáum¥uñðÄÔè¡¤ðÈÔüÄàèÄØ¤ìô¤ì(€€€là°ä°ÄÀ°ÄÅt¹™½É… ¡ŒôùÝÌ¹•Ñ½±Õµ¸¡Œ¤¹…±¥¹µ•¹ÐõíÝÉ…ÁQ•áÐéÑÉÕ”±Ù•ÉÑ¥…°èÑ½Àô¤ì((€€€½¹ÍÐµÜõÝˆ¹…‘‘]½É­Í¡••Ð Ÿšr’ö;¢Î¦GŽ{Ž
çŽ
üœ±íÙ¥•ÝÌémíÍÑ…Ñ”è™É½é•¸œ±åMÁ±¥ÐèÅõuô¤ì(€€€µÜ¹…‘‘I½Ü¡lŸ¦÷¦O–êsžr3Ž
ÏŽóŽ$œ°Ÿ¦÷¦O–êsžr0œ°Ÿš^Ÿžfë–*çš^”œ°Ÿš^Ÿšr’ö;¢Î¦Dœ°ŸšZÃžfë–*çš^”œ°ŸšZÃšr’ö;¢Î¦Dœ°Ÿ–:k–*ÓžrUI0t¤ìÍÑå±•!•…‘•È¡µÜ¹•ÑI½Ü Ä¤¤ì(€€€ÍÑ…Ñ”¹µ¥¹¥µÕµ]…”¹É•½É‘Ì¹™½É… ¡É•Œôùì½¹ÍÐÉÈõµÜ¹…‘‘I½Ü¡mÉ•Œ¹½‘”±É•Œ¹ÁÉ•™•ÑÕÉ”±É•Œ¹½±‘™™•Ñ¥Ù•…Ñ”±É•Œ¹½±‘]…”±É•Œ¹¹•Ý™™•Ñ¥Ù•…Ñ”±É•Œ¹¹•Ý]…”°Ÿ–:k–*ÓžrŽkŽóŽ
àt¤ìÉÈ¹•Ñ•±° Ü¤¹Ù…±Õ”õíÑ•áÐèŸ–:k–*ÓžrŽkŽóŽ
àœ±¡åÁ•É±¥¹¬éÉ•Œ¹Í½ÕÉ•UÉ±ôìÉÈ¹•Ñ•±° Ü¤¹™½¹Ðõí½±½Èéí…ÉˆèÄÜÕÌô±Õ¹‘•É±¥¹”éÑÉÕ•ôìô¤ì(€€€µÜ¹½±Õµ¹ÌõmíÝ¥‘Ñ èÄÙô±íÝ¥‘Ñ èÄÑô±íÝ¥‘Ñ èÄÑô±íÝ¥‘Ñ èÄÑô±íÝ¥‘Ñ èÄÑô±íÝ¥‘Ñ èÄÑô±íÝ¥‘Ñ èÈÉõtìµÜ¹…ÕÑ½¥±Ñ•Èõí™É½´èÄœ±Ñ¼é‘íµÜ¹É½Ý½Õ¹Ñõôì(€€€½¹ÍÐ‰Õ˜õ…Ý…¥ÐÝˆ¹á±Íà¹ÝÉ¥Ñ•	Õ™™•È ¤ì‘½Ý¹±½…‘	±½ˆ¡¹•Ü	±½ˆ¡m‰Õ™t±íÑåÁ”è…ÁÁ±¥…Ñ¥½¸½Ù¹¹½Á•¹áµ±™½Éµ…ÑÌµ½™™¥•‘½Õµ•¹Ð¹ÍÁÉ•…‘Í¡••Ñµ°¹Í¡••Ðô¤±€‘í‰…Í•9…µ” ¥õšr’ö;¢Î¦G–"“–ºi|‘í‘…Ñ•MÑ…µÀ ¥ô¹á±Íá€¤ì(€ô(€™Õ¹Ñ¥½¸ÍÑå±•!•…‘•È¡É½Ü¥ìÉ½Ü¹™½¹Ðõí‰½±éÑÉÕ”±½±½Èéí…ÉˆèõôìÉ½Ü¹™¥±°õíÑåÁ”èÁ…ÑÑ•É¸œ±Á…ÑÑ•É¸èÍ½±¥œ±™½±½Èéí…ÉˆèÌÐÐÀÔÐõôìÉ½Ü¹…±¥¹µ•¹ÐõíÙ•ÉÑ¥…°èµ¥‘‘±”ôìô(€™Õ¹Ñ¥½¸½±½ÉI•ÍÕ±ÑI½Ü¡É½Ü±È¥ì(€€€½¹ÍÐ™¥±°õÈ¹½Ù•É…±°ôôôŸšr’ö;¢Î¦G–&ËŽ
0œüÑÈœéÈ¹½Ù•É…±°ôôôŸ¢šžŠë¢ª4œüÑ	œéÈ¹½Ù•É…±°ôôô=,œüÌœèÉÑÜœì(€€€lÄ°Ét¹™½É… ¡ŒôùÉ½Ü¹•Ñ•±°¡Œ¤¹™¥±°õíÑåÁ”èÁ…ÑÑ•É¸œ±Á…ÑÑ•É¸èÍ½±¥œ±™½±½Èéí…Éˆé™¥±±õô¤ì(€ô((€•±Ì¹ÍÙ¥±”¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¡…¹”œ±…Íå¹Œ”ôùì(€€€±•…ÉÉÉ½È ¤ì½¹ÍÐ™¥±”õ”¹Ñ…É•Ð¹™¥±•Ì˜™”¹Ñ…É•Ð¹™¥±•ÍlÁtì¥˜ …™¥±”¥É•ÑÕÉ¸ì(€€€ÑÉåì(€€€€€¥˜ …ÍÑ…Ñ”¹µ…ÍÑ•ÉÌ¤…Ý…¥Ð±½…‘…Ñ„ ¤ì½¹ÍÐ‘•½‘•õ‘•½‘•ÍØ¡…Ý…¥Ð™¥±”¹…ÉÉ…å	Õ™™•È ¤¤±Á…ÉÍ•õÁ…ÉÍ•ÍØ¡‘•½‘•¹Ñ•áÐ¤ì(€€€€€ÍÑ…Ñ”¹É½ÝÌõÁ…ÉÍ•¹É½ÝÌìÍÑ…Ñ”¹¡•…‘•ÉÌõÁ…ÉÍ•¹¡•…‘•ÉÌìÍÑ…Ñ”¹•¹½‘¥¹œõ‘•½‘•¹•¹½‘¥¹œìÍÑ…Ñ”¹™¥±•9…µ”õ™¥±”¹¹…µ”ì•±Ì¹™¥±•9…µ”¹Ñ•áÑ½¹Ñ•¹Ðõ™¥±”¹¹…µ”ì(€€€€€•±Ì¹™¥±•5•Ñ„¹¡¥‘‘•¸õ™…±Í”ì•±Ì¹™¥±•5•Ñ„¹Ñ•áÑ½¹Ñ•¹Ðõ€‘í™¥±”¹¹…µ•÷¾ösšZ–¶_Ž
ÏŽóŽ$è€‘í‘•½‘•¹•¹½‘¥¹÷¾öp‘íÍÑ…Ñ”¹É½ÝÌ¹±•¹Ñ ¹Ñ½1½…±•MÑÉ¥¹œ ©„µ)@œ¥÷’îÛ¾öp‘íÍÑ…Ñ”¹¡•…‘•ÉÌ¹±•¹Ñ¡÷–"]€ì(€€€€€…¹…±åé•±° ¤ì(€€€õ…Ñ ¡•ÉÈ¥ì½¹Í½±”¹•ÉÉ½È¡•ÉÈ¤ìÍ¡½ÝÉÉ½È¡•ÉÈ¹µ•ÍÍ…•ññMÑÉ¥¹œ¡•ÉÈ¤¤ì•±Ì¹É•ÍÕ±ÑM•Ñ¥½¸¹¡¥‘‘•¸õÑÉÕ”ìô(€ô¤ì(€•±Ì¹…¹…±åÍ¥Í…Ñ”¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¡…¹”œ±…¹…±åé•±°¤ì(€m•±Ì¹™¥±Ñ•ÉMÑ…ÑÕÌ±•±Ì¹™¥±Ñ•ÉAÕ‰±¥…Ñ¥½¸±•±Ì¹™¥±Ñ•ÉAÉ•™•ÑÕÉ•t¹™½É… ¡•°ôù•°¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¡…¹”œ° ¤ôùíÍÑ…Ñ”¹Á…”ôÄíÉ•¹‘•ÉQ…‰±” ¤íô¤¤ì(€•±Ì¹™¥±Ñ•ÉM•…É ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ¥¹ÁÕÐœ° ¤ôùíÍÑ…Ñ”¹Á…”ôÄíÉ•¹‘•ÉQ…‰±” ¤íô¤ì(€•±Ì¹ÁÉ•ÙA…”¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ° ¤ôùí¥˜¡ÍÑ…Ñ”¹Á…”øÄ¥íÍÑ…Ñ”¹Á…”´´íÉ•¹‘•ÉQ…‰±” ¤íõô¤ì•±Ì¹¹•áÑA…”¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ° ¤ôùíÍÑ…Ñ”¹Á…”¬¬íÉ•¹‘•ÉQ…‰±” ¤íô¤ì(€•±Ì¹‘½Ý¹±½…‘ÍØ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ° ¤ôù‘½Ý¹±½…‘ÍØ¡ÍÑ…Ñ”¹É•ÍÕ±ÑÌ°œœ¤¤ì(€•±Ì¹‘½Ý¹±½…‘ÑÑ•¹Ñ¥½¹ÍØ¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ° ¤ôù‘½Ý¹±½…‘ÍØ¡ÍÑ…Ñ”¹É•ÍÕ±ÑÌ¹™¥±Ñ•È¡àôùlŸšr’ö;¢Î¦G–&ËŽ
0œ°Ÿ¢šžŠë¢ª4t¹¥¹±Õ‘•Ì¡à¹É•ÍÕ±Ð¹½Ù•É…±°¤¤°¢š–¾û–þsŽ»Žüœ¤¤ì(€•±Ì¹‘½Ý¹±½…‘á•°¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È ±¥¬œ° ¤ôù‘½Ý¹±½…‘á•° ¤¹…Ñ ¡•ÉÈôùí½¹Í½±”¹•ÉÉ½È¡•ÉÈ¤íÍ¡½ÝÉÉ½È¡á•³žRš"CŽ
£Ž§Žðè€‘í•ÉÈ¹µ•ÍÍ…•ññ•ÉÉõ€¤íô¤¤ì((€±½…‘…Ñ„ ¤¹…Ñ ¡•ÉÈôùÍ¡½ÝÉÉ½È¡ƒŽ{Ž
çŽ
ÿ¢ª·¢úóŽ
£Ž§Žðè€‘í•ÉÈ¹µ•ÍÍ…•ññ•ÉÉõ€¤¤ì)ô¤ ¤ì(