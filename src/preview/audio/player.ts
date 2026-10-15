import { escapeHTML, formatTime } from '../../utils';
import { getMimeType } from '../../lib/mime';
import { downloadBuffer } from '../../lib/download';
import { computeWaveform, drawWaveform } from './waveform';

export interface AudioPlayerOptions {
  url: string;
  filename: string;
  arrayBuffer: ArrayBuffer;
}

export class AudioPlayer {
  readonly url: string;
  readonly filename: string;
  arrayBuffer: ArrayBuffer | null;
  audioBuffer: AudioBuffer | null = null;
  audioContext: AudioContext | null = null;
  sourceNode: AudioBufferSourceNode | null = null;
  gainNode: GainNode | null = null;
  isPlaying = false;
  startTime = 0;
  pauseTime = 0;
  volume = 1;
  container: HTMLElement | null = null;
  elements: Record<string, HTMLElement | null> = {};
  progressUpdateInterval: ReturnType<typeof setInterval> | null = null;
  waveformData: number[] = [];
  private boundDocumentClick: (() => void) | null = null;
  private boundWindowResize: (() => void) | null = null;

  constructor(options: AudioPlayerOptions) {
    this.url = options.url;
    this.filename = options.filename || 'Audio File';
    this.arrayBuffer = options.arrayBuffer;
  }

  render(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'gitpreview-audio-player';
    this.container.innerHTML = this.getHTML();
    this.cacheElements();
    this.bindEvents();
    void this.initAudio();
    return this.container;
  }

  private getHTML(): string {
    const fileSizeKB = Math.round((this.arrayBuffer?.byteLength ?? 0) / 1024);
    return `
      <div class="gitpreview-audio-header">
        <div class="gitpreview-audio-header-left">
          <svg class="gitpreview-audio-header-icon" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <span class="gitpreview-audio-filename">${escapeHTML(this.filename)}</span>
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
        <div class="gitpreview-audio-more-wrapper">
          <button class="gitpreview-audio-more-btn" id="gitpreview-more" title="More options">
            <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </button>
          <div class="gitpreview-audio-more-menu" id="gitpreview-more-menu">
            <button class="gitpreview-audio-menu-item" id="gitpreview-menu-download">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
              </svg>
              Download
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private cacheElements(): void {
    if (!this.container) return;
    const el = (id: string) => this.container!.querySelector<HTMLElement>(id);
    this.elements = {
      playPauseBtn: el('#gitpreview-play-pause'),
      playIcon: el('#gitpreview-play-icon'),
      pauseIcon: el('#gitpreview-pause-icon'),
      waveform: el('#gitpreview-waveform'),
      progressBar: el('#gitpreview-progress-bar'),
      progressFill: el('#gitpreview-progress-fill'),
      volume: el('#gitpreview-volume'),
      volumeIconPath: el('#gitpreview-volume-icon-path'),
      currentTime: el('#gitpreview-current-time'),
      totalTime: el('#gitpreview-total-time'),
      moreBtn: el('#gitpreview-more'),
      moreMenu: el('#gitpreview-more-menu'),
      downloadBtn: el('#gitpreview-menu-download'),
    };
  }

  private setText(key: string, text: string): void {
    const el = this.elements[key];
    if (el) el.textContent = text;
  }

  private bindEvents(): void {
    this.boundDocumentClick = () => this.closeMenu();
    this.boundWindowResize = () => this.renderWaveform();
    this.elements.playPauseBtn?.addEventListener('click', () => this.togglePlay());
    this.elements.progressBar?.addEventListener('click', (e) =>
      this.handleProgressClick(e as MouseEvent),
    );
    this.elements.volume?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.setVolume(Number(target.value));
      this.updateVolumeSliderBackground(Number(target.value));
    });
    this.elements.moreBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu();
    });
    this.elements.downloadBtn?.addEventListener('click', () => this.download());
    document.addEventListener('click', this.boundDocumentClick);
    window.addEventListener('resize', this.boundWindowResize);
    this.updateVolumeSliderBackground(100);
  }

  private updateVolumeSliderBackground(percent: number): void {
    const el = this.elements.volume as HTMLInputElement | null;
    if (!el) return;
    el.style.background = `linear-gradient(to right, #0969da 0%, #0969da ${percent}%, #d1d9e0 ${percent}%, #d1d9e0 100%)`;
  }

  private async initAudio(): Promise<void> {
    if (!this.arrayBuffer) return;
    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('Web Audio API not supported');

      this.audioContext = new AudioContextCtor();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.volume;

      this.audioBuffer = await this.audioContext.decodeAudioData(this.arrayBuffer.slice(0));
      this.setText('totalTime', formatTime(this.audioBuffer.duration));
      this.waveformData = computeWaveform(this.audioBuffer.getChannelData(0));
      this.renderWaveform();
    } catch (err) {
      console.error('GitPreview: failed to initialize audio', err);
    }
  }

