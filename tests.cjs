// Rule tests for the decision engine embedded in index.html.
// Run: node tests.cjs
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//);
if (!m) throw new Error('engine block not found');
const mod = { exports: {} };
new Function('module', m[1])(mod);
const PC = mod.exports;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n    ' + e.message); }
}
const ev = s => PC.evaluate(s);
const keys = r => r.asks.map(a => a.key);
const BG = { riskNone: true, ari: 'none', confNone: true, dre: 'normal', le: 'gt15' };
const CA = (x) => ev({ age: 65, ...BG, bx: 'cancer', ...x });
const grp = x => CA(x).risk.nccn.id;

console.log('First contact');
t('nothing entered → asks only for age + PSA', () => assert.deepEqual(keys(ev({})), ['base']));
t('age + PSA 6.8 → background, PSA modifiers, repeat, volume, MRI asked', () => {
  const k = keys(ev({ age: 62, psa: 6.8 }));
  ['le', 'risk', 'mods', 'repeat', 'vol', 'mri'].forEach(x => assert.ok(k.includes(x), x));
});
t('normal PSA → no work-up asks', () => { const k = keys(ev({ age: 55, psa: 1.4, ...BG })); assert.deepEqual(k, []); });
t('pending item is removed from asks and listed as pending', () => {
  const r = ev({ age: 62, psa: 6.8, ...BG, _pending: ['mri'] });
  assert.ok(!keys(r).includes('mri')); assert.deepEqual(r.pending, ['mri']);
});

console.log('Screening');
t('55 y PSA 1.4 → EAU every 2 y (PSA >1 under 60)', () => assert.equal(ev({ age: 55, psa: 1.4, ...BG }).screen.interval.eau, '每 2 年'));
t('55 y PSA 0.8 → EAU interval may extend to 8 y', () => assert.equal(ev({ age: 55, psa: 0.8, ...BG }).screen.interval.eau, '可延長至 8 年'));
t('62 y PSA 1.8 → EAU 8 y (threshold 2 at ≥60)', () => assert.equal(ev({ age: 62, psa: 1.8, ...BG }).screen.interval.eau, '可延長至 8 年'));
t('life expectancy <10 y → screening not recommended', () => assert.equal(ev({ age: 78, psa: 2, ...BG, le: '5to10' }).screen.verdict, 'stop'));
t('BRCA carrier → EAU start 40, AUA 40–45', () => { const s = ev({ age: 42, brca: true }).screen.start; assert.equal(s.eau, '40 歲'); assert.equal(s.aua, '40–45 歲'); });
t('age ≥70 → individualized', () => assert.equal(ev({ age: 72, psa: 1, ...BG, le: '10to15' }).screen.verdict, 'individual'));

console.log('PSA interpretation');
t('5-ARI ≥6 mo doubles PSA (3.1 → 6.2) and makes it abnormal', () => { const d = ev({ age: 68, psa: 3.1, ari: 'long' }).d; assert.equal(d.psaAdj, 6.2); assert.ok(d.abn); });
t('PSA 2.0 on 5-ARI (adj 4.0) → abnormal', () => assert.ok(ev({ age: 60, psa: 2.0, ari: 'long' }).d.abn));
t('PSAD uses measured PSA, not doubled', () => assert.equal(ev({ age: 68, psa: 3.1, ari: 'long', vol: 62 }).d.psad, 0.05));
t('volume from 3 diameters (ellipsoid 0.52)', () => assert.equal(ev({ age: 60, psa: 5, volL: 5, volW: 4, volH: 4 }).d.vol, 41.6));
t('suspicious DRE alone triggers work-up', () => assert.ok(ev({ age: 60, psa: 1.5, dre: 'suspicious' }).d.suspicion));
t('confounder → biopsy decision deferred', () => assert.equal(ev({ age: 60, psa: 6, confound: true }).bxDec.k, 'defer'));

