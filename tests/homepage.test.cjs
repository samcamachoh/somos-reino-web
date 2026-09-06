const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function setup(videos = [{ videoId: 'abcdefghijk', title: '<img src=x onerror=alert(1)> "Faith"', date: '<b>Today</b>' }]) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {style: {}, dataset: {}, innerHTML: '', classList: {add(){},remove(){},toggle(){},contains(){return false;}},addEventListener(){},setAttribute(){},querySelectorAll(){return [];}});
    return elements.get(id);
  }
  const requests = [];
  const document = { documentElement: {scrollHeight: 2000}, body: {style:{}}, head: {appendChild(tag){elements.set(tag.id,tag);}}, getElementById(id){return id === 'youtube-api' ? elements.get(id) : element(id);},querySelectorAll(){return [];},querySelector(){return element('query');},addEventListener(){},createElement(){return {};}};
  const context = vm.createContext({document, window: {scrollY:0,innerHeight:800,matchMedia(){return {matches:false};},addEventListener(){}},localStorage:{getItem(){throw Error('Storage blocked');},setItem(){throw Error('Storage blocked');}},AbortController,setTimeout,clearTimeout,requestAnimationFrame(){},fetch:async url=>{requests.push(url);return {ok:true,json:async()=>url.endsWith('/videos')?{videos}:url.endsWith('/upcoming')?{upcoming:null}:{live:false}};}});
  vm.runInContext(source,context);
  return {context,elements,requests};
}
test('blocked storage and unavailable IntersectionObserver do not stop initialization', async()=>{
  const {context,elements,requests}=setup();
  await new Promise(setImmediate);
  assert.equal(vm.runInContext('currentLang',context),'es');
  assert.equal(elements.get('sermons-grid').style.display,'grid');
  assert.ok(requests.includes('/api/live'));
  assert.ok(!elements.has('youtube-api'));
});
test('sermon text is escaped before entering HTML',async()=>{
  const {elements}=setup();await new Promise(setImmediate);
  const html=elements.get('sermons-grid').innerHTML;
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt; &quot;Faith&quot;'));
  assert.ok(html.includes('&lt;b&gt;Today&lt;/b&gt;'));
  assert.ok(!html.includes('<img src=x'));
});
test('invalid video IDs fall through to a visible error state',async()=>{
  const {elements}=setup([{videoId:'bad" onclick="alert(1)',title:'Bad'}]);await new Promise(setImmediate);
  assert.equal(elements.get('sermons-error').style.display,'block');
  assert.equal(elements.get('sermons-loading').style.display,'none');
});
test('YouTube API is requested only when a live player is needed',()=>{
 const {context,elements}=setup(); assert.ok(!elements.has('youtube-api'));
 vm.runInContext("startHeroLiveVideo('abcdefghijk')",context);
 assert.equal(elements.get('youtube-api').src,'https://www.youtube.com/iframe_api');
});