  private renderWaveform(): void {
    const canvas = this.elements.waveform as HTMLCanvasElement | null;
    if (canvas) drawWaveform(canvas, this.waveformData);
  }

  private handleProgressClick(e: MouseEvent): void {
    const progressBar = this.elements.progressBar;
    if (!progressBar) return;

    const rect = progressBar.getBoundingClientRect();
    const percentage = (e.clientX - rect.left) / rect.width;
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();

    this.pauseTime = percentage * this.getDuration();
    this.updateProgress();
    if (wasPlaying) this.play();
  }

  togglePlay(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  play(): void {
    if (!this.audioContext || !this.audioBuffer) return;

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume();
    }

    this.stopSource();

    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    if (this.gainNode) this.sourceNode.connect(this.gainNode);
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

  pause(): void {
    if (!this.isPlaying) return;
    this.pauseTime = this.getCurrentTime();
    this.stopSource();
    this.isPlaying = false;
    this.updatePlayPauseIcon();
    this.stopProgressUpdate();
    this.updateProgress();
  }

  private stopSource(): void {
    if (!this.sourceNode) return;
    try {
      this.sourceNode.stop();
    } catch {
      // already stopped
    }
    this.sourceNode = null;
  }

  private updatePlayPauseIcon(): void {
    const { playIcon, pauseIcon } = this.elements;
    if (!playIcon || !pauseIcon) return;
    playIcon.style.display = this.isPlaying ? 'none' : 'block';
    pauseIcon.style.display = this.isPlaying ? 'block' : 'none';
  }

  getCurrentTime(): number {
    if (this.isPlaying && this.audioContext) {
      return this.audioContext.currentTime - this.startTime;
    }
    return this.pauseTime;
  }

  getDuration(): number {
    return this.audioBuffer ? this.audioBuffer.duration : 0;
  }

  private startProgressUpdate(): void {
    this.stopProgressUpdate();
    this.progressUpdateInterval = setInterval(() => this.updateProgress(), 100);
  }

  private stopProgressUpdate(): void {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
      this.progressUpdateInterval = null;
    }
  }

  private updateProgress(): void {
    const currentTime = this.getCurrentTime();
    const duration = this.getDuration();

    if (this.isPlaying && currentTime >= duration) {
      this.onEnded();
      return;
    }

    if (duration > 0) {
      const progressFill = this.elements.progressFill;
      if (progressFill) progressFill.style.width = `${(currentTime / duration) * 100}%`;
      this.setText('currentTime', formatTime(currentTime));
    }
  }

  private onEnded(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.pauseTime = 0;
    this.stopSource();
    this.updatePlayPauseIcon();
    this.stopProgressUpdate();

    const progressFill = this.elements.progressFill;
    if (progressFill && this.audioBuffer) {
      progressFill.style.width = '100%';
      this.setText('currentTime', formatTime(this.audioBuffer.duration));
    }
  }

  rewind(seconds: number): void {
    this.seek(this.getCurrentTime() - seconds);
  }

  forward(seconds: number): void {
    this.seek(this.getCurrentTime() + seconds);
  }

  private seek(time: number): void {
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.pause();
    this.pauseTime = Math.max(0, Math.min(this.getDuration(), time));
    this.updateProgress();
    if (wasPlaying) this.play();
  }

  private toggleMenu(): void {
    const menu = this.elements.moreMenu;
    if (!menu) return;
    const isOpen = menu.classList.contains('gitpreview-audio-menu-open');
    this.closeMenu();
    if (!isOpen) menu.classList.add('gitpreview-audio-menu-open');
  }

  private closeMenu(): void {
    this.elements.moreMenu?.classList.remove('gitpreview-audio-menu-open');
  }

  private download(): void {
    this.closeMenu();
    if (!this.arrayBuffer) return;
    downloadBuffer(this.arrayBuffer, this.filename, getMimeType(this.filename));
  }

  setVolume(percent: number): void {
    this.volume = percent / 100;
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
    this.updateVolumeIcon(percent);
  }

  private updateVolumeIcon(percent: number): void {
    const vol = Math.round(percent);
    let path: string;
    if (vol === 0) {
      path =
        'M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';
    } else if (vol < 50) {
      path =
        'M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';
    } else {
      path =
        'M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z';
    }
    this.elements.volumeIconPath?.setAttribute('d', path);
  }

  destroy(): void {
    if (this.boundDocumentClick) {
      document.removeEventListener('click', this.boundDocumentClick);
      this.boundDocumentClick = null;
    }
    if (this.boundWindowResize) {
      window.removeEventListener('resize', this.boundWindowResize);
      this.boundWindowResize = null;
    }

    this.pause();
    this.stopProgressUpdate();

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        // ignore
      }
      this.gainNode = null;
    }

    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    this.audioBuffer = null;
    this.arrayBuffer = null;
    this.waveformData = [];

    if (this.container?.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.container = null;
  }
}