console.log('MRI → biopsy');
const W = x => ev({ age: 63, psa: 6, ...BG, psaRepeat: true, mri: 'done', ...x }).bxDec.k;
t('PI-RADS 5 → biopsy', () => assert.equal(W({ pirads: '5', vol: 40 }), 'bx'));
t('PI-RADS 3 with PSAD 0.15 → biopsy', () => assert.equal(W({ pirads: '3', vol: 40 }), 'bx'));
t('PI-RADS 3, PSAD <0.10, no family history → omit (EAU 2026)', () => assert.equal(W({ pirads: '3', vol: 80 }), 'omit3'));
t('PI-RADS 3, PSAD <0.10 but family history → biopsy', () => assert.equal(ev({ age: 63, psa: 6, ari: 'none', confNone: true, dre: 'normal', le: 'gt15', fh: true, psaRepeat: true, mri: 'done', pirads: '3', vol: 80 }).bxDec.k, 'bx'));
t('PI-RADS 3, PSAD 0.12 → "consider" (warn)', () => { const b = ev({ age: 63, psa: 6, ...BG, psaRepeat: true, mri: 'done', pirads: '3', vol: 50 }).bxDec; assert.equal(b.k, 'bx'); assert.equal(b.c, 'warn'); });
t('PI-RADS 2, PSAD 0.075 → omit biopsy', () => assert.equal(W({ pirads: '2', vol: 80 }), 'omit'));
t('PI-RADS 2, PSAD 0.17 → still omit under EAU (<0.20) but flagged', () => { const b = ev({ age: 63, psa: 6, ...BG, psaRepeat: true, mri: 'done', pirads: '2', vol: 35 }).bxDec; assert.equal(b.k, 'omit'); assert.equal(b.c, 'warn'); });
t('PI-RADS 2, PSAD 0.24 → consider systematic biopsy', () => assert.equal(W({ pirads: '2', vol: 25 }), 'sysbxNeg'));
t('PI-RADS 2 + family history → consider biopsy', () => assert.equal(ev({ age: 63, psa: 6, ari: 'none', confNone: true, dre: 'normal', le: 'gt15', fh: true, mri: 'done', pirads: '2', vol: 80 }).bxDec.k, 'sysbxNeg'));
t('PSA 14 (>10) → no repeat-PSA ask (EAU repeats for 3–10)', () => assert.ok(!keys(ev({ age: 63, psa: 14, ...BG })).includes('repeat')));
t('PI-RADS 1 + BRCA carrier → consider biopsy', () => assert.equal(ev({ age: 63, psa: 6, ari: 'none', confNone: true, dre: 'normal', le: 'gt15', brca: true, mri: 'done', pirads: '1', vol: 80 }).bxDec.k, 'sysbxNeg'));
t('PI-RADS 2 without volume → asks for PSAD', () => assert.equal(W({ pirads: '2' }), 'needVol'));
t('no MRI available → systematic biopsy option', () => assert.equal(W({ mri: 'no' }), 'sysbx'));
t('biopsy ask appears once biopsy is indicated', () => assert.ok(keys(ev({ age: 63, psa: 6, ...BG, psaRepeat: true, vol: 40, mri: 'done', pirads: '4' })).includes('bx')));

console.log('Grade group');
t('3+3=1, 3+4=2, 4+3=3, 3+5=4, 5+3=4, 4+5=5', () => {
  assert.equal(PC.gradeGroup('3', '3'), 1); assert.equal(PC.gradeGroup('3', '4'), 2); assert.equal(PC.gradeGroup('4', '3'), 3);
  assert.equal(PC.gradeGroup('3', '5'), 4); assert.equal(PC.gradeGroup('5', '3'), 4); assert.equal(PC.gradeGroup('4', '5'), 5);
});

