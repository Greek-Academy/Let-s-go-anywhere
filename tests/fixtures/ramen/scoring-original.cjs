/* Transparent, descriptive rules for this fixed photo collection. Not a psychometric test. */
'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RamenScoring = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const RULES = Object.freeze({version:'visual-16-v3.0', minPhotos:6, minRestaurants:3, boundaryPP:10, minRatingGroup:10, answerScores:{yes:1,maybe:.5,no:0}});
  const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
  function group(rows) {
    const shops = new Map();
    for (const r of rows) { const a=shops.get(r.restaurant_id)||[]; a.push(r.rating); shops.set(r.restaurant_id,a); }
    return {rate:mean([...shops.values()].map(mean)), n:rows.length, yes:rows.filter(r=>r.value==='yes').length, maybe:rows.filter(r=>r.value==='maybe').length, no:rows.filter(r=>r.value==='no').length, restaurants:shops.size};
  }
  function compare(rows, getter) {
    const low=rows.filter(r=>getter(r)===-1), high=rows.filter(r=>getter(r)===1);
    const minus=group(low), plus=group(high);
    const supported=minus.n>=RULES.minPhotos && plus.n>=RULES.minPhotos && minus.restaurants>=RULES.minRestaurants && plus.restaurants>=RULES.minRestaurants;
    const delta=minus.rate===null||plus.rate===null ? null : (plus.rate-minus.rate)*100;
    const direction=delta===null||Math.abs(delta)<1e-8 ? 0 : Math.sign(delta);
    const shops=[...new Set([...low,...high].map(r=>r.restaurant_id))];
    const leaveOneOut=shops.map(shop=>{
      const a=group(low.filter(r=>r.restaurant_id!==shop)).rate, b=group(high.filter(r=>r.restaurant_id!==shop)).rate;
      return a===null||b===null ? null : (b-a)*100;
    }).filter(x=>x!==null);
    const stable=!!direction && leaveOneOut.length===shops.length && leaveOneOut.every(x=>Math.sign(x)===direction && Math.abs(x)>1e-8);
    const status=!supported?'insufficient':Math.abs(delta)<RULES.boundaryPP||!stable?'boundary':'clear';
    return {minus,plus,delta,direction,supported,stable,status,excluded:rows.length-low.length-high.length,leave_one_restaurant_out_range:leaveOneOut.length?[Math.min(...leaveOneOut),Math.max(...leaveOneOut)]:null};
  }
  function score(profile, answers) {
    const byId=new Map(profile.photos.map(p=>[p.id,p]));
    const seen=new Set(), rows=[];
    for (const a of answers) {
      if(seen.has(a.photo_id)) throw new Error('Duplicate photo answer');
      seen.add(a.photo_id);
      if(!byId.has(a.photo_id)||!['yes','maybe','no','skip'].includes(a.value)) throw new Error('Invalid photo answer');
      if(a.value!=='skip')rows.push({...byId.get(a.photo_id),value:a.value,rating:RULES.answerScores[a.value]});
    }
    const yes=rows.filter(r=>r.value==='yes').length, maybe=rows.filter(r=>r.value==='maybe').length, no=rows.filter(r=>r.value==='no').length;
    const enoughVariation=[yes,maybe,no].filter(n=>n>=RULES.minRatingGroup).length>=2;
    const axes=profile.axes.map(a=>({...a,...compare(rows,r=>r.axes[a.id])}));
    const candidates=profile.types.filter(t=>axes.every((a,i)=>!enoughVariation||a.status!=='clear'||t.code[i]===a.letters[a.direction>0?1:0]));
    const code=enoughVariation && axes.every(a=>a.status==='clear') ? candidates[0].code : null;
    const closestCode=enoughVariation && axes.every(a=>a.supported&&a.direction!==0) ? axes.map(a=>a.letters[a.direction>0?1:0]).join('') : null;
    const extras=profile.extras.map(a=>({...a,...compare(rows,r=>r.extras[a.id]===null||r.extras[a.id]===undefined?null:r.extras[a.id]>=.75?1:r.extras[a.id]<=(a.low_max??.25)?-1:0)}));
    const flavors=profile.flavors.map(f=>({...f,...group(rows.filter(r=>r.flavor_category===f.id)),photo_ids:rows.filter(r=>r.flavor_category===f.id&&r.value==='yes').map(r=>r.id)}));
    const serving=profile.serving.map(s=>({...s,...group(rows.filter(r=>r.serving_type===s.id))}));
    const result={rules:RULES,scope:'visual_preferences_in_this_photo_collection',answered:answers.length,valid:rows.length,skipped:answers.length-rows.length,yes,maybe,no,enoughVariation,axes,extras,flavors,serving,code,closest_code:closestCode,candidate_codes:candidates.map(t=>t.code)};
    result.paragraphs=describe(result,profile);
    result.examples=Object.fromEntries(['yes','maybe','no'].map(value=>[value,rows.filter(r=>r.value===value).map(r=>r.id)]));
    return result;
  }
  function describe(r,profile) {
    const out=[];
    if(!r.enoughVariation) {
      out.push(r.yes===r.valid&&r.valid>0?'今回は、すべての写真が「好き」でした。幅広い見た目を受け入れている結果なので、16タイプのひとつには絞っていません。':r.no===r.valid&&r.valid>0?'今回は、すべての写真が「好きではない」でした。この写真集では好みの方向を特定できないため、16タイプのひとつには絞っていません。':r.maybe===r.valid&&r.valid>0?'今回は、すべての写真が「どちらともいえない」でした。好みの方向に差が出ていないため、16タイプのひとつには絞っていません。':'異なる評価を比較する材料が少ないため、今回はタイプを保留しています。');
      out.push('各特徴の好みスコアは下に表示しています。写真の選び方の記録としてご覧ください。');
      return out;
    }
    const clear=r.axes.filter(a=>a.status==='clear').sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    if(clear.length)out.push('今回の写真では、'+clear.map(a=>a.phrases[a.direction>0?1:0]).join('、')+'を比較的高く評価する傾向でした。');
    else out.push('今回の写真では、4つの特徴のどちらか一方に、はっきり寄る結果にはなりませんでした。組み合わせや個々の写真によって「好き」が変わる可能性があります。');
    const both=r.axes.find(a=>a.supported&&a.minus.rate>=.6&&a.plus.rate>=.6);
    if(both)out.push('一方で、「'+both.labels[0]+'」「'+both.labels[1]+'」のどちらも比較的高く評価していて、この特徴だけで好みが決まるわけではなさそうです。');
    const boundary=r.axes.filter(a=>a.status==='boundary');
    if(boundary.length)out.push(boundary.map(a=>'「'+a.name+'」').join('・')+'は境界です。今回の回答では、どちらかに固定せずに捉えています。');
    const missing=r.axes.filter(a=>a.status==='insufficient');
    if(missing.length)out.push(missing.map(a=>'「'+a.name+'」').join('・')+'は、写真から読み取れる比較材料が足りず保留しています。');
    const extra=r.extras.filter(a=>a.status==='clear').sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,2);
    if(extra.length)out.push('さらに、'+extra.map(a=>'「'+a.phrases[a.direction>0?1:0]+'」').join('・')+'といった特徴がある写真の評価も高めです。');
    const flavors=r.flavors.filter(f=>f.n>=6&&f.restaurants>=3).sort((a,b)=>b.rate-a.rate);
    if(flavors.length>=2 && flavors[0].rate>=.5 && (flavors[0].rate-flavors.at(-1).rate)>=.1)out.push('メニュー名が確認できた写真では、「'+flavors[0].label+'」と紹介された一杯の好みスコアが比較的高めでした。味そのものの好みは、実際に食べてから確かめたい部分です。');
    return out;
  }
  function toText(r,profile) {
    const type=profile.types.find(t=>t.code===r.code), closest=profile.types.find(t=>t.code===r.closest_code);
    const title=type?type.name+'（'+type.code+'）':closest?closest.name+'寄り・境界あり':'タイプはひとつに絞らず';
    const lines=['ラーメン写真の好み診断',title,'',...r.paragraphs,'','4つの特徴（○=100・△=50・×=0、店ごとの平均を均等に集計）'];
    for(const a of r.axes)lines.push(a.name+'：'+a.labels.map((label,i)=>{const p=i?a.plus:a.minus;return label+' '+(p.rate===null?'—':Math.round(p.rate*100)+'点')+'（○'+p.yes+'・△'+p.maybe+'・×'+p.no+' / '+p.n+'枚・'+p.restaurants+'店）';}).join(' / ')+'、差 '+(a.delta===null?'—':Math.abs(a.delta).toFixed(1)+'ポイント')+'、'+({clear:'方向あり',boundary:'境界',insufficient:'材料不足'}[a.status]));
    lines.push('','回答：○ '+r.yes+' / △ '+r.maybe+' / × '+r.no+' / 読込不可 '+r.skipped,'独自の16タイプ分類です。写真への好みを記述し、性格や実際の味の好み、診断の正確さを測るものではありません。','判定ルール：'+RULES.version);
    return lines.join('\n');
  }
  return {RULES,score,toText};
});
