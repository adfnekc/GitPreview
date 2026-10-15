/**
 * GitPreview content script entry.
 *
 * To add a new preview type:
 * 1. Create `src/preview/<type>/index.ts` exporting a PreviewHandler
 * 2. Import it here and call `registerHandler(yourHandler)`
 *
 * That's it. The handler's lifecycle methods (openPreview, close)
 * are managed automatically by the registry; page orchestration
 * lives in `controller.ts`.
 */

import { audioHandler } from './preview/audio/index';
import { pdfHandler } from './preview/pdf/index';
import { videoHandler } from './preview/video/index';
import { fontHandler } from './preview/font/index';
import { wordHandler } from './preview/word/index';
import { excelHandler } from './preview/excel/index';
import { powerPointHandler } from './preview/powerpoint/index';
import { registerHandler } from './preview/registry';
import { start } from './controller';
import './preview/preview.css';

registerHandler(audioHandler);
registerHandler(pdfHandler);
registerHandler(videoHandler);
registerHandler(fontHandler);
registerHandler(wordHandler);
registerHandler(excelHandler);
registerHandler(powerPointHandler);

start();