console.log('NCCN risk groups');
const VL = { psa: 5.1, vol: 48, gp: '3', gs: '3', coresPos: 2, coresTot: 12, maxCore: 20, ct: 'T1c' };
t('NCCN 2026: no very-low group — former very-low case is "low" with low-volume flag', () => { const n = CA(VL).risk.nccn; assert.equal(n.id, 'low'); assert.equal(n.lowVol.ok, true); });
t('3 positive cores → low, not low-volume', () => { const n = CA({ ...VL, coresPos: 3 }).risk.nccn; assert.equal(n.id, 'low'); assert.equal(n.lowVol.ok, false); });
t('PSAD 0.15 → not low-volume', () => assert.equal(CA({ ...VL, psa: 7.2 }).risk.nccn.lowVol.ok, false));
t('missing volume → low-volume undetermined', () => { const n = CA({ ...VL, vol: undefined }).risk.nccn; assert.equal(n.id, 'low'); assert.equal(n.lowVol.ok, null); });
t('no label for very low exists', () => assert.ok(!('vlow' in PC.NCCN_LABEL)));
t('GG2, 1 IRF, <50% cores → favorable intermediate', () => assert.equal(grp({ psa: 7.2, gp: '3', gs: '4', coresPos: 3, coresTot: 12, maxCore: 40, ct: 'T1c' }), 'fint'));
t('GG1 + PSA 12 (1 IRF) → favorable intermediate', () => assert.equal(grp({ psa: 12, gp: '3', gs: '3', coresPos: 2, coresTot: 12, ct: 'T1c' }), 'fint'));
t('GG3 → unfavorable intermediate', () => assert.equal(grp({ psa: 6, gp: '4', gs: '3', coresPos: 2, coresTot: 12, ct: 'T1c' }), 'uint'));
t('GG2 with ≥50% cores → unfavorable', () => assert.equal(grp({ psa: 6, gp: '3', gs: '4', coresPos: 6, coresTot: 12, ct: 'T1c' }), 'uint'));
t('GG2 + PSA 12 (2 IRFs) → unfavorable', () => assert.equal(grp({ psa: 12, gp: '3', gs: '4', coresPos: 2, coresTot: 12, ct: 'T1c' }), 'uint'));
t('PSA 20 is intermediate, not high', () => assert.equal(grp({ psa: 20, gp: '3', gs: '3', coresPos: 2, coresTot: 12, ct: 'T1c' }), 'fint'));
t('intermediate without cores → undetermined "int" and asks cores', () => { const r = CA({ psa: 6, gp: '3', gs: '4', ct: 'T1c' }); assert.equal(r.risk.nccn.id, 'int'); assert.ok(keys(r).includes('cores')); });
t('one high feature (PSA 25) → high', () => assert.equal(grp({ psa: 25, gp: '3', gs: '4', coresPos: 2, coresTot: 12, ct: 'T1c' }), 'high'));
t('GG4 alone → high', () => assert.equal(grp({ psa: 6, gp: '4', gs: '4', coresPos: 8, coresTot: 12, ct: 'T2a' }), 'high'));
t('GG4 + PSA 28 → high (very high needs PSA ≥40)', () => assert.equal(grp({ psa: 28, gp: '4', gs: '4', ct: 'T2a' }), 'high'));
t('GG4 + PSA 40 → very high', () => assert.equal(grp({ psa: 40, gp: '4', gs: '4', ct: 'T2a' }), 'vhigh'));
t('GG4 + PSA 39.9 → high', () => assert.equal(grp({ psa: 39.9, gp: '4', gs: '4', ct: 'T2a' }), 'high'));
t('cT3a + GG4 → very high', () => assert.equal(grp({ psa: 8, gp: '4', gs: '4', ct: 'T3a' }), 'vhigh'));
t('cT3b + PSA 45 → very high', () => assert.equal(grp({ psa: 45, gp: '3', gs: '4', ct: 'T3b' }), 'vhigh'));
t('primary pattern 5 alone (5+4, PSA 6, T2a) → high since 2025', () => assert.equal(grp({ psa: 6, gp: '5', gs: '4', ct: 'T2a' }), 'high'));
t('cT3b alone → high since 2025', () => assert.equal(grp({ psa: 6, gp: '3', gs: '4', ct: 'T3b' }), 'high'));
t('PSA 25 + cT3a → very high? no: needs PSA ≥40 → high', () => assert.equal(grp({ psa: 25, gp: '3', gs: '4', ct: 'T3a' }), 'high'));
t('N1 → regional; M1 → metastatic', () => { assert.equal(grp({ psa: 6, gp: '3', gs: '4', ct: 'T2a', cn: 'N1', cm: 'M0' }), 'reg'); assert.equal(grp({ psa: 6, gp: '3', gs: '4', ct: 'T2a', cm: 'M1' }), 'met'); });
t('5-ARI: PSA 6 doubled to 12 changes GG1 low → favorable intermediate', () => assert.equal(grp({ ari: 'long', psa: 6, vol: 60, gp: '3', gs: '3', coresPos: 1, coresTot: 12, maxCore: 10, ct: 'T1c' }), 'fint'));

