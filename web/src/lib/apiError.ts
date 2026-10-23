import i18n from './i18n';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};

function readError(value: unknown) {
  const root = record(value);
  const response = record(root.response);
  const data = record(response.data ?? root);
  const error = record(data.error);
  return { code: error.code ?? data.code ?? root.code, status: response.status, root, data, error };
}

export function getApiErrorDetails(value: unknown): string | null {
  const { data, error, root } = readError(value);
  const message = error.message ?? (typeof data.error === 'string' ? data.error : data.message) ?? root.message;
  return typeof message === 'string' && message.trim() ? message : null;
}

export type ApiErrorContext = 'operation' | 'connection' | 'import' | 'ai' | 'font';

/** Render codes rather than inferring business meaning from source-language messages. */
export function getLocalizedApiError(value: unknown, context: ApiErrorContext = 'operation'): string {
  const { code, status, root } = readError(value);
  switch (code) {
    case 'INVALID_SETTINGS': return i18n.t('errors.invalidSettings');
    case 'INVALID_SETTING': return i18n.t('errors.invalidSettings');
    case 'INVALID_NETWORK_SETTINGS': return i18n.t('errors.invalidSettings');
    case 'INVALID_PROXY_URL': return i18n.t('errors.invalidProxy');
    case 'RESET_CONFIRMATION_REQUIRED': return i18n.t('errors.resetConfirmation');
    case 'INVALID_LIBRARY_CONFIG': return i18n.t('taskWizard.invalidOriginal');
    case 'INVALID_INPUT': return i18n.t('errors.validation');
    case 'INVALID_FONT_FILENAME': return i18n.t('errors.fontInvalid');
    case 'FONT_REQUIRED':
    case 'INVALID_FONT_FILE': return i18n.t('errors.fontInvalid');
    case 'FONT_NOT_FOUND': return i18n.t('errors.fontMissing');
    case 'LIMIT_FILE_SIZE': return i18n.t(context === 'import' ? 'errors.uploadLimit' : 'errors.fontTooLarge');
    case 'CANNOT_DELETE_SELF': return i18n.t('errors.cannotDeleteSelf');
    case 'USER_NOT_FOUND': return i18n.t('errors.userNotFound');
    case 'FORBIDDEN_ROLE_CHANGE': return i18n.t('errors.forbidden');
    case 'AI_PROVIDER_NOT_FOUND': return i18n.t('errors.aiProviderNotFound');
    case 'AI_NOT_CONFIGURED': return i18n.t('errors.aiNotConfigured');
    case 'AI_PROVIDER_INACTIVE': return i18n.t('errors.aiInactive');
    case 'AI_KEY_REQUIRED': return i18n.t('errors.aiKeyRequired');
    case 'AI_CONFIG_INVALID': return i18n.t('errors.aiConfigInvalid');
    case 'AI_PROMPT_REQUIRED': return i18n.t('errors.validation');
    case 'AI_CATALOG_UNSUPPORTED': return i18n.t('aiSettings.modelsFallback');
    case 'AI_CATALOG_FAILED': return i18n.t('errors.aiRequestFailed');
    case 'AI_UPSTREAM_UNAUTHORIZED': return i18n.t('errors.aiUnauthorized');
    case 'AI_RATE_LIMIT': return i18n.t('errors.aiRateLimit');
    case 'AI_TIMEOUT': return i18n.t('errors.aiTimeout');
    case 'AI_INVALID_CANVAS': return i18n.t('errors.aiInvalidCanvas');
    case 'AI_DUPLICATE_IDS': return i18n.t('errors.aiDuplicateIds');
    case 'AI_SELECTION_REQUIRED': return i18n.t('errors.aiSelectLayers');
    case 'AI_SELECTION_MISSING': return i18n.t('errors.aiSelectionMissing');
    case 'AI_INVALID_JSON': return i18n.t('errors.aiInvalidJson');
    case 'AI_RESPONSE_TRUNCATED': return i18n.t('errors.aiTruncated');
    case 'AI_RESPONSE_REFUSED': return i18n.t('errors.aiRefused');
    case 'AI_STREAM_INCOMPLETE': return i18n.t('errors.aiIncomplete');
    case 'SSE_INVALID_EVENT': return i18n.t('errors.sseInvalid');
    case 'AI_IMAGE_UNSUPPORTED': return i18n.t('errors.aiImageUnsupported');
    case 'AI_IMAGE_UNCONFIRMED': return i18n.t('errors.aiImageUnknown');
    case 'REFERENCE_COUNT': return i18n.t('errors.referenceCount');
    case 'REFERENCE_TOO_LARGE': return i18n.t('errors.referenceTooLarge');
    case 'REFERENCE_FORMAT': return i18n.t('errors.referenceFormat');
    case 'REFERENCE_UNREADABLE': return i18n.t('errors.referenceUnreadable');
    case 'REFERENCE_BROWSER': return i18n.t('errors.referenceBrowser');
    case 'REFERENCE_COMPRESS': return i18n.t('errors.referenceCompress');
    case 'AI_PREVIEW_SVG': return i18n.t('errors.previewSvg');
    case 'AI_PREVIEW_CORS': return i18n.t('errors.previewCors');
    case 'AI_PREVIEW_IMAGE': return i18n.t('errors.previewImage');
    case 'AI_PREVIEW_RENDER': return i18n.t('errors.previewRender');
    case 'AI_CONVERSATION_NOT_FOUND': return i18n.t('errors.conversationNotFound');
    case 'AI_REQUEST_FAILED': return i18n.t('errors.aiRequestFailed');

    case 'INVALID_CREDENTIALS': return i18n.t('auth.invalidCredentials');
    case 'USER_EXISTS': return i18n.t('auth.userExists');
    case 'UNAUTHORIZED': return i18n.t('errors.unauthorized');
    case 'FORBIDDEN':
    case 'PREVIEW_FORBIDDEN':
    case 'SERVER_FORBIDDEN':
    case 'TEMPLATE_FORBIDDEN': return i18n.t('errors.forbidden');
    case 'PREVIEW_NOT_FOUND': return i18n.t('errors.previewNotFound');
    case 'LIBRARY_UNAVAILABLE': return i18n.t('errors.libraryUnavailable');
    case 'NO_POSTERS': return i18n.t('errors.noPosters');
    case 'INVALID_SCHEDULE':
    case 'SCHEDULE_REQUIRED': return i18n.t('errors.invalidSchedule');
    case 'MEDIA_UNSUPPORTED_SORT': return i18n.t('taskWizard.sortInvalid');
    case 'TEMPLATE_POOL_INVALID': return i18n.t('taskWizard.poolInvalid');
    case 'TEMPLATE_UNAVAILABLE': return i18n.t('taskWizard.templateRequired');
    case 'TASK_NOT_FOUND': return i18n.t('errors.taskNotFound');
    case 'TASK_RUNNING': return i18n.t('errors.taskRunning');
    case 'REVISION_NOT_FOUND':
    case 'HISTORY_COVER_NOT_FOUND':
    case 'HISTORY_IMAGE_NOT_FOUND': return i18n.t('errors.historyNotFound');
    case 'STORE_UNAVAILABLE': return i18n.t('errors.storeUnavailable');
    case 'STORE_DOWNLOAD_FAILED': return i18n.t('errors.storeDownloadFailed');
    case 'STORE_PACKAGE_INVALID': return i18n.t('errors.storePackageInvalid');
    case 'STORE_PREVIEW_NOT_FOUND':
    case 'STORE_INSTALL_NOT_FOUND':
    case 'STORE_TEMPLATE_NOT_FOUND':
    case 'STORE_VERSION_CHANGED': return i18n.t('errors.storeVersionChanged');
    case 'STORE_APP_UPGRADE_REQUIRED': return i18n.t('errors.storeUpgrade');
    case 'STORE_CONFIRM_REQUIRED': return i18n.t('errors.storeConfirm');
    case 'VALIDATION_ERROR': return i18n.t('errors.validation');
    case 'SERVER_NOT_FOUND': return i18n.t('errors.serverNotFound');
    case 'MEDIA_AUTH_FAILED':
    case 'MEDIA_FORBIDDEN': return i18n.t('errors.mediaAuth');
    case 'MEDIA_TIMEOUT':
    case 'MEDIA_UNREACHABLE':
    case 'MEDIA_REQUEST_FAILED':
    case 'MEDIA_INVALID_URL':
    case 'MEDIA_INVALID_RESPONSE': return i18n.t('errors.connectionFailed');
    case 'TEMPLATE_NOT_FOUND': return i18n.t('errors.templateNotFound');
    case 'TEMPLATE_LOCKED': return i18n.t('errors.templateLocked');
    case 'TEMPLATE_IN_USE': return i18n.t('errors.templateInUse');
    case 'INVALID_TEMPLATE': return i18n.t('errors.invalidTemplate');
    case 'INVALID_TEMPLATE_FONT': return i18n.t('errors.invalidFont');
    case 'NO_FILE': return i18n.t('errors.noFile');
    case 'ECONNABORTED':
    case 'ETIMEDOUT': return i18n.t(context === 'import' ? 'errors.importTimeout' : 'errors.connectionFailed');
    case 'ERR_NETWORK': return i18n.t('errors.network');
  }
  if (status === 413) return i18n.t(context === 'ai' ? 'errors.referenceTooLarge' : context === 'font' ? 'errors.fontTooLarge' : 'errors.uploadLimit');
  if (status === 401) return i18n.t('errors.unauthorized');
  if (status === 403) return i18n.t('errors.forbidden');
  if (root.isAxiosError && !root.response) return i18n.t('errors.network');
  return i18n.t(context === 'connection' ? 'errors.connectionFailed' : context === 'import' ? 'errors.importFailed' : context === 'ai' ? 'errors.aiRequestFailed' : 'errors.operationFailed');
}
