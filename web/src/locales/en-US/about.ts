import type zh from '../zh-CN/about';
import type { TranslationShape } from '../types';

export default {
  "title": "About",
  "description": "Get to know CoverStudio and help shape the project.",
  "intro": "Design and automate covers to give your Jellyfin / Emby libraries a personal touch.",
  "design": "Design freely",
  "designHint": "Create your own library covers in the visual designer.",
  "share": "Share templates",
  "shareHint": "Find inspiration in the template store, then import and share designs.",
  "automate": "Automate updates",
  "automateHint": "Connect a media server to generate and update library covers on a schedule.",
  "openSource": "Open source project",
  "maintainer": "Developed and maintained by HappyQuQu. Feedback, discussion, and template contributions are welcome.",
  "authorGithub": "My GitHub profile",
  "source": "Project source",
  "storeSource": "Template store source",
  "feedback": "Feedback and suggestions",
  "feedbackHint": "Help improve CoverStudio"
} as const satisfies TranslationShape<typeof zh>;
