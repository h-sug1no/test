(() => {

  const sps = new URLSearchParams(location.search);
  const audioSrcUrl = sps.get('audio');
  const actx = new AudioContext();
  let buffer;
  let c2d;
  let c2dElm;
  let logElm;
  let silences = [];
  let activeSource;

  const render = (timestamp=0) => {
    if (!c2d) {
      const elm = document.querySelector('canvas.audioView');
      if (elm) {
        c2d = elm.getContext('2d');
        c2dElm = elm;
      }
    }
    if (!logElm) {
      logElm = document.querySelector('div.log');
    }


    let dirty;
    const {clientWidth, clientHeight} = c2dElm;
    if (c2dElm.width !== clientWidth || 
      c2dElm.height !== clientHeight) {
      c2dElm.width = clientWidth;
      c2dElm.height = clientHeight;
      dirty = true;
    }

    if (logElm) {
      const texts = [];
      if (audioSrcUrl) {
        texts.push(audioSrcUrl);
        if (!buffer) {
          texts.push('loading...');
        }
      }
      if (dirty) {
        texts.push('rendering...');
      }

      if (buffer) {
        texts.push(`audioBuffer: numberOfChannels=${buffer.numberOfChannels}, duration=${buffer.duration}`);
        for (let i = 0; i < buffer.numberOfChannels; i += 1) {
          const data = buffer.getChannelData(i);
          texts.push(`data[${i}]: length=${data.length}`);
        }
        texts.push(`silences: ${JSON.stringify(silences, null, 2)}`);
      }
      logElm.textContent = texts.join('\n');
    }

    if (c2d) {
      c2d.clearRect(0, 0, clientWidth, 50);
      c2d.fillStyle = 'black';
      c2d.fillText(activeSource ? 'playing' : '', 0, 20);
      if (buffer && actx && activeSource) {
        c2d.fillRect(clientWidth *
          ((activeSource.offset +
            (actx.currentTime - activeSource.startTime)) / buffer.duration),
        20, 1, 30);
      }
    }

    if (dirty && c2d) {
      c2d.clearRect(0, 0, clientWidth, clientHeight)
      // c2d.globalCompositeOperation = 'xor';
      let dataLength = -Infinity;
      for (let i = 0; i < buffer.numberOfChannels; i += 1) {
        const data = buffer.getChannelData(i);
        dataLength = Math.max(dataLength, data.length);
      }
      const sampleSec = buffer.duration / dataLength;
      silences = [];
      for (let i = 0; i < buffer.numberOfChannels; i += 1) {
        const row = clientHeight * (1 / (buffer.numberOfChannels + 1));
        const y = row * (i + 1);
        const hRow = row * 0.5;
        c2d.fillRect(0, y, clientWidth, 1);
        const data = buffer.getChannelData(i);

        data.forEach((v, idx) => {
          const x = (clientWidth / data.length) * idx;
          c2d.fillStyle = `hsl(${360/10*i}, 80%, 60%)`;
          c2d.fillRect(x, y, 1 , v * hRow);
          if (Math.abs(v) > 1) {
            console.log(idx, v);
          }
          if (Math.abs(v) <= 0.01) {
            if (!silences[i] || !silences[i].done) {
              silences[i] = {
                sec: sampleSec * idx,
                idx,
                v,
              };
            }
          } else if (silences[i]) {
            if (!silences[i].done) {
              silences[i].done = true;
              silences[i].end = {
                idx,
                v,
                sec: sampleSec * idx,
              }
              c2d.fillStyle = 'black';
              c2d.fillRect(x, y, 1, hRow);
            }
          }
        });
      }
    }
    requestAnimationFrame(render);
  }

  fetch(audioSrcUrl).then(res => res.arrayBuffer())
    .then(data => actx.decodeAudioData(data))
    .then(buf => {
      buffer = buf;
      render();
      return buffer;
    });

    let source;
    window.AUDIOVIEW = {
    play(skipSilence) {
      if (activeSource) {
        return;
      }
      source = actx.createBufferSource();
      source.buffer = buffer;
      source.connect(actx.destination);
      let offset = 0;
      if (skipSilence) {
        offset = Infinity;
        silences.forEach((s) => {
          if (s.end) {
            offset = Math.min(offset, s.end.sec);
          }
        });
      }
      source.onended = () => {
        activeSource = undefined;
      };
      activeSource = {
        source,
        startTime: actx.currentTime + 0.001,
        offset,
      };

      source.start(activeSource.startTime,
        offset);
    },
    stop() {
      if (source) {
        source.stop(0);
      }
    },
  };
})();
