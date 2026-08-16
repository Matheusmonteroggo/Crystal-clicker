// Balance simulator for Crystal Miner.
// Loads the real game script (DOM-stubbed) and exercises the core power/multiplier
// functions across early/mid/late/stress scenarios to verify no explosion/NaN and
// that production grows monotonically with bounded multiplier.
const fs = require('fs');
const path = '/workspace/72ca14ab-3adf-443b-afe8-e514a49fe884/sessions/agent_1a071060-e881-4243-9aeb-8b2caacb6483/crystal-miner-corrigido.html';
const html = fs.readFileSync(path, 'utf8');
let code = html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeEl() {
  return {
    style: {}, classList: { add(){}, remove(){}, contains(){return false} },
    dataset: {}, children: [], setAttribute(){}, getAttribute(){return null},
    appendChild(c){this.children.push(c);return c;}, removeChild(){},
    querySelector(){return makeEl();}, querySelectorAll(){return [];},
    addEventListener(){}, getBoundingClientRect(){return {left:0,top:0,width:10,height:10};},
    set textContent(v){this._t=v;}, get textContent(){return this._t;},
    set innerHTML(v){this._h=v;}, get innerHTML(){return this._h;},
    set onclick(f){}, remove(){}, offsetWidth:0, focus(){},
  };
}
const elements = {};
const doc = {
  readyState: 'complete', createElement(){return makeEl();},
  querySelector(s){return elements[s]||(elements[s]=makeEl());},
  querySelectorAll(){return [];}, addEventListener(){}, body: makeEl(),
  getElementById(s){return elements['#'+s]||(elements['#'+s]=makeEl());},
};
const store = {};
global.window = {
  matchMedia(){return {matches:false};}, addEventListener(){},
  AudioContext: function(){ return {currentTime:0,
    createOscillator(){return {connect(){},start(){},stop(){},frequency:{setValueAtTime(){}},type:''};},
    createGain(){return {connect(){},gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}}};},
    destination:{} }; },
  location:{reload(){}}, navigator:{},
};
global.document = doc;
global.localStorage = { getItem(k){return store[k]||null;}, setItem(k,v){store[k]=v;}, removeItem(k){delete store[k];} };
global.navigator = { vibrate(){} };
global.setInterval = ()=>0; global.setTimeout = ()=>0; global.clearTimeout = ()=>{};
global.btoa = s=>Buffer.from(s,'binary').toString('base64');
global.atob = s=>Buffer.from(s,'base64').toString('binary');
global.prompt = ()=>null;