console.log('EAU & CAPRA');
const E = x => CA(x).risk.eau.id;
t('EAU 2026: cT2c no longer upgrades (low); NCCN still intermediate', () => { assert.equal(E({ psa: 6, gp: '3', gs: '3', ct: 'T2c', coresPos: 2, coresTot: 12 }), 'low'); assert.equal(grp({ psa: 6, gp: '3', gs: '3', ct: 'T2c', coresPos: 2, coresTot: 12 }), 'fint'); });
t('EAU 2026: ISUP 2 + PSA <10 → favourable; ISUP 1 + PSA 15 → favourable', () => { assert.equal(E({ psa: 6, gp: '3', gs: '4', ct: 'T1c' }), 'fint'); assert.equal(E({ psa: 15, gp: '3', gs: '3', ct: 'T1c' }), 'fint'); });
t('EAU 2026: ISUP 2 + PSA 15 → unfavourable; ISUP 3 → unfavourable', () => { assert.equal(E({ psa: 15, gp: '3', gs: '4', ct: 'T1c' }), 'uint'); assert.equal(E({ psa: 5, gp: '4', gs: '3', ct: 'T2b' }), 'uint'); });
t('EAU 2026: PSA 20 → intermediate, 20.1 → high', () => { assert.equal(E({ psa: 20, gp: '3', gs: '3', ct: 'T1c' }), 'fint'); assert.equal(E({ psa: 20.1, gp: '3', gs: '3', ct: 'T1c' }), 'high'); });
t('EAU: cT3a → locally advanced', () => assert.equal(E({ psa: 6, gp: '3', gs: '4', ct: 'T3a' }), 'locadv'));
t('EAU: low', () => assert.equal(E(VL), 'low'));
t('CAPRA example: age 65, PSA 7.2, 3+4, T1c, 25% cores → 1+1+0+0+1 = 3', () => { const c = CA({ psa: 7.2, gp: '3', gs: '4', ct: 'T1c', coresPos: 3, coresTot: 12 }).risk.capra; assert.equal(c.score, 3); assert.equal(c.cat, 'int'); });
t('CAPRA max: PSA 35, 4+4, T3a, 50% cores, age 66 → 10', () => assert.equal(CA({ psa: 35, gp: '4', gs: '4', ct: 'T3a', coresPos: 6, coresTot: 12 }).risk.capra.score, 4 + 3 + 1 + 1 + 1));
t('CAPRA boundaries: PSA 6.0 → 0, 10.0 → 1, 20.0 → 2', () => {
  const p = x => CA({ psa: x, gp: '3', gs: '3', ct: 'T1c', coresPos: 1, coresTot: 12 }).risk.capra.parts[0][1];
  assert.equal(p(6), 0); assert.equal(p(10), 1); assert.equal(p(20), 2); assert.equal(p(30.1), 4);
});

