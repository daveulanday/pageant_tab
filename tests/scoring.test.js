'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const S = require('../scoring.js');

test('browser app reads the scoring library global that scoring.js exports', () => {
  const browserGlobal = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../scoring.js'), 'utf8'), { globalThis: browserGlobal });
  const appSource = fs.readFileSync(require.resolve('../app.js'), 'utf8');

  assert.equal(typeof browserGlobal.PageantScoring.blankState, 'function');
  assert.match(appSource, /const Scoring = globalThis\.PageantScoring;/);
});

test('weighted category score and mean across judges', () => {
  const contestants = [{ id: 'c1', number: '1' }], judges = [{ id: 'j1' }, { id: 'j2' }];
  const category = { id: 'g1', roundId: 'r1', weight: 100, criteria: [{ id: 'a', weight: 60 }, { id: 'b', weight: 40 }] };
  const scores = { 'c1|j1|g1|a': 80, 'c1|j1|g1|b': 90, 'c1|j2|g1|a': 100, 'c1|j2|g1|b': 70 };
  assert.equal(S.categoryScore(scores, contestants, judges, category)[0].value, 86);
});

test('even weight splits total exactly 100 including one decimal remainder', () => {
  assert.deepEqual(S.evenWeights(1), [100]);
  assert.deepEqual(S.evenWeights(3), [33.3, 33.3, 33.4]);
  assert.deepEqual(S.evenWeights(6), [16.6, 16.6, 16.6, 16.6, 16.6, 17]);
  assert.equal(S.evenWeights(0).length, 0);
});

test('next score grid follows criterion and category order and skips fully locked categories', () => {
  const judges = [{ id: 'j1' }, { id: 'j2' }];
  const categories = [
    { id: 'a', criteria: [{ id: 'a1' }, { id: 'a2' }] },
    { id: 'b', criteria: [{ id: 'b1' }] },
    { id: 'c', criteria: [{ id: 'c1' }] },
  ];
  const locks = [{ categoryId: 'b', judgeId: 'j1' }, { categoryId: 'b', judgeId: 'j2' }];
  assert.deepEqual(S.nextCriterion(categories, judges, locks, 'a', 'a1'), { category: categories[0], criterion: categories[0].criteria[1] });
  assert.deepEqual(S.nextCriterion(categories, judges, locks, 'a', 'a2'), { category: categories[2], criterion: categories[2].criteria[0] });
  assert.equal(S.nextCriterion(categories, judges, locks, 'c', 'c1'), null);
});

test('round standings stay provisional until every criterion is scored', () => {
  const contestants = [{ id: 'c1', number: '1' }], judges = [{ id: 'j1' }];
  const category = { id: 'g1', roundId: 'r1', weight: 100, criteria: [{ id: 'a', weight: 50 }, { id: 'b', weight: 50 }] };
  const round = { id: 'r1' };
  const partial = S.roundScore({ 'c1|j1|g1|a': 80 }, contestants, judges, [category], round)[0];
  assert.equal(partial.complete, false);
  assert.equal(partial.value, null);
  const final = S.roundScore({ 'c1|j1|g1|a': 80, 'c1|j1|g1|b': 90 }, contestants, judges, [category], round)[0];
  assert.equal(final.complete, true);
  assert.equal(final.value, 85);
});

test('older round carryover settings are ignored', () => {
  const result = S.normalize({
    version: 2,
    event: {}, contestants: [], judges: [], categories: [], scores: {},
    rounds: [{ id: 'round-main', name: 'Main round', advanceCount: 3, carryoverPercent: 25 }]
  });
  assert.equal(result.state.rounds[0].advanceCount, 3);
  assert.equal(Object.hasOwn(result.state.rounds[0], 'carryoverPercent'), false);
});

test('rounds ties at displayed precision and competition ranks', () => {
  const rows = S.assignPlaces([{ value: 87.34 }, { value: 87.34 }, { value: 87.31 }]);
  assert.deepEqual(rows.map(x => x.place), [1, 1, 3]);
  assert.equal(S.sameScore(87.34, 87.31), false);
});

test('migrates v1 while preserving valid scores and creates Main round', () => {
  const old = { version: 1, event: { name: 'Test' }, contestants: [{ id: 'c1', number: '1', name: 'A' }], judges: [{ id: 'j1', name: 'J' }], categories: [{ id: 'g1', name: 'Evening gown', weight: 100, criteria: [{ id: 'x', name: 'Walk', weight: 100 }] }], scores: { 'c1|j1|g1|x': 87.34 } };
  const result = S.normalize(old);
  assert.equal(result.state.version, 2);
  assert.equal(result.state.rounds[0].name, 'Main round');
  assert.equal(result.state.scores['c1|j1|g1|x'], 87.34);
});

test('sanitizes hostile ids and drops invalid or unknown scores', () => {
  const old = { version: 1, event: {}, contestants: [{ id: 'c" onmouseover="x', number: '1', name: 'A' }], judges: [{ id: 'j1' }], categories: [{ id: 'g1', weight: 100, criteria: [{ id: 'x', weight: 100 }] }], scores: { 'c" onmouseover="x|j1|g1|x': 80, 'unknown|j1|g1|x': 70, 'c" onmouseover="x|j1|g1|x|extra': 60 } };
  const result = S.normalize(old);
  assert.match(result.state.contestants[0].id, S.ID_PATTERN);
  assert.equal(Object.keys(result.state.scores).length, 1);
  assert.equal(result.report.dropped, 2);
});

test('CSV quotes cells, preserves UTF-8 BOM and neutralizes formulas', () => {
  const csv = S.toCSV([['Name', 'Value'], ['Élodie, "Belle"', '=1+1']]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Élodie, ""Belle"""'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('\r\n'));
});

test('cutoff includes everyone tied at the Kth contestant', () => {
  const rows = [{ contestant: { id: 'a' }, value: 90 }, { contestant: { id: 'b' }, value: 80 }, { contestant: { id: 'c' }, value: 80 }, { contestant: { id: 'd' }, value: 70 }];
  const result = S.cutoff(rows, 2);
  assert.deepEqual(result.advancing, ['a', 'b', 'c']);
  assert.match(result.warning, /2 contestants tied for 2nd/);
});

test('tie-break rules resolve equal final scores in configured order', () => {
  const rows = [
    { contestant: { id: 'a' }, value: 90, complete: true, categoryScores: { gown: 85 }, firstPlaceRanks: 3 },
    { contestant: { id: 'b' }, value: 90, complete: true, categoryScores: { gown: 88 }, firstPlaceRanks: 1 },
  ];
  const ranked = S.resolveTies(rows, [{ type: 'category', categoryId: 'gown' }, { type: 'firsts' }]);
  assert.equal(ranked[0].contestant.id, 'b');
  assert.equal(ranked[0].place, 1);
  assert.equal(ranked[1].place, 2);
  assert.equal(ranked[0].tieReason, 'category score');
});

test('shared score remains tied when configured tie-break values are equal', () => {
  const rows = [
    { contestant: { id: 'a' }, value: 90, complete: true, categoryScores: { gown: 88 } },
    { contestant: { id: 'b' }, value: 90, complete: true, categoryScores: { gown: 88 } },
  ];
  const ranked = S.resolveTies(rows, [{ type: 'category', categoryId: 'gown' }]);
  assert.deepEqual(ranked.map(x => x.place), [1, 1]);
});
