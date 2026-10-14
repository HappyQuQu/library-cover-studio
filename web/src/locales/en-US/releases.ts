import type zh from '../zh-CN/releases';
import type { TranslationShape } from '../types';

export default {
  "title": "Release history",
  "description": "See new features, improvements, and fixes in each release.",
  "updateAvailable": "An update is available",
  "newVersion": "Version v{{version}} is available",
  "unavailable": "Unable to check for updates right now",
  "checking": "Checking for updates…",
  "upToDate": "You are up to date",
  "ahead": "This version is newer than the latest official release",
  "noReleases": "No official releases yet",
  "systemVersion": "Application version",
  "currentVersion": "Current version",
  "latestVersion": "Latest version",
  "cachedUpdate": "The latest check failed. Showing the previously confirmed update.",
  "retryHint": "Try again later, or check the releases on GitHub.",
  "webConfirmed": "The latest official version was confirmed through the GitHub releases page.",
  "checkedAt": "Last successful check: {{time}}",
  "check": "Check for updates",
  "checkBusy": "Checking…",
  "update": "Get update",
  "github": "GitHub releases",
  "cachedHistory": "GitHub is unavailable. Showing bundled or cached release history.",
  "loading": "Loading release history…",
  "loadFailed": "Unable to load release history. Select “Check for updates” to retry.",
  "viewRelease": "View release",
  "empty": "No release history yet.",
  "viewGithub": "View on GitHub",
  "emptyNotes": "No detailed notes are available for this release.",
  "originalNotes": "Release notes (original)"
} as const satisfies TranslationShape<typeof zh>;
