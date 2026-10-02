export const LANGUAGES = Object.freeze([
  { code: "ar", name: "Arabic" },
  { code: "zh", name: "Chinese (Simplified)" },
  { code: "nl", name: "Dutch" },
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "hi", name: "Hindi" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "pt", name: "Portuguese" },
  { code: "es", name: "Spanish" },
]);

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code, language]));

export function languageName(code) {
  return BY_CODE.get(code)?.name ?? code;
}

export function isSupportedLanguage(code) {
  return BY_CODE.has(code);
}