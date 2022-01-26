(() => {
  const actx = new AudioContext();
  let buffer;
  let c2d;
  let c2dElm;
  
  const render = (timestamp=0) => {
    if (!c2d) {
      const elm = document.querySelector('canvas.audioView');
      if (elm) {
        c2d = elm.getContext('2d');
        c2dElm = elm;
      }
    }

    let dirty;
    const {clientWidth, clientHeight} = c2dElm;
    if (c2dElm.width !== clientWidth || 
      c2dElm.height !== clientHeight) {
      c2dElm.width = clientWidth;
      c2dElm.height = clientHeight;
      dirty = true;
    }


    if (dirty && c2d) {
      c2d.clearRect(0, 0, clientWidth, clientHeight)
      // c2d.globalCompositeOperation = 'xor';

      for (let i = 0; i < buffer.numberOfChannels; i += 1) {
        const row = clientHeight * (1 / (buffer.numberOfChannels + 1));
        const y = row * (i + 1);
        const hRow = row * 0.5;
        c2d.fillRect(0, y, clientWidth, 1);
        const data = buffer.getChannelData(i);

        c2d.fillStyle = `hsl(${360/10*i}, 80%, 60%)`;

        data.forEach((v, idx) => {
          const x = (clientWidth / data.length) * idx;
          c2d.fillRect(x, y, 1 , v * hRow);
          if (Math.abs(v) > 1) {
            console.log(idx, v);
          }
            
        });
      }
    }
    requestAnimationFrame(render);
  }

  const sps = new URLSearchParams(location.search);

  fetch(sps.get('audio')).then(res => res.arrayBuffer())
    .then(data => actx.decodeAudioData(data))
    .then(buf => {
      buffer = buf;
      render();
      return buffer;
    });

    let source;
  window.AUDIOVIEW = {
    play() {
      source = actx.createBufferSource();
      source.buffer = buffer;
      source.connect(actx.destination);
      source.start(0);
    },
    stop() {
      if (source) {
        source.stop(0);
      }
    },
  };
})();
