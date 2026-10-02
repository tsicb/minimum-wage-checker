(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MinimumWageCheckerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REQUIRED_COLUMNS = [
    '求人管理番号','公開情報区分','雇用形態区分','県コード1','給与区分','給与金額MIN',
    '平均所定労働時間','勤務形態','固定残業代の支払額','固定残業時間',
    '給与区分(試用期間)','給与金額MIN(試用期間)','平均所定労働時間(試用期間)',
    '固定残業代の支払額(試用期間)','固定残業時間(試用期間)'
  ];

  const STATUS = Object.freeze({ NG:'NG', REVIEW:'要確認', OK:'OK', NA:'対象なし' });
  const OVERALL = Object.freeze({ NG:'最低賃金割れ', REVIEW:'要確認', OK:'OK', EXCLUDED:'対象外' });
  const EXCLUDED_EMPLOYMENT = new Set(['9','99']);

  function s(v) { return v == null ? '' : String(v).trim(); }
  function blank(v) { return s(v) === ''; }
  function number(v) {
    if (blank(v)) return null;
    const n = Number(s(v).replace(/[，,円￥¥\s]/g,'').replace(/．/g,'.').replace(/－/g,'-'));
    return Number.isFinite(n) ? n : null;
  }
  function validPositive(v) { const n = number(v); return n != null && n > 0 ? n : null; }
  function yen(v, digits=0) {
    if (v == null || !Number.isFinite(v)) return '－';
    const rounded = Number(v.toFixed(digits));
    return rounded.toLocaleString('ja-JP',{maximumFractionDigits:digits, minimumFractionDigits:Number.isInteger(rounded)?0:digits}) + '円';
  }
  function hourly(v) {
    if (v == null || !Number.isFinite(v)) return '－';
    const digits = Math.abs(v - Math.round(v)) < 1e-9 ? 0 : 1;
    return yen(v,digits) + '/h';
  }
  function compare(value, threshold) {
    if (value == null || threshold == null) return null;
    return value + 1e-9 >= threshold;
  }
  function axis(status, message, detail={}) { return { status, message, ...detail }; }

  function normalizeDate(v) {
    const x=s(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null;
  }

  function buildLookup(records, key='code') {
    const m={}; for (const r of records || []) m[String(r[key])] = r; return m;
  }

  function payTypeLabel(code, masters) {
    return (masters.payType && masters.payType[s(code)]) || `不明コード(${s(code) || '空白'})`;
  }

  function makeRegularScenarios(fields, minWage, masters, isTrial=false) {
    const code=s(fields.payType), amount=validPositive(fields.amount), hours=validPositive(fields.hours), otAmount=number(fields.otAmount);
    const label=payTypeLabel(code, masters);
    const prefix=isTrial ? '試用期間' : '通常';
    if (!code) return {axis:axis(STATUS.REVIEW, `${prefix}の給与区分が空白`), scenarios:[], payType:label};
    if (amount == null) return {axis:axis(STATUS.REVIEW, `${prefix}の給与金額MINが空白または不正`), scenarios:[], payType:label};

    // 時給: 固定残業代は時間給そのものから控除しない。
    if (code === '1') {
      const ok=compare(amount,minWage);
      const msg=`${ok?'OK':'NG'}｜${hourly(amount)} ${ok?'≧':'＜'} 最賃${yen(minWage)}`;
      return {axis:axis(ok?STATUS.OK:STATUS.NG,msg,{conservativeHourly:amount,separateHourly:amount,includedHourly:amount,diff:amount-minWage}), scenarios:[amount], payType:label};
    }

    if (code === '6' || code === '99') {
      return {axis:axis(STATUS.REVIEW, `${prefix}は${label}のため自動換算対象外`), scenarios:[], payType:label};
    }
    if (!['2','3','4','5'].includes(code)) {
      return {axis:axis(STATUS.REVIEW, `${prefix}の給与区分コード${code}は未定義`), scenarios:[], payType:label};
    }
    if (hours == null) return {axis:axis(STATUS.REVIEW, `${prefix}の平均所定労働時間が空白または不正`), scenarios:[], payType:label};

    let periodAmount=amount;
    if (code === '4' || code === '5') periodAmount = amount / 12;
    let separate = periodAmount / hours;
    let included = separate;
    let hasAmbiguity = false;

    // 月給・年俸・年収は固定残業代が給与表示額に含まれている可能性を両建て計算する。
    if (otAmount != null && otAmount >= 0 && ['3','4','5'].includes(code)) {
      included = (periodAmount - otAmount) / hours;
      hasAmbiguity = true;
      if (!Number.isFinite(included) || included < 0) {
        return {axis:axis(STATUS.REVIEW, `${prefix}の固定残業代控除後給与が不正`), scenarios:[], payType:label};
      }
    }

    const scenarios = hasAmbiguity ? [included,separate] : [separate];
    const passes = scenarios.map(v=>compare(v,minWage));
    const allPass = passes.every(Boolean), allFail = passes.every(v=>!v);
    const conservative = Math.min(...scenarios);
    const detail={includedHourly:included,separateHourly:separate,conservativeHourly:conservative,diff:conservative-minWage};

    // 年収は賞与等を含む可能性があるので結果にかかわらず参考判定。
    if (code === '5') {
      const range=hasAmbiguity ? `込み想定${hourly(included)}／別途想定${hourly(separate)}` : `参考換算${hourly(separate)}`;
      return {axis:axis(STATUS.REVIEW, `要確認｜年収の${range}（賞与等を含む可能性）`,detail), scenarios, payType:label, referenceOnly:true};
    }

    if (allPass) {
      const msg=hasAmbiguity ? `OK｜込み想定${hourly(included)}／別途想定${hourly(separate)}` : `OK｜${hourly(separate)} ≧ 最賃${yen(minWage)}`;
      return {axis:axis(STATUS.OK,msg,detail), scenarios, payType:label};
    }
    if (allFail) {
      const msg=hasAmbiguity ? `NG｜込み想定${hourly(included)}／別途想定${hourly(separate)} とも最賃未満` : `NG｜${hourly(separate)} ＜ 最賃${yen(minWage)}`;
      return {axis:axis(STATUS.NG,msg,detail), scenarios, payType:label};
    }
    return {axis:axis(STATUS.REVIEW, `要確認｜込み想定${hourly(included)}／別途想定${hourly(separate)}で判定が分岐`,detail), scenarios, payType:label};
  }

  function checkFixedOvertime(fields, regularResult, isTrial=false) {
    const prefix=isTrial ? '試用期間' : '通常';
    if (blank(fields.otAmount)) return axis(STATUS.NA, `${prefix}の固定残業制度なし`);
    const amount=number(fields.otAmount), hours=validPositive(fields.otHours);
    if (amount == null || amount < 0) return axis(STATUS.REVIEW, `${prefix}の固定残業代支払額が不正`);
    if (hours == null) return axis(STATUS.REVIEW, `${prefix}の固定残業時間が空白または不正`);
    if (!regularResult || !regularResult.scenarios || !regularResult.scenarios.length) return axis(STATUS.REVIEW, `${prefix}の通常時間額を算出できないため固定残業代を判定できない`);

    const actual=amount/hours;
    const required=regularResult.scenarios.map(v=>v*1.25);
    const passes=required.map(v=>compare(actual,v));
    const allPass=passes.every(Boolean), allFail=passes.every(v=>!v);
    const maxRequired=Math.max(...required);
    const detail={fixedOvertimeHourly:actual,requiredOvertimeHourlyMax:maxRequired,fixedOvertimeDiff:actual-maxRequired};

    if (regularResult.referenceOnly) {
      return axis(STATUS.REVIEW, `要確認｜年収が参考換算のため固定残業単価${hourly(actual)}も参考判定`,detail);
    }
    if (allPass) return axis(STATUS.OK, `OK｜固定残業${hourly(actual)} ≧ 必要${hourly(maxRequired)}`,detail);
    if (allFail) return axis(STATUS.NG, `NG｜固定残業${hourly(actual)} ＜ 必要${hourly(Math.min(...required))}`,detail);
    return axis(STATUS.REVIEW, `要確認｜固定残業${hourly(actual)}は給与への包含有無で判定が分岐`,detail);
  }

  function trialHasAny(row) {
    return ['給与区分(試用期間)','給与金額MIN(試用期間)','平均所定労働時間(試用期間)','固定残業代の支払額(試用期間)','固定残業時間(試用期間)'].some(k=>!blank(row[k]));
  }

  function summarizeOverall(axes) {
    if (axes.some(a=>a.status===STATUS.NG)) return OVERALL.NG;
    if (axes.some(a=>a.status===STATUS.REVIEW)) return OVERALL.REVIEW;
    if (axes.some(a=>a.status===STATUS.OK)) return OVERALL.OK;
    return OVERALL.EXCLUDED;
  }

  function urgency(overall, publicCode, analysisDate, effectiveDate, publicationKnown=true) {
    if (overall === OVERALL.OK || overall === OVERALL.EXCLUDED) return '－';
    if (!publicationKnown) return '要確認・公開状態不明';
    const isPublic=s(publicCode)==='6';
    if (overall === OVERALL.REVIEW) return isPublic ? '要確認・公開中' : '要確認・非公開';
    const reached = analysisDate && effectiveDate ? analysisDate >= effectiveDate : null;
    if (reached == null) return isPublic ? '要確認・公開中' : '要確認・非公開';
    if (isPublic && reached) return '緊急';
    if (isPublic && !reached) return '改定前要対応';
    if (!isPublic && reached) return '公開前要修正';
    return '公開前確認';
  }

  function analyzeRow(row, ctx) {
    const masters=ctx.masters || {}, wageByCode=ctx.wageByCode || buildLookup((ctx.minimumWage && ctx.minimumWage.records)||[]);
    const analysisDate=normalizeDate(ctx.analysisDate);
    const empCode=s(row['雇用形態区分']), prefCode=s(row['県コード1']), pubCode=s(row['公開情報区分']);
    const employment=(masters.employment && masters.employment[empCode]) || (empCode?`不明コード(${empCode})`:'空白');
    const publicationKnown=Boolean(masters.publication && masters.publication[pubCode]);
    const publication=(masters.publication && masters.publication[pubCode]) || (pubCode?`不明コード(${pubCode})`:'空白');
    const wage=wageByCode[prefCode] || null;
    const base={
      jobId:s(row['求人管理番号']), publication, employment,
      prefecture:wage ? wage.prefecture : ((masters.prefectures&&masters.prefectures[prefCode])||''),
      minimumWage:wage ? Number(wage.newWage) : null,
      effectiveDate:wage ? wage.newEffectiveDate : '',
      sourceUrl:wage ? wage.sourceUrl : '', analysisDate
    };

    if (EXCLUDED_EMPLOYMENT.has(empCode)) {
      const na=axis(STATUS.NA, `${employment}のため最低賃金判定対象外`);
      return {...base, regular:na, fixedOvertime:na, trialRegular:na, trialFixedOvertime:na, overall:OVERALL.EXCLUDED, urgency:'－'};
    }
    if (!masters.employment || !masters.employment[empCode]) {
      const rv=axis(STATUS.REVIEW, '雇用形態区分が空白またはマスタ未登録');
      return {...base, regular:rv,fixedOvertime:axis(STATUS.NA,'判定保留'),trialRegular:axis(STATUS.NA,'判定保留'),trialFixedOvertime:axis(STATUS.NA,'判定保留'),overall:OVERALL.REVIEW,urgency:urgency(OVERALL.REVIEW,pubCode,analysisDate,wage&&wage.newEffectiveDate,publicationKnown)};
    }
    if (!wage) {
      const rv=axis(STATUS.REVIEW, '県コード1が空白または最低賃金マスタ未登録');
      return {...base, regular:rv,fixedOvertime:axis(STATUS.NA,'判定保留'),trialRegular:axis(STATUS.NA,'判定保留'),trialFixedOvertime:axis(STATUS.NA,'判定保留'),overall:OVERALL.REVIEW,urgency:urgency(OVERALL.REVIEW,pubCode,analysisDate,null,publicationKnown)};
    }
    if (!analysisDate) {
      const rv=axis(STATUS.REVIEW,'CSVダウンロード日が不正');
      return {...base, regular:rv,fixedOvertime:axis(STATUS.NA,'判定保留'),trialRegular:axis(STATUS.NA,'判定保留'),trialFixedOvertime:axis(STATUS.NA,'判定保留'),overall:OVERALL.REVIEW,urgency:urgency(OVERALL.REVIEW,pubCode,null,wage.newEffectiveDate,publicationKnown)};
    }

    let regular, fixedOvertime, trialRegular, trialFixedOvertime;
    if (blank(row['勤務形態'])) {
      const code=s(row['給与区分']), amount=validPositive(row['給与金額MIN']);
      if (code !== '1') regular=axis(STATUS.REVIEW, '勤務形態が空白で給与区分が時給ではない');
      else if (amount == null) regular=axis(STATUS.REVIEW, '給与金額MINが空白または不正');
      else {
        const ok=compare(amount,wage.newWage);
        regular=axis(ok?STATUS.OK:STATUS.NG, `${ok?'OK':'NG'}｜${hourly(amount)} ${ok?'≧':'＜'} 最賃${yen(wage.newWage)}`, {conservativeHourly:amount,separateHourly:amount,includedHourly:amount,diff:amount-wage.newWage});
      }
      fixedOvertime=axis(STATUS.NA,'勤務形態空白ルートのため対象なし');
      trialRegular=axis(STATUS.NA,'勤務形態空白ルートのため対象なし');
      trialFixedOvertime=axis(STATUS.NA,'勤務形態空白ルートのため対象なし');
    } else {
      const normalFields={payType:row['給与区分'],amount:row['給与金額MIN'],hours:row['平均所定労働時間'],otAmount:row['固定残業代の支払額'],otHours:row['固定残業時間']};
      const normalResult=makeRegularScenarios(normalFields,Number(wage.newWage),masters,false);
      regular=normalResult.axis;
      fixedOvertime=checkFixedOvertime(normalFields,normalResult,false);

      if (!trialHasAny(row)) {
        trialRegular=axis(STATUS.NA,'試用期間給与設定なし');
        trialFixedOvertime=axis(STATUS.NA,'試用期間給与設定なし');
      } else {
        const trialFields={payType:row['給与区分(試用期間)'],amount:row['給与金額MIN(試用期間)'],hours:row['平均所定労働時間(試用期間)'],otAmount:row['固定残業代の支払額(試用期間)'],otHours:row['固定残業時間(試用期間)']};
        const trialResult=makeRegularScenarios(trialFields,Number(wage.newWage),masters,true);
        trialRegular=trialResult.axis;
        trialFixedOvertime=checkFixedOvertime(trialFields,trialResult,true);
      }
    }

    const overall=summarizeOverall([regular,fixedOvertime,trialRegular,trialFixedOvertime]);
    return {...base,regular,fixedOvertime,trialRegular,trialFixedOvertime,overall,urgency:urgency(overall,pubCode,analysisDate,wage.newEffectiveDate,publicationKnown)};
  }

  function validateColumns(headers) {
    const set=new Set(headers || []); return REQUIRED_COLUMNS.filter(c=>!set.has(c));
  }

  function flattenForExport(result) {
    return {
      '緊急度':result.urgency,
      '総合判定':result.overall,
      '求人管理番号':result.jobId,
      '公開状態':result.publication,
      '雇用形態':result.employment,
      '都道府県':result.prefecture,
      '最低賃金':result.minimumWage,
      '改定日':result.effectiveDate,
      '通常賃金判定':result.regular.message,
      '固定残業判定':result.fixedOvertime.message,
      '試用賃金判定':result.trialRegular.message,
      '試用固定残業判定':result.trialFixedOvertime.message,
      '厚労省URL':result.sourceUrl
    };
  }

  return { REQUIRED_COLUMNS, STATUS, OVERALL, buildLookup, analyzeRow, validateColumns, flattenForExport, number, yen, hourly, urgency, makeRegularScenarios, checkFixedOvertime };
});
