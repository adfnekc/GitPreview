(function() {
  'use strict';

  console.log('GitPreview: Extension loaded');

  const SUPPORTED_EXTENSIONS = [...(window.GitPreviewAudio?.AUDIO_EXTENSIONS || [])];

  let settings = {
    autoPreview: true,
    previewMode: 'modal',
    keyboardShortcuts: true
  };

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
    // No longer needed, container is created dynamically
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
        document.querySelectorAll('.gitpreview-link-processed').forEach(el => {
          el.classList.remove('gitpreview-link-processed');
        });
        document.querySelectorAll('.gitpreview-preview-btn').forEach(el => {
          el.remove();
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
    
    const blobLinks = document.querySelectorAll('a[href*="/blob/"]');
    
    console.log(`GitPreview: Found ${blobLinks.length} blob links`);

    blobLinks.forEach((link) => {
      if (link.classList.contains('gitpreview-link-processed')) return;

      const href = link.getAttribute('href');
      if (!href) return;

      const extension = getFileExtension(href);
      if (!isSupportedExtension(extension)) {
        return;
      }

      console.log(`GitPreview: Adding preview button for ${href}`);
      link.classList.add('gitpreview-link-processed');

      const btn = createPreviewButton(href, link.textContent.trim() || href.split('/').pop(), true);
      
      const truncateContainer = link.closest('.react-directory-truncate');
      if (truncateContainer) {
        truncateContainer.appendChild(btn);
      } else {
        link.after(btn);
      }
    });
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

    // Strategy 1: Find Raw button and insert next to it
    const rawBtn = document.querySelector('a[data-testid="raw-button"], a[href*="/raw/"], a#raw-url, a[href*="/raw/"]');
    if (rawBtn && rawBtn.parentElement) {
      rawBtn.parentElement.insertBefore(btn, rawBtn);
      console.log('GitPreview: Inserted next to Raw button');
      return;
    }

    // Strategy 2: Find "View raw" link
    const rawLink = document.querySelector('a[href*="raw.githubusercontent.com"], a[data-component="Link"][href*="/raw/"]');
    if (rawLink && rawLink.parentElement) {
      const section = rawLink.closest('section, [class*="BlobContent"]');
      if (section && section.parentElement) {
        section.parentElement.insertBefore(btn, section);
        return;
      }
    }

    // Strategy 3: Via more-file-actions-button
    const moreActionsBtn = document.querySelector('[data-testid="more-file-actions-button"]');
    if (moreActionsBtn) {
      const actionsContainer = moreActionsBtn.closest('[class*="react-blob-header-edit-and-raw-actions"]')
        || moreActionsBtn.parentElement;
      if (actionsContainer) {
        actionsContainer.insertBefore(btn, moreActionsBtn.closest('div') || moreActionsBtn);
        return;
      }
    }

    // Strategy 4: Other common targets
    const possibleTargets = [
      '[class*="BlobViewHeader-module"]',
      '[class*="react-blob-header-actions"]',
      '[class*="react-blob-header-edit-and-raw-actions"]',
      '.file-actions',
      '[data-testid="file-header"]',
      '.react-blob-header',
      '.react-blob-header-actions',
      '.Box-header .d-flex',
      '.Box-header'
    ];
    
    for (const selector of possibleTargets) {
      const target = document.querySelector(selector);
      if (target) {
        console.log(`GitPreview: Found insert target: ${selector}`);
        target.appendChild(btn);
        return;
      }
    }

    // Fallback
    const blobHeader = document.querySelector('[class*="blob-header"], [class*="file-header"], [class*="BlobViewHeader"]');
    if (blobHeader) {
      blobHeader.appendChild(btn);
      return;
    }

    console.log('GitPreview: Could not find insert target for blob page');
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      `;
    } else {
      btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;">
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

    if (window.GitPreviewAudio?.isAudioExtension(extension)) {
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
    removeExistingPlayer();

    const container = createInlineContainer(filename);
    const content = container.querySelector('#gitpreview-inline-content');
    content.innerHTML = `
      <div class="gitpreview-loading">
        <div class="gitpreview-spinner"></div>
        <div class="gitpreview-loading-text">Loading ${filename}...</div>
      </div>
    `;
    insertInlineContainer(container);
  }

  function showError(filename, message) {
    removeExistingPlayer();

    const container = createInlineContainer(filename);
    const content = container.querySelector('#gitpreview-inline-content');
    content.innerHTML = `
      <div class="gitpreview-error">
        <div class="gitpreview-error-icon">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:48px;height:48px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h4 class="gitpreview-error-title">Failed to Load File</h4>
        <p class="gitpreview-error-message">${message}</p>
      </div>
    `;
    insertInlineContainer(container);
  }

  function createInlineContainer(filename) {
    const container = document.createElement('div');
    container.className = 'gitpreview-inline-container';
    container.id = 'gitpreview-inline';

    const header = document.createElement('div');
    header.className = 'gitpreview-inline-header';
    header.innerHTML = `
      <div class="gitpreview-inline-title">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:6px;">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        ${escapeHTML(filename)}
      </div>
      <button class="gitpreview-inline-close" title="Close">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    `;

    header.querySelector('.gitpreview-inline-close').addEventListener('click', () => {
      closeModal();
    });

    container.appendChild(header);

    const content = document.createElement('div');
    content.className = 'gitpreview-inline-content';
    content.id = 'gitpreview-inline-content';
    container.appendChild(content);

    return container;
  }

  function insertInlineContainer(container) {
    const blobTargets = [
      '[class*="BlobViewContent-module__blobContentWrapper"]',
      '[class*="BlobContent-module__blobContentSection"]',
      '[data-testid="blob-content"]',
      '.blob-wrapper',
      '.Box-body',
      '.react-code-view',
      '[data-testid="file-content"]'
    ];

    for (const selector of blobTargets) {
      const target = document.querySelector(selector);
      if (target && target.parentElement) {
        target.parentElement.insertBefore(container, target);
        return;
      }
    }

    const treeTargets = [
      '[class*="react-directory"]',
      '[data-testid="list-view"]',
      '.js-navigation-container',
      '[role="table"]',
      '[role="grid"]',
      'table.files',
      '.Box'
    ];

    for (const selector of treeTargets) {
      const target = document.querySelector(selector);
      if (target && target.parentElement) {
        target.parentElement.insertBefore(container, target.nextSibling);
        return;
      }
    }

    const repoContent = document.querySelector('.repository-content')
      || document.querySelector('[data-testid="repo-content"]')
      || document.querySelector('[id="repo-content-pjax-container"]')
      || document.querySelector('[class*="PageLayout-PageLayoutContent"]')
      || document.querySelector('main')
      || document.querySelector('#js-repo-pjax-container');

    if (repoContent) {
      repoContent.appendChild(container);
      return;
    }

    document.body.appendChild(container);
  }

  function removeExistingPlayer() {
    const existing = document.getElementById('gitpreview-inline');
    if (existing) {
      existing.remove();
    }
  }

  function openAudioPreview(url, filename) {
    console.log('GitPreview: Opening audio preview for', filename);

    let inlineContent = document.getElementById('gitpreview-inline-content');

    if (!inlineContent) {
      showLoading(filename);
      inlineContent = document.getElementById('gitpreview-inline-content');
    }

    if (!inlineContent) {
      console.error('GitPreview: Could not create inline container');
      return;
    }

    if (window.GitPreviewAudio?.openAudioPreview) {
      window.GitPreviewAudio.openAudioPreview(url, filename, inlineContent)
        .catch(err => {
          console.error('GitPreview audio error:', err);
          showError(filename, err.message || 'Failed to load audio');
        });
    }
  }

  function closeModal() {
    if (window.GitPreviewAudio?.closeAudioPreview) {
      window.GitPreviewAudio.closeAudioPreview();
    }
    removeExistingPlayer();
  }

  function bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!settings.keyboardShortcuts) return;

      const isPreviewOpen = !!document.getElementById('gitpreview-inline');

      if (e.key === 'Escape') {
        if (isPreviewOpen) {
          e.preventDefault();
          closeModal();
        }
      }

      if (isPreviewOpen && window.GitPreviewAudio) {
        switch (e.key) {
          case ' ':
            e.preventDefault();
            window.GitPreviewAudio.togglePlay();
            break;
          case 'ArrowLeft':
            e.preventDefault();
            window.GitPreviewAudio.rewind(10);
            break;
          case 'ArrowRight':
            e.preventDefault();
            window.GitPreviewAudio.forward(10);
            break;
          case 'ArrowUp':
            e.preventDefault();
            const newVolUp = Math.min(100, window.GitPreviewAudio.getVolume() + 10);
            window.GitPreviewAudio.setVolume(newVolUp);
            break;
          case 'ArrowDown':
            e.preventDefault();
            const newVolDown = Math.max(0, window.GitPreviewAudio.getVolume() - 10);
            window.GitPreviewAudio.setVolume(newVolDown);
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
