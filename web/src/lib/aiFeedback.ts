import type { DisplayMessage } from './displayMessage';
import type { CanvasJSON } from './aiDesign';

export interface AIStreamEvent {
  type: 'chunk' | 'status' | 'complete' | 'error' | 'conversation_id';
  content?: string;
  canvasJson?: CanvasJSON;
  error?: string;
  code?: string;
  id?: string;
}

/** Status is product feedback, while content and referenceAnalysis remain model-authored data. */
export function feedbackForStatus(event: AIStreamEvent): DisplayMessage {
  switch (event.code) {
    case 'AI_RETRY_TRUNCATED': return { key: 'aiChat.retryTruncated' };
    case 'AI_RETRY_FORMAT': return { key: 'aiChat.retryFormat' };
    default: return { key: 'aiChat.correcting' };
  }
}
