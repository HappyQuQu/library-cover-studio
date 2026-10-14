import type zh from '../zh-CN/auth';
import type { TranslationShape } from '../types';

export default {
  "tagline": "Media library cover design and automation",
  "welcome": "Welcome back",
  "createAccount": "Create an account",
  "loginHint": "Sign in to continue",
  "registerHint": "Register to get started",
  "username": "Username",
  "usernamePlaceholder": "Enter your username",
  "password": "Password",
  "passwordPlaceholder": "Enter your password",
  "login": "Sign in",
  "register": "Register",
  "noAccount": "Don’t have an account?",
  "hasAccount": "Already have an account?",
  "registerNow": "Register now",
  "loginNow": "Sign in now",
  "footer": "Cover design for Jellyfin / Emby",
  "welcomeToast": "Welcome back 👋",
  "registeredToast": "Account created 🎉",
  "successDescription": "{{username}}, start designing your library covers!",
  "errorTitle": "Something went wrong",
  "credentialsHint": "Please check your credentials",
  "invalidCredentials": "Incorrect username or password",
  "userExists": "This username is already taken",
  "validationFailed": "Please check the username and password format",
  "networkError": "Unable to reach the server. Please try again later.",
  "switchToLight": "Switch to light mode",
  "switchToDark": "Switch to dark mode"
} as const satisfies TranslationShape<typeof zh>;