const probe = `
  if (typeof global !== 'undefined') {
    global.__api = {
      getClickPower, getAutoPower, getTotalMultiplier, getUpgradeCost,
      getPrestigeGain, getPrestigeGainPast, softCapPercent, getLevel,
      getRealityGain, getRealityFragmentBonus, getCosmicAscensionBonus,
      UPGRADES_DEFS, UPGRADES_DEFS_PAST, UPGRADES_DEFS_FUTURE, state,
      setState(p){ Object.assign(state, p); },
      setUpg(id, lvl){ state.upgrades[id] = lvl; },
      setTemporalUpg(id, lvl){ if(!state.temporalUpgrades) state.temporalUpgrades={}; state.temporalUpgrades[id]=lvl; },
      setRealityUpg(id, lvl){ if(!state.realityUpgrades) state.realityUpgrades={}; state.realityUpgrades[id]=lvl; },
    };
  }
`;
code = code.replace(/\n\s*if \(document.readyState/, probe + "\n            if (document.readyState");

new Function('window','document','localStorage','navigator','setInterval','setTimeout','clearTimeout','btoa','atob','prompt', code)
  (global.window, doc, global.localStorage, global.navigator, global.setInterval, global.setTimeout, global.clearTimeout, global.btoa, global.atob, global.prompt);

const api = global.__api;
function fmt(n){ return n >= 1e9 ? (n/1e9).toFixed(2)+'B' : n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(2)+'K' : Math.floor(n).toString(); }

function scenario(name, setup){
  setup();
  const click = api.getClickPower();
  const auto = api.getAutoPower();
  const mult = api.getTotalMultiplier();
  const ok = Number.isFinite(click) && Number.isFinite(auto) && Number.isFinite(mult) && click>=0 && auto>=0 && mult>0;
  console.log(
    name.padEnd(22),
    'click='+fmt(click).padStart(10),
    'auto='+fmt(auto).padStart(12),
    'mult='+fmt(mult).padStart(12),
    ok ? 'OK' : 'FAIL'
  );
  return {click, auto, mult, ok};
}

console.log('=== BALANCE SIMULATION ===');
const results = [];

// Early
results.push(scenario('early', () => {
  api.setState({ totalCrystals: 1e3, lifetimeTotalCrystals: 1e3, prestigePoints: 0, temporalFragments: 0, era:'present' });
  api.state.upgrades = {}; api.state.temporalUpgrades = {};
}));

// Mid: 1e9 crystals, 10 prestiges, 25 levels of each % upgrade, several value upgrades
results.push(scenario('mid', () => {
  api.setState({ totalCrystals: 1e9, lifetimeTotalCrystals: 1e9, prestigePoints: 10, temporalFragments: 0, era:'present' });
  api.state.upgrades = {}; api.state.temporalUpgrades = {};
  api.setUpg('click_mastery', 25); api.setUpg('click_supremacy', 25);
  api.setUpg('auto_efficiency', 25); api.setUpg('auto_supremacy', 25);
  api.setUpg('pickaxe', 50); api.setUpg('drill', 50); api.setUpg('laser', 50); api.setUpg('nano_boost', 50);
  api.setUpg('auto_miner', 50); api.setUpg('miner_bot', 50); api.setUpg('extractor', 50); api.setUpg('orbital', 50);
}));

// Late: 1e15 crystals, 1000 prestiges, all % maxed, 5e6 fragments, all temporal maxed
results.push(scenario('late', () => {
  api.setState({ totalCrystals: 1e15, lifetimeTotalCrystals: 1e15, prestigePoints: 1000, temporalFragments: 5e6, era:'present' });
  api.state.upgrades = {}; api.state.temporalUpgrades = {};
  api.setUpg('click_mastery', 25); api.setUpg('click_supremacy', 25);
  api.setUpg('auto_efficiency', 25); api.setUpg('auto_supremacy', 25);
  for (const u of api.UPGRADES_DEFS) if (u.maxLevel) api.setUpg(u.id, u.maxLevel);
  api.setTemporalUpg('temp_prod_both', 50); api.setTemporalUpg('temp_click_both', 50);
  api.setTemporalUpg('temp_gacha', 50); api.setTemporalUpg('temp_offline', 50); api.setTemporalUpg('temp_golden', 50);
  api.setTemporalUpg('temp_start', 50); api.setTemporalUpg('temp_eco', 50); api.setTemporalUpg('temp_luck', 50);
}));

// Extreme stress: absurd % levels (simulate unlimited buying bypassing maxLevel guard)
results.push(scenario('stress-unbounded-%', () => {
  api.setState({ totalCrystals: 1e18, lifetimeTotalCrystals: 1e18, prestigePoints: 1e6, temporalFragments: 1e9, era:'present' });
  api.state.upgrades = {}; api.state.temporalUpgrades = {};
  api.setUpg('click_mastery', 1e6); api.setUpg('click_supremacy', 1e6);
  api.setUpg('auto_efficiency', 1e6); api.setUpg('auto_supremacy', 1e6);
  api.setTemporalUpg('temp_prod_both', 1e6); api.setTemporalUpg('temp_click_both', 1e6);
}));

// Past era mid
results.push(scenario('past-mid', () => {
  api.setState({ totalCrystals: 1e9, lifetimeTotalCrystals: 1e9, prestigePoints: 0, temporalFragments: 0, era:'past' });
  api.state.upgrades = {}; api.state.temporalUpgrades = {};
  api.setUpg('past_click_mastery', 25); api.setUpg('past_auto_efficiency', 25);
  api.setUpg('stone_pick', 50); api.setUpg('bone_spear', 50); api.setUpg('amber_charm', 50); api.setUpg('time_blade', 50);
}));

// Future era: Fr + Ascensão (Parte 3)
results.push(scenario('future', () => {
  api.setState({ totalCrystals: 1e15, lifetimeTotalCrystals: 1e15, prestigePoints: 0, temporalFragments: 0,
                 era:'future', realityFragments: 5e6, cosmicAscensions: 50 });
  api.state.upgrades = {}; api.state.temporalUpgrades = {};
  api.state.realityUpgrades = {};
  for (const u of api.UPGRADES_DEFS_FUTURE) if (u.maxLevel) api.setUpg(u.id, u.maxLevel);
  api.setRealityUpg('real_prod_both', 50); api.setRealityUpg('real_fr_gain', 50); api.setRealityUpg('real_golden', 50);
}));

// Future stress: unbounded Fr/Ascensão
results.push(scenario('future-stress', () => {
  api.setState({ totalCrystals: 1e18, lifetimeTotalCrystals: 1e18, prestigePoints: 0, temporalFragments: 0,
                 era:'future', realityFragments: 1e9, cosmicAscensions: 1e6 });
  api.state.upgrades = {}; api.state.temporalUpgrades = {}; api.state.realityUpgrades = {};
  for (const u of api.UPGRADES_DEFS_FUTURE) if (u.maxLevel) api.setUpg(u.id, 1e6);
}));

console.log('=== CHECKS ===');
const allFinite = results.every(r => r.ok);
const multBounded = results.every(r => r.mult < 1e6);
const monotonic = results[0].mult <= results[1].mult && results[1].mult <= results[2].mult;
console.log('All finite/non-negative:', allFinite);
console.log('Multiplier bounded (<1e6):', multBounded, '(stress mult=', fmt(results[3].mult), ')');
console.log('Multiplier monotonic early<=mid<=late:', monotonic);
console.log('PASS:', allFinite && multBounded && monotonic);
