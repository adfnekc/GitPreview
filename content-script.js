(function() {
  'use strict';

  console.log('GitPreview: Extension loaded');

  const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
  const SUPPORTED_EXTENSIONS = [...AUDIO_EXTENSIONS];

  class GitPreviewAudioPlayer {
    constructor(options = {}) {
      this.audioContext = null;
      this.audioBuffer = null;
      this.sourceNode = null;
      this.gainNode = null;
      this.isPlaying = false;
      this.startTime = 0;
      this.pauseTime = 0;
      this.volume = 1;
      this.arrayBuffer = options.arrayBuffer;
      this.url = options.url;
      this.filename = options.filename || 'Audio File';
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
      this.initAudioContext();
      this.loadAudioFromBuffer();
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

    initAudioContext() {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.volume;
        this.gainNode.connect(this.audioContext.destination);
      } catch (err) {
        console.error('Failed to initialize AudioContext:', err);
        this.onError(err);
      }
    }

    async loadAudioFromBuffer() {
      try {
        this.elements.meta.textContent = 'Loading audio...';
        
        if (this.arrayBuffer) {
          await this.decodeAudioData(this.arrayBuffer);
        } else {
          this.onError(new Error('No audio data provided'));
        }
      } catch (err) {
        console.error('Failed to load audio:', err);
        this.onError(err);
      }
    }

    async decodeAudioData(arrayBuffer) {
      try {
        this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        this.updateDuration();
        this.elements.meta.textContent = `Audio File (${this.formatFileSize(this.audioBuffer.duration)})`;
        console.log('GitPreview: Audio decoded successfully');
      } catch (err) {
        console.error('Failed to decode audio:', err);
        this.onError(err);
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
      if (!this.audioBuffer) {
        console.error('Audio buffer not ready');
        return;
      }

      try {
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }

        this.sourceNode = this.audioContext.createBufferSource();
        this.sourceNode.buffer = this.audioBuffer;
        this.sourceNode.connect(this.gainNode);

        this.sourceNode.onended = () => {
          if (this.isPlaying) {
            this.onEnded();
          }
        };

        const offset = this.pauseTime;
        this.sourceNode.start(0, offset);
        this.startTime = this.audioContext.currentTime - offset;
        this.isPlaying = true;
        this.updatePlayPauseIcon();
        this.startProgressUpdate();
      } catch (err) {
        console.error('Failed to play audio:', err);
      }
    }

    pause() {
      if (!this.isPlaying) return;

      try {
        if (this.sourceNode) {
          this.sourceNode.stop();
          this.sourceNode.disconnect();
          this.sourceNode = null;
        }

        this.pauseTime = this.getCurrentTime();
        this.isPlaying = false;
        this.updatePlayPauseIcon();
        this.stopProgressUpdate();
      } catch (err) {
        console.error('Failed to pause audio:', err);
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
      const newTime = Math.max(0, currentTime - seconds);
      this.seekToTime(newTime);
    }

    forward(seconds) {
      const currentTime = this.getCurrentTime();
      const duration = this.getDuration();
      const newTime = Math.min(duration, currentTime + seconds);
      this.seekToTime(newTime);
    }

    seek(percent) {
      const duration = this.getDuration();
      const time = (percent / 100) * duration;
      this.seekToTime(time);
    }

    seekToTime(time) {
      const wasPlaying = this.isPlaying;
      
      if (this.isPlaying) {
        this.pause();
      }

      this.pauseTime = time;
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

    startProgressUpdate() {
      this.stopProgressUpdate();
      this.progressUpdateInterval = setInterval(() => {
        if (this.isPlaying) {
          this.updateProgress();
        }
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

  let settings = {
    autoPreview: true,
    previewMode: 'modal',
    keyboardShortcuts: true
  };

  let currentPlayer = null;
  let modalContainer = null;
  let isInitialized = false;

  function init() {
    console.log('GitPreview: init called');
    if (isInitialized) {
      console.log('GitPreview: Already initialized, skipping');
      return;
    }
    isInitialized = true;

    loadSettings().then(() => {
      console.log('GitPreview: Settings loaded');
      createModalContainer();
      observePageChanges();
      addPreviewButtons();
      handleBlobPage();
      bindKeyboardShortcuts();
      console.log('GitPreview: Initialization complete');
    }).catch((err) => {
      console.error('GitPreview: Initialization error:', err);
    });
  }

  function loadSettings() {
    return new Promise((resolve) => {
      console.log('GitPreview: Loading settings');
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        try {
          chrome.storage.sync.get({
            autoPreview: true,
            previewMode: 'modal',
            keyboardShortcuts: true
          }, (result) => {
            if (chrome.runtime.lastError) {
              console.error('GitPreview: Error loading settings:', chrome.runtime.lastError);
            } else {
              settings = result;
              console.log('GitPreview: Settings loaded from storage:', settings);
            }
            resolve();
          });
        } catch (err) {
          console.error('GitPreview: Exception loading settings:', err);
          resolve();
        }
      } else {
        console.log('GitPreview: chrome.storage not available, using default settings');
        resolve();
      }
    });
  }



  function createModalContainer() {
    modalContainer = document.createElement('div');
    modalContainer.className = 'gitpreview-modal-overlay';
    modalContainer.id = 'gitpreview-modal';
    modalContainer.innerHTML = `
      <div class="gitpreview-modal" id="gitpreview-modal-inner">
        <div class="gitpreview-modal-header">
          <h3 class="gitpreview-modal-title" id="gitpreview-modal-title">Preview</h3>
          <button class="gitpreview-modal-close" id="gitpreview-modal-close" title="Close (Esc)">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div class="gitpreview-modal-content" id="gitpreview-modal-content">
        </div>
      </div>
    `;
    document.body.appendChild(modalContainer);

    modalContainer.addEventListener('click', (e) => {
      if (e.target === modalContainer) {
        closeModal();
      }
    });

    document.getElementById('gitpreview-modal-close').addEventListener('click', closeModal);
  }

  function observePageChanges() {
    console.log('GitPreview: Setting up page change observers');
    
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          shouldUpdate = true;
          break;
        }
      }
      if (shouldUpdate) {
        debounce(addPreviewButtons, 200)();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    let lastUrl = location.href;
    setInterval(() => {
      const url = location.href;
      if (url !== lastUrl) {
        console.log(`GitPreview: URL changed from ${lastUrl} to ${url}`);
        lastUrl = url;
        document.querySelectorAll('.gitpreview-processed').forEach(el => {
          el.classList.remove('gitpreview-processed');
        });
        document.querySelectorAll('.gitpreview-blob-preview-btn').forEach(el => {
          el.remove();
        });
        debounce(addPreviewButtons, 500)();
        debounce(handleBlobPage, 500)();
      }
    }, 1000);
  }

  let debounceTimer = null;
  function debounce(func, wait) {
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(debounceTimer);
        func(...args);
      };
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(later, wait);
    };
  }

  function addPreviewButtons() {
    console.log('GitPreview: addPreviewButtons called');
    
    const fileRows = document.querySelectorAll([
      'div[role="row"].react-directory-filename-column',
      '.js-navigation-item',
      '.Box-row',
      '[data-testid="list-view-item"]',
      '.react-directory-row'
    ].join(', '));

    console.log(`GitPreview: Found ${fileRows.length} file rows`);

    fileRows.forEach((row) => {
      if (row.classList.contains('gitpreview-processed')) return;

      const link = row.querySelector('a[href*="/blob/"]');
      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      const extension = getFileExtension(href);
      if (!isSupportedExtension(extension)) {
        return;
      }

      console.log(`GitPreview: Adding preview button for ${href}`);
      row.classList.add('gitpreview-processed');

      const btn = createPreviewButton(href, link.textContent.trim() || href.split('/').pop(), true);
      
      let insertTarget = findInsertTarget(row, link);
      if (insertTarget) {
        insertTarget.insertBefore(btn, insertTarget.firstChild);
      } else {
        let parent = link.parentElement;
        if (parent) {
          parent.style.display = 'inline-flex';
          parent.style.alignItems = 'center';
          parent.insertBefore(btn, link);
        }
      }
    });
  }

  function findInsertTarget(row, link) {
    const parent = link.parentElement;
    if (!parent) return null;
    
    const selectors = [
      '.btn',
      '[class*="btn-"]',
      '.react-directory-row-actions',
      '.Box-row-actions',
      '[data-testid*="actions"]',
      '.d-flex.flex-items-center'
    ];
    
    for (const selector of selectors) {
      const target = row.querySelector(selector);
      if (target && target.parentElement) {
        return target.parentElement;
      }
    }
    
    const allElements = row.querySelectorAll('*');
    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      if (style.display === 'flex' || style.display === 'inline-flex') {
        if (el.contains(link)) {
          return el;
        }
      }
    }
    
    return null;
  }

  function handleBlobPage() {
    console.log('GitPreview: handleBlobPage called');
    
    if (document.querySelector('.gitpreview-blob-preview-btn')) {
      console.log('GitPreview: Preview button already exists on blob page');
      return;
    }
    
    const url = location.href;
    if (!url.includes('/blob/')) {
      console.log('GitPreview: Not a blob page');
      return;
    }
    
    const extension = getFileExtension(url);
    if (!isSupportedExtension(extension)) {
      console.log(`GitPreview: Unsupported extension on blob page: ${extension}`);
      return;
    }
    
    console.log(`GitPreview: Handling blob page for ${url}`);
    
    const filename = url.split('/').pop().split('?')[0];
    
    const btn = createPreviewButton(url, filename);
    btn.classList.add('gitpreview-blob-preview-btn');
    
    let insertTarget = null;
    
    const possibleTargets = [
      '.file-actions',
      '.Box-header .d-flex',
      '[data-testid="file-header"]',
      '.react-blob-header',
      '.Box-header'
    ];
    
    for (const selector of possibleTargets) {
      const target = document.querySelector(selector);
      if (target) {
        insertTarget = target;
        break;
      }
    }
    
    if (insertTarget) {
      console.log('GitPreview: Found insert target for blob page preview button');
      const firstChild = insertTarget.firstChild;
      if (firstChild) {
        insertTarget.insertBefore(btn, firstChild);
      } else {
        insertTarget.appendChild(btn);
      }
    } else {
      console.log('GitPreview: Could not find insert target, adding to body');
      btn.style.position = 'fixed';
      btn.style.top = '10px';
      btn.style.right = '10px';
      btn.style.zIndex = '99999';
      document.body.appendChild(btn);
    }
  }

  function getFileExtension(path) {
    const filename = path.split('/').pop().split('?')[0];
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) return '';
    return filename.slice(lastDot + 1).toLowerCase();
  }

  function isSupportedExtension(ext) {
    return SUPPORTED_EXTENSIONS.includes(ext.toLowerCase());
  }

  function isAudioExtension(ext) {
    return AUDIO_EXTENSIONS.includes(ext.toLowerCase());
  }

  function createPreviewButton(fileUrl, filename, isIconOnly = false) {
    const btn = document.createElement('button');
    btn.className = 'gitpreview-preview-btn gitpreview-btn-secondary';
    if (isIconOnly) {
      btn.className += ' gitpreview-btn-icon';
    }
    btn.type = 'button';
    btn.title = `Preview ${filename}`;
    
    if (isIconOnly) {
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      `;
    } else {
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
        Preview
      `;
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPreview(fileUrl, filename);
    });

    return btn;
  }

  function openPreview(fileUrl, filename) {
    const extension = getFileExtension(fileUrl);
    const rawUrl = convertToRawUrl(fileUrl);

    showLoading(filename);

    if (isAudioExtension(extension)) {
      openAudioPreview(rawUrl, filename);
    }
  }

  function convertToRawUrl(githubUrl) {
    let url = githubUrl;
    if (url.startsWith('/')) {
      url = 'https://github.com' + url;
    }

    if (url.includes('/blob/')) {
      url = url.replace('github.com', 'raw.githubusercontent.com');
      url = url.replace('/blob/', '/');
    }

    return url;
  }

  function showLoading(filename) {
    const modalTitle = document.getElementById('gitpreview-modal-title');
    const modalContent = document.getElementById('gitpreview-modal-content');

    if (modalTitle) {
      modalTitle.textContent = filename;
    }

    if (modalContent) {
      modalContent.innerHTML = `
        <div class="gitpreview-loading">
          <div class="gitpreview-spinner"></div>
          <div class="gitpreview-loading-text">Loading ${filename}...</div>
        </div>
      `;
    }

    openModal();
  }

  function showError(filename, message) {
    const modalTitle = document.getElementById('gitpreview-modal-title');
    const modalContent = document.getElementById('gitpreview-modal-content');

    if (modalTitle) {
      modalTitle.textContent = filename;
    }

    if (modalContent) {
      modalContent.innerHTML = `
        <div class="gitpreview-error">
          <div class="gitpreview-error-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h4 class="gitpreview-error-title">Failed to Load File</h4>
          <p class="gitpreview-error-message">${message}</p>
        </div>
      `;
    }
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

  function base64ToBlob(base64, mimeType) {
    const byteString = atob(base64);
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      byteArray[i] = byteString.charCodeAt(i);
    }
    return new Blob([byteArray], { type: mimeType });
  }

  function getAudioMimeType(filename) {
    const ext = getFileExtension(filename).toLowerCase();
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

  function openAudioPreview(url, filename) {
    console.log('GitPreview: Opening audio preview for', filename);
    
    const modalContent = document.getElementById('gitpreview-modal-content');
    if (!modalContent) {
      showError(filename, 'Modal container not found');
      return;
    }

    if (currentPlayer) {
      currentPlayer.destroy();
    }

    fetchAudioFromBackground(url, filename)
      .then((arrayBuffer) => {
        currentPlayer = new GitPreviewAudioPlayer({
          arrayBuffer: arrayBuffer,
          url: url,
          filename: filename
        });
        modalContent.innerHTML = '';
        modalContent.appendChild(currentPlayer.render());
        console.log('GitPreview: Audio player created successfully');
      })
      .catch((err) => {
        console.error('GitPreview audio error:', err);
        showError(filename, err.message || 'Failed to initialize audio player');
      });
  }

  function openModal() {
    if (modalContainer) {
      modalContainer.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal() {
    if (modalContainer) {
      modalContainer.classList.remove('active');
      document.body.style.overflow = '';
    }

    if (currentPlayer) {
      currentPlayer.destroy();
      currentPlayer = null;
    }
  }

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!settings.keyboardShortcuts) return;

      if (e.key === 'Escape') {
        if (modalContainer && modalContainer.classList.contains('active')) {
          e.preventDefault();
          closeModal();
        }
      }

      if (currentPlayer) {
        switch (e.key) {
          case ' ':
            if (modalContainer && modalContainer.classList.contains('active')) {
              e.preventDefault();
              currentPlayer.togglePlay();
            }
            break;
          case 'ArrowLeft':
            if (modalContainer && modalContainer.classList.contains('active')) {
              e.preventDefault();
              currentPlayer.rewind(10);
            }
            break;
          case 'ArrowRight':
            if (modalContainer && modalContainer.classList.contains('active')) {
              e.preventDefault();
              currentPlayer.forward(10);
            }
            break;
          case 'ArrowUp':
            if (modalContainer && modalContainer.classList.contains('active')) {
              e.preventDefault();
              const newVol = Math.min(100, (currentPlayer.audio.volume * 100) + 10);
              currentPlayer.setVolume(newVol);
              currentPlayer.elements.volume.value = newVol;
            }
            break;
          case 'ArrowDown':
            if (modalContainer && modalContainer.classList.contains('active')) {
              e.preventDefault();
              const newVol = Math.max(0, (currentPlayer.audio.volume * 100) - 10);
              currentPlayer.setVolume(newVol);
              currentPlayer.elements.volume.value = newVol;
            }
            break;
        }
      }
    });
  }

  function safeInit() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(init, 500);
      });
    } else {
      setTimeout(init, 500);
    }
  }

  safeInit();

  window.addEventListener('load', () => {
    console.log('GitPreview: Window load event');
    if (!isInitialized) {
      console.log('GitPreview: Initializing on window load');
      init();
    }
  });
})();
