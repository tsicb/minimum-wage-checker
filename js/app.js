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
    if(serious.length) throw new Error(`CSV解析エラー: ${serious[0].message}`);
    return {rows:parsed.data,headers:(parsed.meta.fields||[])};
  }

  function analyzeAll(){
    if(!state.rows.length) return;
    clearError();
    const missing=core.validateColumns(state.headers);
    if(missing.length){ showError(`必要列が不足しています: ${missing.join('、')}`); els.resultSection.hidden=true; return; }
    const analysisDate=els.analysisDate.value;
    state.results=state.rows.map((row,index)=>({row,index,result:core.analyzeRow(row,{masters:state.masters,wageByCode:state.wageByCode,analysisDate})}));
    state.page=1;
    updateSummary(); updateFilterOptions(); renderTable(); els.resultSection.hidden=false;
  }

  function updateSummary(){
    const results=state.results.map(x=>x.result);
    $('countTotal').textContent=results.length.toLocaleString('ja-JP');
    $('countUrgent').textContent=results.filter(r=>r.urgency==='緊急').length.toLocaleString('ja-JP');
    $('countUpcoming').textContent=results.filter(r=>r.urgency==='改定前要対応').length.toLocaleString('ja-JP');
    $('countReview').textContent=results.filter(r=>r.overall==='要確認').length.toLocaleString('ja-JP');
    $('countOk').textContent=results.filter(r=>r.overall==='OK').length.toLocaleString('ja-JP');
    $('countExcluded').textContent=results.filter(r=>r.overall==='対象外').length.toLocaleString('ja-JP');
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
      if(status==='attention' && !['最低賃金割れ','要確認'].includes(r.overall)) return false;
      if(status==='ng' && r.overall!=='最低賃金割れ') return false;
      if(status==='review' && r.overall!=='要確認') return false;
      if(status==='ok' && r.overall!=='OK') return false;
      if(status==='excluded' && r.overall!=='対象外') return false;
      if(pub!=='all' && r.publication!==pub) return false;
      if(pref!=='all' && r.prefecture!==pref) return false;
      if(q){ const hay=`${r.jobId} ${row['仕事名']||''}`.toLowerCase(); if(!hay.includes(q)) return false; }
      return true;
    }).sort((a,b)=>priority(a.result)-priority(b.result)||a.index-b.index);
  }

  function priority(r){ const order={'緊急':0,'改定前要対応':1,'要確認・公開中':2,'要確認・公開状態不明':3,'公開前要修正':4,'公開前確認':5,'要確認・非公開':6,'－':7}; return order[r.urgency]??8; }
  function badgeClass(text){
    if(text==='NG'||text==='最低賃金割れ') return 'badge-ng'; if(text==='OK') return 'badge-ok'; if(text==='要確認') return 'badge-review'; if(text==='対象なし'||text==='対象外'||text==='－') return 'badge-na';
    if(text==='緊急') return 'badge-urgent'; if(text==='改定前要対応') return 'badge-upcoming'; if(text.startsWith('公開前')) return 'badge-prepublish'; if(text.startsWith('要確認')) return 'badge-review'; return 'badge-unknown';
  }
  function badge(text){ return `<span class="badge ${badgeClass(text)}">${esc(text)}</span>`; }
  function axisCell(a){ return `<td class="axis-cell">${badge(a.status)}<span class="axis-message" title="${esc(a.message)}">${esc(a.message)}</span></td>`; }

  function renderTable(){
    const items=filteredItems(),pages=Math.max(1,Math.ceil(items.length/state.pageSize)); if(state.page>pages) state.page=pages;
    const start=(state.page-1)*state.pageSize,pageItems=items.slice(start,start+state.pageSize);
    els.resultBody.innerHTML=pageItems.map(({row,result:r})=>`<tr>
      <td class="nowrap">${badge(r.urgency)}</td><td class="nowrap">${badge(r.overall)}</td><td class="nowrap">${esc(r.jobId)}</td>
      <td class="jobname">${esc(row['仕事名']||'')}</td><td class="nowrap">${esc(r.publication)}</td><td class="nowrap">${esc(r.prefecture)}</td><td class="nowrap">${r.minimumWage?esc(Number(r.minimumWage).toLocaleString('ja-JP')+'円'):'－'}</td>
      ${axisCell(r.regular)}${axisCell(r.fixedOvertime)}${axisCell(r.trialRegular)}${axisCell(r.trialFixedOvertime)}
    </tr>`).join('');
    els.pageInfo.textContent=`${state.page} / ${pages}（${items.length.toLocaleString('ja-JP')}件）`;
    els.prevPage.disabled=state.page<=1; els.nextPage.disabled=state.page>=pages;
    els.resultCaption.textContent=`${items.length.toLocaleString('ja-JP')}件を表示対象にしています。1ページ${state.pageSize}件。`;
  }

  function leftHeaders(){ return ['緊急度','総合判定','求人管理番号','公開状態','雇用形態','都道府県','最低賃金','改定日','通常賃金判定','固定残業判定','試用賃金判定','試用固定残業判定','厚労省URL']; }
  function originalHeadersForExport(){ return state.headers.filter(h=>h!=='求人管理番号'); }
  function leftValues(r){ const f=core.flattenForExport(r); return leftHeaders().map(h=>f[h]); }
  function exportMatrix(items){ const headers=[...leftHeaders(),...originalHeadersForExport()]; const rows=items.map(({row,result})=>[...leftValues(result),...originalHeadersForExport().map(h=>row[h]??'')]); return {headers,rows}; }

  function csvEscape(v){ const x=String(v??''); return /[",\r\n]/.test(x)?`"${x.replace(/"/g,'""')}"`:x; }
  function makeCsvText(matrix){ return [matrix.headers,...matrix.rows].map(r=>r.map(csvEscape).join(',')).join('\r\n'); }
  function downloadBlob(blob,name){ const url=URL.createObjectURL(blob),a=document.createElement('a'); a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function baseName(){ return (state.fileName||'result').replace(/\.csv$/i,'').replace(/[\\/:*?"<>|]/g,'_'); }
  function dateStamp(){ return (els.analysisDate.value||todayLocal()).replace(/-/g,''); }
  function downloadCsv(items,suffix){
    const text=makeCsvText(exportMatrix(items));
    const unicode=Encoding.stringToCode(text),sjis=Encoding.convert(unicode,{to:'SJIS',from:'UNICODE'}),bytes=new Uint8Array(sjis);
    downloadBlob(new Blob([bytes],{type:'text/csv;charset=shift_jis'}),`${baseName()}_最低賃金判定_${dateStamp()}${suffix||''}.csv`);
  }

  function detailValue(a,key){ const v=a&&a[key]; return typeof v==='number'&&Number.isFinite(v)?v:null; }
  async function downloadExcel(){
    const wb=new ExcelJS.Workbook(); wb.creator='minimum-wage-checker'; wb.created=new Date();
    const summary=wb.addWorksheet('サマリ',{views:[{state:'frozen',ySplit:1}]});
    summary.columns=[{width:24},{width:16}]; summary.addRow(['項目','件数']);
    const vals=[['全求人',state.results.length],['最低賃金割れ',state.results.filter(x=>x.result.overall==='最低賃金割れ').length],['緊急',state.results.filter(x=>x.result.urgency==='緊急').length],['改定前要対応',state.results.filter(x=>x.result.urgency==='改定前要対応').length],['要確認',state.results.filter(x=>x.result.overall==='要確認').length],['OK',state.results.filter(x=>x.result.overall==='OK').length],['対象外',state.results.filter(x=>x.result.overall==='対象外').length]];
    vals.forEach(v=>summary.addRow(v));
    styleHeader(summary.getRow(1));
    summary.addRow([]); summary.addRow(['都道府県','最低賃金割れ件数']); styleHeader(summary.getRow(summary.rowCount));
    const byPref={}; state.results.filter(x=>x.result.overall==='最低賃金割れ').forEach(x=>byPref[x.result.prefecture]=(byPref[x.result.prefecture]||0)+1);
    Object.entries(byPref).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'ja')).forEach(v=>summary.addRow(v));

    const ws=wb.addWorksheet('判定結果',{views:[{state:'frozen',xSplit:3,ySplit:1}]});
    const detailHeaders=['通常時間額(込み想定)','通常時間額(別途想定)','通常差額(厳しめ)','固定残業時間単価','固定残業必要単価(高い方)','固定残業差額(厳しめ)','試用時間額(込み想定)','試用時間額(別途想定)','試用差額(厳しめ)','試用固定残業時間単価','試用固定残業必要単価(高い方)','試用固定残業差額(厳しめ)'];
    const headers=[...leftHeaders(),...detailHeaders,...originalHeadersForExport()]; ws.addRow(headers); styleHeader(ws.getRow(1)); ws.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};
    state.results.sort((a,b)=>priority(a.result)-priority(b.result)||a.index-b.index).forEach(({row,result:r})=>{
      const details=[detailValue(r.regular,'includedHourly'),detailValue(r.regular,'separateHourly'),detailValue(r.regular,'diff'),detailValue(r.fixedOvertime,'fixedOvertimeHourly'),detailValue(r.fixedOvertime,'requiredOvertimeHourlyMax'),detailValue(r.fixedOvertime,'fixedOvertimeDiff'),detailValue(r.trialRegular,'includedHourly'),detailValue(r.trialRegular,'separateHourly'),detailValue(r.trialRegular,'diff'),detailValue(r.trialFixedOvertime,'fixedOvertimeHourly'),detailValue(r.trialFixedOvertime,'requiredOvertimeHourlyMax'),detailValue(r.trialFixedOvertime,'fixedOvertimeDiff')];
      const excelRow=ws.addRow([...leftValues(r),...details,...originalHeadersForExport().map(h=>row[h]??'')]);
      colorResultRow(excelRow,r); for(let c=14;c<=25;c++) excelRow.getCell(c).numFmt='#,##0.0';
      if(r.sourceUrl){ const cell=excelRow.getCell(13); cell.value={text:'厚労省ページ',hyperlink:r.sourceUrl}; cell.font={color:{argb:'FF175CD3'},underline:true}; }
    });
    ws.columns.forEach((col,i)=>{ col.width=i<13?[14,14,14,14,14,12,11,12,34,34,34,34,18][i]||15:(i<25?18:16); });
    [8,9,10,11].forEach(c=>ws.getColumn(c).alignment={wrapText:true,vertical:'top'});

    const mw=wb.addWorksheet('最低賃金マスタ',{views:[{state:'frozen',ySplit:1}]});
    mw.addRow(['都道府県コード','都道府県','旧発効日','旧最低賃金','新発効日','新最低賃金','厚労省URL']); styleHeader(mw.getRow(1));
    state.minimumWage.records.forEach(rec=>{ const rr=mw.addRow([rec.code,rec.prefecture,rec.oldEffectiveDate,rec.oldWage,rec.newEffectiveDate,rec.newWage,'厚労省ページ']); rr.getCell(7).value={text:'厚労省ページ',hyperlink:rec.sourceUrl}; rr.getCell(7).font={color:{argb:'FF175CD3'},underline:true}; });
    mw.columns=[{width:16},{width:14},{width:14},{width:14},{width:14},{width:14},{width:22}]; mw.autoFilter={from:'A1',to:`G${mw.rowCount}`};
    const buf=await wb.xlsx.writeBuffer(); downloadBlob(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`${baseName()}_最低賃金判定_${dateStamp()}.xlsx`);
  }
  function styleHeader(row){ row.font={bold:true,color:{argb:'FFFFFFFF'}}; row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF344054'}}; row.alignment={vertical:'middle'}; }
  function colorResultRow(row,r){
    const fill=r.overall==='最低賃金割れ'?'FFFFE4E2':r.overall==='要確認'?'FFF4EBFF':r.overall==='OK'?'FFECFDF3':'FFF2F4F7';
    [1,2].forEach(c=>row.getCell(c).fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}});
  }

  els.csvFile.addEventListener('change',async e=>{
    clearError(); const file=e.target.files&&e.target.files[0]; if(!file)return;
    try{
      if(!state.masters) await loadData(); const decoded=decodeCsv(await file.arrayBuffer()),parsed=parseCsv(decoded.text);
      state.rows=parsed.rows; state.headers=parsed.headers; state.encoding=decoded.encoding; state.fileName=file.name; els.fileName.textContent=file.name;
      els.fileMeta.hidden=false; els.fileMeta.textContent=`${file.name}｜文字コード: ${decoded.encoding}｜${state.rows.length.toLocaleString('ja-JP')}件｜${state.headers.length}列`;
      analyzeAll();
    }catch(err){ console.error(err); showError(err.message||String(err)); els.resultSection.hidden=true; }
  });
  els.analysisDate.addEventListener('change',analyzeAll);
  [els.filterStatus,els.filterPublication,els.filterPrefecture].forEach(el=>el.addEventListener('change',()=>{state.page=1;renderTable();}));
  els.filterSearch.addEventListener('input',()=>{state.page=1;renderTable();});
  els.prevPage.addEventListener('click',()=>{if(state.page>1){state.page--;renderTable();}}); els.nextPage.addEventListener('click',()=>{state.page++;renderTable();});
  els.downloadCsv.addEventListener('click',()=>downloadCsv(state.results,''));
  els.downloadAttentionCsv.addEventListener('click',()=>downloadCsv(state.results.filter(x=>['最低賃金割れ','要確認'].includes(x.result.overall)),'_要対応のみ'));
  els.downloadExcel.addEventListener('click',()=>downloadExcel().catch(err=>{console.error(err);showError(`Excel生成エラー: ${err.message||err}`);}));

  loadData().catch(err=>showError(`マスタ読込エラー: ${err.message||err}`));
})();
