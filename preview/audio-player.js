(function() {
  'use strict';

  class GitPreviewAudioPlayer {
    constructor(options = {}) {
      this.url = options.url;
      this.filename = options.filename || 'Audio File';
      this.audio = new Audio();
      this.isPlaying = false;
      this.container = null;
      this.elements = {};
    }

    render() {
      this.container = document.createElement('div');
      this.container.className = 'gitpreview-audio-player';
      this.container.innerHTML = this.getHTML();
      this.cacheElements();
      this.bindEvents();
      this.loadAudio();
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

      this.audio.addEventListener('timeupdate', () => this.updateProgress());
      this.audio.addEventListener('loadedmetadata', () => this.updateDuration());
      this.audio.addEventListener('ended', () => this.onEnded());
      this.audio.addEventListener('error', (e) => this.onError(e));
    }

    loadAudio() {
      this.audio.crossOrigin = 'anonymous';
      this.audio.src = this.url;
      this.audio.volume = 1;
      this.elements.meta.textContent = 'Loading audio...';
    }

    togglePlay() {
      if (this.isPlaying) {
        this.pause();
      } else {
        this.play();
      }
    }

    play() {
      this.audio.play().then(() => {
        this.isPlaying = true;
        this.updatePlayPauseIcon();
      }).catch((err) => {
        console.error('Failed to play audio:', err);
      });
    }

    pause() {
      this.audio.pause();
      this.isPlaying = false;
      this.updatePlayPauseIcon();
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
      this.audio.currentTime = Math.max(0, this.audio.currentTime - seconds);
    }

    forward(seconds) {
      this.audio.currentTime = Math.min(this.audio.duration, this.audio.currentTime + seconds);
    }

    seek(percent) {
      const time = (percent / 100) * this.audio.duration;
      this.audio.currentTime = time;
    }

    setVolume(percent) {
      this.audio.volume = percent / 100;
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

    updateProgress() {
      if (this.audio.duration) {
        const percent = (this.audio.currentTime / this.audio.duration) * 100;
        this.elements.progress.value = percent;
        this.elements.currentTime.textContent = this.formatTime(this.audio.currentTime);
      }
    }

    updateDuration() {
      this.elements.totalTime.textContent = this.formatTime(this.audio.duration);
      this.elements.meta.textContent = `Audio File (${this.formatFileSize(this.audio.duration)})`;
    }

    onEnded() {
      this.isPlaying = false;
      this.updatePlayPauseIcon();
      this.audio.currentTime = 0;
    }

    onError(e) {
      console.error('Audio error:', e);
      this.elements.meta.textContent = 'Failed to load audio';
    }

    formatTime(seconds) {
      if (isNaN(seconds)) return '0:00';
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(duration) {
      return `${this.formatTime(duration)}`;
    }

    escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    destroy() {
      this.pause();
      this.audio.src = '';
      this.audio.load();
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
    }
  }

  window.GitPreviewAudioPlayer = GitPreviewAudioPlayer;
})();
