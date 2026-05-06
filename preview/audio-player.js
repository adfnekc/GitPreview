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
      return `
        <div class="gitpreview-audio-info">
          <div class="gitpreview-audio-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div class="gitpreview-audio-details">
            <h4 class="gitpreview-audio-filename">${this.escapeHTML(this.filename)}</h4>
            <p class="gitpreview-audio-meta" id="gitpreview-audio-meta">Loading...</p>
          </div>
        </div>
        <div class="gitpreview-audio-controls">
          <div class="gitpreview-audio-progress">
            <input type="range" id="gitpreview-progress" min="0" max="100" value="0">
            <div class="gitpreview-audio-time">
              <span id="gitpreview-current-time">0:00</span>
              <span id="gitpreview-total-time">0:00</span>
            </div>
          </div>
          <div class="gitpreview-audio-buttons">
            <button class="gitpreview-audio-btn" id="gitpreview-prev" title="Rewind 10s">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
              </svg>
            </button>
            <button class="gitpreview-audio-btn play-pause" id="gitpreview-play-pause" title="Play/Pause">
              <svg id="gitpreview-play-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <svg id="gitpreview-pause-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24" style="display: none;">
                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
              </svg>
            </button>
            <button class="gitpreview-audio-btn" id="gitpreview-next" title="Forward 10s">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
              </svg>
            </button>
          </div>
          <div class="gitpreview-audio-volume">
            <svg id="gitpreview-volume-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <input type="range" id="gitpreview-volume" min="0" max="100" value="100">
          </div>
        </div>
      `;
    }

    cacheElements() {
      this.elements = {
        playPauseBtn: this.container.querySelector('#gitpreview-play-pause'),
        playIcon: this.container.querySelector('#gitpreview-play-icon'),
        pauseIcon: this.container.querySelector('#gitpreview-pause-icon'),
        prevBtn: this.container.querySelector('#gitpreview-prev'),
        nextBtn: this.container.querySelector('#gitpreview-next'),
        progress: this.container.querySelector('#gitpreview-progress'),
        volume: this.container.querySelector('#gitpreview-volume'),
        volumeIcon: this.container.querySelector('#gitpreview-volume-icon'),
        currentTime: this.container.querySelector('#gitpreview-current-time'),
        totalTime: this.container.querySelector('#gitpreview-total-time'),
        meta: this.container.querySelector('#gitpreview-audio-meta')
      };
    }

    bindEvents() {
      this.elements.playPauseBtn.addEventListener('click', () => this.togglePlay());
      this.elements.prevBtn.addEventListener('click', () => this.rewind(10));
      this.elements.nextBtn.addEventListener('click', () => this.forward(10));
      this.elements.progress.addEventListener('input', (e) => this.seek(e.target.value));
      this.elements.volume.addEventListener('input', (e) => this.setVolume(e.target.value));
    }

    async initAudio() {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.connect(this.audioContext.destination);
        this.gainNode.gain.value = this.volume;

        this.audioBuffer = await this.audioContext.decodeAudioData(this.arrayBuffer.slice(0));
        
        this.elements.meta.textContent = `Audio File (${this.formatFileSize(this.audioBuffer.duration)})`;
        this.elements.totalTime.textContent = this.formatTime(this.audioBuffer.duration);
      } catch (err) {
        console.error('Failed to initialize audio:', err);
        this.elements.meta.textContent = 'Failed to load audio';
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

    rewind(seconds) {
      const currentTime = this.getCurrentTime();
      const wasPlaying = this.isPlaying;
      
      if (wasPlaying) {
        this.pause();
      }
      
      this.pauseTime = Math.max(0, currentTime - seconds);
      this.updateProgress();
      
      if (wasPlaying) {
        this.play();
      }
    }

    forward(seconds) {
      const currentTime = this.getCurrentTime();
      const duration = this.getDuration();
      const wasPlaying = this.isPlaying;
      
      if (wasPlaying) {
        this.pause();
      }
      
      this.pauseTime = Math.min(duration, currentTime + seconds);
      this.updateProgress();
      
      if (wasPlaying) {
        this.play();
      }
    }

    seek(percent) {
      const duration = this.getDuration();
      const wasPlaying = this.isPlaying;
      
      if (wasPlaying) {
        this.pause();
      }
      
      this.pauseTime = (percent / 100) * duration;
      this.updateProgress();
      
      if (wasPlaying) {
        this.play();
      }
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
      this.elements.volumeIcon.innerHTML = `<path stroke-linecap="round" stroke-linejoin="round" d="${path}" />`;
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
      
      if (duration > 0) {
        const percent = (currentTime / duration) * 100;
        this.elements.progress.value = percent;
        this.elements.currentTime.textContent = this.formatTime(currentTime);
      }
    }

    updateDuration() {
      const duration = this.getDuration();
      this.elements.totalTime.textContent = this.formatTime(duration);
    }

    onEnded() {
      this.isPlaying = false;
      this.pauseTime = 0;
      this.updatePlayPauseIcon();
      this.stopProgressUpdate();
      this.updateProgress();
    }

    onError(err) {
      console.error('Audio error:', err);
      this.elements.meta.textContent = 'Failed to load audio';
    }

    formatTime(seconds) {
      if (isNaN(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(duration) {
      return this.formatTime(duration);
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