console.log('Imaging, germline, management');
t('low risk → no staging imaging', () => assert.equal(CA(VL).imaging.need, false));
t('unfavorable intermediate → staging imaging needed and asked', () => { const r = CA({ psa: 6, gp: '4', gs: '3', coresPos: 2, coresTot: 12, ct: 'T1c' }); assert.ok(r.imaging.need); assert.ok(keys(r).includes('staging')); });
t('high risk → germline testing recommended', () => assert.equal(CA({ psa: 25, gp: '3', gs: '4', coresPos: 2, coresTot: 12, ct: 'T1c' }).germ.rec, 'yes'));
t('favorable intermediate + cribriform → germline recommended', () => assert.equal(CA({ psa: 7.2, gp: '3', gs: '4', coresPos: 3, coresTot: 12, ct: 'T1c', crib: true }).germ.rec, 'yes'));
t('low, long LE → active surveillance preferred', () => { const o = CA(VL).mgmt.opts; assert.ok(o[0].pref); assert.match(o[0].t, /主動監測/); });
t('low, LE 5–10 → observation', () => assert.match(CA({ ...VL, le: '5to10' }).mgmt.opts[0].t, /觀察/));
t('very high (cT3a + GG4) → abiraterone option preferred, STAMPEDE met', () => { const r = CA({ psa: 15, gp: '4', gs: '4', ct: 'T3a' }); assert.equal(r.risk.nccn.id, 'vhigh'); assert.ok(r.stampede); assert.ok(r.mgmt.opts.some(o => /abiraterone/.test(o.t) && o.pref)); });
t('high risk → no abiraterone option', () => assert.ok(!CA({ psa: 25, gp: '3', gs: '4', ct: 'T1c', coresPos: 2, coresTot: 12 }).mgmt.opts.some(o => /abiraterone/.test(o.t))));
t('NCCN very high and STAMPEDE criteria agree for N0', () => { for (const x of [{ psa: 40, gp: '4', gs: '4', ct: 'T2a' }, { psa: 39, gp: '4', gs: '4', ct: 'T2a' }, { psa: 45, gp: '3', gs: '3', ct: 'T3a' }, { psa: 6, gp: '5', gs: '5', ct: 'T3b' }]) { const r = CA({ ...x, cn: 'N0' }); assert.equal(r.risk.nccn.id === 'vhigh', r.stampede, JSON.stringify(x)); } });
t('STAMPEDE: PSA 45 + GG4 qualifies', () => assert.ok(CA({ psa: 45, gp: '4', gs: '4', ct: 'T2a' }).stampede));
t('metastatic high-volume → triplet preferred, no prostate RT', () => { const o = CA({ psa: 85, gp: '4', gs: '5', ct: 'T3b', cn: 'N1', cm: 'M1', mvol: 'high' }).mgmt.opts; assert.ok(o.find(x => /docetaxel/.test(x.t)).pref); assert.ok(!o.some(x => /局部放射/.test(x.t))); });
t('metastatic low-volume → prostate RT offered', () => assert.ok(CA({ psa: 30, gp: '4', gs: '4', ct: 'T2c', cm: 'M1', mvol: 'low' }).mgmt.opts.some(x => /局部放射/.test(x.t))));
t('M1 without volume → asks for volume', () => assert.ok(keys(CA({ psa: 30, gp: '4', gs: '4', ct: 'T2c', cm: 'M1', cn: 'N0', coresPos: 3, coresTot: 12 })).includes('mvol')));

console.log('PSA kinetics');
const rows = [{ date: '2025-01-01', psa: 1 }, { date: '2025-07-02', psa: 2 }, { date: '2026-01-01', psa: 4 }];
t('doubling every ~6 months → PSADT ≈ 6', () => { const k = PC.kinetics(rows); assert.ok(Math.abs(k.psadt - 6) < 0.2, k.psadt); });
t('falling PSA → no PSADT', () => { const k = PC.kinetics([{ date: '2025-01-01', psa: 4 }, { date: '2025-06-01', psa: 2 }]); assert.ok(k.falling); assert.equal(k.psadt, null); });
t('post-RP: two values ≥0.2 → BCR', () => assert.equal(PC.kinetics([{ date: '2025-01-01', psa: 0.21 }, { date: '2025-03-01', psa: 0.3 }], { setting: 'rp' }).bcr, 'yes'));
t('post-RP: single ≥0.2 → needs confirmation', () => assert.equal(PC.kinetics([{ date: '2025-01-01', psa: 0.1 }, { date: '2025-03-01', psa: 0.22 }], { setting: 'rp' }).bcr, 'confirm'));
t('post-RT Phoenix: nadir 0.5 → BCR at ≥2.5', () => {
  assert.equal(PC.kinetics([{ date: '2024-01-01', psa: 0.5 }, { date: '2025-01-01', psa: 2.4 }], { setting: 'rt' }).bcr, 'no');
  assert.equal(PC.kinetics([{ date: '2024-01-01', psa: 0.5 }, { date: '2025-01-01', psa: 2.6 }], { setting: 'rt' }).bcr, 'yes');
});
t('post-RP BCR, PSADT ~6 mo, pathological ISUP 2 → EAU high risk', () => assert.equal(PC.kinetics([{ date: '2025-01-01', psa: 0.25 }, { date: '2025-07-02', psa: 0.5 }, { date: '2026-01-01', psa: 1.0 }], { setting: 'rp', pathGG: '2' }).eauRisk, 'high'));
t('post-RP BCR, PSADT >12 mo and ISUP 2 → EAU low risk', () => assert.equal(PC.kinetics([{ date: '2024-01-01', psa: 0.2 }, { date: '2025-01-01', psa: 0.25 }, { date: '2026-01-01', psa: 0.32 }], { setting: 'rp', pathGG: '2' }).eauRisk, 'low'));
t('on ADT, PSADT ≤10 → high-risk nmCRPC note', () => assert.ok(PC.kinetics(rows, { setting: 'adt' }).notes.some(n => /nmCRPC/.test(n.t))));


