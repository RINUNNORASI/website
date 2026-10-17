const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const D=require('../dist/listening-data.js');

test('bundled neural audio matches the lesson script and changes its URL when regenerated',()=>{
  const directory=path.join(__dirname,'../dist/assets/listening');
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  assert.equal(manifest.assets.length,D.originals.length);
  for(const lesson of D.originals){
    const asset=manifest.assets.find(item=>item.id===lesson.id);
    assert.ok(asset,'Missing audio provenance for '+lesson.id);
    assert.equal(asset.filename,lesson.id+'.mp3');
    const bytes=fs.readFileSync(path.join(directory,asset.filename));
    assert.equal(bytes.length,asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    assert.equal(createHash('sha256').update(lesson.script,'utf8').digest('hex'),asset.script_sha256,
      'Regenerate audio after changing the original script');
    assert.ok(asset.seconds>10&&asset.seconds<180,'Unexpected lesson audio duration');
    assert.ok(bytes.toString('ascii',0,3)==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224),'Expected MP3 audio');
    const url=new URL(lesson.audioUrl,'https://xunci.test');
    assert.equal(url.origin,'https://xunci.test');
    assert.equal(url.pathname,'/assets/listening/'+asset.filename);
    assert.equal(url.searchParams.get('v'),asset.sha256.slice(0,12),
      'Audio identity must invalidate the old browser media resource');
  }
});
