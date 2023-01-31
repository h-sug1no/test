import { TimeStretcher } from './stretch.js';

(() => {
  const sps = new URLSearchParams(location.search);

  /*
  this.wavesurfer.empty();
  this.wavesurfer.loadDecodedBuffer(yourBuffer);
  */

  function L() {
    console.log(...arguments);
  }

  const init = () => {
    const audioElm = document.querySelector('#player');
    audioElm.src = sps.get('src');
    window.WTGLOBAL.audioElm = audioElm;
    App.setupSample(audioElm.src);
  };

  const App = {
    actx: new AudioContext(),
    buffer: undefined,
    playBuffer: undefined,
    pitchShift: 0,
    stretchFactor: 1,
    wavesurfer: undefined,
    elms: {
      timeStretch: undefined,
      pitchShift: undefined,
    },
    loadThisBuffer() {
      this.wavesurfer.empty();
      this.wavesurfer.loadDecodedBuffer(this.playBuffer || this.buffer);
    },
    async setupSample(url) {
      const { actx: ctx } = this;
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.buffer = await ctx.decodeAudioData(arrayBuffer);
      this.wavesurfer = WaveSurfer.create({
        container: document.querySelector('#wsContainer'),
      });

      const me = this;
      document.querySelector('#togglePlay').addEventListener('click', (e) => {
        const { wavesurfer } = me;
        if (e.altKey) {
          wavesurfer.seekTo(0);
          wavesurfer.play();
        } else {
          wavesurfer.playPause();
        }
      });

      this.elms.timeStretch = document.querySelector('#timeStretch');
      this.elms.pitchShift = document.querySelector('#pitchShift');

      document.querySelector('#apply').addEventListener('click', (e) => {
        me.stretchFactor = Number(this.elms.timeStretch.value);
        me.pitchShift = Number(this.elms.pitchShift.value);
        me.stretch();
        this.loadThisBuffer();
      });

      this.loadThisBuffer();
    },
    stretch() {
      const buffer = this.buffer;
      if (!buffer) return;

      let len = buffer.duration;

      if (len == 0) {
        this.playBuffer = null;
        return;
      }

      let stretchBuffer = buffer;

      if (this.stretchFactor == 1 && this.pitchShift == 0) {
        this.playBuffer = stretchBuffer;
        return;
      }

      let pitchShift = Math.pow(2, this.pitchShift / 12);
      let totalStretchFactor = this.stretchFactor * pitchShift;
      let newSize = stretchBuffer.length * this.stretchFactor;

      L('Stretching: ', this.stretchFactor, 'Shifting: ', pitchShift);

      let stretcher = new TimeStretcher({
        sampleRate: buffer.sampleRate,
        stretchFactor: totalStretchFactor,
      });

      let result_buffers = [];
      let b = this.actx.createBuffer(
        stretchBuffer.numberOfChannels,
        newSize,
        stretchBuffer.sampleRate,
      );
      for (let i = 0; i < stretchBuffer.numberOfChannels; ++i) {
        L('Stretching channel: ', i);
        stretcher.setBuffer(stretchBuffer.getChannelData(i)).stretch();
        result_buffers[i] = pitchShift
          ? stretcher.resize(newSize).getPitchShiftedBuffer()
          : stretcher.getStretchedBuffer();
        b.getChannelData(i).set(result_buffers[i]);
      }

      this.playBuffer = b;
    },
  };

  window.WTGLOBAL = {
    init,
  };
})();
