import {TimeStretcher} from './stretch.js';

(()=>{

  const sps = new URLSearchParams(location.search);


  const init=()=>{
    const audioElm = document.querySelector('#player');
    audioElm.src = sps.get('src');
    window.WTGLOBAL.audioElm = audioElm;
  }


  window.WTGLOBAL = {
    init,
  }
})();
