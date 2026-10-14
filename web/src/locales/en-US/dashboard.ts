import type zh from '../zh-CN/dashboard';
import type { TranslationShape } from '../types';

export default {
  "title": "Dashboard",
  "welcome": "Welcome back. Give your media libraries a fresh look.",
  "sources": "Media sources",
  "templates": "Templates",
  "tasks": "Automation tasks",
  "monthlyGenerated": "Generated this month",
  "connect": "Connect a server",
  "connectDescription": "Add a Jellyfin / Emby server and discover its libraries.",
  "create": "Create a template",
  "createDescription": "Use the visual editor to design your library covers.",
  "automate": "Automate updates",
  "automateDescription": "Schedule tasks to generate and update library covers.",
  "startDesigning": "Start designing",
  "quickStart": "Quick start",
  "start": "Get started",
  "featureTitle": "Visual cover designer",
  "featureDescription": "Design consistent library covers with dynamic variables, layers, and live previews in the canvas editor.",
  "tryNow": "Try it now",
  "recentActivity": "Recent activity",
  "lastRun": "Last run: {{time}}",
  "neverRun": "Not run yet",
  "manage": "Manage",
  "noActivity": "No activity yet",
  "activityHint": "Your activity will appear here when you start using the app.",
  "loadFailed": "Some dashboard data could not be loaded. Please try again."
} as const satisfies TranslationShape<typeof zh>;
