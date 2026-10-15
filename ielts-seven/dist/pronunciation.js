(function(root){
  'use strict';
  const cache=new Map();let player=null,current=0;
  async function britishVoice(){
    if(!root.speechSynthesis)return null;
    const pick=()=>root.speechSynthesis.getVoices().find(v=>/^en[-_]GB$/i.test(v.lang));
    if(pick())return pick();
    return new Promise(resolve=>{const done=()=>{clearTimeout(timer);root.speechSynthesis.removeEventListener('voiceschanged',change);resolve(pick()||null);};const change=()=>{if(pick())done();};const timer=setTimeout(done,2000);root.speechSynthesis.addEventListener('voiceschanged',change);});
  }
  async function play(word,onStatus=()=>{}){
    const run=++current;if(player){player.pause();player=null;}root.speechSynthesis?.cancel();
    onStatus({kind:'loading',word});let data=cache.get(word);
    if(!data&&/^[A-Za-z]+(?:[-'][A-Za-z]+)*$/.test(word)){
      try{const res=await fetch('/api/pronunciation?word='+encodeURIComponent(word),{credentials:'same-origin',cache:'force-cache'});if(res.ok){data=await res.json();cache.set(word,data);}}catch{}
    }
    if(run!==current)return;
    if(data?.available&&data.accent==='UK'&&/^https:\/\/api\.dictionaryapi\.dev\//.test(data.audioUrl)){
      try{player=new Audio(data.audioUrl);player.playbackRate=.95;await player.play();onStatus({kind:'recording',word,sourceUrl:data.sourceUrl});return;}catch{}
    }
    const voice=await britishVoice();if(run!==current)return;
    if(voice){const u=new SpeechSynthesisUtterance(word);u.voice=voice;u.lang='en-GB';u.rate=.86;u.pitch=1;root.speechSynthesis.speak(u);onStatus({kind:'speech',word,voice:voice.name});return;}
    onStatus({kind:'unavailable',word,sourceUrl:data?.sourceUrl||'https://dictionary.cambridge.org/dictionary/english/'+encodeURIComponent(word)});
  }
  root.IELTS_AUDIO={play};
})(window);
