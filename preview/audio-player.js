(function() {
  'use strict';

  const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];

  function isAudioExtension(ext) {
    return AUDIO_EXTENSIONS.includes(ext.toLowerCase());
  }

  function getAudioMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'm4a': 'audio/mp4',
      'flac': 'audio/flac',
      'aac': 'audio/aac'
    };
    return mimeTypes[ext] || 'audio/mpeg';
  }

  function base64ToBlob(base64, mimeType) {
    const byteString = atob(base64);
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      byteArray[i] = byteString.charCodeAt(i);
    }
    return new Blob([byteArray], { type: mimeType });
  }

  function fetchAudioFromBackground(url, filename) {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'fetchAudio', url: url }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response.success) {
            const audioBlob = base64ToBlob(response.data, getAudioMimeType(filename));
            const reader = new FileReader();
            reader.onload = () => {
              resolve(reader.result);
            };
            reader.onerror = () => {
              reject(new Error('Failed to convert blob to ArrayBuffer'));
            };
            reader.readAsArrayBuffer(audioBlob);
          } else {
            reject(new Error(response.error || 'Failed to fetch audio'));
          }
        });
      } else {
        reject(new Error('Chrome runtime not available'));
      }
    });
  }

  class GitPreviewAudioPlayer {
    constructor(options = {}) {
      this.url = options.url;
      this.filename = options.filename || 'Audio File';
      this.arrayBuffer = options.arrayBuffer;
      this.audioBuffer = null;
      this.audioContext = null;
      this.sourceNode = null;
      this.gainNode = null;
      this.isPlaying = false;
      this.startTime = 0;
      this.pauseTime = 0;
      this.volume = 1;
      this.container = null;
      this.elements = {};
      this.progressUpdateInterval = null;
      this.waveformCanvas = null;
      this.waveformData = [];
    }

    render() {
      this.container = document.createElement('div');
      this.container.className = 'gitpreview-audio-player';
      this.container.innerHTML = this.getHTML();
      this.cacheElements();
      this.bindEvents();
      this.initAudio();
      return this.container;
    }

    getHTML() {
      const fileSizeKB = Math.round(this.arrayBuffer.byteLength / 1024);
      return `
        <div class="gitpreview-audio-header">
          <div class="gitpreview-audio-header-left">
            <svg class="gitpreview-audio-header-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
            <span class="gitpreview-audio-filename">${this.escapeHTML(this.filename)}</span>
            <span class="gitpreview-audio-filesize">${fileSizeKB} KB</span>
          </div>
        </div>
        <div class="gitpreview-audio-main">
          <button class="gitpreview-audio-play-btn" id="gitpreview-play-pause" title="Play/Pause">
            <svg id="gitpreview-play-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <svg id="gitpreview-pause-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style="display: none;">
              <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
            </svg>
          </button>
          <div class="gitpreview-audio-time">
            <span id="gitpreview-current-time">0:00</span>
            <span>/</span>
            <span id="gitpreview-total-time">0:00</span>
          </div>
          <div class="gitpreview-audio-waveform-container">
            <canvas id="gitpreview-waveform" class="gitpreview-audio-waveform"></canvas>
            <div class="gitpreview-audio-progress-bar" id="gitpreview-progress-bar">
              <div class="gitpreview-audio-progress-fill" id="gitpreview-progress-fill"></div>
            </div>
          </div>
          <div class="gitpreview-audio-volume-section">
            <svg class="gitpreview-audio-volume-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path id="gitpreview-volume-icon-path" stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
            </svg>
            <input type="range" id="gitpreview-volume" min="0" max="100" value="100" class="gitpreview-audio-volume-slider">
          </div>
          <button class="gitpreview-audio-more-btn" id="gitpreview-more" title="More options">
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </button>
        </div>
      `;
    }

    cacheElements() {
      this.elements = {
        playPauseBtn: this.container.querySelector('#gitpreview-play-pause'),
        playIcon: this.container.querySelector('#gitpreview-play-icon'),
        pauseIcon: this.container.querySelector('#gitpreview-pause-icon'),
        waveform: this.container.querySelector('#gitpreview-waveform'),
        progressBar: this.container.querySelector('#gitpreview-progress-bar'),
        progressFill: this.container.querySelector('#gitpreview-progress-fill'),
        volume: this.container.querySelector('#gitpreview-volume'),
        volumeIconPath: this.container.querySelector('#gitpreview-volume-icon-path'),
        currentTime: this.container.querySelector('#gitpreview-current-time'),
        totalTime: this.container.querySelector('#gitpreview-total-time'),
        moreBtn: this.container.querySelector('#gitpreview-more')
      };
    }

    bindEvents() {
      this.elements.playPauseBtn.addEventListener('click', () => this.togglePlay());
      this.elements.progressBar.addEventListener('click', (e) => this.handleProgressClick(e));
      this.elements.volume.addEventListener('input', (e) => {
        this.setVolume(e.target.value);
        this.updateVolumeSliderBackground(e.target.value);
      });
      
      window.addEventListener('resize', () => this.drawWaveform());
      
      // Initialize volume slider background
      this.updateVolumeSliderBackground(100);
    }

    updateVolumeSliderBackground(percent) {
      this.elements.volume.style.background = `linear-gradient(to right, #0969da 0%, #0969da ${percent}%, #d1d9e0 ${percent}%, #d1d9e0 100%)`;
    }

    async initAudio() {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.gainNode.gain.value = this.volume;

        this.audioBuffer = await this.audioContext.decodeAudioData(this.arrayBuffer.slice(0));
        
        this.elements.totalTime.textContent = this.formatTime(this.audioBuffer.duration);
        
        // Generate and draw waveform
        this.generateWaveformData();
        this.drawWaveform();
      } catch (err) {
        console.error('Failed to initialize audio:', err);
      }
    }

    generateWaveformData() {
      if (!this.audioBuffer) return;
      
      const channelData = this.audioBuffer.getChannelData(0);
      const samples = 200;
      const blockSize = Math.floor(channelData.length / samples);
      this.waveformData = [];
      
      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[i * blockSize + j]);
        }
        this.waveformData.push(sum / blockSize);
      }
      
      // Normalize
      const max = Math.max(...this.waveformData);
      if (max > 0) {
        this.waveformData = this.waveformData.map(v => v / max);
      }
    }

    drawWaveform() {
      const canvas = this.elements.waveform;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      
      const width = rect.width;
      const height = rect.height;
      const barWidth = width / this.waveformData.length;
      const barGap = 1;
      
      ctx.clearRect(0, 0, width, height);
      
      this.waveformData.forEach((value, index) => {
        const barHeight = Math.max(2, value * height * 0.8);
        const x = index * barWidth;
        const y = (height - barHeight) / 2;
        
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#8b949e');
        gradient.addColorStop(0.5, '#6e7681');
        gradient.addColorStop(1, '#8b949e');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - barGap, barHeight);
      });
    }

    handleProgressClick(e) {
      const rect = this.elements.progressBar.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const duration = this.getDuration();
      const newTime = percentage * duration;
      
      const wasPlaying = this.isPlaying;
      if (wasPlaying) {
        this.pause();
      }
      this.pauseTime = newTime;
      this.updateProgress();
      if (wasPlaying) {
        this.play();
      }
    }

    togglePlay() {
      if (this.isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    }

    play() {
      if (!this.audioContext || !this.audioBuffer) return;

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      this.stopSource();

      this.sourceNode = this.audioContext.createBufferSource();
      this.sourceNode.buffer = this.audioBuffer;
      this.sourceNode.connect(this.gainNode);
      
      // 监听音频结束事件
      this.sourceNode.onended = () => {
        if (this.isPlaying && this.getCurrentTime() >= this.getDuration()) {
          this.onEnded();
        }
      };

      const offset = this.pauseTime;
      this.sourceNode.start(0, offset);
      this.startTime = this.audioContext.currentTime - offset;
      
      this.isPlaying = true;
      this.updatePlayPauseIcon();
      this.startProgressUpdate();
    }

    pause() {
      if (!this.isPlaying) return;

      this.pauseTime = this.getCurrentTime();
      this.stopSource();
      this.isPlaying = false;
      this.updatePlayPauseIcon();
      this.stopProgressUpdate();
      this.updateProgress();
    }

    stopSource() {
      if (this.sourceNode) {
        try {
          this.sourceNode.stop();
        } catch (err) {
          // Ignore errors if already stopped
        }
        this.sourceNode = null;
      }
    }

    updatePlayPauseIcon() {
      if (this.isPlaying) {
        this.elements.playIcon.style.display = 'none';
        this.elements.pauseIcon.style.display = 'block';
      } else {
        this.elements.playIcon.style.display = 'block';
        this.elements.pauseIcon.style.display = 'none';
      }
    }



    getCurrentTime() {
      if (this.isPlaying && this.audioContext) {
        return this.audioContext.currentTime - this.startTime;
      }
      return this.pauseTime;
    }

    getDuration() {
      return this.audioBuffer ? this.audioBuffer.duration : 0;
    }

    startProgressUpdate() {
      this.stopProgressUpdate();
      this.progressUpdateInterval = setInterval(() => {
        this.updateProgress();
      }, 100);
    }

    stopProgressUpdate() {
      if (this.progressUpdateInterval) {
        clearInterval(this.progressUpdateInterval);
        this.progressUpdateInterval = null;
      }
    }

    updateProgress() {
      const currentTime = this.getCurrentTime();
      const duration = this.getDuration();
      
      // 检查是否播放结束
      if (this.isPlaying && currentTime >= duration) {
        this.onEnded();
        return;
      }
      
      if (duration > 0) {
        const percent = (currentTime / duration) * 100;
        this.elements.progressFill.style.width = `${percent}%`;
        this.elements.currentTime.textContent = this.formatTime(currentTime);
      }
    }

    updateDuration() {
      const duration = this.getDuration();
      this.elements.totalTime.textContent = this.formatTime(duration);
    }

    onEnded() {
      if (!this.isPlaying) return; // 防止重复调用
      
      this.isPlaying = false;
      this.pauseTime = 0;
      this.stopSource();
      this.updatePlayPauseIcon();
      this.stopProgressUpdate();
      
      // 确保进度显示100%
      if (this.elements.progressFill && this.audioBuffer) {
        this.elements.progressFill.style.width = '100%';
        this.elements.currentTime.textContent = this.formatTime(this.audioBuffer.duration);
      }
    }

    onError(err) {
      console.error('Audio error:', err);
    }

    formatTime(seconds) {
      if (isNaN(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    setVolume(percent) {
      this.volume = percent / 100;
      if (this.gainNode) {
        this.gainNode.gain.value = this.volume;
      }
      this.updateVolumeIcon(percent);
    }

    updateVolumeIcon(percent) {
      const vol = parseInt(percent);
      let path = '';
      if (vol === 0) {
        path = 'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';
      } else if (vol < 50) {
        path = 'M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';
      } else {
        path = 'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';
      }
      this.elements.volumeIconPath.setAttribute('d', path);
    }

    escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    destroy() {
      this.pause();
      this.stopProgressUpdate();
      
      if (this.sourceNode) {
        try {
          this.sourceNode.disconnect();
        } catch (err) {
          console.error('Error disconnecting source node:', err);
        }
        this.sourceNode = null;
      }
      
      if (this.gainNode) {
        try {
          this.gainNode.disconnect();
        } catch (err) {
          console.error('Error disconnecting gain node:', err);
        }
        this.gainNode = null;
      }
      
      if (this.audioContext) {
        try {
          this.audioContext.close();
        } catch (err) {
          console.error('Error closing audio context:', err);
        }
        this.audioContext = null;
      }
      
      this.audioBuffer = null;
      this.arrayBuffer = null;
      
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
    }
  }

  let currentPlayer = null;

  function openAudioPreview(url, filename, container) {
    if (currentPlayer) {
      currentPlayer.destroy();
    }

    container.innerHTML = `
      <div class="gitpreview-loading">
        <div class="gitpreview-spinner"></div>
        <div class="gitpreview-loading-text">Loading ${filename}...</div>
      </div>
    `;

    return fetchAudioFromBackground(url, filename)
      .then((arrayBuffer) => {
        currentPlayer = new GitPreviewAudioPlayer({
          arrayBuffer: arrayBuffer,
          url: url,
          filename: filename
        });
        container.innerHTML = '';
        container.appendChild(currentPlayer.render());
        console.log('GitPreview: Audio player created successfully');
      });
  }

  function closeAudioPreview() {
    if (currentPlayer) {
      currentPlayer.destroy();
      currentPlayer = null;
    }
  }

  window.GitPreviewAudioPlayer = GitPreviewAudioPlayer;
  window.GitPreviewAudio = {
    AUDIO_EXTENSIONS,
    isAudioExtension,
    openAudioPreview,
    closeAudioPreview,
    getCurrentPlayer: () => currentPlayer,
    togglePlay: () => currentPlayer?.togglePlay(),
    rewind: (seconds) => currentPlayer?.rewind(seconds),
    forward: (seconds) => currentPlayer?.forward(seconds),
    setVolume: (percent) => currentPlayer?.setVolume(percent),
    getVolume: () => currentPlayer ? currentPlayer.volume * 100 : 100
  };
})();
