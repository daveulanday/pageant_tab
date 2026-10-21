(() => {
  'use strict';
  const KEY = 'pageant-score-tabulation-v1';
  const Scoring = globalThis.PageantScoring;
  const blankState = () => Scoring.blankState();
  let lastNormalizeReport = {migrated:false,dropped:0,remapped:0};
  let state = loadState();
  let activeView = 'overview';
  let resultTab = 'overall';
  let editContext = null;
  let setupWizardDraft = null;
  const scoreDrafts = new Map();
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  function loadState(){try{const parsed=JSON.parse(localStorage.getItem(KEY));return normalize(parsed)}catch{return blankState()}}
  function normalize(s){const result=Scoring.normalize(s);lastNormalizeReport=result.report;return result.state}
  function persist(){try{localStorage.setItem(KEY,JSON.stringify(state));$('.storage-indicator strong').textContent='Saved on this device';return true}catch{$('.storage-indicator strong').textContent='Could not save — storage full';return false}}
  function toast(message, kind='success', details=[]){const el=document.createElement('div');el.setAttribute('role',kind==='error'?'alert':'status');el.className=`toast ${kind==='error'?'error':''}`;el.innerHTML=`${escapeHTML(message)}${details.length?`<ul class="toast-list">${details.slice(0,5).map(x=>`<li>${escapeHTML(x)}</li>`).join('')}</ul>`:''}`;$('#toast-region').append(el);setTimeout(()=>el.remove(),kind==='error'?8000:3500)}
  function showView(name){if(name==='settings'){fillEventForm()}else if(!$('#view-'+name))name='overview';activeView=name;$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('#crumb-title').textContent=({overview:'Overview',contestants:'Contestants',judges:'Judges',categories:'Categories',scores:'Score entry',results:'Results',settings:'Event setup'})[name]||'Overview';$('.sidebar').classList.remove('open');if(name==='scores')renderScores();if(name==='results')renderResults();if(name==='categories')renderCategories();if(name==='contestants')renderContestants();if(name==='judges')renderJudges();if(name==='overview')renderOverview();window.scrollTo({top:0,behavior:'smooth'})}
  function countExpected(){return state.contestants.length*state.judges.length*state.categories.reduce((n,c)=>n+c.criteria.length,0)}
  function scoreKey(ci,ji,cat,crit){return Scoring.scoreKey(ci,ji,cat,crit)}
  function scoreValue(ci,ji,cat,crit){const v=state.scores[scoreKey(ci,ji,cat,crit)];return v===undefined||v===null||v===''?null:Number(v)}
  function criteriaWeightsValid(category){return Scoring.validWeights(category.criteria)}
  function categoryWeightsValid(roundId=state.rounds[0]?.id){return Scoring.validWeights(state.categories.filter(cat=>cat.roundId===roundId))}
  function categoryReady(contestant,category){return state.judges.length>0&&criteriaWeightsValid(category)&&state.judges.every(j=>category.criteria.every(cr=>scoreValue(contestant.id,j.id,category.id,cr.id)!==null))}
  function categoryJudgeScore(contestant,judge,category){return Scoring.categoryJudgeScore(state.scores,contestant,judge,category)}
  function categoryResult(category){return Scoring.categoryScore(state.scores,state.contestants,state.judges,category)}
  function roundBlocked(roundIndex){return roundIndex>0&&state.rounds.slice(0,roundIndex).some(round=>!round.finalizedAt)}
  function cutoffSelection(rows,advanceCount){
    const result=Scoring.cutoff(rows,advanceCount);
    if(advanceCount==null||!result.warning)return {...result,fixedIds:result.advancing,candidateIds:result.advancing,chooseCount:0};
    const ranked=assignPlaces(rows),boundary=ranked[Number(advanceCount)-1];
    if(!boundary||boundary.value==null)return {...result,fixedIds:[],candidateIds:result.advancing,chooseCount:Number(advanceCount)};
    const fixedIds=ranked.filter(row=>row.value!=null&&row.place<boundary.place).map(row=>row.contestant.id);
    const tiedIds=ranked.filter(row=>row.value!=null&&row.place===boundary.place).map(row=>row.contestant.id);
    return {...result,fixedIds,candidateIds:[...fixedIds,...tiedIds],chooseCount:Math.max(0,Number(advanceCount)-fixedIds.length)};
  }
  function validAdvancementSelection(selection,ids,advanceCount){
    if(!Array.isArray(ids)||ids.length!==Number(advanceCount)||new Set(ids).size!==ids.length)return false;
    const allowed=new Set(selection.candidateIds);
    return selection.fixedIds.every(id=>ids.includes(id))&&ids.every(id=>allowed.has(id));
  }
  function contestantsForRound(roundIndex){if(roundIndex<=0)return [...state.contestants];if(roundBlocked(roundIndex))return [];const prior=state.rounds[roundIndex-1];if(Array.isArray(prior.advancingIds))return state.contestants.filter(c=>prior.advancingIds.includes(c.id));const rows=roundResult(prior.id);const rule=Scoring.cutoff(rows,prior.advanceCount);return state.contestants.filter(c=>rule.advancing.includes(c.id))}
  function roundResult(roundId){const index=state.rounds.findIndex(r=>r.id===roundId);const round=state.rounds[index];if(!round)return [];const people=contestantsForRound(index);return Scoring.roundScore(state.scores,people,state.judges,state.categories,round)}
  function overallResult(){return roundResult(state.rounds[0]?.id)}
  function criterionProgressValue(contestant,category,criterion){const values=state.judges.map(j=>scoreValue(contestant.id,j.id,category.id,criterion.id)).filter(value=>value!==null);if(!values.length)return null;return values.reduce((sum,value)=>sum+value,0)/values.length*Number(criterion.weight||0)/100}
  function categoryProgressValue(contestant,category){const points=category.criteria.map(criterion=>criterionProgressValue(contestant,category,criterion)).filter(value=>value!==null);return points.length?points.reduce((sum,value)=>sum+value,0):null}
  function categoryProgressResult(category){return state.contestants.map(contestant=>({contestant,value:categoryProgressValue(contestant,category),complete:categoryReady(contestant,category)})).sort((a,b)=>a.value===null?1:b.value===null?-1:b.value-a.value)}
  function overallProgressResult(){return state.contestants.map(contestant=>{const values=state.categories.map(category=>({value:categoryProgressValue(contestant,category),weight:Number(category.weight||0)})).filter(x=>x.value!==null);const value=values.length?values.reduce((sum,item)=>sum+item.value*item.weight/100,0):null;return {contestant,value,complete:categoryWeightsValid()&&state.categories.every(category=>categoryReady(contestant,category))}}).sort((a,b)=>a.value===null?1:b.value===null?-1:b.value-a.value)}
  function assignPlaces(rows){return Scoring.assignPlaces(rows)}
  function countScored(){let done=0;for(const c of state.contestants)for(const j of state.judges)for(const cat of state.categories)for(const cr of cat.criteria)if(scoreValue(c.id,j.id,cat.id,cr.id)!==null)done++;return done}
  function completion(){const expected=countExpected();return expected?Math.round(countScored()/expected*100):0}
  function fmtDate(value){if(!value)return '';const d=new Date(`${value}T00:00:00`);return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat(undefined,{dateStyle:'medium'}).format(d)}
  function renderAll(){renderSidebar();renderOverview();renderContestants();renderJudges();renderCategories();renderScores();renderResults();fillEventForm()}
  function renderSidebar(){$('#sidebar-event').textContent=state.event.name||'New Pageant';$('#contestant-count').textContent=state.contestants.length;$('#judge-count').textContent=state.judges.length;$('#banner-event').textContent=state.event.name||'New Pageant';$('#banner-meta').textContent=[fmtDate(state.event.date),state.event.location].filter(Boolean).join(' / ')||'Add event details to get started';$('#welcome-title').textContent=state.event.name&&state.event.name!=='New Pageant'?state.event.name:'Event overview'}
  function ordinal(n){if(!n)return '—';const mod=n%100;if(mod>=11&&mod<=13)return `${n}th`;return `${n}${({1:'st',2:'nd',3:'rd'})[n%10]||'th'}`}
  function renderContestants(){const q=($('#contestant-search')?.value||'').toLowerCase();const rows=state.contestants.filter(c=>`${c.number} ${c.name}`.toLowerCase().includes(q));$('#contestant-total').textContent=`${rows.length} contestant${rows.length===1?'':'s'}`;$('#contestant-empty').classList.toggle('show',state.contestants.length===0);$('#contestant-table').innerHTML=rows.map(c=>`<tr><td class="entry-number">${escapeHTML(c.number)}</td><td><div class="person-cell"><strong>${escapeHTML(c.name)}</strong></div></td><td><span class="status-chip ${state.categories.length&&state.judges.length&&state.categories.every(cat=>categoryReady(c,cat))?'complete':''}">${state.categories.length&&state.judges.length&&state.categories.every(cat=>categoryReady(c,cat))?'Scored':'Awaiting scores'}</span></td><td class="row-actions"><button data-edit="contestant" data-id="${escapeHTML(c.id)}">Edit</button><button class="delete" data-delete="contestant" data-id="${escapeHTML(c.id)}">Remove</button></td></tr>`).join('')}
  function renderJudges(){const q=($('#judge-search')?.value||'').toLowerCase();const rows=state.judges.filter(j=>j.name.toLowerCase().includes(q));$('#judge-total').textContent=`${rows.length} judge${rows.length===1?'':'s'}`;$('#judge-empty').classList.toggle('show',state.judges.length===0);$('#judge-table').innerHTML=rows.map(j=>{let entered=0;for(const c of state.contestants)for(const cat of state.categories)for(const cr of cat.criteria)if(scoreValue(c.id,j.id,cat.id,cr.id)!==null)entered++;const total=state.contestants.length*state.categories.reduce((n,cat)=>n+cat.criteria.length,0);return `<tr><td><div class="person-cell"><strong>${escapeHTML(j.name)}</strong></div></td><td>${entered} / ${total}</td><td class="row-actions"><button data-edit="judge" data-id="${escapeHTML(j.id)}">Edit</button><button class="delete" data-delete="judge" data-id="${escapeHTML(j.id)}">Remove</button></td></tr>`}).join('')}
  function renderCategories(){const sum=state.categories.reduce((n,c)=>n+Number(c.weight||0),0);const valid=Math.abs(sum-100)<.01;$('#weight-summary').innerHTML=state.categories.length?`Category weights total <strong class="${valid?'':'weight-warning'}">${sum.toFixed(1)}%</strong>. ${valid?'The overall weighting is ready.':'Adjust category weights to total 100%.'}`:'Set category weights that add up to 100% to complete the overall score formula.';$('#category-empty').classList.toggle('show',state.categories.length===0);$('#category-list').innerHTML=state.categories.map(cat=>{const cs=cat.criteria.reduce((n,x)=>n+Number(x.weight||0),0);return `<article class="panel category-card"><div class="category-head"><div class="category-main"><div class="category-title-row"><h3>${escapeHTML(cat.name)}</h3><span class="weight-badge">${Number(cat.weight||0)}% overall</span></div><p>${cat.criteria.length} scoring criteria</p></div><div class="category-actions"><button data-edit="category" data-id="${escapeHTML(cat.id)}">Edit</button><button class="delete" data-delete="category" data-id="${escapeHTML(cat.id)}">Remove</button></div></div><div class="criteria-list">${cat.criteria.map(cr=>`<div class="criterion-row"><span>${escapeHTML(cr.name)}</span><b>${Number(cr.weight||0)}% of category</b><button class="text-button" data-edit-criterion="${escapeHTML(cat.id)}" data-id="${escapeHTML(cr.id)}">Edit</button><button class="text-button" data-delete-criterion="${escapeHTML(cat.id)}" data-id="${escapeHTML(cr.id)}">Remove</button></div>`).join('')||'<div class="criterion-row"><span>No criteria added yet</span></div>'}</div><div class="category-footer"><button data-add-criterion="${escapeHTML(cat.id)}">Add criterion</button><span class="muted ${Math.abs(cs-100)<.01?'':'weight-warning'}">Criteria total: ${cs.toFixed(1)}%</span></div></article>`}).join('')}
  function scoreSelectors(){const select=$('#score-category');const old=select.value;select.innerHTML=state.categories.map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');if(state.categories.some(c=>c.id===old))select.value=old;const judge=$('#score-judge');const oldJ=judge.value;judge.innerHTML=state.judges.map(j=>`<option value="${escapeHTML(j.id)}">${escapeHTML(j.name)}</option>`).join('');if(state.judges.some(j=>j.id===oldJ))judge.value=oldJ}
  function scoreDraftValue(contestant,judge,category,criterion){const key=scoreKey(contestant,judge,category,criterion);return scoreDrafts.has(key)?scoreDrafts.get(key):scoreValue(contestant,judge,category,criterion)}
  function renderScores(){scoreSelectors();const cat=state.categories.find(x=>x.id===$('#score-category').value),judge=state.judges.find(x=>x.id===$('#score-judge').value);const root=$('#score-grid');if(!state.contestants.length||!state.judges.length||!cat){root.innerHTML=`<div class="panel score-empty">${!state.contestants.length?'Add contestants':!state.judges.length?'Add judges':'Add categories and criteria'} to begin score entry.</div>`;$('#submit-scores').disabled=true;return}if(!cat.criteria.length){root.innerHTML='<div class="panel score-empty">Add criteria to this category before entering scores.</div>';$('#submit-scores').disabled=true;return}$('#submit-scores').disabled=false;const criteria=cat.criteria.map(cr=>`<th scope="col">${escapeHTML(cr.name)}<small>${Number(cr.weight||0)}% of category</small></th>`).join('');root.innerHTML=`<div class="score-table-wrap"><table class="score-table"><thead><tr><th scope="col">Contestant</th>${criteria}<th scope="col">Status</th></tr></thead><tbody>${state.contestants.map(c=>{const values=cat.criteria.map(cr=>scoreDraftValue(c.id,judge.id,cat.id,cr.id));const complete=values.every(v=>v!==null&&v!=='');const pending=cat.criteria.some(cr=>scoreDrafts.has(scoreKey(c.id,judge.id,cat.id,cr.id)));return `<tr><th scope="row"><div class="score-person"><span class="candidate-number">${escapeHTML(c.number)}</span><strong>${escapeHTML(c.name)}</strong></div></th>${cat.criteria.map(cr=>{const value=scoreDraftValue(c.id,judge.id,cat.id,cr.id);return `<td><label class="table-score-wrap"><span class="sr-only">${escapeHTML(cr.name)} score for ${escapeHTML(c.name)}</span><input type="number" inputmode="decimal" min="0" max="100" step="0.01" aria-label="${escapeHTML(cr.name)} score for ${escapeHTML(c.name)}" data-score-contestant="${escapeHTML(c.id)}" data-score-judge="${escapeHTML(judge.id)}" data-score-category="${escapeHTML(cat.id)}" data-score-criterion="${escapeHTML(cr.id)}" value="${value===null?'':escapeHTML(value)}" placeholder="—"><small class="score-error hidden">Use a score from 0 to 100.</small></label></td>`}).join('')}<td><span class="status-chip ${complete?'complete':''}">${pending?'Unsaved':complete?'Saved':'Needs scores'}</span></td></tr>`}).join('')}</tbody></table></div>`;updateScoreDraftMessage()}
  function updateScoreDraftMessage(){const count=[...scoreDrafts.keys()].filter(key=>{const p=key.split('|');return p[1]===$('#score-judge').value&&p[2]===$('#score-category').value}).length;$('#score-save-message').textContent=count?`${count} score field${count===1?' has':'s have'} unsaved changes. Choose Save scores to store them.`:'Enter scores from 0 to 100, then choose Save scores.'}
  function stageScore(input){
    const key=scoreKey(input.dataset.scoreContestant,input.dataset.scoreJudge,input.dataset.scoreCategory,input.dataset.scoreCriterion);
    scoreDrafts.set(key,input.value.trim());
    input.classList.remove('invalid');input.removeAttribute('aria-invalid');
    input.parentElement.querySelector('.score-error').classList.add('hidden');
    updateScoreDraftMessage();
  }
  function submitScores(){
    const category=$('#score-category').value,judge=$('#score-judge').value;
    const inputs=$$('[data-score-criterion]').filter(input=>input.dataset.scoreCategory===category&&input.dataset.scoreJudge===judge);
    if(!inputs.length){toast('Choose a category and judge before submitting scores.','error');return}
    const invalid=[];
    for(const input of inputs){const raw=input.value.trim();if(raw!==''&&!validScore(Number(raw))){input.classList.add('invalid');input.parentElement.querySelector('.score-error').classList.remove('hidden');invalid.push(input)}}
    if(invalid.length){invalid[0].focus();toast('Scores must be between 0 and 100.','error');return}
    const entered=inputs.filter(input=>input.value.trim()!=='');
    if(!entered.length){toast('Enter at least one score before submitting.','error');return}
    for(const input of inputs){const key=scoreKey(input.dataset.scoreContestant,judge,category,input.dataset.scoreCriterion);const raw=input.value.trim();if(raw==='')delete state.scores[key];else state.scores[key]=Number(raw);scoreDrafts.delete(key)}
    if(!persist()){toast('Scores could not be saved on this device. Free up storage and submit again.','error');renderScores();return}
    resultTab='overall';renderAll();showView('results');
    toast('Scores saved. Results updated; rankings remain provisional until all judges finish.');
    $('#score-save-message').textContent='Scores saved.'
  }
  function renderResultsChart(overall,category){const rows=(overall?overallProgressResult():category?categoryProgressResult(category):[]).filter(r=>r.value!==null);$('#chart-title').textContent=overall?'Overall score progress':`${category?.name||'Category'} score progress`;const root=$('#results-chart');root.innerHTML=rows.length?rows.map(r=>{const width=Math.max(0,Math.min(100,r.value));return `<div class="result-chart-row"><div class="result-chart-person"><span class="candidate-number">${escapeHTML(r.contestant.number)}</span><strong>${escapeHTML(r.contestant.name)}</strong><small>${r.complete?'Complete':'In progress'}</small></div><div class="result-chart-track" role="progressbar" aria-label="${escapeHTML(r.contestant.name)} current score" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${r.value.toFixed(2)}"><span style="width:${width}%"></span></div><strong class="result-chart-value">${r.value.toFixed(2)}</strong></div>`}).join(''):'<p class="chart-empty">Save scores to see current contestant totals.</p>'}
  function renderCategoryWinners(){const root=$('#category-winners');root.innerHTML=state.categories.length?state.categories.map(category=>{const finalRows=categoryResult(category);const final=state.contestants.length>0&&finalRows.every(row=>row.complete&&row.value!==null);const rows=final?finalRows:categoryProgressResult(category).filter(row=>row.value!==null);const leaders=rows.length?rows.filter(row=>Scoring.sameScore(row.value,rows[0].value)):[];return `<article class="winner-card ${leaders.length?'has-winner':''} ${leaders.length>1?'is-tied':''}"><div class="winner-card-top"><span class="winner-category">${escapeHTML(category.name)}</span></div>${leaders.length?`<div class="winner-names">${leaders.map(row=>`<strong>${escapeHTML(row.contestant.name)}</strong><small>Entry ${escapeHTML(row.contestant.number)}</small>`).join('')}</div><div class="winner-score">${leaders[0].value.toFixed(2)} <small>${final?'points':'partial points'}</small></div><span class="winner-caption">${final?(leaders.length>1?'Tied category winners':'Category winner'):(leaders.length>1?'Provisional tie':'Provisional leader')}</span>`:`<p class="winner-pending">${category.criteria.length?'No submitted scores yet':'Add criteria to begin scoring'}</p>`}</article>`}).join(''):'<p class="winner-pending">Create a category to see its winner here.</p>'}
  function renderResults(){
    const ranked=overallResult().filter(row=>row.complete).length;
    $('#results-summary').innerHTML=`<div class="summary-card"><span>Contestants ranked</span><strong>${ranked} / ${state.contestants.length}</strong></div><div class="summary-card"><span>Score completion</span><strong>${completion()}%</strong><small>${countScored()} of ${countExpected()} score fields saved</small></div><div class="summary-card"><span>Categories</span><strong>${state.categories.length}</strong></div>`;
    renderCategoryWinners();
    const tabs=[{id:'overall',name:'Overall'},...state.categories.map(category=>({id:category.id,name:category.name}))];
    if(!tabs.some(tab=>tab.id===resultTab))resultTab='overall';
    $('#results-tabs').innerHTML=tabs.map(tab=>`<button class="results-tab ${tab.id===resultTab?'active':''}" data-result-tab="${escapeHTML(tab.id)}">${escapeHTML(tab.name)}</button>`).join('');
    const overall=resultTab==='overall';
    const category=state.categories.find(item=>item.id===resultTab);
    $('#chart-title').textContent=overall?'Overall score progress':`${category?.name||'Category'} score progress`;
    $('#results-kicker').textContent=overall?'Overall tabulation':'Category tabulation';
    $('#results-title').textContent=overall?'Overall results':`${category?.name||''} results`;
    $('#results-subtitle').textContent=overall?'Weighted category points':'Weighted criterion points';
    const rows=assignPlaces(overall?overallProgressResult():category?categoryProgressResult(category):[]);
    $('#results-head').innerHTML=overall
      ?`<tr><th>Contestant</th><th>Rank</th>${state.categories.map(item=>`<th>${escapeHTML(item.name)}<small>${Number(item.weight||0)}% overall</small></th>`).join('')}<th>Final score</th><th>Status</th></tr>`
      :`<tr><th>Contestant</th><th>Rank</th>${(category?.criteria||[]).map(item=>`<th>${escapeHTML(item.name)}<small>${Number(item.weight||0)}% of category</small></th>`).join('')}<th>Final score</th><th>Status</th></tr>`;
    $('#results-body').innerHTML=rows.map(row=>{
      const status=row.complete?'Complete':row.value===null?'Awaiting scores':'Scores submitted';
      const categoryCells=overall?state.categories.map(item=>{const score=categoryProgressValue(row.contestant,item);return `<td class="score-cell">${score===null?'—':(score*Number(item.weight||0)/100).toFixed(2)}</td>`}).join(''):(category?.criteria||[]).map(item=>{const score=criterionProgressValue(row.contestant,category,item);return `<td class="score-cell">${score===null?'—':score.toFixed(2)}</td>`}).join('');
      const tied=row.value!==null&&rows.some(other=>other!==row&&Scoring.sameScore(other.value,row.value));
      const rank=row.place===null?'—':`${ordinal(row.place)}${row.complete?'':'*'}${tied?' tied':''}`;
      return `<tr><th scope="row"><div class="result-person"><span class="candidate-number">${escapeHTML(row.contestant.number)}</span><strong>${escapeHTML(row.contestant.name)}</strong></div></th><td class="place-cell ${tied?'tie':''}">${rank}</td>${categoryCells}<td class="score-cell">${row.value===null?'—':row.value.toFixed(2)}</td><td class="${row.complete?'':'results-status'}">${status}</td></tr>`
    }).join('');
    $('#results-empty').classList.toggle('show',!state.contestants.length);
    renderResultsChart(overall,category);
  }
  function fillEventForm(){const form=$('#event-form');if(!form)return;form.elements.name.value=state.event.name||'';form.elements.date.value=state.event.date||'';form.elements.location.value=state.event.location||''}
  function openModal(title,fields,context){
    editContext=context;
    $('#modal-error').hidden=true;$('#modal-error').textContent='';
    $('#modal-title').textContent=title;
    $('#modal-eyebrow').textContent=context.type==='criterion'?'Category criterion':context.type[0].toUpperCase()+context.type.slice(1);
    $('#modal-fields').innerHTML=fields;
    $('#edit-dialog').showModal();
  }
  function field(label,name,value='',type='text',placeholder='',extra=''){
    return `<label>${escapeHTML(label)}<input name="${escapeHTML(name)}" type="${escapeHTML(type)}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}" ${extra}></label>`;
  }
  function categoryCriterionRow(criterion={}){
    const removeLabel=criterion.name?`Remove ${criterion.name}`:'Remove criterion';
    return `<div class="category-criterion-entry" data-category-criterion-row data-criterion-id="${escapeHTML(criterion.id||'')}"><label>Criterion name<input name="criterionName" type="text" value="${escapeHTML(criterion.name||'')}" placeholder="e.g. Confidence" maxlength="80"></label><label>Weight within category (%)<input name="criterionWeight" type="number" value="${escapeHTML(criterion.weight??'')}" placeholder="e.g. 50" min="0" max="100" step="0.1"></label><button class="text-button category-criterion-remove" type="button" data-remove-category-criterion aria-label="${escapeHTML(removeLabel)}">Remove</button></div>`;
  }
  function categoryCriteriaEditor(criteria=[]){
    const rows=criteria.length?criteria.map(categoryCriterionRow).join(''):categoryCriterionRow();
    return `<fieldset class="category-criteria-editor"><legend>Scoring criteria</legend><p>Enter criteria and their share of this category here, together with the category details.</p><div class="category-criterion-list" id="category-criterion-list">${rows}</div><button class="text-button category-criterion-add" type="button" data-add-category-criterion>Add another criterion</button></fieldset>`;
  }
  function openEntityLegacy(type,record={}){const editing=Boolean(record.id);if(type==='contestant')openModal(editing?'Edit contestant':'Add contestant',field('Contestant number','number',record.number||'','text','e.g. 01','required maxlength="20"')+field('Full name','name',record.name||'','text','Contestant name','required maxlength="100"'),{type,id:record.id});if(type==='judge')openModal(editing?'Edit judge':'Add judge',field('Full name','name',record.name||'','text','Judge name','required maxlength="100"'),{type,id:record.id});if(type==='category')openModal(editing?'Edit category':'Add category',field('Category name','name',record.name||'','text','e.g. Evening wear','required maxlength="80"')+field('Overall weight (%)','weight',record.weight??'','number','e.g. 40','required min="0" max="100" step="0.1"')+categoryCriteriaEditor(record.criteria||[]),{type,id:record.id});if(type==='criterion'){const cat=state.categories.find(c=>c.id===record.categoryId);const criterion=cat?.criteria.find(c=>c.id===record.id);openModal(criterion?'Edit criterion':'Add criterion',field('Criterion name','name',criterion?.name||'','text','e.g. Confidence','required maxlength="80"')+field('Weight within category (%)','weight',criterion?.weight??'','number','e.g. 50','required min="0" max="100" step="0.1"'),{type,categoryId:record.categoryId,id:record.id})}}
  function saveEntityLegacy(e){e.preventDefault();if(!editContext)return;const form=new FormData(e.currentTarget);const get=k=>String(form.get(k)||'').trim();const ctx=editContext;if(ctx.type==='contestant'){const number=get('number');if(state.contestants.some(x=>x.number.toLowerCase()===number.toLowerCase()&&x.id!==ctx.id)){toast('That contestant number is already in use.','error');return}const rec={id:ctx.id||id('contestant'),number,name:get('name')};upsert(state.contestants,rec)}else if(ctx.type==='judge'){const rec={id:ctx.id||id('judge'),name:get('name')};upsert(state.judges,rec)}else if(ctx.type==='category'){const w=Number(get('weight'));if(!validScore(w)){toast('Category weight must be between 0 and 100.','error');return}const existing=ctx.id?state.categories.find(x=>x.id===ctx.id):null;const categoryId=ctx.id||id('category');const criteria=[];for(const row of e.currentTarget.querySelectorAll('[data-category-criterion-row]')){const name=row.querySelector('[name="criterionName"]').value.trim();const rawWeight=row.querySelector('[name="criterionWeight"]').value.trim();const criterionId=row.dataset.criterionId;if(!name&&!rawWeight&&!criterionId)continue;if(!name||rawWeight===''){toast('Enter both a criterion name and weight, or remove that criterion.','error');return}const criterionWeight=Number(rawWeight);if(!validScore(criterionWeight)){toast('Each criterion weight must be between 0 and 100.','error');return}criteria.push({id:criterionId||id('criterion'),name,weight:criterionWeight})}for(const old of existing?.criteria||[]){if(!criteria.some(cr=>cr.id===old.id))deleteScoreParts(3,old.id,categoryId)}const rec={id:categoryId,name:get('name'),weight:w,criteria};upsert(state.categories,rec)}else if(ctx.type==='criterion'){const cat=state.categories.find(c=>c.id===ctx.categoryId);if(!cat)return;const w=Number(get('weight'));if(!validScore(w)){toast('Criterion weight must be between 0 and 100.','error');return}const rec={id:ctx.id||id('criterion'),name:get('name'),weight:w};upsert(cat.criteria,rec)}$('#edit-dialog').close();editContext=null;persist();renderAll();toast('Changes saved.')}
  function upsert(arr,record){const i=arr.findIndex(x=>x.id===record.id);if(i<0)arr.push(record);else arr[i]={...arr[i],...record}}
  function validScore(n){return Number.isFinite(n)&&n>=0&&n<=100}
  function removeRecord(type,recordId,categoryId){if(!confirm(`Remove this ${type}? Related scores will also be removed.`))return;if(type==='contestant'){state.contestants=state.contestants.filter(x=>x.id!==recordId);deleteScoreParts(0,recordId)}else if(type==='judge'){state.judges=state.judges.filter(x=>x.id!==recordId);deleteScoreParts(1,recordId)}else if(type==='category'){state.categories=state.categories.filter(x=>x.id!==recordId);deleteScoreParts(2,recordId)}else if(type==='criterion'){const cat=state.categories.find(c=>c.id===categoryId);if(cat)cat.criteria=cat.criteria.filter(x=>x.id!==recordId);deleteScoreParts(3,recordId,categoryId)}persist();renderAll();toast(`${type[0].toUpperCase()+type.slice(1)} removed.`)}
  function deleteScoreParts(kind,value,catId){for(const key of Object.keys(state.scores)){const p=key.split('|');if(kind===0&&p[0]===value||kind===1&&p[1]===value||kind===2&&p[2]===value||kind===3&&p[2]===catId&&p[3]===value)delete state.scores[key]}for(const key of scoreDrafts.keys()){const p=key.split('|');if(kind===0&&p[0]===value||kind===1&&p[1]===value||kind===2&&p[2]===value||kind===3&&p[2]===catId&&p[3]===value)scoreDrafts.delete(key)}}
  function download(filename,content,type){const blob=new Blob([content],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function exportBackup(){download('pageant-backup.json',JSON.stringify(state,null,2),'application/json')}
  function importBackup(file){const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));if(!parsed||typeof parsed!=='object'||!parsed.event||!Array.isArray(parsed.contestants)||!Array.isArray(parsed.judges)||!Array.isArray(parsed.categories)||!parsed.scores)throw new Error('This does not look like a Pageant backup.');if(!confirm('Restore this backup? The current event saved in this browser will be replaced.'))return;state=normalize(parsed);persist();resultTab='overall';renderAll();$('#backup-dialog').close();showView('overview');toast('Backup restored.')}catch(e){toast(e.message||'Could not restore backup.','error')}$('#json-file').value=''};reader.onerror=()=>toast('Could not read this backup file.','error');reader.readAsText(file)}
  function saveEvent(e){e.preventDefault();const f=e.currentTarget;state.event={name:f.elements.name.value.trim(),date:f.elements.date.value,location:f.elements.location.value.trim()};persist();renderAll();showView('overview');toast('Event details saved.')}
  function resetContest(){if(!confirm('Start a new contest? This clears the current event name, date, location, contestants, judges, categories, and all scores from this device. Download a JSON backup first if you want to keep this event.'))return;state=blankState();scoreDrafts.clear();resultTab='overall';persist();renderAll();showView('overview');toast('All contest fields have been reset.')}
  $('#modal-fields').addEventListener('click',e=>{if(e.target.closest('[data-add-category-criterion]')){$('#category-criterion-list')?.insertAdjacentHTML('beforeend',categoryCriterionRow());return}const remove=e.target.closest('[data-remove-category-criterion]');if(remove)remove.closest('[data-category-criterion-row]')?.remove()});
  document.addEventListener('click',e=>{const nav=e.target.closest('[data-view]');if(nav){showView(nav.dataset.view);return}const go=e.target.closest('[data-go]');if(go){if(go.closest('#help-dialog'))$('#help-dialog').close();showView(go.dataset.go);return}if(e.target.closest('[data-guide-backup]')){$('#help-dialog').close();$('#backup-dialog').showModal();return}const action=e.target.closest('[data-action]');if(action){if(action.dataset.action==='add-contestant')openEntity('contestant');if(action.dataset.action==='add-judge')openEntity('judge');if(action.dataset.action==='add-category')openEntity('category');return}const addCr=e.target.closest('[data-add-criterion]');if(addCr){openEntity('criterion',{categoryId:addCr.dataset.addCriterion});return}const editCr=e.target.closest('[data-edit-criterion]');if(editCr){openEntity('criterion',{categoryId:editCr.dataset.editCriterion,id:editCr.dataset.id});return}const delCr=e.target.closest('[data-delete-criterion]');if(delCr){removeRecord('criterion',delCr.dataset.id,delCr.dataset.deleteCriterion);return}const edit=e.target.closest('[data-edit]');if(edit){const type=edit.dataset.edit,record=type==='category'?state.categories.find(x=>x.id===edit.dataset.id):state[`${type}s`].find(x=>x.id===edit.dataset.id);if(record)openEntity(type,record);return}const del=e.target.closest('[data-delete]');if(del){removeRecord(del.dataset.delete,del.dataset.id);return}const tab=e.target.closest('[data-result-tab]');if(tab){resultTab=tab.dataset.resultTab;renderResults();return}});
  document.addEventListener('input',e=>{if(e.target.matches('[data-score-criterion]'))stageScore(e.target);if(e.target.id==='contestant-search')renderContestants();if(e.target.id==='judge-search')renderJudges()});
  $('#add-contestant').addEventListener('click',()=>openEntity('contestant'));$('#add-judge').addEventListener('click',()=>openEntity('judge'));$('#add-category').addEventListener('click',()=>openEntity('category'));$('#edit-form').addEventListener('submit',saveEntity);$('#modal-cancel').addEventListener('click',()=>$('#edit-dialog').close());$('#score-category').addEventListener('change',renderScores);$('#score-judge').addEventListener('change',renderScores);$('#submit-scores').addEventListener('click',()=>submitScores());$('#save-next-scores')?.addEventListener('click',()=>submitScores(true));$('#start-new-contest').addEventListener('click',resetContest);$('#sidebar-reset-button')?.addEventListener('click',resetContest);$('#event-form').addEventListener('submit',saveEvent);$('#backup-button').addEventListener('click',()=>$('#backup-dialog').showModal());$('#backup-export').addEventListener('click',exportBackup);$('#backup-import').addEventListener('click',()=>$('#json-file').click());$('#json-file').addEventListener('change',e=>e.target.files[0]&&importBackup(e.target.files[0]));$('#help-button').addEventListener('click',()=>$('#help-dialog').showModal());$('#mobile-menu').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));document.addEventListener('click',e=>{if(innerWidth<=760&&!e.target.closest('.sidebar')&&!e.target.closest('#mobile-menu'))$('.sidebar').classList.remove('open')});
  const roundValue = () => $('#score-round')?.value || state.rounds[0]?.id || '';
  const selectedRound = () => state.rounds.find(round => round.id === ($('#results-round')?.value || state.rounds[0]?.id)) || state.rounds[0];
  let activeUnresolvedTies=[];
  const numericContestants = rows => [...rows].sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true, sensitivity: 'base' }));
  function roundResult(roundId){
    const index=state.rounds.findIndex(r=>r.id===roundId), round=state.rounds[index]; if(!round)return [];
    const people=contestantsForRound(index), categories=state.categories.filter(c=>c.roundId===round.id);
    let rows=Scoring.roundScore(state.scores,people,state.judges,state.categories,round);
    const judgeValues=state.judges.map(judge=>people.map(person=>{
      const scores=categories.map(cat=>Scoring.categoryJudgeScore(state.scores,person,judge,cat));
      if(scores.some(value=>value==null))return null;
      return scores.reduce((sum,value,i)=>sum+value*Number(categories[i].weight||0)/100,0);
    }));
    const ranks=judgeValues.map(values=>Scoring.judgeRanks(values.map(value=>value??-Infinity)));
    rows=rows.map(row=>{
      if(!row.complete)return row;
      const personIndex=people.findIndex(p=>p.id===row.contestant.id), contestantRanks=ranks.map(values=>values[personIndex]);
      return {...row,firstPlaceRanks:contestantRanks.filter(rank=>rank===1).length,judgeRankSum:contestantRanks.reduce((sum,rank)=>sum+rank,0),categoryScores:row.categoryValues};
    });
    const decisions=state.tieDecisions.filter(decision=>decision.roundId===round.id);
    return Scoring.resolveTies(rows,round.tieBreakers||[],decisions);
  }
  function persist(){
    try { state.version = 2; state.updatedAt=new Date().toISOString(); const json=JSON.stringify(state);localStorage.setItem(KEY,json);$('#storage-status').textContent=json.length>4_000_000?`Storage is nearly full (${(json.length/1_000_000).toFixed(1)} MB)`:'Saved on this device'; return true; }
    catch { $('#storage-status').textContent = 'Could not save — storage full'; return false; }
  }
  function audit(type, summary, details = [], reason = '') {
    state.audit.unshift({ timestamp: new Date().toISOString(), type, summary, details, reason: reason || null });
    persist();
  }
  function renderSidebar(){
    $('#sidebar-event').textContent = state.event.name || 'New Pageant';
    $('#contestant-count').textContent = state.contestants.length;
    $('#judge-count').textContent = state.judges.length;
    $('#banner-event').textContent = state.event.name || 'New Pageant';
    $('#banner-meta').textContent = [fmtDate(state.event.date), state.event.location].filter(Boolean).join(' / ') || 'Add event details to get started';
    $('#welcome-title').textContent = state.event.name && state.event.name !== 'New Pageant' ? state.event.name : 'Event overview';
    const minutes = state.lastBackupAt ? Math.floor((Date.now() - Date.parse(state.lastBackupAt)) / 60000) : null;
    $('#backup-status').textContent = minutes == null ? 'Last backup: never' : `Last backup: ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const dirty=!state.lastBackupAt||Date.parse(state.updatedAt||0)>Date.parse(state.lastBackupAt);
    $('#backup-status').classList.toggle('weight-warning', dirty&&(minutes == null || minutes > 30));
  }
  function showView(name){
    if (name === 'settings') fillEventForm();
    if (!$('#view-' + name)) name = 'overview';
    activeView = name;
    $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
    $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === name));
    $('#crumb-title').textContent = ({ overview:'Overview', contestants:'Contestants', judges:'Judges', rounds:'Rounds', categories:'Categories', scores:'Score entry', results:'Results', audit:'Audit log', settings:'Event setup' })[name] || 'Overview';
    $('.sidebar').classList.remove('open');
    if (name === 'scores') renderScores();
    if (name === 'results') renderResults();
    if (name === 'rounds') renderRounds();
    if (name === 'audit') renderAudit();
    if (name === 'categories') renderCategories();
    if (name === 'contestants') renderContestants();
    if (name === 'judges') renderJudges();
    if (name === 'overview') renderOverview();
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  function renderAll(){ renderSidebar(); renderOverview(); renderContestants(); renderJudges(); renderRounds(); renderCategories(); renderScores(); renderResults(); renderAudit(); fillEventForm(); }
  function renderOverview(){
    renderSidebar();
    $('#stat-contestants').textContent=state.contestants.length;
    $('#stat-judges').textContent=state.judges.length;
    $('#stat-categories').textContent=state.categories.length;
    const percent=completion();
    $('#stat-completion').textContent=`${percent}%`;
    $('#completion-bar').style.width=`${percent}%`;
    const tasks=[
      ['Event details',Boolean(state.event.name&&state.event.name!=='New Pageant'),'Add the event name, date, and location','settings'],
      ['Contestants',state.contestants.length>0,'Enter contestant numbers and names','contestants'],
      ['Judges',state.judges.length>0,'Add judges for this event','judges'],
      ['Rounds, categories, and criteria',state.categories.length>0,'Use Quick setup to create scoring stages and categories','rounds']
    ];
    const complete=tasks.filter(task=>task[1]).length;
    const next=tasks.find(task=>!task[1]);
    $('#checklist-progress').textContent=`${complete} / ${tasks.length}`;
    const continueButton=$('#continue-setup');
    continueButton.dataset.go=next?.[3]||'scores';
    continueButton.textContent=next?`Next: ${next[0]}`:'Enter scores';
    $('#checklist').innerHTML=tasks.map(([title,isDone,description,view])=>
      `<div class="check-row ${isDone?'done':''}"><span class="check-state">${isDone?'Ready':'To do'}</span><span><strong>${escapeHTML(title)}</strong><small>${escapeHTML(isDone?'Complete':description)}</small></span>${isDone?'':`<button data-go="${view}">Set up</button>`}</div>`
    ).join('');
    const leaders=assignPlaces(overallResult()).filter(row=>row.value!==null).slice(0,3);
    $('#overview-results').innerHTML=leaders.length?leaders.map(row=>
      `<div class="overview-top"><span class="rank-mark">${ordinal(row.place)}</span><span class="entry-number">${escapeHTML(row.contestant.number)}</span><strong>${escapeHTML(row.contestant.name)}</strong><span>${row.value.toFixed(2)} points</span></div>`
    ).join(''):'<div class="score-empty">Complete scores to see current standings.</div>';
  }
  function renderContestants(){
    const query = ($('#contestant-search')?.value || '').toLowerCase();
    const rows = numericContestants(state.contestants.filter(c => `${c.number} ${c.name}`.toLowerCase().includes(query)));
    $('#contestant-total').textContent = `${rows.length} contestant${rows.length === 1 ? '' : 's'}`;
    $('#contestant-empty').classList.toggle('show', state.contestants.length === 0);
    $('#contestant-table').innerHTML = rows.map(c => `<tr><td class="entry-number">${escapeHTML(c.number)}</td><td><div class="person-cell"><strong>${escapeHTML(c.name)}</strong></div></td><td><span class="status-chip">Registered</span></td><td class="row-actions"><button data-edit="contestant" data-id="${escapeHTML(c.id)}">Edit</button><button class="delete" data-delete="contestant" data-id="${escapeHTML(c.id)}">Remove</button></td></tr>`).join('');
  }
  function renderJudges(){
    const query=($('#judge-search')?.value||'').toLowerCase();
    const judges=state.judges.filter(judge=>judge.name.toLowerCase().includes(query));
    $('#judge-total').textContent=`${judges.length} judge${judges.length===1?'':'s'}`;
    $('#judge-empty').classList.toggle('show',state.judges.length===0);
    $('#judge-table').innerHTML=judges.map(judge=>{
      let entered=0;
      for(const contestant of state.contestants)for(const category of state.categories)for(const criterion of category.criteria){
        if(scoreValue(contestant.id,judge.id,category.id,criterion.id)!==null)entered++;
      }
      const expected=state.contestants.length*state.categories.reduce((total,category)=>total+category.criteria.length,0);
      return `<tr><td><div class="person-cell"><strong>${escapeHTML(judge.name)}</strong></div></td><td>${entered} / ${expected}</td><td class="row-actions"><button data-edit="judge" data-id="${escapeHTML(judge.id)}">Edit</button><button class="delete" data-delete="judge" data-id="${escapeHTML(judge.id)}">Remove</button></td></tr>`;
    }).join('');
  }
  function renderRounds(){
    const root = $('#round-list'); if (!root) return;
    const canReorder=!state.rounds.some(round=>round.finalizedAt);
    root.innerHTML = state.rounds.map((round, index) => {
      const cats = state.categories.filter(c => c.roundId === round.id);
      const sum = cats.reduce((n, c) => n + Number(c.weight || 0), 0);
      const blocker = state.rounds.slice(0, index).find(r => !r.finalizedAt);
      const blockers = Boolean(blocker);
      const entrants = contestantsForRound(index).length;
      const entrantLabel = index === 0
        ? `${entrants} contestant${entrants === 1 ? '' : 's'} registered`
        : blockers
          ? `Finish ${escapeHTML(blocker.name)} to unlock contestants`
          : `${entrants} contestant${entrants === 1 ? '' : 's'} advancing`;
      const scoreDisabled=blockers||round.finalizedAt;
      const scoreTitle=blockers?`Finish ${blocker.name} first.`:round.finalizedAt?'This round is already finished.':'';
      const orderTitle=canReorder?'Change round order':'Reopen finished rounds before changing the order';
      return `<article class="panel category-card"><div class="category-head"><div class="category-main"><div class="category-title-row"><h3>${escapeHTML(round.name)}</h3><span class="weight-badge">${round.advanceCount == null ? 'No cutoff' : `Top ${round.advanceCount} advance`}</span></div><p>${entrantLabel} · ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}</p><p class="${cats.length && Math.abs(sum - 100) < .01 ? '' : 'weight-warning'}">Category contribution total: ${sum.toFixed(1)}%</p>${blockers ? `<p class="weight-warning">Finish ${escapeHTML(blocker.name)} before opening this round for scoring.</p>` : ''}</div><div class="category-actions">${cats.length&&Math.abs(sum-100)>=.01&&!round.finalizedAt?`<button class="normalize-contributions" type="button" data-normalize-round="${escapeHTML(round.id)}">Set contributions to 100%</button>`:''}<button type="button" data-round-up="${escapeHTML(round.id)}" aria-label="Move ${escapeHTML(round.name)} earlier" title="${orderTitle}" ${!canReorder||index===0?'disabled':''}>Move up</button><button type="button" data-round-down="${escapeHTML(round.id)}" aria-label="Move ${escapeHTML(round.name)} later" title="${orderTitle}" ${!canReorder||index===state.rounds.length-1?'disabled':''}>Move down</button><button type="button" data-score-round="${escapeHTML(round.id)}" ${scoreDisabled?`disabled title="${escapeHTML(scoreTitle)}"`:''}>${round.finalizedAt?'Round finished':'Score this round'}</button><button data-round-edit="${escapeHTML(round.id)}">Edit round</button><button data-finalize="${escapeHTML(round.id)}">${round.finalizedAt ? 'Finished' : 'Finish round'}</button></div></div><div class="criteria-list">${cats.map(c => `<div class="criterion-row"><span>${escapeHTML(c.name)}</span><b>${Number(c.weight || 0)}% contribution</b><span>${c.criteria.length} criteria</span></div>`).join('') || '<div class="criterion-row"><span>No categories are assigned to this round.</span></div>'}</div></article>`;
    }).join('') || '<p class="panel">Add a round to begin.</p>';
  }
  function normalizeRoundContributions(roundId){
    const round=state.rounds.find(item=>item.id===roundId),categories=state.categories.filter(item=>item.roundId===roundId);
    if(!round||round.finalizedAt||!categories.length)return;
    const currentTotal=categories.reduce((sum,category)=>sum+Math.max(0,Number(category.weight)||0),0);
    const message=currentTotal>0
      ? `${round.name} category contributions total ${currentTotal.toFixed(1)}%. Scale them proportionally to 100%? Their relative shares will stay the same.`
      : `${round.name} has no category contribution assigned. Split 100% evenly across its categories?`;
    if(!window.confirm(message))return;
    const oldWeights=categories.map(category=>category.weight);
    let nextWeights;
    if(currentTotal<=0)nextWeights=Scoring.evenWeights(categories.length);
    else{
      const exact=categories.map(category=>Math.max(0,Number(category.weight)||0)/currentTotal*1000);
      const units=exact.map(Math.floor),remainder=1000-units.reduce((sum,value)=>sum+value,0);
      const order=exact.map((value,index)=>({index,fraction:value-units[index]})).sort((a,b)=>b.fraction-a.fraction);
      for(let i=0;i<remainder;i++)units[order[i%order.length].index]++;
      nextWeights=units.map(value=>value/10);
    }
    categories.forEach((category,index)=>category.weight=nextWeights[index]);
    if(!persist()){categories.forEach((category,index)=>category.weight=oldWeights[index]);renderAll();toast('Category contributions could not be saved.','error');return;}
    audit('Category contribution adjustment',`Adjusted ${round.name} category contributions to 100%`,categories.map((category,index)=>`${category.name}: ${oldWeights[index]}% to ${nextWeights[index]}%`));
    renderAll();
    toast(`${round.name} category contributions now total 100%. Return to Results and finish the round.`);
  }
  function renderCategories(){
    const roundSelect=$('#category-round-filter'),oldRound=roundSelect.value;
    roundSelect.innerHTML=state.rounds.map(round=>`<option value="${escapeHTML(round.id)}">${escapeHTML(round.name)}${round.finalizedAt?' (finished)':''}</option>`).join('');
    if(state.rounds.some(round=>round.id===oldRound))roundSelect.value=oldRound;
    else if(roundSelect.options.length){const populated=state.rounds.find(round=>state.categories.some(category=>category.roundId===round.id));roundSelect.value=(populated||state.rounds[0]).id;}
    const selectedRound=state.rounds.find(round=>round.id===roundSelect.value),categories=state.categories.filter(category=>category.roundId===selectedRound?.id);
    const weightTotal=categories.reduce((sum,category)=>sum+Number(category.weight||0),0),weightsValid=Math.abs(weightTotal-100)<.01,readOnly=Boolean(selectedRound?.finalizedAt);
    $('#weight-summary-title').textContent=selectedRound?`${selectedRound.name} category contributions`:'Category contributions';
    $('#weight-summary').innerHTML=selectedRound?`Total within this round: <strong class="${weightsValid?'':'weight-warning'}">${weightTotal.toFixed(1)}%</strong>. ${weightsValid?'These category contributions are ready.':'Set category contributions in this round to 100%. Earlier-round scores do not carry forward.'}`:'Add a round before creating categories.';
    $('#category-round-status').hidden=!readOnly;$('#category-round-status').textContent=readOnly?'Finished round — categories are read-only.':'';
    $('#add-category').disabled=readOnly||!selectedRound;$('#add-category').title=readOnly?'Reopen this round before adding categories.':'';
    const empty=$('#category-empty');empty.classList.toggle('show',categories.length===0);
    $('#category-empty-title').textContent=selectedRound?`No categories in ${selectedRound.name}`:'No rounds available';
    $('#category-empty-description').textContent=readOnly?'Reopen this round before adding categories.':'Add categories and criteria before entering scores.';
    const emptyAdd=empty.querySelector('[data-action="add-category"]');emptyAdd.disabled=readOnly||!selectedRound;
    $('#category-list').innerHTML = categories.map(cat => {
      const round = selectedRound;
      const sum = cat.criteria.reduce((n, cr) => n + Number(cr.weight || 0), 0);
      const disabled=readOnly?'disabled title="Reopen this round before editing categories"':'';
      return `<article class="panel category-card"><div class="category-head"><div class="category-main"><div class="category-title-row"><h3>${escapeHTML(cat.name)}</h3><span class="weight-badge">${Number(cat.weight || 0)}% contribution in ${escapeHTML(round?.name || 'round')}</span></div><p>${cat.criteria.length} scoring criteria</p></div><div class="category-actions"><button data-edit="category" data-id="${escapeHTML(cat.id)}" ${disabled}>Edit</button><button class="delete" data-delete="category" data-id="${escapeHTML(cat.id)}" ${disabled}>Remove</button></div></div><div class="criteria-list">${cat.criteria.map(cr => `<div class="criterion-row"><span>${escapeHTML(cr.name)}</span><b>${Number(cr.weight || 0)}% of category</b><button class="text-button" data-edit-criterion="${escapeHTML(cat.id)}" data-id="${escapeHTML(cr.id)}" ${disabled}>Edit</button><button class="text-button" data-delete-criterion="${escapeHTML(cat.id)}" data-id="${escapeHTML(cr.id)}" ${disabled}>Remove</button></div>`).join('') || '<div class="criterion-row"><span>No criteria added yet</span></div>'}</div><div class="category-footer"><button data-add-criterion="${escapeHTML(cat.id)}" ${disabled}>Add criterion</button><span class="muted ${Math.abs(sum - 100) < .01 ? '' : 'weight-warning'}">Criteria total: ${sum.toFixed(1)}%</span></div></article>`;
    }).join('');
  }
  function renderScores(){
    const roundSelect = $('#score-round');
    if (roundSelect) { const old = roundSelect.value; roundSelect.innerHTML = state.rounds.map(r => `<option value="${escapeHTML(r.id)}">${escapeHTML(r.name)}</option>`).join(''); if (state.rounds.some(r => r.id === old)) roundSelect.value = old; }
    const roundId = roundValue();
    const cats = state.categories.filter(c => c.roundId === roundId);
    const catSelect = $('#score-category'); const oldCat = catSelect.value;
    catSelect.innerHTML = cats.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');
    if (cats.some(c => c.id === oldCat)) catSelect.value = oldCat;
    const judgeSelect = $('#score-judge'); const oldJudge = judgeSelect.value;
    judgeSelect.innerHTML = state.judges.map(j => `<option value="${escapeHTML(j.id)}">${escapeHTML(j.name)}</option>`).join('');
    if (state.judges.some(j => j.id === oldJudge)) judgeSelect.value = oldJudge;
    const cat = cats.find(c => c.id === catSelect.value), judge = state.judges.find(j => j.id === judgeSelect.value);
    const roundIndex = state.rounds.findIndex(r => r.id === roundId);
    const people = numericContestants(contestantsForRound(roundIndex));
    const root = $('#score-grid');
    if (!people.length || !judge || !cat) { root.innerHTML = '<div class="panel score-empty">Add contestants, judges, and categories to begin score entry.</div>'; $('#submit-scores').disabled = true; $('#save-next-scores').disabled = true; return; }
    if (!cat.criteria.length) { root.innerHTML = '<div class="panel score-empty">Add criteria to this category before entering scores.</div>'; $('#submit-scores').disabled = true; $('#save-next-scores').disabled = true; return; }
    const lockRecord=state.locks.find(lock => lock.judgeId === judge.id && lock.categoryId === cat.id), finalized=state.rounds.find(r => r.id === roundId)?.finalizedAt;
    const locked = Boolean(lockRecord||finalized), lockedAt=lockRecord?.lockedAt||finalized;
    $('#submit-scores').disabled = locked;
    $('#save-next-scores').disabled = locked;
    $('#lock-sheet').hidden=locked;$('#unlock-sheet').hidden=!locked;
    root.innerHTML = `<div class="score-table-wrap"><table class="score-table"><thead><tr><th>Contestant</th>${cat.criteria.map(cr => `<th>${escapeHTML(cr.name)}<small>${Number(cr.weight || 0)}% of category</small></th>`).join('')}<th>Status</th></tr></thead><tbody>${people.map(c => {
      const pending = cat.criteria.some(cr => scoreDrafts.has(scoreKey(c.id, judge.id, cat.id, cr.id)));
        return `<tr><th scope="row"><div class="score-person"><span class="candidate-number">${escapeHTML(c.number)}</span><strong>${escapeHTML(c.name)}</strong></div></th>${cat.criteria.map(cr => { const key = scoreKey(c.id, judge.id, cat.id, cr.id); const value = scoreDrafts.has(key) ? scoreDrafts.get(key) : scoreValue(c.id, judge.id, cat.id, cr.id); return `<td><label class="table-score-wrap"><span class="sr-only">${escapeHTML(cr.name)} score for ${escapeHTML(c.name)}</span><input type="number" inputmode="decimal" min="0" max="100" step="0.01" aria-label="${escapeHTML(cr.name)} score for ${escapeHTML(c.name)}" data-score-contestant="${escapeHTML(c.id)}" data-score-judge="${escapeHTML(judge.id)}" data-score-category="${escapeHTML(cat.id)}" data-score-criterion="${escapeHTML(cr.id)}" value="${value == null ? '' : escapeHTML(value)}" placeholder="—" ${locked ? 'disabled' : ''}><small class="score-error hidden">Use a score from 0 to 100.</small></label></td>`; }).join('')}<td><span class="status-chip ${pending ? '' : 'complete'}">${locked ? `Locked at ${escapeHTML(new Date(lockedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))}` : pending ? 'Unsaved' : 'Saved or needs scores'}</span></td></tr>`;
    }).join('')}</tbody></table></div>`;
    updateScoreDraftMessage();
  }
  function updateScoreDraftMessage(){
    const roundId = roundValue(), categoryId = $('#score-category').value, judgeId = $('#score-judge').value;
    const count = [...scoreDrafts.keys()].filter(k => { const p = k.split('|'); return p[1] === judgeId && p[2] === categoryId; }).length;
    const other = new Set([...scoreDrafts.keys()].filter(k => { const p = k.split('|'); return p[1] !== judgeId || p[2] !== categoryId; }).map(k => `${state.judges.find(j => j.id === k.split('|')[1])?.name || 'Unknown judge'} / ${state.categories.find(c => c.id === k.split('|')[2])?.name || 'Unknown category'}`));
    const otherSheets=[...new Map([...scoreDrafts.keys()].filter(k=>{const p=k.split('|');return p[1]!==judgeId||p[2]!==categoryId;}).map(k=>{const p=k.split('|');return [`${p[1]}|${p[2]}`,{judgeId:p[1],categoryId:p[2]}];})).values()];
    $('#score-save-message').innerHTML = `${count ? `${count} unsaved score field${count === 1 ? '' : 's'}.` : 'Enter scores from 0 to 100.'} Choose <strong>Save &amp; next</strong> to save and move to the next sheet, or <strong>Save scores</strong> to stay here.${other.size ? `<br>Other drafts: ${otherSheets.map(x=>`<button class="link-button" type="button" data-open-draft="${escapeHTML(x.judgeId)}|${escapeHTML(x.categoryId)}">${escapeHTML(state.judges.find(j=>j.id===x.judgeId)?.name||'Judge')} / ${escapeHTML(state.categories.find(c=>c.id===x.categoryId)?.name||'Category')}</button>`).join(' ')}` : ''}`;
  }
  function nextScoreSheet(roundId, categoryId, judgeId){
    const round=state.rounds.find(item=>item.id===roundId);
    if(round?.finalizedAt)return null;
    const sheets=state.categories
      .filter(category=>category.roundId===roundId&&category.criteria.length)
      .flatMap(category=>state.judges.map(judge=>({category,judge})))
      .filter(({category,judge})=>!state.locks.some(lock=>lock.categoryId===category.id&&lock.judgeId===judge.id));
    const current=sheets.findIndex(sheet=>sheet.category.id===categoryId&&sheet.judge.id===judgeId);
    return current<0?null:sheets[current+1]||null;
  }
  function submitScores(advance=false){
    const categoryId = $('#score-category').value, judgeId = $('#score-judge').value;
    const inputs = $$('[data-score-criterion]').filter(input => input.dataset.scoreCategory === categoryId && input.dataset.scoreJudge === judgeId);
    if (!inputs.length) { toast('Choose a category and judge before saving scores.', 'error'); return; }
    const invalid = inputs.find(input => input.value.trim() !== '' && !validScore(Number(input.value)));
    if (invalid) { invalid.classList.add('invalid'); invalid.setAttribute('aria-invalid', 'true'); invalid.focus(); toast('Scores must be between 0 and 100.', 'error'); return; }
    const existing = inputs.some(input => scoreValue(input.dataset.scoreContestant, judgeId, categoryId, input.dataset.scoreCriterion) !== null);
    if (inputs.every(input => input.value.trim() === '') && existing && !window.confirm('Clear all saved scores on this sheet?')) return;
    const details = [];
    for (const input of inputs) {
      const key = scoreKey(input.dataset.scoreContestant, judgeId, categoryId, input.dataset.scoreCriterion);
      const old = state.scores[key] ?? null, raw = input.value.trim();
      if (raw === '') delete state.scores[key]; else state.scores[key] = Number(raw);
      if (old !== (raw === '' ? null : Number(raw))) details.push({ contestant: state.contestants.find(c => c.id === input.dataset.scoreContestant)?.name || '', judge: state.judges.find(j => j.id === judgeId)?.name || '', category: state.categories.find(c => c.id === categoryId)?.name || '', criterion: state.categories.find(c => c.id === categoryId)?.criteria.find(cr => cr.id === input.dataset.scoreCriterion)?.name || '', oldValue: old, newValue: raw === '' ? null : Number(raw) });
      scoreDrafts.delete(key);
    }
    if (!persist()) { toast('Scores could not be saved because local storage is full.', 'error'); return; }
    audit(inputs.every(i => i.value.trim() === '') ? 'Score clear' : 'Score save', `${inputs.every(i => i.value.trim() === '') ? 'Cleared' : 'Saved'} ${details.length} score${details.length === 1 ? '' : 's'}`, details);
    renderScores(); renderResults();
    const count = inputs.filter(i => i.value.trim() !== '').length;
    const now = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());
    showView('scores');
    if(advance){
      const next=nextScoreSheet(roundValue(),categoryId,judgeId);
      if(next){
        $('#score-category').value=next.category.id;
        $('#score-judge').value=next.judge.id;
        renderScores();
        $('#score-save-message').textContent=`Saved ${count} scores. Next: ${next.category.name} / ${next.judge.name}.`;
      }else $('#score-save-message').textContent=`Saved ${count} scores. This is the last unlocked sheet in this round.`;
      return;
    }
    $('#score-save-message').innerHTML = `Saved ${count} scores for ${escapeHTML(state.judges.find(j => j.id === judgeId)?.name || 'judge')}, ${escapeHTML(state.categories.find(c => c.id === categoryId)?.name || 'category')}, ${escapeHTML(now)}. <button type="button" class="link-button" data-go="results">Go to results</button>`;
  }
  function renderScores(){
    const roundSelect=$('#score-round'),oldRound=roundSelect.value;
    roundSelect.innerHTML=state.rounds.map((round,index)=>{const blocker=roundBlocked(index)?state.rounds.slice(0,index).find(item=>!item.finalizedAt):null;return `<option value="${escapeHTML(round.id)}" ${blocker?'disabled':''}>${escapeHTML(round.name)}${blocker?` (finish ${escapeHTML(blocker.name)} first)`:''}</option>`}).join('');
    const current=state.rounds.find((round,index)=>round.id===oldRound&&!roundBlocked(index));
    const next=state.rounds.find((round,index)=>!round.finalizedAt&&!roundBlocked(index));
    if(current&&!current.finalizedAt)roundSelect.value=current.id;
    else if(next)roundSelect.value=next.id;
    else if(current)roundSelect.value=current.id;
    else if(roundSelect.options.length)roundSelect.selectedIndex=0;
    const roundId=roundValue(),categories=state.categories.filter(category=>category.roundId===roundId);
    const categorySelect=$('#score-category'),oldCategory=categorySelect.value;
    categorySelect.innerHTML=categories.map(category=>`<option value="${escapeHTML(category.id)}">${escapeHTML(category.name)}</option>`).join('');
    if(categories.some(category=>category.id===oldCategory))categorySelect.value=oldCategory;
    const category=categories.find(item=>item.id===categorySelect.value),criterionSelect=$('#score-criterion'),oldCriterion=criterionSelect.value;
    criterionSelect.innerHTML=(category?.criteria||[]).map(criterion=>`<option value="${escapeHTML(criterion.id)}">${escapeHTML(criterion.name)}</option>`).join('');
    if(category?.criteria.some(criterion=>criterion.id===oldCriterion))criterionSelect.value=oldCriterion;
    const criterion=category?.criteria.find(item=>item.id===criterionSelect.value),round=state.rounds.find(item=>item.id===roundId);
    const people=numericContestants(contestantsForRound(state.rounds.findIndex(item=>item.id===roundId))),root=$('#score-grid');
    const roundIndex=state.rounds.findIndex(item=>item.id===roundId),previousRound=roundIndex>0?state.rounds[roundIndex-1]:null,advancementStatus=$('#score-advancement-status');
    if(previousRound?.finalizedAt){advancementStatus.hidden=false;advancementStatus.textContent=`${people.length} contestant${people.length===1?'':'s'} advanced from ${previousRound.name}. Only these contestants appear in ${round?.name||'this round'} score entry.`;}else{advancementStatus.hidden=true;advancementStatus.textContent='';}
    const blocker=roundBlocked(roundIndex)?state.rounds.slice(0,roundIndex).find(item=>!item.finalizedAt):null;
    if(blocker){root.innerHTML=`<div class="panel score-empty"><strong>${escapeHTML(round.name)} is locked.</strong> Finish ${escapeHTML(blocker.name)} first. Complete its scores and finalize it to open this round; advancing contestants will then appear here.</div>`;$('#submit-scores').disabled=true;$('#save-next-scores').disabled=true;return;}
    if(!people.length||!state.judges.length||!category){
      const previous=round?state.rounds[state.rounds.indexOf(round)-1]:null;
      const message=!people.length
        ? !state.contestants.length ? 'Add contestants on the Contestants page to begin score entry.'
          : previous ? `No contestants are ready for ${escapeHTML(round.name)} yet. Finish ${escapeHTML(previous.name)} first; the advancing contestants will appear here automatically.`
          : 'No contestants are available for this round.'
        : !state.judges.length ? 'Add judges on the Judges page to begin score entry.'
        : `Add a category to ${escapeHTML(round?.name||'this round')} before entering scores.`;
      root.innerHTML=`<div class="panel score-empty">${message}</div>`;$('#submit-scores').disabled=true;$('#save-next-scores').disabled=true;return;
    }
    if(!criterion){root.innerHTML='<div class="panel score-empty">Add criteria to this category before entering scores.</div>';$('#submit-scores').disabled=true;$('#save-next-scores').disabled=true;return;}
    const judges=state.judges.map(judge=>{
      const lock=state.locks.find(item=>item.judgeId===judge.id&&item.categoryId===category.id),locked=Boolean(lock||round?.finalizedAt);
      return {judge,locked,lockedAt:lock?.lockedAt||round?.finalizedAt,complete:people.every(person=>category.criteria.every(item=>scoreValue(person.id,judge.id,category.id,item.id)!==null))};
    });
    const editable=judges.filter(item=>!item.locked).length>0;
    $('#submit-scores').disabled=!editable;$('#save-next-scores').disabled=!editable;
    const headers=judges.map(({judge,locked,lockedAt,complete})=>`<th scope="col"><strong>${escapeHTML(judge.name)}</strong><small>${locked?(round?.finalizedAt?'Round finalized':`Locked at ${escapeHTML(new Date(lockedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}))}`):complete?'Complete · unlocked':'Incomplete · unlocked'}</small>${locked?(round?.finalizedAt?'':`<button class="text-button" type="button" data-unlock-judge="${escapeHTML(judge.id)}">Unlock sheet</button>`):`<button class="text-button" type="button" data-lock-judge="${escapeHTML(judge.id)}" ${complete?'':'disabled title="Enter all scores before locking"'}>Lock sheet</button>`}</th>`).join('');
    root.innerHTML=`<div class="score-table-wrap"><table class="score-table judge-score-table"><thead><tr><th scope="col">Contestant</th>${headers}</tr></thead><tbody>${people.map(person=>`<tr><th scope="row"><div class="score-person"><span class="candidate-number">${escapeHTML(person.number)}</span><strong>${escapeHTML(person.name)}</strong></div></th>${judges.map(({judge,locked})=>{const key=scoreKey(person.id,judge.id,category.id,criterion.id),value=scoreDrafts.has(key)?scoreDrafts.get(key):scoreValue(person.id,judge.id,category.id,criterion.id);return `<td><label class="table-score-wrap"><span class="sr-only">${escapeHTML(criterion.name)} score for ${escapeHTML(person.name)} by ${escapeHTML(judge.name)}</span><input type="number" inputmode="decimal" min="0" max="100" step="0.01" aria-label="${escapeHTML(criterion.name)} score for ${escapeHTML(person.name)} by ${escapeHTML(judge.name)}" data-score-contestant="${escapeHTML(person.id)}" data-score-judge="${escapeHTML(judge.id)}" data-score-category="${escapeHTML(category.id)}" data-score-criterion="${escapeHTML(criterion.id)}" value="${value==null?'':escapeHTML(value)}" placeholder="—" ${locked?'disabled':''}><small class="score-error hidden">Use a score from 0 to 100.</small></label></td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;
    updateScoreDraftMessage();
  }
  function updateScoreDraftMessage(){
    const categoryId=$('#score-category').value,criterionId=$('#score-criterion').value;
    const current=[...scoreDrafts.keys()].filter(key=>{const parts=key.split('|');return parts[2]===categoryId&&parts[3]===criterionId;}).length;
    const other=[...scoreDrafts.keys()].filter(key=>{const parts=key.split('|');return parts[2]!==categoryId||parts[3]!==criterionId;}).length;
    $('#score-save-message').innerHTML=`${current?`${current} unsaved score${current===1?'':'s'} in this grid.`:'Enter scores from 0 to 100.'} Choose <strong>Save &amp; next</strong> to save and move on, or <strong>Save &amp; view rankings</strong> to open this round's results.${other?` ${other} unsaved score${other===1?'':'s'} on other grids.`:''}`;
  }
  function nextScoreTarget(roundId,categoryId,criterionId){
    if(state.rounds.find(round=>round.id===roundId)?.finalizedAt)return null;
    return Scoring.nextCriterion(state.categories.filter(category=>category.roundId===roundId),state.judges,state.locks,categoryId,criterionId);
  }
  function submitScores(advance=false){
    const categoryId=$('#score-category').value,criterionId=$('#score-criterion').value;
    const activeCategory=state.categories.find(category=>category.id===categoryId),activeRoundIndex=state.rounds.findIndex(round=>round.id===activeCategory?.roundId);
    if(roundBlocked(activeRoundIndex)){const blocker=state.rounds.slice(0,activeRoundIndex).find(round=>!round.finalizedAt);toast(`Finish ${blocker?.name||'the previous round'} before entering scores for this round.`,'error');return;}
    const inputs=$$('[data-score-criterion]').filter(input=>input.dataset.scoreCategory===categoryId&&input.dataset.scoreCriterion===criterionId&&!input.disabled);
    if(!inputs.length){toast('All judge sheets for this category are locked.','error');return;}
    const invalid=inputs.find(input=>input.value.trim()!==''&&!validScore(Number(input.value)));
    if(invalid){invalid.classList.add('invalid');invalid.setAttribute('aria-invalid','true');invalid.focus();toast('Scores must be between 0 and 100.','error');return;}
    const existing=inputs.some(input=>scoreValue(input.dataset.scoreContestant,input.dataset.scoreJudge,categoryId,criterionId)!==null);
    if(inputs.every(input=>input.value.trim()==='')&&!existing){toast('Enter at least one score before saving.','error');return;}
    if(inputs.every(input=>input.value.trim()==='')&&existing&&!window.confirm('Clear all saved scores for this criterion and the unlocked judges?'))return;
    const previous=[],details=[];
    for(const input of inputs){
      const key=scoreKey(input.dataset.scoreContestant,input.dataset.scoreJudge,categoryId,criterionId),raw=input.value.trim(),old=state.scores[key]??null;
      previous.push([key,Object.prototype.hasOwnProperty.call(state.scores,key),state.scores[key]]);
      if(raw==='')delete state.scores[key];else state.scores[key]=Number(raw);
      if(old!==(raw===''?null:Number(raw)))details.push({contestant:state.contestants.find(item=>item.id===input.dataset.scoreContestant)?.name||'',judge:state.judges.find(item=>item.id===input.dataset.scoreJudge)?.name||'',category:state.categories.find(item=>item.id===categoryId)?.name||'',criterion:state.categories.find(item=>item.id===categoryId)?.criteria.find(item=>item.id===criterionId)?.name||'',oldValue:old,newValue:raw===''?null:Number(raw)});
      scoreDrafts.delete(key);
    }
    const changedRound=details.length?state.rounds.find(round=>round.id===state.categories.find(category=>category.id===categoryId)?.roundId):null,previousAdvancingIds=changedRound?.advancingIds;
    if(changedRound)changedRound.advancingIds=null;
    if(!persist()){for(const[key,hadValue,value]of previous){if(hadValue)state.scores[key]=value;else delete state.scores[key];}if(changedRound)changedRound.advancingIds=previousAdvancingIds;renderScores();toast('Scores could not be saved because local storage is full.','error');return;}
    audit(inputs.every(input=>input.value.trim()==='')?'Score clear':'Score save',`${inputs.every(input=>input.value.trim()==='')?'Cleared':'Saved'} ${details.length} score${details.length===1?'':'s'}`,details);
    renderScores();renderResults();
    const count=inputs.filter(input=>input.value.trim()!=='').length;
    const remaining=scoreDrafts.size?` ${scoreDrafts.size} unsaved score${scoreDrafts.size===1?'':'s'} remain on other grids.`:'';
    if(advance){const next=nextScoreTarget(roundValue(),categoryId,criterionId);if(next){$('#score-category').value=next.category.id;$('#score-criterion').value=next.criterion.id;renderScores();$('#score-save-message').textContent=`Saved ${count} scores. Next: ${next.category.name} / ${next.criterion.name}.${remaining}`;}else $('#score-save-message').textContent=`Saved ${count} scores. No more score grids in this round.${remaining}`;return;}
    $('#results-round').value=activeCategory?.roundId||state.rounds[0]?.id||'';
    resultTab='overall';
    showView('results');
    $('#score-save-message').textContent=`Saved ${count} scores. Opened rankings for ${state.rounds[activeRoundIndex]?.name||'this round'}.${remaining}`;
  }
  function renderRoundRankings(){
    const root=$('#round-rankings');
    if(!root)return;
    root.innerHTML=state.rounds.map((round,index)=>{
      const blocker=index>0?state.rounds.slice(0,index).find(item=>!item.finalizedAt):null;
      if(blocker)return `<section class="round-ranking-section is-locked"><div class="round-ranking-heading"><div><div class="eyebrow">Rankings for this round</div><h2>${escapeHTML(round.name)}</h2></div><span class="round-ranking-rule">${round.advanceCount==null?'All contestants advance':`Top ${round.advanceCount} advance`}</span></div><p class="round-ranking-note">Finish ${escapeHTML(blocker.name)} to open rankings for this round.</p></section>`;
      const rows=assignPlaces(roundResult(round.id));
      const ranked=rows.filter(row=>row.value!=null);
      const noScores=ranked.length===0;
      return `<section class="round-ranking-section"><div class="round-ranking-heading"><div><div class="eyebrow">Rankings for this round</div><h2>${escapeHTML(round.name)}</h2></div><span class="round-ranking-rule">${round.advanceCount==null?'All contestants advance':`Top ${round.advanceCount} advance`}${round.finalizedAt?' · Finished':''}</span></div>${noScores?`<p class="round-ranking-note">${rows.length?'No scores submitted yet.':'No contestants are assigned to this round yet.'}</p>`:`<div class="round-ranking-table-wrap"><table class="round-ranking-table"><thead><tr><th scope="col">Rank</th><th scope="col">Entry</th><th scope="col">Contestant</th><th scope="col">Score</th><th scope="col">Status</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${row.value==null?'—':row.place}</td><td>${escapeHTML(row.contestant.number)}</td><th scope="row">${escapeHTML(row.contestant.name)}</th><td>${row.value==null?'—':row.value.toFixed(2)}</td><td><span class="status-chip ${row.complete?'complete':''}">${row.complete?(round.finalizedAt?'Final':'Complete'):row.value==null?'Awaiting scores':'Provisional'}</span></td></tr>`).join('')}</tbody></table></div>`}</section>`;
    }).join('');
  }
  function renderResults(){
    const roundSelect = $('#results-round');
    const oldRound = roundSelect.value;
    roundSelect.innerHTML = state.rounds.map(r => `<option value="${escapeHTML(r.id)}">${escapeHTML(r.name)}</option>`).join('');
    if (state.rounds.some(r => r.id === oldRound)) roundSelect.value = oldRound;
    else if(state.rounds.length) roundSelect.value=[...state.rounds].reverse().find(item=>item.finalizedAt)?.id||state.rounds[0].id;
    const round = selectedRound();
    renderRoundRankings();
    const roundCategories = state.categories.filter(c => c.roundId === round?.id);
    const roundPeople=numericContestants(contestantsForRound(state.rounds.indexOf(round)));
    const categorySelect=$('#results-category'), previousCategory=categorySelect.value;
    categorySelect.innerHTML=`<option value="">Round total</option>${roundCategories.map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('')}`;
    if(roundCategories.some(c=>c.id===previousCategory))categorySelect.value=previousCategory;
    const tabs = [{ id: 'overall', name: 'Round total' }, ...roundCategories.map(c => ({ id: c.id, name: c.name }))];
    if (!tabs.some(tab => tab.id === resultTab)) resultTab = 'overall';
    categorySelect.value=resultTab==='overall'?'':resultTab;
    $('#results-tabs').innerHTML = tabs.map(tab => `<button class="results-tab ${tab.id === resultTab ? 'active' : ''}" data-result-tab="${escapeHTML(tab.id)}">${escapeHTML(tab.name)}</button>`).join('');
    const category = roundCategories.find(c => c.id === resultTab);
    const activeIds=new Set(roundPeople.map(person=>person.id));
    const rowsBase = category ? categoryResult(category).filter(row=>activeIds.has(row.contestant.id)) : roundResult(round?.id);
    const rows = assignPlaces(rowsBase);
    const cutoffInfo = category ? {warning:null,cutoffPlace:null} : cutoffSelection(rows, round?.advanceCount);
    const roundScoresComplete=rows.every(row=>row.complete);
    const unresolvedTies=[];
    if(!category)for(const row of rows){if(row.complete&&row.value!=null&&!row.tieReason){const group=rows.filter(other=>other.complete&&other.value!=null&&other.place===row.place&&!other.tieReason&&Scoring.sameScore(other.value,row.value));if(group.length>1&&!unresolvedTies.some(x=>x[0].place===group[0].place&&Scoring.sameScore(x[0].value,group[0].value)))unresolvedTies.push(group);}}
    activeUnresolvedTies=unresolvedTies;
    const tieText = round?.advancingIds ? null : cutoffInfo.warning;
    $('#results-summary').innerHTML = `<div class="summary-card"><span>Contestants in round</span><strong>${rows.length}</strong></div><div class="summary-card"><span>Score completion</span><strong>${completion()}%</strong></div><div class="summary-card"><span>Category contribution total</span><strong>${roundCategories.reduce((s,c)=>s+Number(c.weight||0),0).toFixed(1)}%</strong></div>`;
    $('#category-winners').innerHTML=roundCategories.map(cat=>{
      const finalRows=categoryResult(cat).filter(item=>activeIds.has(item.contestant.id));
      const final=finalRows.length>0&&finalRows.every(item=>item.complete&&item.value!=null);
      const scored=final?finalRows:categoryProgressResult(cat).filter(item=>activeIds.has(item.contestant.id)&&item.value!=null);
      const leaders=scored.length?scored.filter(item=>Scoring.sameScore(item.value,scored[0].value)):[];
      return `<article class="winner-card ${leaders.length?'has-winner':''} ${leaders.length>1?'is-tied':''}"><div class="winner-card-top"><span class="winner-category">${escapeHTML(cat.name)}</span></div>${leaders.length?`<div class="winner-names">${leaders.map(item=>`<strong>${escapeHTML(item.contestant.name)}</strong><small>Entry ${escapeHTML(item.contestant.number)}</small>`).join('')}</div><div class="winner-score">${leaders[0].value.toFixed(2)} <small>${final?'points':'partial points'}</small></div><span class="winner-caption">${final?(leaders.length>1?'Tied category winners':'Category winner'):'Provisional leader'}</span>`:'<p class="winner-pending">No submitted scores yet</p>'}</article>`;
    }).join('')||'<p class="winner-pending">No categories are assigned to this round.</p>';
    $('#results-kicker').textContent = round?.name || 'Round';
    $('#results-title').textContent = category ? `${category.name} results` : `${round?.name || 'Round'} standings`;
    $('#results-subtitle').textContent = category ? 'Weighted criterion points' : 'Weighted category points';
    $('#cutoff-panel').hidden = !tieText && round?.advanceCount == null && !unresolvedTies.length;
    const requiredIds=cutoffInfo.fixedIds||[],eligibleIds=cutoffInfo.candidateIds||[],tiedIds=eligibleIds.filter(id=>!requiredIds.includes(id));
    const requiredNumbers=requiredIds.map(id=>state.contestants.find(person=>person.id===id)?.number).filter(Boolean);
    const tiedNumbers=tiedIds.map(id=>state.contestants.find(person=>person.id===id)?.number).filter(Boolean);
    $('#cutoff-panel').innerHTML = `${round?.advanceCount == null ? '' : `<strong>Top ${round.advanceCount} advance</strong>${tieText ? `<p class="weight-warning">${escapeHTML(tieText)} Everyone ranked above the cutoff advances. Choose ${cutoffInfo.chooseCount} contestant${cutoffInfo.chooseCount===1?'':'s'} from the tied entries to fill the remaining place${cutoffInfo.chooseCount===1?'':'s'}.</p>${!roundScoresComplete?'<p>Complete the round’s scores and weights before saving the cutoff choice.</p>':''}${requiredNumbers.length?`<p>Already advancing: ${requiredNumbers.map(escapeHTML).join(', ')}</p>`:''}<p>Tied entries at the cutoff: ${tiedNumbers.map(escapeHTML).join(', ')}</p><label>Entry numbers to advance from the tied group<input id="advancing-override" placeholder="${tiedNumbers.slice(0,cutoffInfo.chooseCount).map(escapeHTML).join(', ')}"></label><button class="button button-outline" id="save-advance-override" type="button" ${roundScoresComplete?'':'disabled'}>Save cutoff decision</button>` : round?.advancingIds ? `<p>Advancing contestants: ${round.advancingIds.map(id=>escapeHTML(state.contestants.find(person=>person.id===id)?.number||'')).filter(Boolean).join(', ')}</p>` : ''}`}${unresolvedTies.map((group,index)=>`<div class="committee-tie"><p class="weight-warning">Shared place ${group[0].place}: ${group.map(r=>escapeHTML(r.contestant.number)).join(', ')}. Committee decision required.</p><label>Order entries by contestant number<input data-committee-order="${index}" placeholder="${group.map(r=>escapeHTML(r.contestant.number)).join(', ')}"></label><label>Decision note<textarea data-committee-note="${index}" rows="2"></textarea></label><button class="button button-outline" data-save-committee="${index}" type="button">Save tie decision</button></div>`).join('')}`;
    const missing = [];
    for (const cat of roundCategories) {
      const total = cat.criteria.reduce((s, cr) => s + Number(cr.weight || 0), 0);
      if (Math.abs(total - 100) >= .01) missing.push(`${cat.name}: criterion weights total ${total.toFixed(1)}%, not 100%.`);
    }
    const weightTotal = roundCategories.reduce((s, cat) => s + Number(cat.weight || 0), 0);
    if (Math.abs(weightTotal - 100) >= .01) missing.push(`${round.name}: category contributions total ${weightTotal.toFixed(1)}%, not 100%.`);
    for (const cat of roundCategories) for (const judge of state.judges) {
      if (roundPeople.some(c => cat.criteria.some(cr => scoreValue(c.id, judge.id, cat.id, cr.id) == null))) missing.push(`${judge.name} has not scored every contestant in ${cat.name}.`);
    }
    $('#what-missing').innerHTML = missing.length ? missing.map(x => `<li>${escapeHTML(x)}</li>`).join('') : '<li>Nothing is missing for this round.</li>';
    if (category) $('#results-head').innerHTML = `<tr><th>Contestant</th><th>Rank</th>${category.criteria.map(cr => `<th>${escapeHTML(cr.name)}<small>${Number(cr.weight||0)}%</small></th>`).join('')}<th>Final score</th><th>Status</th></tr>`;
    else $('#results-head').innerHTML = `<tr><th>Contestant</th><th>Rank</th>${roundCategories.map(cat => `<th>${escapeHTML(cat.name)}<small>${Number(cat.weight||0)}% of round total</small></th>`).join('')}<th>Final score</th><th>Status</th></tr>`;
    $('#results-body').innerHTML = rows.map(row => {
      const rowIndex=rows.indexOf(row);
      const cutoffLine=cutoffInfo.cutoffPlace!=null&&row.place===cutoffInfo.cutoffPlace&&!Scoring.sameScore(row.value,rows[rowIndex+1]?.value);
      const tie = rows.filter(other => other.value != null && other.place===row.place&&Scoring.sameScore(other.value, row.value)).length > 1;
      const rank = row.place == null ? '—' : `${ordinal(row.place)}${row.complete ? '' : '*'}${tie ? ' tied' : ''}${row.tieReason ? ` (tie-break: ${escapeHTML(row.tieReason)})` : ''}`;
      const cells = category ? category.criteria.map(cr => { const value = criterionProgressValue(row.contestant, category, cr); return `<td>${value == null ? '—' : value.toFixed(2)}</td>`; }).join('') : roundCategories.map(cat => { const value = row.categoryValues?.[cat.id]; return `<td>${value == null ? '—' : (value * Number(cat.weight || 0) / 100).toFixed(2)}</td>`; }).join('');
      const status = row.complete ? 'Complete' : row.value == null ? 'Awaiting scores' : 'Provisional';
      return `<tr class="${cutoffLine ? 'cutoff-row' : ''}"><th scope="row"><div class="result-person"><span class="candidate-number">${escapeHTML(row.contestant.number)}</span><strong>${escapeHTML(row.contestant.name)}</strong></div></th><td class="place-cell ${tie ? 'tie' : ''}">${rank}</td>${cells}<td class="score-cell">${row.value == null ? '—' : row.value.toFixed(2)}</td><td>${status}</td></tr>`;
    }).join('');
    $('#results-empty').classList.toggle('show', rows.length === 0);
    $('#chart-title').textContent = category ? `${category.name} score progress` : `${round?.name || 'Round'} score progress`;
    $('#results-chart').innerHTML = rows.filter(r => r.value != null).map(r => `<div class="result-chart-row"><div class="result-chart-person"><span class="candidate-number">${escapeHTML(r.contestant.number)}</span><strong>${escapeHTML(r.contestant.name)}</strong></div><div class="result-chart-track"><span style="width:${Math.max(0, Math.min(100, r.value))}%"></span></div><strong>${r.value.toFixed(2)}</strong></div>`).join('');
    $('#finalize-round').hidden = Boolean(round?.finalizedAt);
    $('#finalize-round').disabled=roundBlocked(state.rounds.indexOf(round));
    const followingRound=state.rounds[state.rounds.indexOf(round)+1];
    $('#finalize-round').textContent=followingRound?'Finish round & proceed to next':'Finish final round';
    $('#round-transition-note').textContent=followingRound
      ? `${round?.advanceCount==null?'All contestants in this round':`Top ${round.advanceCount} contestants`} will advance to ${followingRound.name}. Score entry opens with those contestants after this round is finished.`
      : 'Finishing this round records the final rankings.';
    if(roundBlocked(state.rounds.indexOf(round))){const blocker=state.rounds.slice(0,state.rounds.indexOf(round)).find(item=>!item.finalizedAt);$('#finalize-round').title=`Finish ${blocker?.name||'the previous round'} first.`;}else $('#finalize-round').removeAttribute('title');
    $('#unfinalize-round').hidden = !round?.finalizedAt;
    $('#print-time').textContent=new Date().toLocaleString();
    $('#print-heading').innerHTML=`<h1>${escapeHTML(state.event.name||'Pageant tabulation')}</h1><p>${escapeHTML(state.event.date||'')} ${escapeHTML(state.event.location||'')}</p><p>${escapeHTML(round?.name||'')} · ${escapeHTML(category?.name||'Round total')} · ${round?.finalizedAt?'FINAL':'PROVISIONAL'}</p><p>${round?.advanceCount==null?'No cutoff':`Top ${round.advanceCount} advance`}</p>`;
    $('#print-judge-signatures').innerHTML=state.judges.map(j=>`<p>____________________________ <span>${escapeHTML(j.name)}</span></p>`).join('');
    if($('#results-view').value==='judge')renderByJudge();
  }
  function renderAudit(){
    if (!$('#audit-list')) return;
    const type = $('#audit-type').value, query = ($('#audit-search').value || '').toLowerCase();
    const kinds = [...new Set(state.audit.map(item => item.type))];
    const old = type; $('#audit-type').innerHTML = '<option value="">All types</option>' + kinds.map(kind => `<option value="${escapeHTML(kind)}">${escapeHTML(kind)}</option>`).join(''); $('#audit-type').value = old;
    const entries = state.audit.filter(item => (!type || item.type === type) && `${item.summary} ${item.type} ${item.reason || ''} ${JSON.stringify(item.details||[])}`.toLowerCase().includes(query));
    $('#audit-list').innerHTML = entries.map(item => `<article class="panel"><strong>${escapeHTML(item.summary)}</strong><p>${escapeHTML(item.type)} · ${escapeHTML(new Date(item.timestamp).toLocaleString())}</p>${item.details?.length ? `<ul>${item.details.slice(0,20).map(detail=>`<li>${escapeHTML(typeof detail==='string'?detail:JSON.stringify(detail))}</li>`).join('')}</ul>` : ''}${item.reason ? `<p>Reason: ${escapeHTML(item.reason)}</p>` : ''}</article>`).join('') || '<p class="panel">No audit entries match.</p>';
  }
  function exportCSV(kind){
    const round = selectedRound(); let data;
    if(kind==='audit') data=[['Timestamp','Type','Summary','Details','Reason'],...state.audit.map(x=>[x.timestamp,x.type,x.summary,JSON.stringify(x.details||[]),x.reason||''])];
    else if(kind==='raw') data=[['Round','Category','Criterion','Judge','Contestant number','Contestant name','Score'],...state.rounds.flatMap(r=>state.categories.filter(c=>c.roundId===r.id).flatMap(c=>c.criteria.flatMap(cr=>state.judges.flatMap(j=>state.contestants.map(p=>[r.name,c.name,cr.name,j.name,p.number,p.name,scoreValue(p.id,j.id,c.id,cr.id)]).filter(row=>row[6]!=null)))))];
    else if(kind==='judge'){
      const category=state.categories.find(c=>c.id===$('#results-category').value),people=numericContestants(contestantsForRound(state.rounds.indexOf(round)));
      const values=state.judges.map(j=>people.map(p=>{
        if(category)return Scoring.categoryJudgeScore(state.scores,p,j,category);
        const cats=state.categories.filter(c=>c.roundId===round.id),scores=cats.map(c=>Scoring.categoryJudgeScore(state.scores,p,j,c));
        return Scoring.validWeights(cats)&&scores.every(v=>v!=null)?scores.reduce((s,v,i)=>s+v*Number(cats[i].weight||0)/100,0):null;
      }));
      const ranks=values.map(list=>Scoring.judgeRanks(list.map(v=>v??-Infinity)));
      const standings=assignPlaces(roundResult(round.id));
      data=[['Contestant number','Contestant','Judge','Score','Judge rank','Average','Final rank','Judge total'],...people.flatMap((person,i)=>{
        const scored=values.map(list=>list[i]).filter(value=>value!=null),average=scored.length?scored.reduce((a,b)=>a+b,0)/scored.length:null;
        const final=standings.find(row=>row.contestant.id===person.id);
        return state.judges.map((judge,j)=>[person.number,person.name,judge.name,values[j][i]==null?'':values[j][i].toFixed(2),values[j][i]==null?'':ranks[j][i],average==null?'':average.toFixed(2),final?.place??'',values[j].reduce((sum,value)=>sum+(value||0),0).toFixed(2)]);
      }),...state.judges.map((judge,j)=>['','',judge.name,'Judge total',values[j].reduce((sum,value)=>sum+(value||0),0).toFixed(2),'','',''])];
    }
    else data=[['Place','Entry','Contestant','Score','Status'],...assignPlaces(roundResult(round?.id)).map(x=>[x.place,x.contestant.number,x.contestant.name,x.value==null?'':x.value.toFixed(2),x.complete?'Final':'Provisional'])];
    const slug=(state.event.name||'pageant').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'pageant';
    download(`${slug}_${(round?.name||'round').toLowerCase().replace(/[^a-z0-9]+/g,'-')}_${new Date().toISOString().slice(0,10)}.csv`,Scoring.toCSV(data),'text/csv;charset=utf-8');
  }
  function renderByJudge(){
    if ($('#results-view').value !== 'judge') return;
    const round=selectedRound(), category=state.categories.find(c=>c.id===$('#results-category').value), judges=state.judges;
    const people=numericContestants(contestantsForRound(state.rounds.indexOf(round)));
    const totals=judges.map(j=>people.map(person=>{
      if(category)return Scoring.categoryJudgeScore(state.scores,person,j,category);
      const cats=state.categories.filter(c=>c.roundId===round.id);
      if(!Scoring.validWeights(cats))return null;
      const values=cats.map(c=>Scoring.categoryJudgeScore(state.scores,person,j,c));
      return values.some(v=>v==null)?null:values.reduce((sum,v,i)=>sum+v*Number(cats[i].weight||0)/100,0);
    }));
    const ranks=totals.map(values=>Scoring.judgeRanks(values.map(v=>v==null?-Infinity:v)));
    const sums=totals.map(values=>values.reduce((n,v)=>n+(v||0),0));
    $('#results-head').innerHTML=`<tr><th>Contestant</th>${judges.map(j=>`<th>${escapeHTML(j.name)}<small>Score and rank</small></th>`).join('')}<th>Average</th><th>Final rank</th></tr>`;
    const overall=assignPlaces(roundResult(round.id));
    $('#results-body').innerHTML=people.map(person=>{
      const index=people.findIndex(c=>c.id===person.id), values=totals.map(t=>t[index]);
      const scored=values.filter(v=>v!=null), average=scored.length?scored.reduce((a,b)=>a+b,0)/scored.length:null;
      const final=overall.find(x=>x.contestant.id===person.id);
      return `<tr><th scope="row"><button class="text-button" type="button" data-expand-contestant="${escapeHTML(person.id)}">${escapeHTML(person.number)} · ${escapeHTML(person.name)} (show criteria)</button></th>${judges.map((j,jIndex)=>`<td>${values[jIndex]==null?'<span class="weight-warning">—</span>':`${values[jIndex].toFixed(2)}<small class="judge-rank">Rank ${ranks[jIndex][index]}</small>`}</td>`).join('')}<td>${average==null?'—':average.toFixed(2)}</td><td>${final?.place==null?'—':ordinal(final.place)}</td></tr>`;
    }).join('');
    $('#results-body').insertAdjacentHTML('beforeend',`<tr class="judge-total-row"><th scope="row">Judge totals</th>${sums.map(n=>`<td>${n.toFixed(2)}</td>`).join('')}<td colspan="2"></td></tr>`);
  }
  async function verifyPin(){
    if(!state.pin)return true;
    if(!crypto?.subtle){toast('The saved chairperson PIN cannot be checked because crypto.subtle is unavailable.','error');return false;}
    const entered=window.prompt('Enter the chairperson PIN.');if(entered==null)return false;
    const salt=state.pin.salt.split(',').map(Number),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${salt.join(',')}:${entered}`));
    const hash=[...new Uint8Array(digest)].join(',');if(hash!==state.pin.hash){toast('The chairperson PIN is incorrect.','error');return false;}return true;
  }
  function exportBackup(){
    audit('Backup export','Downloaded JSON backup');
    const stamp=new Date().toISOString();state.lastBackupAt=stamp;state.updatedAt=stamp;
    try{localStorage.setItem(KEY,JSON.stringify(state));}catch{toast('Backup downloaded, but the updated backup time could not be stored locally.','error');}
    download('pageant-backup.json',JSON.stringify(state,null,2),'application/json');
    renderSidebar();
  }
  function importBackup(file){
    const reader=new FileReader();
    reader.onload=async()=>{
      try{
        const parsed=JSON.parse(String(reader.result));
        if(!parsed||typeof parsed!=='object'||!parsed.event||!Array.isArray(parsed.contestants)||!Array.isArray(parsed.judges)||!Array.isArray(parsed.categories)||!parsed.scores)throw new Error('This does not look like a Pageant backup.');
        if(!window.confirm('Restore this backup? The current event saved in this browser will be replaced.'))return;
        if(!await verifyPin())return;
        state=normalize(parsed);const report=lastNormalizeReport;
        audit('Backup restore',`Restored backup${report.migrated?' and migrated it to version 2':''}`,[`Dropped ${report.dropped} invalid score or reference${report.dropped===1?'':'s'}`,`Remapped ${report.remapped} unsafe IDs`]);
        resultTab='overall';renderAll();$('#backup-dialog').close();showView('overview');
        toast(`Backup restored. ${report.migrated?'Migrated to version 2. ':''}${report.dropped} invalid score or reference${report.dropped===1?' was':'s were'} dropped.`);
      }catch(error){toast(error.message||'Could not restore this backup.','error');}
      $('#json-file').value='';
    };
    reader.onerror=()=>toast('Could not read this backup file.','error');reader.readAsText(file);
  }
  function saveEvent(event){
    event.preventDefault();const form=event.currentTarget;
    state.event={name:form.elements.name.value.trim(),date:form.elements.date.value,location:form.elements.location.value.trim()};
    audit('Event settings','Updated event details');renderAll();showView('overview');toast('Event details saved.');
  }
  function removeRecord(type,recordId,categoryId){
    const protectedContestant=type==='contestant'&&state.rounds.some(r=>r.finalizedAt&&r.snapshot?.some(x=>x.contestantId===recordId));
    const protectedJudge=type==='judge'&&state.rounds.some(r=>r.finalizedAt);
    const cat=type==='category'?state.categories.find(c=>c.id===recordId):type==='criterion'?state.categories.find(c=>c.id===categoryId):null;
    if(protectedContestant||protectedJudge||cat&&state.rounds.find(r=>r.id===cat.roundId)?.finalizedAt){toast('This record appears in a finalized round and cannot be removed.','error');return;}
    if(!window.confirm(`Remove this ${type}? Related scores will also be removed.`))return;
    if(type==='contestant'){state.contestants=state.contestants.filter(x=>x.id!==recordId);deleteScoreParts(0,recordId);}
    else if(type==='judge'){state.judges=state.judges.filter(x=>x.id!==recordId);deleteScoreParts(1,recordId);}
    else if(type==='category'){state.categories=state.categories.filter(x=>x.id!==recordId);deleteScoreParts(2,recordId);}
    else if(type==='criterion'){const category=state.categories.find(c=>c.id===categoryId);if(category)category.criteria=category.criteria.filter(x=>x.id!==recordId);deleteScoreParts(3,recordId,categoryId);}
    audit('Record remove',`Removed ${type}`);renderAll();
  }
  function showModalError(message, field){ const error=$('#modal-error'); error.textContent=message; error.hidden=false; field?.setAttribute('aria-invalid','true'); field?.focus(); }
  function saveEntity(e){
    const ctx=editContext;
    const selectedRecord=ctx?.type==='category'?state.categories.find(x=>x.id===ctx.id):ctx?.type==='criterion'?state.categories.find(c=>c.id===ctx.categoryId):null;
    if(selectedRecord&&state.rounds.find(r=>r.id===selectedRecord.roundId)?.finalizedAt){toast('This category belongs to a finalized round and cannot be edited.','error');return;}
    if(ctx?.type==='contestant'){
      const number=$('#edit-form [name="number"]');
      if(state.contestants.some(x=>x.number.toLowerCase()===number.value.trim().toLowerCase()&&x.id!==ctx.id)){showModalError('That contestant number is already in use.',number);return;}
    }
    if(ctx?.type==='category'){
      const weight=$('#edit-form [name="weight"]');
      if(!validScore(Number(weight.value))){showModalError('Category weight must be between 0 and 100.',weight);return;}
      const targetRoundId=$('#edit-form [name="roundId"]')?.value,targetRoundRecord=state.rounds.find(round=>round.id===targetRoundId);
      if(targetRoundRecord?.finalizedAt){toast('Reopen this round before adding or moving categories into it.','error');return;}
      for(const row of $$('[data-category-criterion-row]')){
        const name=row.querySelector('[name="criterionName"]'), value=row.querySelector('[name="criterionWeight"]');
        if((name.value.trim()||value.value.trim())&&(!name.value.trim()||!validScore(Number(value.value)))){showModalError('Enter a criterion name and a weight from 0 to 100, or remove the row.',!name.value.trim()?name:value);return;}
      }
      const targetRound=$('#edit-form [name="roundId"]')?.value, oldId=ctx.id;
      saveEntityLegacy(e);
      const saved=state.categories.find(c=>c.id===(oldId||state.categories.at(-1)?.id));
      if(saved&&state.rounds.some(r=>r.id===targetRound))saved.roundId=targetRound;
      audit(oldId?'Record edit':'Record add',`${oldId?'Updated':'Added'} category ${saved?.name||''}`);persist();renderAll();return;
    }
    if(ctx?.type==='criterion'){
      const weight=$('#edit-form [name="weight"]');
      if(!validScore(Number(weight.value))){showModalError('Criterion weight must be between 0 and 100.',weight);return;}
    }
    if(ctx?.type==='round'){
      e.preventDefault(); const form=new FormData(e.currentTarget); const get=k=>String(form.get(k)||'').trim();
      const tieBreakers=get('tieBreakers').split(',').map(value=>value.trim()).filter(Boolean).map(value=>value==='firsts'?{type:'firsts'}:value==='rankSum'?{type:'rankSum'}:(()=>{const category=state.categories.find(c=>c.id===value||c.name.toLowerCase()===value.toLowerCase());return {type:'category',categoryId:category?.id||value,name:category?.name||value};})());
      const record={id:ctx.id||id('round'),name:get('name')||'Round',advanceCount:get('advanceCount')?Math.max(1,Number(get('advanceCount'))):null,tieBreakers};
      const old=state.rounds.findIndex(x=>x.id===ctx.id); if(old<0)state.rounds.push(record); else state.rounds[old]=record;
      $('#edit-dialog').close(); editContext=null; audit(old<0?'Round add':'Round edit',`${old<0?'Added':'Updated'} round ${record.name}`); renderAll(); return;
    }
    $('#modal-error').hidden=true; $('#modal-error').textContent='';
    const oldId=ctx?.id;
    saveEntityLegacy(e);
    if(ctx&&['contestant','judge','criterion'].includes(ctx.type))audit(oldId?'Record edit':'Record add',`${oldId?'Updated':'Added'} ${ctx.type}`);
  }
  function resetContest(){ $('#reset-confirmation').value=''; $('#reset-error').hidden=true; $('#reset-dialog').showModal(); }
  $('#reset-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    if($('#reset-confirmation').value!=='RESET'){$('#reset-error').textContent='Type RESET exactly to clear this contest.';$('#reset-error').hidden=false;$('#reset-confirmation').focus();return;}
    if(!await verifyPin())return;
    const history=state.audit.slice();state=blankState();state.audit=history;scoreDrafts.clear();resultTab='overall';audit('Contest reset','Reset all contest fields');persist();$('#reset-dialog').close();renderAll();showView('overview');
  });
  $('#reset-backup')?.addEventListener('click',exportBackup);
  document.querySelectorAll('[data-close-reset]').forEach(button=>button.addEventListener('click',()=>$('#reset-dialog').close()));
  $('#modal-fields')?.addEventListener('input',event=>{if(event.target.matches('input,select')){event.target.removeAttribute('aria-invalid');$('#modal-error').hidden=true;}});
  function openEntity(type,record={}){
    if(type==='category'){
      openEntityLegacy(type,record);
      const target=$('#modal-fields'); const selected=record.roundId||$('#category-round-filter')?.value||state.rounds[0]?.id||'';
      target.insertAdjacentHTML('beforeend',`<label>Round<select name="roundId">${state.rounds.map(r=>`<option value="${escapeHTML(r.id)}" ${r.id===selected?'selected':''} ${r.finalizedAt?'disabled':''}>${escapeHTML(r.name)}${r.finalizedAt?' (finished)':''}</option>`).join('')}</select></label>`);
      const weightLabel=$('#modal-fields [name="weight"]')?.parentElement;
      if(weightLabel?.firstChild)weightLabel.firstChild.textContent='Category contribution within round (%)';
      return;
    }
    if(type!=='round'){openEntityLegacy(type,record);return;}
    const existing=state.rounds.find(r=>r.id===record.id);
    const order=(existing?.tieBreakers||[]).map(rule=>rule.type==='category'?state.categories.find(c=>c.id===rule.categoryId)?.name||rule.categoryId:rule.type).join(',');
    openModal(existing?'Edit round':'Add round',field('Round name','name',existing?.name||'','text','e.g. Final','required maxlength="80"')+field('Advance count (blank for final round)','advanceCount',existing?.advanceCount??'','number','e.g. 5','min="1" step="1"')+field('Tie-break order (category name, firsts, rankSum)','tieBreakers',order,'text','Evening gown, firsts, rankSum'),{type:'round',id:existing?.id});
  }
  function setupNewCategory(roundId){return {id:id('setup-category'),roundId,name:'',criteria:[{id:id('setup-criterion'),name:''}]};}
  function setupRoundChoices(){return [...state.rounds.map(round=>({id:round.id,name:round.name,finalized:Boolean(round.finalizedAt)})),...(setupWizardDraft?.rounds||[]).map(round=>({id:round.id,name:round.name||'New round',finalized:false}))];}
  function setupCategoryKey(category){return category.isNew?`new:${category.id}`:category.id;}
  function setupAffectedRounds(){return [...new Set(setupWizardDraft.categories.map(category=>category.roundId).filter(Boolean))];}
  function seedSetupPreview(){
    const categoryWeights={},criterionWeights={};
    for(const roundId of setupAffectedRounds()){
      const existing=state.categories.filter(category=>category.roundId===roundId),added=setupWizardDraft.categories.filter(category=>category.roundId===roundId).map(category=>({...category,isNew:true}));
      const all=[...existing,...added],shares=Scoring.evenWeights(all.length);
      all.forEach((category,index)=>{const key=setupCategoryKey(category);categoryWeights[key]=shares[index];if(category.isNew){const criteriaShares=Scoring.evenWeights(category.criteria.length);category.criteria.forEach((criterion,criterionIndex)=>criterionWeights[`${category.id}|${criterion.id}`]=criteriaShares[criterionIndex]);}});
    }
    setupWizardDraft.preview={categoryWeights,criterionWeights};setupWizardDraft.previewRevision=setupWizardDraft.structureRevision;
  }
  function renderSetupWizard(){
    const content=$('#setup-wizard-content'),footer=$('#setup-wizard-footer'),draft=setupWizardDraft;
    if(!draft)return;
    if(draft.step==='edit'){
      const choices=setupRoundChoices();
      content.innerHTML=`<p class="modal-description">Add rounds, categories, and criteria here. Existing event records stay in place.</p><h3 class="wizard-section-title">New rounds</h3><div class="wizard-round-list">${draft.rounds.map((round,index)=>`<div class="wizard-round-row"><label>Round name<input maxlength="80" data-setup-round-index="${index}" data-setup-round-field="name" value="${escapeHTML(round.name)}" placeholder="e.g. Final"></label><label>Advance count (blank for final)<input type="number" min="1" step="1" data-setup-round-index="${index}" data-setup-round-field="advanceCount" value="${escapeHTML(round.advanceCount)}" placeholder="e.g. 5"></label><button class="text-button" type="button" data-remove-setup-round="${escapeHTML(round.id)}">Remove round</button></div>`).join('')||'<p class="wizard-hint">Use the existing Main round, or add rounds for each stage.</p>'}</div><button class="button button-outline" type="button" data-add-setup-round>Add round</button><h3 class="wizard-section-title">Categories and criteria</h3><div class="wizard-category-list">${draft.categories.map((category,index)=>`<article class="wizard-category-card"><div class="wizard-category-heading"><strong>Category ${index+1}</strong><button class="text-button" type="button" data-remove-setup-category="${escapeHTML(category.id)}">Remove</button></div><div class="wizard-category-fields"><label>Round<select data-setup-category-index="${index}" data-setup-category-field="roundId">${choices.map(choice=>`<option value="${escapeHTML(choice.id)}" ${choice.id===category.roundId?'selected':''} ${choice.finalized?'disabled':''}>${escapeHTML(choice.name)}${choice.finalized?' (finalized)':''}</option>`).join('')}</select></label><label>Category name<input maxlength="80" data-setup-category-index="${index}" data-setup-category-field="name" value="${escapeHTML(category.name)}" placeholder="e.g. Evening wear"></label></div><div class="wizard-criteria-list">${category.criteria.map((criterion,criterionIndex)=>`<div class="wizard-criterion-row"><label>Criterion ${criterionIndex+1}<input maxlength="80" data-setup-category-id="${escapeHTML(category.id)}" data-setup-criterion-index="${criterionIndex}" data-setup-criterion-field="name" value="${escapeHTML(criterion.name)}" placeholder="e.g. Confidence"></label><button class="text-button" type="button" data-remove-setup-criterion="${escapeHTML(category.id)}|${escapeHTML(criterion.id)}">Remove</button></div>`).join('')}</div><button class="text-button" type="button" data-add-setup-criterion="${escapeHTML(category.id)}">Add criterion</button></article>`).join('')}</div><button class="button button-outline" type="button" data-add-setup-category>Add category</button><div id="setup-wizard-error" class="wizard-error" role="alert" hidden></div>`;
      footer.innerHTML='<button class="button button-outline" type="button" data-setup-action="cancel">Cancel</button><button class="button button-primary" type="button" data-setup-action="review">Review weights</button>';
      return;
    }
    if(!draft.preview||draft.previewRevision!==draft.structureRevision)seedSetupPreview();
    const choices=setupRoundChoices(),groups=setupAffectedRounds().map(roundId=>{
      const round=choices.find(item=>item.id===roundId),existing=state.categories.filter(category=>category.roundId===roundId),added=draft.categories.filter(category=>category.roundId===roundId).map(category=>({...category,isNew:true}));
      const rows=[...existing,...added].map(category=>{
        const key=setupCategoryKey(category),weight=draft.preview.categoryWeights[key];
        const criteria=category.isNew?`<div class="wizard-criterion-weights">${category.criteria.map(criterion=>`<div class="wizard-weight-row"><span>↳ ${escapeHTML(criterion.name||'(new criterion)')}</span><label>Weight within category (%)<input type="number" min="0" max="100" step="0.1" data-setup-criterion-weight="${escapeHTML(category.id)}|${escapeHTML(criterion.id)}" value="${escapeHTML(draft.preview.criterionWeights[`${category.id}|${criterion.id}`])}"></label></div>`).join('')}</div><small class="wizard-criteria-total" data-setup-criteria-total="${escapeHTML(category.id)}"></small>`:'';
        return `<div class="wizard-weight-row"><span>${escapeHTML(category.name||'(new category)')}${category.isNew?' <small>New</small>':''}</span><label>Category contribution in ${escapeHTML(round?.name||'round')} (%)<input type="number" min="0" max="100" step="0.1" data-setup-category-weight="${escapeHTML(key)}" value="${escapeHTML(weight)}"></label></div>${criteria}`;
      }).join('');
      return `<section class="wizard-weight-group"><h3>${escapeHTML(round?.name||'Round')} <span data-setup-round-total="${escapeHTML(roundId)}"></span></h3>${rows}</section>`;
    }).join('');
    content.innerHTML=`<p class="modal-description">Category contributions are split evenly within each affected round, and criteria are split evenly within each new category. Existing category contributions in these rounds will change to the values shown. Edit any value before saving. These percentages do not carry scores between rounds.</p>${groups}<div id="setup-wizard-error" class="wizard-error" role="alert" hidden></div>`;
    footer.innerHTML='<button class="button button-outline" type="button" data-setup-action="back">Back</button><button class="button button-outline" type="button" data-setup-action="cancel">Cancel</button><button class="button button-primary" type="button" data-setup-action="save">Save setup</button>';
    updateSetupWeightTotals();
  }
  function setupWizardError(message){const error=$('#setup-wizard-error');if(error){error.textContent=message;error.hidden=false;}}
  function validateSetupDraft(){
    const names=new Set(state.rounds.map(round=>round.name.trim().toLowerCase()));
    for(const round of setupWizardDraft.rounds){const name=round.name.trim();if(!name){setupWizardError('Enter a name for every new round.');return false;}if(names.has(name.toLowerCase())){setupWizardError(`The round “${name}” already exists.`);return false;}names.add(name.toLowerCase());if(round.advanceCount&&(!/^\d+$/.test(round.advanceCount)||Number(round.advanceCount)<1)){setupWizardError(`Enter a whole number of at least 1 for ${name}’s advance count.`);return false;}}
    if(!setupWizardDraft.categories.length){setupWizardError('Add at least one category.');return false;}
    const newRoundIds=new Set(setupWizardDraft.rounds.map(round=>round.id));
    for(const round of setupWizardDraft.rounds)if(!setupWizardDraft.categories.some(category=>category.roundId===round.id)){setupWizardError(`Add at least one category to ${round.name||'each new round'}.`);return false;}
    for(const category of setupWizardDraft.categories){
      const target=state.rounds.find(round=>round.id===category.roundId);
      if((target&&target.finalizedAt)||(!target&&!newRoundIds.has(category.roundId))){setupWizardError('Choose an active existing round or a round added in this wizard.');return false;}
      if(!category.name.trim()){setupWizardError('Enter a name for every category.');return false;}
      if(!category.criteria.length||category.criteria.some(criterion=>!criterion.name.trim())){setupWizardError(`Enter a name for every criterion in ${category.name}.`);return false;}
    }
    return true;
  }
  function updateSetupWeightTotals(){
    if(!setupWizardDraft?.preview)return;
    for(const roundId of setupAffectedRounds()){
      const inputs=$$('[data-setup-category-weight]'),sum=inputs.reduce((total,input)=>{const key=input.dataset.setupCategoryWeight;const roundCategories=state.categories.filter(category=>category.roundId===roundId).map(setupCategoryKey).concat(setupWizardDraft.categories.filter(category=>category.roundId===roundId).map(category=>`new:${category.id}`));return total+(roundCategories.includes(key)?Number(input.value||0):0);},0);
        const output=$(`[data-setup-round-total="${CSS.escape(roundId)}"]`);if(output)output.textContent=`Category contribution total: ${sum.toFixed(1)}%`;
    }
    for(const category of setupWizardDraft.categories){const sum=category.criteria.reduce((total,criterion)=>total+Number(setupWizardDraft.preview.criterionWeights[`${category.id}|${criterion.id}`]||0),0),output=$$('[data-setup-criteria-total]').find(item=>item.dataset.setupCriteriaTotal===category.id);if(output)output.textContent=`Criteria weights: ${sum.toFixed(1)}%`;}
  }
  function openSetupWizard(){setupWizardDraft={step:'edit',rounds:[],categories:[setupNewCategory(state.rounds.find(round=>!round.finalizedAt)?.id||'')],structureRevision:0,previewRevision:-1,preview:null};renderSetupWizard();$('#setup-wizard-dialog').showModal();}
  function addSetupRound(){setupWizardDraft.rounds.push({id:id('setup-round'),name:'',advanceCount:''});setupWizardDraft.structureRevision++;renderSetupWizard();}
  function addSetupCategory(){const target=setupWizardDraft.rounds.at(-1)?.id||state.rounds.find(round=>!round.finalizedAt)?.id||'';setupWizardDraft.categories.push(setupNewCategory(target));setupWizardDraft.structureRevision++;renderSetupWizard();}
  function saveSetupWizard(){
    if(!validateSetupDraft())return;
    const roundIds=new Map(),groups=new Map();for(const roundId of setupAffectedRounds())groups.set(roundId,state.categories.filter(category=>category.roundId===roundId).map(category=>({key:setupCategoryKey(category),weight:setupWizardDraft.preview.categoryWeights[setupCategoryKey(category)]})).concat(setupWizardDraft.categories.filter(category=>category.roundId===roundId).map(category=>({key:`new:${category.id}`,weight:setupWizardDraft.preview.categoryWeights[`new:${category.id}`]}))));
    for(const[roundId,items]of groups){const values=items.map(item=>Number(item.weight));if(values.some(value=>!validScore(value))||Math.abs(values.reduce((sum,value)=>sum+value,0)-100)>.01){setupWizardError(`Category contributions for ${state.rounds.find(round=>round.id===roundId)?.name||setupWizardDraft.rounds.find(round=>round.id===roundId)?.name||'this round'} must total 100%.`);return;}}
    for(const category of setupWizardDraft.categories){const values=category.criteria.map(criterion=>Number(setupWizardDraft.preview.criterionWeights[`${category.id}|${criterion.id}`]));if(values.some(value=>!validScore(value))||Math.abs(values.reduce((sum,value)=>sum+value,0)-100)>.01){setupWizardError(`Criterion weights in ${category.name} must total 100%.`);return;}}
    const beforeRounds=state.rounds.slice(),beforeCategories=state.categories.slice(),oldWeights=new Map(state.categories.map(category=>[category.id,category.weight]));
    for(const round of setupWizardDraft.rounds){const realId=id('round');roundIds.set(round.id,realId);state.rounds.push({id:realId,name:round.name.trim(),advanceCount:round.advanceCount?Number(round.advanceCount):null,tieBreakers:[],finalizedAt:null,snapshot:null,advancingIds:null});}
    for(const[roundId,items]of groups)for(const item of items){if(!item.key.startsWith('new:')){const category=state.categories.find(existing=>existing.id===item.key);if(category)category.weight=Number(item.weight);}}
    for(const category of setupWizardDraft.categories){const realCategoryId=id('category'),realRoundId=roundIds.get(category.roundId)||category.roundId;state.categories.push({id:realCategoryId,name:category.name.trim(),roundId:realRoundId,weight:Number(setupWizardDraft.preview.categoryWeights[`new:${category.id}`]),criteria:category.criteria.map(criterion=>({id:id('criterion'),name:criterion.name.trim(),weight:Number(setupWizardDraft.preview.criterionWeights[`${category.id}|${criterion.id}`])}))});}
    if(!persist()){state.rounds=beforeRounds;state.categories=beforeCategories;for(const category of state.categories)category.weight=oldWeights.get(category.id);toast('Setup could not be saved because local storage is full.','error');return;}
    audit('Setup wizard',`Added ${setupWizardDraft.rounds.length} round${setupWizardDraft.rounds.length===1?'':'s'} and ${setupWizardDraft.categories.length} categor${setupWizardDraft.categories.length===1?'y':'ies'}`);$('#setup-wizard-dialog').close();setupWizardDraft=null;renderAll();showView('rounds');toast('Rounds, categories, and criteria saved.');
  }
  $('#open-setup-wizard')?.addEventListener('click',openSetupWizard);$('#open-setup-wizard-categories')?.addEventListener('click',openSetupWizard);
  $('#setup-wizard-content').addEventListener('input',event=>{
    const field=event.target;
    if(field.dataset.setupRoundIndex!==undefined){const round=setupWizardDraft.rounds[Number(field.dataset.setupRoundIndex)];if(round)round[field.dataset.setupRoundField]=field.value;}
    if(field.dataset.setupCategoryIndex!==undefined){const category=setupWizardDraft.categories[Number(field.dataset.setupCategoryIndex)];if(category)category[field.dataset.setupCategoryField]=field.value;}
    if(field.dataset.setupCategoryId){const category=setupWizardDraft.categories.find(item=>item.id===field.dataset.setupCategoryId),criterion=category?.criteria[Number(field.dataset.setupCriterionIndex)];if(criterion)criterion[field.dataset.setupCriterionField]=field.value;}
    if(field.dataset.setupCategoryWeight&&setupWizardDraft.preview){setupWizardDraft.preview.categoryWeights[field.dataset.setupCategoryWeight]=field.value;updateSetupWeightTotals();}
    if(field.dataset.setupCriterionWeight&&setupWizardDraft.preview)setupWizardDraft.preview.criterionWeights[field.dataset.setupCriterionWeight]=field.value;
  });
  $('#setup-wizard-dialog').addEventListener('change',event=>{if(event.target.dataset.setupCategoryIndex!==undefined){const category=setupWizardDraft.categories[Number(event.target.dataset.setupCategoryIndex)];if(category){category.roundId=event.target.value;setupWizardDraft.structureRevision++;}}});
  $('#setup-wizard-dialog').addEventListener('click',event=>{
    if(event.target.closest('[data-add-setup-round]')){addSetupRound();return;}
    if(event.target.closest('[data-add-setup-category]')){addSetupCategory();return;}
    const addCriterion=event.target.closest('[data-add-setup-criterion]');if(addCriterion){const category=setupWizardDraft.categories.find(item=>item.id===addCriterion.dataset.addSetupCriterion);if(category){category.criteria.push({id:id('setup-criterion'),name:''});setupWizardDraft.structureRevision++;renderSetupWizard();}return;}
    const removeCriterion=event.target.closest('[data-remove-setup-criterion]');if(removeCriterion){const[categoryId,criterionId]=removeCriterion.dataset.removeSetupCriterion.split('|'),category=setupWizardDraft.categories.find(item=>item.id===categoryId);if(category){category.criteria=category.criteria.filter(item=>item.id!==criterionId);setupWizardDraft.structureRevision++;renderSetupWizard();}return;}
    const removeCategory=event.target.closest('[data-remove-setup-category]');if(removeCategory){setupWizardDraft.categories=setupWizardDraft.categories.filter(category=>category.id!==removeCategory.dataset.removeSetupCategory);setupWizardDraft.structureRevision++;renderSetupWizard();return;}
    const removeRound=event.target.closest('[data-remove-setup-round]');if(removeRound){setupWizardDraft.rounds=setupWizardDraft.rounds.filter(round=>round.id!==removeRound.dataset.removeSetupRound);const fallback=state.rounds.find(round=>!round.finalizedAt)?.id||setupWizardDraft.rounds[0]?.id||'';setupWizardDraft.categories.forEach(category=>{if(category.roundId===removeRound.dataset.removeSetupRound)category.roundId=fallback;});setupWizardDraft.structureRevision++;renderSetupWizard();return;}
    const action=event.target.closest('[data-setup-action]')?.dataset.setupAction;if(action==='cancel'){ $('#setup-wizard-dialog').close();return;}if(action==='review'){if(validateSetupDraft()){setupWizardDraft.step='review';setupWizardDraft.preview=null;renderSetupWizard();}return;}if(action==='back'){setupWizardDraft.step='edit';setupWizardDraft.structureRevision++;renderSetupWizard();return;}if(action==='save')saveSetupWizard();
  });
  $('#setup-wizard-dialog').addEventListener('close',()=>{setupWizardDraft=null;});
  function finalizeRound(round){
    if(round.finalizedAt){toast(`${round.name} is already finalized.`,'error');return;}
    const roundIndex=state.rounds.indexOf(round);
    const blocker=roundIndex>0?state.rounds.slice(0,roundIndex).find(item=>!item.finalizedAt):null;
    if(blocker){toast(`Finish ${blocker.name} before finishing ${round.name}.`,'error');return;}
    const categories=state.categories.filter(c=>c.roundId===round.id);
    if(!categories.length){
      $('#category-round-filter').value=round.id;
      showView('categories');
      toast(`${round.name} has no categories. Add a category before finishing this round.`,'error');
      return;
    }
    const categoryWeightTotal=categories.reduce((sum,category)=>sum+Number(category.weight||0),0);
    if(!Scoring.validWeights(categories)){
      showView('rounds');
      toast(`${round.name} category contributions total ${categoryWeightTotal.toFixed(1)}%. Choose Set contributions to 100% on this round card, then finish the round.`,'error');
      return;
    }
    const rows=roundResult(round.id);
    if(rows.some(x=>!x.complete)){toast('Every contestant and judge must complete every score before finishing this round.','error');return;}
    const cutoff=cutoffSelection(rows,round.advanceCount);
    if(cutoff.warning&&!validAdvancementSelection(cutoff,round.advancingIds,round.advanceCount)){toast(`Resolve the cutoff tie and choose exactly ${round.advanceCount} contestants on Results before finishing ${round.name}.`,'error');return;}
    const tied=assignPlaces(rows).some((row,i,all)=>all.some((other,j)=>j!==i&&row.place===other.place));
    if(tied&&!window.confirm('Accept shared places for unresolved ties?'))return;
    const categoryIds=new Set(categories.map(category=>category.id));
    const frozenScores=Object.fromEntries(Object.entries(state.scores).filter(([key])=>categoryIds.has(key.split('|')[2])));
    round.advancingIds=cutoff.warning?round.advancingIds:cutoff.advancing;
    round.snapshot={finalizedAt:new Date().toISOString(),standings:assignPlaces(rows).map(row=>({contestantId:row.contestant.id,score:row.value,place:row.place})),advancingIds:[...round.advancingIds],scores:frozenScores}; round.finalizedAt=round.snapshot.finalizedAt;
    audit('Round finalize',`Finished ${round.name}`); for(const category of categories) for(const judge of state.judges) if(!state.locks.some(x=>x.categoryId===category.id&&x.judgeId===judge.id))state.locks.push({categoryId:category.id,judgeId:judge.id,lockedAt:round.finalizedAt});
    persist(); renderAll(); $('#backup-prompt').innerHTML='Round finished. <button class="button button-outline" data-download-backup>Download backup</button>';
    const nextRound=state.rounds[roundIndex+1];
    if(nextRound){
      $('#score-round').value=nextRound.id;
      showView('scores');
      const advancingCount=round.advancingIds?.length||0;
      toast(`${round.name} is finished. ${advancingCount} contestant${advancingCount===1?'':'s'} advance to ${nextRound.name}; Score entry is ready.`);
    }else{
      showView('results');
      toast(`${round.name} is finished. This was the last round.`);
    }
  }
  function moveRound(roundId,offset){
    if(state.rounds.some(round=>round.finalizedAt)){toast('Reopen every finished round before changing the round order.','error');return;}
    const from=state.rounds.findIndex(round=>round.id===roundId),to=from+offset;
    if(from<0||to<0||to>=state.rounds.length)return;
    const previous=state.rounds;state.rounds=[...state.rounds];[state.rounds[from],state.rounds[to]]=[state.rounds[to],state.rounds[from]];
    if(!persist()){state.rounds=previous;renderAll();toast('Round order could not be saved because local storage is full.','error');return;}
    audit('Round order',`Moved ${state.rounds[to].name} to position ${to+1}`);renderAll();toast('Round order updated.');
  }
  function lockCurrentSheet(judgeId=$('#score-judge').value){
    const category=state.categories.find(item=>item.id===$('#score-category').value),judge=state.judges.find(item=>item.id===judgeId);
    if(!category||!judge||state.locks.some(item=>item.categoryId===category.id&&item.judgeId===judge.id))return;
    const round=state.rounds.find(item=>item.id===category.roundId),people=contestantsForRound(state.rounds.indexOf(round));
    if(round?.finalizedAt){toast('Unfinalize this round before changing its sheets.','error');return;}
    if(people.some(person=>category.criteria.some(criterion=>scoreValue(person.id,judge.id,category.id,criterion.id)==null))){toast(`Enter every score for ${judge.name} before locking this sheet.`,'error');return;}
    state.locks.push({categoryId:category.id,judgeId:judge.id,lockedAt:new Date().toISOString()});audit('Sheet lock',`Locked ${judge.name} / ${category.name}`);renderScores();$('#backup-prompt').innerHTML='Sheet locked. <button class="button button-outline" data-download-backup>Download backup</button>';
  }
  async function unlockCurrentSheet(judgeId=$('#score-judge').value){
    const categoryId=$('#score-category').value,selectedCategory=state.categories.find(item=>item.id===categoryId),judge=state.judges.find(item=>item.id===judgeId);
    if(!judge||state.rounds.find(round=>round.id===selectedCategory?.roundId)?.finalizedAt){toast('Unfinalize the round before changing its locked sheets.','error');return;}
    const reason=window.prompt(`Enter a reason of at least 5 characters to unlock ${judge.name}'s sheet.`);
    if(!reason||reason.trim().length<5){toast('A reason of at least 5 characters is required to unlock this sheet.','error');return;}
    if(!await verifyPin())return;
    state.locks=state.locks.filter(item=>!(item.categoryId===categoryId&&item.judgeId===judgeId));audit('Sheet unlock',`Unlocked ${judge.name} / ${selectedCategory?.name||'category'}`,[],reason.trim());renderScores();
  }
  $('#score-round')?.addEventListener('change',renderScores);
  $('#category-round-filter')?.addEventListener('change',renderCategories);
  $('#results-round')?.addEventListener('change',()=>{resultTab='overall';renderResults();});
  $('#results-view')?.addEventListener('change',renderByJudge);
  $('#results-category')?.addEventListener('change',()=>{resultTab=$('#results-category').value;renderResults();});
  $('#score-category').addEventListener('change',renderScores); $('#score-criterion')?.addEventListener('change',renderScores);
  $('#add-round')?.addEventListener('click',()=>openEntity('round'));
  $('#print-results')?.addEventListener('click',()=>window.print());
  $('#finalize-round')?.addEventListener('click',()=>{const r=selectedRound();if(r)finalizeRound(r);});
  $('#unfinalize-round')?.addEventListener('click',async()=>{const r=selectedRound();if(state.rounds.slice(state.rounds.indexOf(r)+1).some(round=>round.finalizedAt)){toast('Reopen later rounds first.','error');return;}const reason=window.prompt('Enter a reason of at least 5 characters to reopen this round.');if(!reason||reason.trim().length<5){toast('A reason of at least 5 characters is required to reopen this round.','error');return;}if(!await verifyPin())return;r.finalizedAt=null;r.snapshot=null;r.advancingIds=null;state.locks=state.locks.filter(lock=>!state.categories.some(c=>c.roundId===r.id&&c.id===lock.categoryId));audit('Round reopen',`Reopened ${r.name}`,[],reason.trim());renderAll();});
  $('#lock-sheet')?.addEventListener('click',lockCurrentSheet); $('#unlock-sheet')?.addEventListener('click',unlockCurrentSheet);
  $('#audit-type')?.addEventListener('change',renderAudit); $('#audit-search')?.addEventListener('input',renderAudit);
  $('#save-pin')?.addEventListener('click',async()=>{if(!crypto?.subtle){$('#pin-status').textContent='PIN option unavailable because crypto.subtle is not supported here.';return;}const value=$('#pin-value').value;if(value.length<4){$('#pin-status').textContent='Enter a PIN with at least four characters.';return;}const salt=crypto.getRandomValues(new Uint8Array(16));const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${[...salt].join(',')}:${value}`));state.pin={salt:[...salt].join(','),hash:[...new Uint8Array(hash)].join(',')};audit('PIN change','Saved chairperson PIN');$('#pin-value').value='';$('#pin-status').textContent='Chairperson PIN saved.';});
  if(!globalThis.crypto?.subtle){$('#pin-value').hidden=true;$('#save-pin').hidden=true;$('#pin-status').textContent='The chairperson PIN option is unavailable because crypto.subtle is not supported here.';}
  document.addEventListener('click',event=>{
    const lockJudge=event.target.closest('[data-lock-judge]');if(lockJudge){lockCurrentSheet(lockJudge.dataset.lockJudge);return;}
    const unlockJudge=event.target.closest('[data-unlock-judge]');if(unlockJudge){unlockCurrentSheet(unlockJudge.dataset.unlockJudge);return;}
    const expand=event.target.closest('[data-expand-contestant]');if(expand){
      const row=expand.closest('tr'),next=row.nextElementSibling;
      if(next?.matches('[data-criteria-detail]')){next.remove();expand.textContent=expand.textContent.replace('(hide criteria)','(show criteria)');return;}
      const person=state.contestants.find(c=>c.id===expand.dataset.expandContestant),round=selectedRound();
      const categories=state.categories.filter(c=>c.roundId===round.id&&(!$('#results-category').value||c.id===$('#results-category').value));
      const detail=categories.flatMap(category=>category.criteria.map(criterion=>`<tr><th>${escapeHTML(category.name)} · ${escapeHTML(criterion.name)}</th>${state.judges.map(judge=>{const score=scoreValue(person.id,judge.id,category.id,criterion.id);return `<td>${score==null?'<span class="weight-warning">—</span>':score.toFixed(2)}</td>`;}).join('')}</tr>`)).join('');
      row.insertAdjacentHTML('afterend',`<tr data-criteria-detail="${escapeHTML(person.id)}"><td colspan="${state.judges.length+3}"><div class="criteria-breakdown"><table><thead><tr><th>Category and criterion</th>${state.judges.map(j=>`<th>${escapeHTML(j.name)}</th>`).join('')}</tr></thead><tbody>${detail}</tbody></table></div></td></tr>`);
      expand.textContent=expand.textContent.replace('(show criteria)','(hide criteria)');return;
    }
    const draft=event.target.closest('[data-open-draft]');if(draft){const [judgeId,categoryId]=draft.dataset.openDraft.split('|');const category=state.categories.find(c=>c.id===categoryId);if(category)$('#score-round').value=category.roundId;renderScores();$('#score-judge').value=judgeId;$('#score-category').value=categoryId;renderScores();return;}
    const normalizeRound=event.target.closest('[data-normalize-round]');if(normalizeRound){normalizeRoundContributions(normalizeRound.dataset.normalizeRound);return;}
    const roundUp=event.target.closest('[data-round-up]');if(roundUp){moveRound(roundUp.dataset.roundUp,-1);return;}
    const roundDown=event.target.closest('[data-round-down]');if(roundDown){moveRound(roundDown.dataset.roundDown,1);return;}
    const scoreRound=event.target.closest('[data-score-round]');if(scoreRound){$('#score-round').value=scoreRound.dataset.scoreRound;showView('scores');return;}
    const roundEdit=event.target.closest('[data-round-edit]');if(roundEdit){openEntity('round',{id:roundEdit.dataset.roundEdit});return;}
    const finalize=event.target.closest('[data-finalize]');if(finalize){const r=state.rounds.find(x=>x.id===finalize.dataset.finalize);if(r)finalizeRound(r);return;}
    const exportButton=event.target.closest('[data-export]');if(exportButton){exportCSV(exportButton.dataset.export);return;}
    if(event.target.closest('[data-download-backup]')){exportBackup();return;}
    if(event.target.id==='save-advance-override'){
      const wanted=$('#advancing-override').value.split(',').map(x=>x.trim()).filter(Boolean),round=selectedRound(),rows=roundResult(round.id);
      if(rows.some(row=>!row.complete)){toast('Complete every score in this round before choosing cutoff contestants.','error');return;}
      const selection=cutoffSelection(rows,round.advanceCount),tiedChoiceIds=state.contestants.filter(person=>wanted.includes(person.number)&&selection.candidateIds.includes(person.id)&&!selection.fixedIds.includes(person.id)).map(person=>person.id);
      if(!selection.warning){toast('There is no unresolved tie at this round’s cutoff.','error');return;}
      if(new Set(wanted).size!==wanted.length||tiedChoiceIds.length!==selection.chooseCount){toast(`Choose exactly ${selection.chooseCount} different contestant number${selection.chooseCount===1?'':'s'} from the tied entries shown.`,'error');return;}
      const selected=[...selection.fixedIds,...tiedChoiceIds];
      if(!validAdvancementSelection(selection,selected,round.advanceCount)){toast('The advancing list must include every contestant above the cutoff and exactly fill the remaining places from the tied entries.','error');return;}
      round.advancingIds=selected;audit('Cutoff decision',`Selected ${selected.length} contestants to advance from ${round.name}`,[],`Entries: ${selected.map(id=>state.contestants.find(person=>person.id===id)?.number||'').join(', ')}`);renderAll();return;
    }
    const committee=event.target.closest('[data-save-committee]');if(committee){
      const index=Number(committee.dataset.saveCommittee), group=activeUnresolvedTies[index], round=selectedRound();
      const orderNumbers=$(`[data-committee-order="${index}"]`).value.split(',').map(x=>x.trim()).filter(Boolean);
      const order=orderNumbers.map(number=>state.contestants.find(c=>c.number===number)?.id).filter(Boolean);
      if(!group||order.length!==group.length||new Set(order).size!==group.length||!group.every(row=>order.includes(row.contestant.id))){toast('List every tied contestant number exactly once to record the committee order.','error');return;}
      const note=$(`[data-committee-note="${index}"]`).value.trim();if(!note){toast('Enter a note for the committee tie decision.','error');return;}
      const decision={roundId:round.id,contestantIds:group.map(row=>row.contestant.id),order,timestamp:new Date().toISOString(),note};state.tieDecisions.push(decision);audit('Tie decision','Recorded committee tie decision',[...orderNumbers],note);renderResults();return;
    }
  });
  document.addEventListener('input',event=>{if(event.target.matches('[data-score-criterion]'))stageScore(event.target);if(event.target.matches('#modal-fields input')){event.target.removeAttribute('aria-invalid');$('#modal-error').hidden=true;}});
  window.addEventListener('beforeunload',event=>{if(scoreDrafts.size){event.preventDefault();event.returnValue='';}});
  try { navigator.storage?.persist?.().catch(()=>{}); } catch {}
  if (lastNormalizeReport.migrated || lastNormalizeReport.remapped || lastNormalizeReport.dropped) { persist(); }
  renderAll();
})();
