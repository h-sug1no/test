(() => {
  const sps = new URLSearchParams(location.search);
  let audioSrcUrl = sps.get('audio');
  const actx = new AudioContext();
  let buffer;
  let c2d;
  let c2dElm;
  let loadErrorElm;
  let logElm;
  let silences = [];
  let activeSource;
  let error;
  let loadError;
  let forceRelayout = false;

  const decodeAudioData = (data) => {
    return actx
      .decodeAudioData(data)
      .then((buf) => {
        buffer = buf;
        document.body.classList.add('ready');
        return buffer;
      })
      .catch((e) => Promise.reject(e));
  };

  const ticker = {
    ticks: {},
    startSec: 0,
    tickNo: 0,
    bpmRef: 120,
    start(startSec, bpmRef = { value: 120 }) {
      this.startSec = startSec;
      this.bpmRef = bpmRef;
      this.tickNo = 0;
      this.render();
    },
    stop() {
      this.startSec = 0;
      const { ticks } = this;
      Object.keys(ticks).forEach((key) => {
        ticks[key].stop(0);
      });
      this.ticks = {};
    },
    render() {
      const { ticks, startSec, bpmRef } = this;
      if (!startSec) {
        return;
      }
      let n = Object.keys(ticks).length;
      n = 2 - n;
      const d = 60 / (Number(bpmRef.value) || 1);
      while (n > 0) {
        const f = this.tickNo % 4 ? 600 : 800;
        this.pushTick(startSec + this.tickNo * d, f);
        n -= 1;
        this.tickNo += 1;
      }
    },
    adsr: {
      a: {
        v: 1,
        sec: 0.0009,
      },
      d: {
        sec: 0.15,
        v: 0.001,
      },
    },
    pushTick(startSec, freq) {
      const { adsr } = this;
      const osc = actx.createOscillator();
      osc.frequency.value = freq;
      const gainNode = actx.createGain();
      gainNode.gain.value = 1;
      gainNode.gain.exponentialRampToValueAtTime(
        adsr.a.v,
        startSec + adsr.a.sec,
      );
      gainNode.gain.exponentialRampToValueAtTime(
        adsr.d.v,
        startSec + adsr.d.sec,
      );
      gainNode.connect(actx.destination);
      osc.connect(gainNode);
      this.ticks[startSec] = osc;
      osc.onended = () => {
        delete this.ticks[startSec];
      };
      osc.start(startSec);
      osc.stop(startSec + 0.3);
    },
  };

  const dropZone = {
    elm: undefined,
    render() {
      if (this.elm) {
        return;
      }

      this.elm = document.querySelector('div.audioDZContainer input');
      const { elm } = this;
      if (elm) {
        const tglClazz = (v) => {
          elm.classList.toggle('hover', v);
        };
        elm.ondragover = (e) => {
          console.log(e);
          tglClazz(true);
        };
        elm.ondragend = () => {
          tglClazz(false);
        };
        elm.ondragleave = () => {
          tglClazz(false);
        };
        elm.ondrop = () => {
          tglClazz(false);
        };

        elm.addEventListener('change', () => {
          const file = elm.files[0];
          file
            .arrayBuffer()
            .then((data) => decodeAudioData(data))
            .then(() => {
              audioSrcUrl = `localfile:${file.name}`;
              forceRelayout = true;
              loadError = undefined;
              error = undefined;
              window.AUDIOVIEW.stop();
            })
            .catch((e) => (loadError = `${file.name}: ${e.toString()}`));
        });
      }
    },
  };

  const ui = {
    elmsMap: undefined,
    render() {
      dropZone.render();
      const cs = ['play', 'stop'];
      if (!this.elmsMap) {
        cs.forEach((c) => {
          const elms = document.querySelectorAll(`div.uiContainer button.${c}`);
          if (elms.length) {
            this.elmsMap = this.elmsMap || {};
            this.elmsMap[c] = elms;
          }
        });
        if (this.elmsMap) {
          ['ticker', 'bpm'].forEach((c) => {
            this.elmsMap[c] = document.querySelector(`div.uiContainer .${c}`);
          });
          const { bpm: bpmElm } = this.elmsMap;
          if (bpmElm) {
            bpmElm.value = sps.get('bpm') || 120;
          }
        }
      }
      const { elmsMap } = this;
      if (!elmsMap) {
        return;
      }

      cs.forEach((c) => {
        elmsMap[c].forEach((v) => {
          switch (c) {
            case 'play':
              v.disabled = !!activeSource || error;
              break;
            case 'stop':
              v.disabled = !activeSource || error;
              break;
            default:
              break;
          }
        });
      });

      elmsMap.ticker.disabled = activeSource && !ticker.startSec;
    },
    enabled(c) {
      return ui.elmsMap && ui.elmsMap[c] && ui.elmsMap[c].checked;
    },
  };

  const render = (timestamp = 0) => {
    if (ui.enabled('ticker')) {
      ticker.render();
    }
    ui.render();
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

    if (!loadErrorElm) {
      loadErrorElm = document.querySelector('div.loadError');
    }

    let dirty = forceRelayout;
    const tC2dElm = c2dElm || {};
    const { clientWidth, clientHeight } = tC2dElm;
    if (tC2dElm.width !== clientWidth || tC2dElm.height !== clientHeight) {
      tC2dElm.width = clientWidth;
      tC2dElm.height = clientHeight;
      dirty = true;
    }

    if (logElm) {
      const texts = [];
      if (loadError) {
        loadErrorElm.textContent = loadError;
      }
      if (error) {
        if (audioSrcUrl) {
          texts.push(error);
          texts.push(`audio=${audioSrcUrl}`);
        }
        const url = new URL(location);
        url.search = 'audio=audioFileUrl';
        texts.push(`usage: ${url.toString()}[&bpm=number]`);
      } else {
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
          texts.push(
            `audioBuffer: numberOfChannels=${buffer.numberOfChannels}, duration=${buffer.duration}`,
          );
          for (let i = 0; i < buffer.numberOfChannels; i += 1) {
            const data = buffer.getChannelData(i);
            texts.push(`data[${i}]: length=${data.length}`);
          }
          texts.push(`silences: ${JSON.stringify(silences, null, 2)}`);
        }
      }
      logElm.textContent = texts.join('\n');
      c2dElm.title = logElm.textContent;
    }

    const markerBoxHeight = 50;
    if (dirty && c2d && buffer) {
      forceRelayout = false;
      c2d.clearRect(0, 0, clientWidth, clientHeight);
      // c2d.globalCompositeOperation = 'xor';
      let dataLength = -Infinity;
      for (let i = 0; i < buffer.numberOfChannels; i += 1) {
        const data = buffer.getChannelData(i);
        dataLength = Math.max(dataLength, data.length);
      }
      const sampleSec = buffer.duration / dataLength;
      silences = [];
      const contentBoxHeight = clientHeight - markerBoxHeight;
      for (let i = 0; i < buffer.numberOfChannels; i += 1) {
        const row = contentBoxHeight * (1 / buffer.numberOfChannels);
        const hRow = row * 0.5;
        const y = markerBoxHeight + (row * i + hRow);
        c2d.fillRect(0, y, clientWidth, 1);
        const data = buffer.getChannelData(i);

        data.forEach((v, idx) => {
          const x = (clientWidth / data.length) * idx;
          if (!(idx % 100)) {
            c2d.fillStyle = `hsl(${(360 / 10) * i}, 80%, 60%)`;
            c2d.fillRect(x, y, 1, v * hRow);
          }
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
              };
              c2d.fillStyle = 'rgba(0,0,0,0.4)';
              c2d.fillRect(0, y - hRow * 0.5, x, hRow);
            }
          }
        });
      }
    }
    if (c2d) {
      c2d.clearRect(0, 0, clientWidth, markerBoxHeight);
      if (buffer && actx && activeSource) {
        c2d.fillStyle = 'black';
        const x =
          clientWidth *
          ((activeSource.offset + (actx.currentTime - activeSource.startTime)) /
            buffer.duration);
        c2d.textAlign = x / clientWidth > 0.5 ? 'end' : 'start';
        c2d.fillText(
          `${(actx.currentTime - activeSource.startTime).toFixed(
            3,
          )} / ${buffer.duration.toFixed(3)}`,
          x,
          15,
        );
        c2d.fillRect(x, 20, 1, 30);
      }
    }
    requestAnimationFrame(render);
  };

  fetch(audioSrcUrl)
    .then((res) => {
      if (res.ok) {
        return res
          .arrayBuffer()
          .then((data) => decodeAudioData(data))
          .catch((e) => Promise.reject(e));
      } else {
        return Promise.reject(Error(`${res.status}: ${res.statusText}`));
      }
    })
    .catch((e) => {
      error = e.toString();
    });

  let source;
  window.AUDIOVIEW = {
    play(skipSilence) {
      if (activeSource) {
        return;
      }
      if (actx.resume) {
        actx.resume();
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
        ticker.stop();
      };
      activeSource = {
        source,
        startTime: actx.currentTime + 0.001,
        offset,
      };

      source.start(activeSource.startTime, offset);
      if (ui.enabled('ticker')) {
        ticker.start(activeSource.startTime, ui.elmsMap.bpm);
      }
    },
    stop() {
      if (source) {
        source.stop(0);
      }
      ticker.stop();
    },
  };

  render();
})();
