import type zh from '../zh-CN/schedule';
import type { TranslationShape } from '../types';

export default {
  "sortDateCreated": "Recently added",
  "sortRandom": "Random",
  "sortCommunityRating": "Community rating",
  "sortSortName": "Name",
  "sortPremiereDate": "Release date",
  "sortDatePlayed": "Recently played",
  "sortPlayCount": "Play count",
  "sortCriticRating": "Critic rating",
  "sortOfficialRating": "Parental rating",
  "sortRuntime": "Runtime",
  "sunday": "Sunday",
  "monday": "Monday",
  "tuesday": "Tuesday",
  "wednesday": "Wednesday",
  "thursday": "Thursday",
  "friday": "Friday",
  "saturday": "Saturday",
  "custom": "Custom schedule",
  "hourly": "Every hour at minute {{minute}}",
  "weekly": "Every {{weekday}} at {{time}}",
  "monthly": "On day {{day}} of each month at {{time}}",
  "daily": "Every day at {{time}}"
} as const satisfies TranslationShape<typeof zh>;
