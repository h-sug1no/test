(() => {
  var jsmediatags = window.jsmediatags;

  const sps = new URLSearchParams(location.search);
  let audioSrcUrl = sps.get('audio');
  const actx = new AudioContext();
  let buffer;
  let audioTags;
  let bpmInfo = {
    audioSrcUrl,
    musicTempo: undefined,
    bpm: sps.get('bpm'),
  };
  let c2d;
  let c2dElm;
  let loadErrorElm;
  let logElm;
  let picturesElm;
  let silences = [];
  let levelInfo = {};
  let activeSource;
  let error;
  let loadError;
  let forceRelayout = false;
  let wavesurfer;

  const getSilenceEnd = () => {
    let offset = Infinity;
    silences.forEach((s) => {
      if (s.end) {
        offset = Math.min(offset, s.end.sec);
      }
    });
    return offset === Infinity ? 0 : offset;
  };
  const fromPictureTagData = (picture = {}) => {
    const { data, format } = picture;
    if (!data) {
      return undefined;
    }
    let base64String = '';
    for (let i = 0; i < data.length; i += 1) {
      base64String += String.fromCharCode(data[i]);
    }
    const ret = document.createElement('img');
    ret.src = `data:${format};base64,${window.btoa(base64String)}`;
    return ret;
  };

  const decodeAudioData = (data) => {
    const p = new Promise((resolve, reject) => {
      audioTags = undefined;
      const audioBlob = new Blob([data], { type: 'application/octet-binary' });
      wavesurfer.loadBlob(audioBlob);
      jsmediatags.read(audioBlob, {
        onSuccess: function (tag) {
          audioTags = tag.tags;
          resolve(audioTags);
        },
        onError: function (error) {
          // console.log(error);
          resolve(error);
        },
      });
    });
    return p.then(() => {
      return actx
        .decodeAudioData(data)
        .then((buf) => {
          buffer = buf;
          document.body.classList.add('ready');
          document.body.classList.remove('loading');
          return buffer;
        })
        .catch((e) => Promise.reject(e));
    });
  };

  const ticker = {
    ticks: {},
    startSec: 0,
    tickNo: 0,
    bpmRef: 120,
    start(startSec, bpmRef = { value: 120 }, currentSec) {
      const aTick = 60 / Number(bpmRef.value);
      let offsetInCurrentBeat = currentSec % aTick;
      let offsetToNextBeat = 0;
      let tick0No = 0;
      if (offsetInCurrentBeat) {
        offsetToNextBeat = aTick - offsetInCurrentBeat;
        tick0No = Math.ceil(currentSec / aTick) % 4;
      }
      this.startSec = startSec + offsetToNextBeat;
      this.tick0No = tick0No;
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
        const f = (this.tick0No + this.tickNo) % 4 ? 600 : 800;
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
        adsr.a.v * levelInfo.max,
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
          document.body.classList.remove('ready');
          document.body.classList.add('loading');
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
            bpmElm.value = bpmInfo.bpm || 120;
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

  const gridCtx = (gridWidth) => {
    let prevX = undefined;
    return {
      fillRect(x, y, w, h) {
        const shouldRender = prevX === undefined || x - prevX >= gridWidth;
        if (shouldRender) {
          c2d.fillRect(x, y, w, h);
          prevX = x;
        }
      },
    };
  };

  const render = (timestamp = 0) => {
    if (!wavesurfer) {
      if (document.querySelector('#waveform')) {
        wavesurfer = WaveSurfer.create({
          container: '#waveform',
          plugins: [
            /*
            WaveSurfer.cursor.create({
              showTime: true,
              opacity: 1,
              customShowTimeStyle: {
                'background-color': '#000',
                color: '#fff',
                padding: '2px',
                'font-size': '10px',
              },
            }),
          */
          ],
          // waveColor: 'violet',
          // progressColor: 'purple',
        });
      }
    }
    if (ui.enabled('ticker')) {
      ticker.render();
    }
    ui.render();
    if (!c2d) {
      const elm = document.querySelector('canvas.audioView');
      if (elm) {
        c2d = elm.getContext('2d');
        c2dElm = elm;

        c2dElm.addEventListener('click', (e) => {
          console.log(e);
          const d01F = e.offsetX / c2dElm.clientWidth;
          window.AUDIOVIEW.stop();
          window.setTimeout(() => {
            window.AUDIOVIEW.play(true, d01F);
          }, 100);
        });
      }
    }
    if (!logElm) {
      logElm = document.querySelector('div.log');
    }

    if (!picturesElm) {
      picturesElm = document.querySelector('div.pictures');
    }
    if (picturesElm) {
      picturesElm.textContent = '';
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
      loadErrorElm.textContent = loadError || '';
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
            if (bpmInfo.audioSrcUrl !== audioSrcUrl || !bpmInfo.bpm) {
              var mt = new MusicTempo(data);
              /*
              console.log(mt.tempo);
              console.log(mt.beats);
              */
              bpmInfo.musicTempo = mt;
              bpmInfo.audioSrcUrl = audioSrcUrl;
              bpmInfo.bpm = Math.round(mt.tempo || 120);
              ui.elmsMap.bpm.value = bpmInfo.bpm;
            }
            texts.push(`data[${i}]: length=${data.length}`);
          }
          texts.push(`silences: ${JSON.stringify(silences, null, 2)}`);
        }
        if (audioTags) {
          texts.push(
            JSON.stringify(
              audioTags,
              (k, v) => {
                if (k === 'data' && v && Array.isArray(v)) {
                  return '[...]';
                }
                return v;
              },
              2,
            ),
          );
          const { picture } = audioTags;
          if (picture) {
            const imgElm = fromPictureTagData(picture);
            if (imgElm) {
              picturesElm.appendChild(imgElm);
            }
          }
        }
      }
      logElm.textContent = texts.join('\n');
      c2dElm.title = logElm.textContent;
    }

    const markerBoxHeight = 50;
    const secW = buffer ? clientWidth / buffer.duration : 0;

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
      levelInfo = {
        max: 0,
        total: 0,
        count: 0,
        average: 0,
      };
      const contentBoxHeight = clientHeight - markerBoxHeight;
      for (let i = 0; i < buffer.numberOfChannels; i += 1) {
        const row = contentBoxHeight * (1 / buffer.numberOfChannels);
        const hRow = row * 0.5;
        const y = markerBoxHeight + (row * i + hRow);
        c2d.fillRect(0, y, clientWidth, 1);
        const data = buffer.getChannelData(i);

        const gctx = gridCtx(1);
        data.forEach((v, idx) => {
          const x = (clientWidth / data.length) * idx;
          if (!(idx % 100)) {
            c2d.fillStyle = `hsl(${(360 / 10) * i}, 80%, 60%)`;
            gctx.fillRect(x, y, 1, v * hRow);
          }
          const absV = Math.abs(v);
          levelInfo.max = Math.max(absV, levelInfo.max);
          if (absV > 1) {
            console.log(idx, v);
          }
          if (absV <= 0.01) {
            if (!silences[i] || !silences[i].done) {
              silences[i] = {
                sec: sampleSec * idx,
                idx,
                v,
              };
            }
          } else {
            levelInfo.count += 1;
            levelInfo.total += v;
            if (silences[i]) {
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
          }
        });
      }
      levelInfo.average = levelInfo.total / levelInfo.count;
      bpmInfo.tickBpm = 0;
    }
    if (c2d) {
      if (bpmInfo.tickBpm !== ui.elmsMap.bpm.value && buffer) {
        c2d.clearRect(0, markerBoxHeight, clientWidth, 50);
        if (bpmInfo.musicTempo) {
          const { beats = [] } = bpmInfo.musicTempo;
          const hRow = 100;
          const gctx = gridCtx(10);
          beats.forEach((b) => {
            c2d.fillStyle = 'rgba(0,0,255,0.4)';
            gctx.fillRect(secW * b, 0, 1, hRow);
          });
        }

        bpmInfo.tickBpm = ui.elmsMap.bpm.value;
        const silenceEndSec = getSilenceEnd();
        let sec = silenceEndSec;
        const beatSec = 60 / Number(bpmInfo.tickBpm);
        const gctx = gridCtx(10);
        while (sec < buffer.duration) {
          c2d.fillStyle = 'rgba(0,255, 0, 0.4)';
          gctx.fillRect(sec * secW, 0, 3, 75);
          sec += beatSec;
        }
      }

      c2d.clearRect(0, 0, clientWidth, markerBoxHeight);
      if (buffer && actx && activeSource) {
        c2d.fillStyle = 'black';
        // FIXME: how to solve audio delay on vmware (host:w10, guest: ubuntu)
        const platformDelay = 0;
        const now =
          activeSource.offset +
          (actx.currentTime - activeSource.startTime) -
          platformDelay;
        const now01F = now / buffer.duration;
        const x = clientWidth * now01F;
        c2d.textAlign = x / clientWidth > 0.5 ? 'end' : 'start';
        c2d.fillText(
          `${now.toFixed(3)} / ${buffer.duration.toFixed(3)}`,
          x,
          15,
        );
        c2d.fillRect(x, 20, 1, 30);

        if (wavesurfer) {
          wavesurfer.seekAndCenter(now01F);
        }
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
    play(skipSilence, startOffset01F = 0) {
      if (activeSource) {
        return;
      }
      if (actx.resume) {
        actx.resume();
      }
      source = actx.createBufferSource();
      source.buffer = buffer;
      source.connect(actx.destination);
      let silenceEnd = 0;
      let startOffset = buffer.duration * startOffset01F;

      if (skipSilence) {
        silenceEnd = getSilenceEnd();
        startOffset = Math.max(silenceEnd, startOffset);
      }

      source.onended = () => {
        activeSource = undefined;
        ticker.stop();
      };
      activeSource = {
        source,
        startTime: actx.currentTime + 0.1,
        offset: startOffset,
        silenceEnd: silenceEnd,
      };

      source.start(activeSource.startTime, startOffset);
      if (ui.enabled('ticker')) {
        const currentSec = startOffset - silenceEnd;
        ticker.start(activeSource.startTime, ui.elmsMap.bpm, currentSec);
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