console.log('Taiwan NHI');
const N = (n) => PC.nhi(n);
const stOf = (r, re) => (r.items.find(i => re.test(i.d)) || {}).st;
const HR = { stage: 'mcspc', gs8: true, bone3: true, visceral: false, nha: 'none', ecog: 1, labs: true };
t('high-risk mCSPC (Gleason ≥8 + bone ≥3) → all ARPIs and daro triplet reimbursable', () => {
  const r = N(HR); assert.ok(r.hr.ok);
  ['Abiraterone＋ADT', 'Enzalutamide', 'Apalutamide', 'Darolutamide＋ADT', 'Darolutamide＋docetaxel'].forEach(d => assert.equal(stOf(r, new RegExp(d)), 'yes', d));
});
t('abiraterone triplet never reimbursed', () => assert.equal(stOf(N(HR), /Abiraterone＋docetaxel/), 'no'));
t('only one high-risk feature → ARPIs not reimbursed', () => { const r = N({ ...HR, bone3: false }); assert.equal(r.hr.ok, false); assert.equal(stOf(r, /Enzalutamide/), 'no'); });
t('one feature + one unknown → "check"', () => { const r = N({ ...HR, bone3: undefined }); assert.ok(r.hr.undetermined); assert.equal(stOf(r, /Apalutamide/), 'check'); });
t('abiraterone mCSPC needs ECOG ≤1; enzalutamide does not', () => { const r = N({ ...HR, ecog: 2 }); assert.equal(stOf(r, /Abiraterone＋ADT/), 'no'); assert.equal(stOf(r, /Enzalutamide/), 'yes'); });
t('daro triplet needs labs', () => assert.equal(stOf(N({ ...HR, labs: false }), /Darolutamide＋docetaxel/), 'no'));
t('NHA already used → lifetime-one rule blocks all ARPIs', () => assert.equal(stOf(N({ ...HR, nha: 'used' }), /Darolutamide＋ADT/), 'no'));
const NM = { stage: 'nmcrpc', psadt: 8, ecog: 0, noMets: true, nha: 'none' };
t('nmCRPC PSADT 8 → enza/apa/daro yes, abiraterone no', () => { const r = N(NM); ['Enzalutamide', 'Apalutamide', 'Darolutamide'].forEach(d => assert.equal(stOf(r, new RegExp(d)), 'yes')); assert.equal(stOf(r, /Abiraterone/), 'no'); });
t('nmCRPC PSADT 10 yes, 10.5 no', () => { assert.equal(stOf(N({ ...NM, psadt: 10 }), /Apalutamide/), 'yes'); assert.equal(stOf(N({ ...NM, psadt: 10.5 }), /Apalutamide/), 'no'); });
t('nmCRPC: definite fail wins over missing data', () => assert.equal(stOf(N({ stage: 'nmcrpc', psadt: 14 }), /Enzalutamide/), 'no'));
const MC = { stage: 'mcrpc', ecog: 1, nha: 'none', doce: 0, symptomatic: false, visceral: false, fastCRPC: false, gs8: true };
t('mCRPC chemo-naive asymptomatic → abi/enza yes', () => assert.equal(stOf(N(MC), /化療前/), 'yes'));
t('CRPC <12 months after ADT with Gleason ≥8 → must have chemo first', () => assert.equal(stOf(N({ ...MC, fastCRPC: true }), /化療前/), 'no'));
t('symptomatic or visceral → pre-chemo ARPI no', () => { assert.equal(stOf(N({ ...MC, symptomatic: true }), /化療前/), 'no'); assert.equal(stOf(N({ ...MC, visceral: true }), /化療前/), 'no'); });
t('post-docetaxel (2 cycles, failed, ECOG 2) → abi/enza yes', () => assert.equal(stOf(N({ ...MC, doce: 2, doceFail: true, ecog: 2 }), /docetaxel 後/), 'yes'));
t('olaparib mono needs BRCA and prior NHA', () => { assert.equal(stOf(N({ ...MC, brca: true, nha: 'used' }), /Olaparib 單獨/), 'yes'); assert.equal(stOf(N({ ...MC, brca: true, nha: 'none' }), /Olaparib 單獨/), 'no'); });
t('olaparib + abiraterone: BRCA, chemo-naive, abiraterone ≤4 mo allowed', () => { assert.equal(stOf(N({ ...MC, brca: true, nha: 'abiShort' }), /Olaparib＋abiraterone/), 'yes'); assert.equal(stOf(N({ ...MC, brca: true, nha: 'none', doce: 3 }), /Olaparib＋abiraterone/), 'no'); });
t('cabazitaxel: docetaxel ≥3 + NHA progression + ECOG ≤1', () => { assert.equal(stOf(N({ ...MC, doce: 3, nha: 'used' }), /Cabazitaxel/), 'yes'); assert.equal(stOf(N({ ...MC, doce: 2, nha: 'used' }), /Cabazitaxel/), 'no'); });
t('radium-223: symptomatic bone ≥2, no visceral', () => { assert.equal(stOf(N({ ...MC, boneSymp2: true }), /Radium/), 'yes'); assert.equal(stOf(N({ ...MC, boneSymp2: true, visceral: true }), /Radium/), 'no'); });
t('Lu-PSMA not reimbursed', () => assert.equal(stOf(N(MC), /Lu-PSMA/), 'no'));
const day = s => Date.parse(s);
t('NHI PSADT data rules: valid series passes', () => { const c = PC.nhiPsadtCheck([{ date: '2026-01-05', psa: 0.6 }, { date: '2026-04-05', psa: 0.9 }, { date: '2026-07-05', psa: 1.4 }], day('2026-08-01')); assert.ok(c.ok, c.fails.join(',')); });
t('NHI PSADT data rules: max ≤1.0 fails', () => { const c = PC.nhiPsadtCheck([{ date: '2026-01-05', psa: 0.3 }, { date: '2026-04-05', psa: 0.5 }, { date: '2026-07-05', psa: 0.9 }], day('2026-08-01')); assert.ok(!c.ok); assert.ok(c.fails.some(f => /最高值/.test(f))); });
t('NHI PSADT data rules: span <8 weeks and stale last value fail', () => { const c = PC.nhiPsadtCheck([{ date: '2026-01-01', psa: 1 }, { date: '2026-01-20', psa: 1.5 }, { date: '2026-02-10', psa: 2 }], day('2026-08-01')); assert.ok(c.fails.some(f => /首末/.test(f))); assert.ok(c.fails.some(f => /3 個月/.test(f))); });

console.log('Summary');
t('summary includes NCCN group, low-volume tag and treatment', () => { const s = PC.summary({ age: 65, ...BG, bx: 'cancer', ...VL }); assert.match(s, /NCCN：低風險（低腫瘤量）/); assert.match(s, /主動監測/); });
t('metastatic: doublet lists darolutamide', () => assert.ok(CA({ psa: 30, gp: '4', gs: '4', ct: 'T2c', cm: 'M1', mvol: 'low' }).mgmt.opts.some(x => /darolutamide 或 enzalutamide/.test(x.t))));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
