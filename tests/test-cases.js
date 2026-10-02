(function(root,factory){ const v=factory(); if(typeof module==='object'&&module.exports) module.exports=v; root.MinimumWageTestCases=v; })(typeof globalThis!=='undefined'?globalThis:this,function(){
  const base={
    '求人管理番号':'T-BASE','公開情報区分':'6','雇用形態区分':'1','県コード1':'99',
    '給与区分':'3','給与金額MIN':'200000','平均所定労働時間':'160','勤務形態':'3',
    '固定残業代の支払額':'','固定残業時間':'',
    '給与区分(試用期間)':'','給与金額MIN(試用期間)':'','平均所定労働時間(試用期間)':'',
    '固定残業代の支払額(試用期間)':'','固定残業時間(試用期間)':''
  };
  const row=(patch={})=>({...base,...patch});
  return [
    {name:'01 業務委託は対象外',row:row({'雇用形態区分':'9'}),date:'2026-10-02',expect:{overall:'対象外',urgency:'－'}},
    {name:'02 その他は対象外',row:row({'雇用形態区分':'99'}),date:'2026-10-02',expect:{overall:'対象外',urgency:'－'}},
    {name:'03 雇用形態不明は要確認',row:row({'雇用形態区分':'777'}),date:'2026-10-02',expect:{overall:'要確認',urgency:'要確認・公開中'}},
    {name:'04 県コード不明は要確認',row:row({'県コード1':'777'}),date:'2026-10-02',expect:{overall:'要確認',urgency:'要確認・公開中'}},
    {name:'05 勤務形態空白・時給が最賃未満',row:row({'勤務形態':'','給与区分':'1','給与金額MIN':'1199'}),date:'2026-10-02',expect:{regular:'NG',overall:'最低賃金割れ',urgency:'緊急'}},
    {name:'06 勤務形態空白・時給が最賃同額',row:row({'勤務形態':'','給与区分':'1','給与金額MIN':'1200'}),date:'2026-10-02',expect:{regular:'OK',overall:'OK'}},
    {name:'07 勤務形態空白・時給が最賃超',row:row({'勤務形態':'','給与区分':'1','給与金額MIN':'1201'}),date:'2026-10-02',expect:{regular:'OK',overall:'OK'}},
    {name:'08 勤務形態空白・非時給は要確認',row:row({'勤務形態':'','給与区分':'3'}),date:'2026-10-02',expect:{regular:'要確認',overall:'要確認'}},
    {name:'09 月給・固定残業なし・最賃未満',row:row({'給与金額MIN':'191999'}),date:'2026-10-02',expect:{regular:'NG',fixedOvertime:'対象なし',overall:'最低賃金割れ'}},
    {name:'10 月給・固定残業なし・最賃同額',row:row({'給与金額MIN':'192000'}),date:'2026-10-02',expect:{regular:'OK',overall:'OK'}},
    {name:'11 月給・固定残業なし・最賃超',row:row({'給与金額MIN':'200000'}),date:'2026-10-02',expect:{regular:'OK',overall:'OK'}},
    {name:'12 月給固定残業あり・込み別途ともOK',row:row({'給与金額MIN':'250000','固定残業代の支払額':'40000','固定残業時間':'20'}),date:'2026-10-02',expect:{regular:'OK',fixedOvertime:'OK',overall:'OK'}},
    {name:'13 月給固定残業あり・込み別途ともNG',row:row({'給与金額MIN':'190000','固定残業代の支払額':'20000','固定残業時間':'10'}),date:'2026-10-02',expect:{regular:'NG',overall:'最低賃金割れ'}},
    {name:'14 月給固定残業あり・包含有無で通常賃金分岐',row:row({'給与金額MIN':'200000','固定残業代の支払額':'30000','固定残業時間':'20'}),date:'2026-10-02',expect:{regular:'要確認',fixedOvertime:'要確認',overall:'要確認'}},
    {name:'15 固定残業代空白は制度なし確定',row:row({'給与金額MIN':'210000','固定残業代の支払額':'','固定残業時間':''}),date:'2026-10-02',expect:{fixedOvertime:'対象なし'}},
    {name:'16 固定残業代あり・時間空白は要確認',row:row({'給与金額MIN':'230000','固定残業代の支払額':'30000','固定残業時間':''}),date:'2026-10-02',expect:{fixedOvertime:'要確認',overall:'要確認'}},
    {name:'17 固定残業時間単価が不足',row:row({'給与金額MIN':'240000','固定残業代の支払額':'20000','固定残業時間':'20'}),date:'2026-10-02',expect:{regular:'OK',fixedOvertime:'NG',overall:'最低賃金割れ'}},
    {name:'18 固定残業時間単価が十分',row:row({'給与金額MIN':'240000','固定残業代の支払額':'40000','固定残業時間':'20'}),date:'2026-10-02',expect:{regular:'OK',fixedOvertime:'OK',overall:'OK'}},
    {name:'19 固定残業単価が包含有無で分岐',row:row({'給与金額MIN':'220000','固定残業代の支払額':'20000','固定残業時間':'12'}),date:'2026-10-02',expect:{regular:'OK',fixedOvertime:'要確認',overall:'要確認'}},
    {name:'20 試用期間列すべて空白は対象なし',row:row(),date:'2026-10-02',expect:{trialRegular:'対象なし',trialFixedOvertime:'対象なし'}},
    {name:'21 試用期間だけ最低賃金割れ',row:row({'給与金額MIN':'240000','給与区分(試用期間)':'3','給与金額MIN(試用期間)':'180000','平均所定労働時間(試用期間)':'160'}),date:'2026-10-02',expect:{regular:'OK',trialRegular:'NG',overall:'最低賃金割れ'}},
    {name:'22 試用期間固定残業制度なし',row:row({'給与金額MIN':'240000','給与区分(試用期間)':'3','給与金額MIN(試用期間)':'200000','平均所定労働時間(試用期間)':'160'}),date:'2026-10-02',expect:{trialRegular:'OK',trialFixedOvertime:'対象なし'}},
    {name:'23 試用期間固定残業単価不足',row:row({'給与金額MIN':'240000','給与区分(試用期間)':'3','給与金額MIN(試用期間)':'220000','平均所定労働時間(試用期間)':'160','固定残業代の支払額(試用期間)':'20000','固定残業時間(試用期間)':'20'}),date:'2026-10-02',expect:{trialRegular:'OK',trialFixedOvertime:'NG',overall:'最低賃金割れ'}},
    {name:'24 年収は参考換算のため要確認',row:row({'給与区分':'5','給与金額MIN':'3000000'}),date:'2026-10-02',expect:{regular:'要確認',overall:'要確認'}},
    {name:'25 年俸は12分割換算し最賃未満',row:row({'給与区分':'4','給与金額MIN':'2200000'}),date:'2026-10-02',expect:{regular:'NG',overall:'最低賃金割れ'}},
    {name:'26 日給は所定時間で割って同額',row:row({'給与区分':'2','給与金額MIN':'9600','平均所定労働時間':'8'}),date:'2026-10-02',expect:{regular:'OK'}},
    {name:'27 完全歩合制は要確認',row:row({'給与区分':'6','給与金額MIN':'250000'}),date:'2026-10-02',expect:{regular:'要確認',overall:'要確認'}},
    {name:'28 平均所定労働時間空白は要確認',row:row({'平均所定労働時間':''}),date:'2026-10-02',expect:{regular:'要確認',overall:'要確認'}},
    {name:'29 改定日前・公開中のNGは改定前要対応',row:row({'給与金額MIN':'180000'}),date:'2026-09-30',expect:{overall:'最低賃金割れ',urgency:'改定前要対応'}},
    {name:'30 改定日以降・非公開NGは公開前要修正',row:row({'公開情報区分':'2','給与金額MIN':'180000'}),date:'2026-10-02',expect:{overall:'最低賃金割れ',urgency:'公開前要修正'}},
    {name:'31 改定日前・非公開NGは公開前確認',row:row({'公開情報区分':'2','給与金額MIN':'180000'}),date:'2026-09-30',expect:{overall:'最低賃金割れ',urgency:'公開前確認'}},
    {name:'32 公開状態コード不明なら緊急度を確定しない',row:row({'公開情報区分':'999','給与金額MIN':'180000'}),date:'2026-10-02',expect:{overall:'最低賃金割れ',urgency:'要確認・公開状態不明'}},
    {name:'33 CSVダウンロード日不正は要確認',row:row({'給与金額MIN':'180000'}),date:'invalid',expect:{overall:'要確認',urgency:'要確認・公開中'}},
    {name:'34 時給＋勤務形態ありでも時給を直接比較',row:row({'給与区分':'1','給与金額MIN':'1200','平均所定労働時間':'1'}),date:'2026-10-02',expect:{regular:'OK'}},
    {name:'35 試用期間データが途中までなら要確認',row:row({'給与区分(試用期間)':'3','給与金額MIN(試用期間)':'190000','平均所定労働時間(試用期間)':''}),date:'2026-10-02',expect:{trialRegular:'要確認',overall:'要確認'}}
  ];
});