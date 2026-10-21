(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PageantScoring = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ID_PATTERN = /^[A-Za-z0-9_-]+$/;
  const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const evenWeights = count => {
    if (!Number.isInteger(count) || count < 1) return [];
    const totalUnits = 1000;
    const baseUnits = Math.floor(totalUnits / count);
    const remainder = totalUnits - baseUnits * count;
    return Array.from({ length: count }, (_, index) => (baseUnits + (index === count - 1 ? remainder : 0)) / 10);
  };
  const sameScore = (a, b) => a != null && b != null && round2(a) === round2(b);
  const ordinal = value => { const mod100=value%100; return `${value}${mod100>=11&&mod100<=13?'th':({1:'st',2:'nd',3:'rd'})[value%10]||'th'}`; };
  const blankState = () => ({
    version: 2,
    event: { name: 'New Pageant', date: '', location: '' },
    contestants: [], judges: [],
    rounds: [{ id: 'round-main', name: 'Main round', advanceCount: null, tieBreakers: [] }],
    categories: [], scores: {},
    locks: [], tieDecisions: [], audit: [], lastBackupAt: null,
    pin: null
  });

  function safeId(value, prefix, used, index) {
    let candidate = String(value == null ? '' : value);
    if (!ID_PATTERN.test(candidate) || used.has(candidate)) {
      const stem = `${prefix}-${index + 1}`;
      candidate = stem;
      let suffix = 1;
      while (used.has(candidate)) candidate = `${stem}-${suffix++}`;
    }
    used.add(candidate);
    return candidate;
  }

  function normalize(input) {
    const state = blankState();
    const report = { migrated: Number(input && input.version) !== 2, dropped: 0, remapped: 0 };
    if (!input || typeof input !== 'object') return { state, report };

    state.event = { ...state.event, ...(input.event && typeof input.event === 'object' ? input.event : {}) };
    const idMaps = { contestant: new Map(), judge: new Map(), category: new Map(), criterion: new Map(), round: new Map() };
    const used = { contestant: new Set(), judge: new Set(), category: new Set(), criterion: new Set(), round: new Set() };
    const records = (arr, kind) => (Array.isArray(arr) ? arr : []).map((item, index) => {
      const old = String(item && item.id != null ? item.id : '');
      const next = safeId(old, kind, used[kind], index);
      if (old !== next) report.remapped++;
      if (old && !idMaps[kind].has(old)) idMaps[kind].set(old, next);
      return { ...item, id: next };
    });
    state.contestants = records(input.contestants, 'contestant').map(c => ({ id: c.id, number: String(c.number ?? ''), name: String(c.name ?? '') }));
    state.judges = records(input.judges, 'judge').map(j => ({ id: j.id, name: String(j.name ?? '') }));
    const rawRounds = Array.isArray(input.rounds) ? input.rounds : [];
    state.rounds = records(rawRounds.length ? rawRounds : [{ id: 'round-main', name: 'Main round', advanceCount: null, tieBreakers: [] }], 'round')
      .map(r => ({ id: r.id, name: String(r.name || 'Main round'), advanceCount: r.advanceCount == null || r.advanceCount === '' ? null : Math.max(1, Number(r.advanceCount) || 1), tieBreakers: Array.isArray(r.tieBreakers) ? r.tieBreakers.map(rule => ({ type: rule.type, categoryId: rule.categoryId ? String(rule.categoryId) : undefined, name: rule.name })) : [], finalizedAt: r.finalizedAt || null, snapshot: r.snapshot || null, advancingIds: Array.isArray(r.advancingIds) ? r.advancingIds.map(id => idMaps.contestant.get(String(id))).filter(Boolean) : null }));
    const defaultRoundId = state.rounds[0]?.id || 'round-main';
    const rawCats = records(input.categories, 'category');
    state.categories = rawCats.map(c => ({
      id: c.id, name: String(c.name ?? ''), weight: Number(c.weight) || 0,
      roundId: idMaps.round.get(String(c.roundId || '')) || defaultRoundId,
      criteria: (Array.isArray(c.criteria) ? c.criteria : []).map((cr, index) => {
        const old = String(cr && cr.id != null ? cr.id : '');
        const next = safeId(old, 'criterion', used.criterion, index);
        if (old !== next) report.remapped++;
        if (old && !idMaps.criterion.has(old)) idMaps.criterion.set(old, next);
        return { id: next, name: String(cr.name ?? ''), weight: Number(cr.weight) || 0 };
      })
    }));
    state.rounds.forEach(round => { round.tieBreakers = round.tieBreakers.filter(rule => rule.type === 'firsts' || rule.type === 'rankSum' || (rule.type === 'category' && idMaps.category.has(String(rule.categoryId)))).map(rule => ({ ...rule, categoryId: rule.categoryId ? idMaps.category.get(String(rule.categoryId)) : undefined })); });

    const known = { contestant: new Set(state.contestants.map(x => x.id)), judge: new Set(state.judges.map(x => x.id)), category: new Set(state.categories.map(x => x.id)), criterion: new Set(state.categories.flatMap(c => c.criteria.map(x => x.id))) };
    const scores = input.scores && typeof input.scores === 'object' ? input.scores : {};
    state.scores = {};
    for (const [key, value] of Object.entries(scores)) {
      const parts = key.split('|');
      if (parts.length !== 4) { report.dropped++; continue; }
      const ids = [idMaps.contestant.get(parts[0]), idMaps.judge.get(parts[1]), idMaps.category.get(parts[2]), idMaps.criterion.get(parts[3])];
      const score = Number(value);
      if (ids.some((id, index) => !id || !known[['contestant', 'judge', 'category', 'criterion'][index]].has(id)) || !Number.isFinite(score) || score < 0 || score > 100) { report.dropped++; continue; }
      state.scores[ids.join('|')] = score;
    }
    state.locks = Array.isArray(input.locks) ? input.locks.filter(lock => lock && idMaps.judge.has(String(lock.judgeId)) && idMaps.category.has(String(lock.categoryId))).map(lock => ({ ...lock, judgeId: idMaps.judge.get(String(lock.judgeId)), categoryId: idMaps.category.get(String(lock.categoryId)) })) : [];
    state.tieDecisions = Array.isArray(input.tieDecisions) ? input.tieDecisions.filter(x => x && idMaps.round.has(String(x.roundId))).map(x => ({ roundId:idMaps.round.get(String(x.roundId)), contestantIds:(x.contestantIds||[]).map(id=>idMaps.contestant.get(String(id))).filter(Boolean), order:(x.order||[]).map(id=>idMaps.contestant.get(String(id))).filter(Boolean), timestamp:String(x.timestamp||''), note:String(x.note||'') })) : [];
    state.audit = Array.isArray(input.audit) ? input.audit.map(x => ({ ...x })) : [];
    state.lastBackupAt = input.lastBackupAt || null;
    state.updatedAt = input.updatedAt || null;
    state.pin = input.pin && typeof input.pin === 'object' ? { salt: String(input.pin.salt || ''), hash: String(input.pin.hash || '') } : null;
    return { state, report };
  }

  const scoreKey = (contestantId, judgeId, categoryId, criterionId) => `${contestantId}|${judgeId}|${categoryId}|${criterionId}`;
  function nextCriterion(categories, judges, locks, categoryId, criterionId) {
    const items = categories
      .filter(category => category.criteria?.length && judges.some(judge => !locks.some(lock => lock.categoryId === category.id && lock.judgeId === judge.id)))
      .flatMap(category => category.criteria.map(criterion => ({ category, criterion })));
    const current = items.findIndex(item => item.category.id === categoryId && item.criterion.id === criterionId);
    return current < 0 ? null : items[current + 1] || null;
  }
  const validWeights = items => items.length > 0 && Math.abs(items.reduce((sum, item) => sum + Number(item.weight || 0), 0) - 100) < 0.01;
  function criterionScore(scores, contestant, judge, category, criterion) {
    const value = scores[scoreKey(contestant.id, judge.id, category.id, criterion.id)];
    return value == null || value === '' ? null : Number(value);
  }
  function categoryJudgeScore(scores, contestant, judge, category) {
    if (!category.criteria.length || category.criteria.some(cr => criterionScore(scores, contestant, judge, category, cr) == null)) return null;
    return category.criteria.reduce((sum, cr) => sum + criterionScore(scores, contestant, judge, category, cr) * Number(cr.weight || 0) / 100, 0);
  }
  function categoryScore(scores, contestants, judges, category) {
    return contestants.map(contestant => {
      const perJudge = judges.map(judge => categoryJudgeScore(scores, contestant, judge, category));
      const complete = judges.length > 0 && validWeights(category.criteria) && perJudge.every(value => value != null);
      return { contestant, value: complete ? perJudge.reduce((a, b) => a + b, 0) / judges.length : null, complete, perJudge };
    }).sort((a, b) => a.value == null ? 1 : b.value == null ? -1 : b.value - a.value || String(a.contestant.number).localeCompare(String(b.contestant.number), undefined, { numeric: true, sensitivity: 'base' }));
  }
  function roundScore(scores, contestants, judges, categories, round) {
    const cats = categories.filter(c => c.roundId === round.id);
    const each = cats.map(category => [category, categoryScore(scores, contestants, judges, category)]);
    return contestants.map(contestant => {
      const values = each.map(([cat, rows]) => ({ category: cat, row: rows.find(r => r.contestant.id === contestant.id) }));
      const complete = validWeights(cats) && values.length > 0 && values.every(x => x.row.complete && x.row.value != null);
      const value = complete ? values.reduce((sum, x) => sum + x.row.value * Number(x.category.weight || 0) / 100, 0) : values.some(x => x.row.value != null) ? values.reduce((sum, x) => sum + (x.row.value || 0) * Number(x.category.weight || 0) / 100, 0) : null;
      return { contestant, value, complete, categoryValues: Object.fromEntries(values.map(x => [x.category.id, x.row.value])) };
    }).sort((a, b) => a.value == null ? 1 : b.value == null ? -1 : b.value - a.value || String(a.contestant.number).localeCompare(String(b.contestant.number), undefined, { numeric: true, sensitivity: 'base' }));
  }
  function assignPlaces(rows) {
    if (rows.some(row => row.tieReason && row.place != null)) return [...rows];
    let previous = null, place = 0;
    return [...rows].map((row, index) => {
      if (row.value == null) return { ...row, place: null };
      if (previous == null || !sameScore(row.value, previous)) place = index + 1;
      previous = row.value;
      return { ...row, place };
    });
  }
  function cutoff(rows, advanceCount) {
    const ranked = assignPlaces(rows);
    if (advanceCount == null) return { rows: ranked, advancing: ranked.filter(x => x.value != null).map(x => x.contestant.id), warning: null, cutoffPlace: null };
    const boundary = ranked[Number(advanceCount) - 1];
    if (!boundary || boundary.value == null) return { rows: ranked, advancing: ranked.filter(x => x.value != null).map(x => x.contestant.id), warning: null, cutoffPlace: null };
    const tie = ranked.filter(row => row.value != null && row.place === boundary.place && sameScore(row.value, boundary.value));
    const included = ranked.filter(row => row.value != null && row.place <= boundary.place);
    return { rows: ranked, advancing: included.map(x => x.contestant.id), warning: tie.length > 1 ? `${tie.length} contestants tied for ${ordinal(Number(advanceCount))}; the committee must decide who advances` : null, cutoffPlace: boundary.place };
  }
  function judgeRanks(values) {
    const rows = values.map((value, index) => ({ index, value })).sort((a, b) => b.value - a.value || a.index - b.index);
    let previous, place = 0;
    for (let i = 0; i < rows.length; i++) {
      if (previous == null || !sameScore(previous, rows[i].value)) place = i + 1;
      rows[i].rank = place; previous = rows[i].value;
    }
    return rows.sort((a, b) => a.index - b.index).map(x => x.rank);
  }
  function resolveTies(rows, tieBreakers = [], decisions = []) {
    const sorted = [...rows].sort((a,b)=>a.value==null?1:b.value==null?-1:b.value-a.value);
    const result=[];let place=1;
    for(let i=0;i<sorted.length;){
      if(sorted[i].value==null){result.push({...sorted[i],place:null,tieReason:null});i++;continue;}
      let end=i+1;while(end<sorted.length&&sameScore(sorted[i].value,sorted[end].value))end++;
      const group=sorted.slice(i,end);
      let reason=null, signatures=[];
      if(group.length>1&&group.every(row=>row.complete)){
        const decision=decisions.find(item=>group.every(row=>item.contestantIds?.includes(row.contestant.id)));
        for(const rule of tieBreakers){
          if(rule.type==='category')signatures.push(row=>Number(row.categoryScores?.[rule.categoryId]??row.categoryValues?.[rule.categoryId]??0));
          else if(rule.type==='firsts')signatures.push(row=>Number(row.firstPlaceRanks||0));
          else if(rule.type==='rankSum')signatures.push(row=>-Number(row.judgeRankSum||0));
        }
        if(decision){const order=new Map((decision.order||[]).map((id,index)=>[id,index]));signatures.push(row=>-(order.get(row.contestant.id)??Infinity));}
        const metric=row=>signatures.map(get=>get(row));
        group.sort((a,b)=>{const av=metric(a),bv=metric(b);for(let k=0;k<av.length;k++){if(!sameScore(av[k],bv[k]))return bv[k]-av[k];}return 0;});
        if(group.length>1&&signatures.length&&group.some((row,index)=>index>0&&metric(row).some((value,k)=>!sameScore(value,metric(group[index-1])[k])))){
          const ruleIndex=signatures.findIndex(get=>group.some((row,index)=>index>0&&!sameScore(get(row),get(group[index-1]))));
          const rule=tieBreakers[ruleIndex];reason=rule?rule.name||(rule.type==='category'?'category score':rule.type==='firsts'?'first-place judge ranks':'judge rank sum'):'committee decision';
        }
      }
      if(reason){
        const metric=row=>signatures.map(get=>get(row));
        const sameMetric=(a,b)=>signatures.every(get=>sameScore(get(a),get(b)));
        for(let start=0;start<group.length;){
          let finish=start+1;while(finish<group.length&&sameMetric(group[start],group[finish]))finish++;
          const subGroup=group.slice(start,finish), resolved=subGroup.length===1;
          let why=null;
          if(resolved){
            const neighbor=start>0?group[start-1]:group[finish];
            const index=signatures.findIndex(get=>!sameScore(get(subGroup[0]),get(neighbor)));
            const rule=tieBreakers[index];why=rule?rule.name||(rule.type==='category'?'category score':rule.type==='firsts'?'first-place judge ranks':'judge rank sum'):'committee decision';
          }
          subGroup.forEach(row=>result.push({...row,place:place+start,tieReason:why}));
          start=finish;
        }
      }else group.forEach(row=>result.push({...row,place,tieReason:null}));
      place+=group.length;i=end;
    }
    return result;
  }
  function csvCell(value) {
    let text = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }
  function toCSV(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }

  return { ID_PATTERN, blankState, normalize, scoreKey, round2, sameScore, evenWeights, nextCriterion, validWeights, criterionScore, categoryJudgeScore, categoryScore, roundScore, assignPlaces, cutoff, judgeRanks, resolveTies, csvCell, toCSV };
});
