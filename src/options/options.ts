export {};

// Kept as a local constant (rather than importing `lib/instances`) so the
// options bundle does not share a chunk with the background worker.
const GITLAB_INSTANCES_KEY = 'gitlabInstances';

const input = document.getElementById('instance-input') as HTMLInputElement;
const addBtn = document.getElementById('add-btn') as HTMLButtonElement;
const listEl = document.getElementById('instance-list') as HTMLUListElement;
const messageEl = document.getElementById('message') as HTMLParagraphElement;

function setMessage(text: string, kind: 'info' | 'error' | 'success' = 'info'): void {
  messageEl.textContent = text;
  messageEl.className = `options-message options-message-${kind}`;
}

function normalizeOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return url.origin;
}

function getInstances(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ [GITLAB_INSTANCES_KEY]: [] }, (result) => {
      resolve((result[GITLAB_INSTANCES_KEY] as string[]) ?? []);
    });
  });
}

function saveInstances(instances: string[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [GITLAB_INSTANCES_KEY]: instances }, () => resolve());
  });
}

async function render(): Promise<void> {
  const instances = await getInstances();
  listEl.replaceChildren();

  if (instances.length === 0) {
    const li = document.createElement('li');
    li.className = 'options-empty';
    li.textContent = 'No self-hosted instances added yet.';
    listEl.appendChild(li);
    return;
  }

  for (const origin of instances) {
    const li = document.createElement('li');
    li.className = 'options-instance';

    const label = document.createElement('span');
    label.textContent = origin;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'options-remove';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      void removeInstance(origin);
    });

    li.append(label, remove);
    listEl.appendChild(li);
  }
}

async function addInstance(): Promise<void> {
  const origin = normalizeOrigin(input.value);
  if (!origin) {
    setMessage('Please enter a valid http(s) URL.', 'error');
    return;
  }

  const instances = await getInstances();
  if (instances.includes(origin)) {
    setMessage('Instance already added.', 'info');
    return;
  }

  const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!granted) {
    setMessage('Permission denied — instance not added.', 'error');
    return;
  }

  await saveInstances([...instances, origin]);
  input.value = '';
  setMessage(`Added ${origin}`, 'success');
  await render();
}

async function removeInstance(origin: string): Promise<void> {
  const instances = await getInstances();
  await saveInstances(instances.filter((item) => item !== origin));

  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    const ids = scripts
      .filter((script) => script.matches?.includes(`${origin}/*`))
      .map((script) => script.id);
    if (ids.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids });
    }
  } catch {
    /* script was not registered */
  }

  try {
    await chrome.permissions.remove({ origins: [`${origin}/*`] });
  } catch {
    /* permission already gone */
  }

  setMessage(`Removed ${origin}`, 'info');
  await render();
}

addBtn.addEventListener('click', () => {
  void addInstance();
});

input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') void addInstance();
});

void render();
