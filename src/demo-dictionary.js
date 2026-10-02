/**
 * Demo mode is deliberately limited to this curated phrase book. It never
 * fabricates a translation: unknown phrases or languages produce an error.
 */
export const DEMO_LANGUAGES = Object.freeze(["en", "es", "fr", "de", "hi"]);

export const DEMO_PHRASES = Object.freeze([
  { id: "hello", en: "Hello", es: "Hola", fr: "Bonjour", de: "Hallo", hi: "नमस्ते" },
  { id: "goodbye", en: "Goodbye", es: "Adiós", fr: "Au revoir", de: "Auf Wiedersehen", hi: "अलविदा" },
  { id: "thank-you", en: "Thank you", es: "Gracias", fr: "Merci", de: "Danke", hi: "धन्यवाद" },
  { id: "please", en: "Please", es: "Por favor", fr: "S'il vous plaît", de: "Bitte", hi: "कृपया" },
  { id: "good-night", en: "Good night", es: "Buenas noches", fr: "Bonne nuit", de: "Gute Nacht", hi: "शुभ रात्रि" },
  { id: "how-are-you", en: "How are you?", es: "¿Cómo estás?", fr: "Comment allez-vous ?", de: "Wie geht es dir?", hi: "आप कैसे हैं?" },
  { id: "dont-understand", en: "I don't understand.", es: "No entiendo.", fr: "Je ne comprends pas.", de: "Ich verstehe nicht.", hi: "मुझे समझ नहीं आया।" },
  { id: "train-station", en: "Where is the train station?", es: "¿Dónde está la estación de tren?", fr: "Où est la gare ?", de: "Wo ist der Bahnhof?", hi: "रेलवे स्टेशन कहाँ है?" },
  { id: "cost", en: "How much does this cost?", es: "¿Cuánto cuesta esto?", fr: "Combien ça coûte ?", de: "Wie viel kostet das?", hi: "इसकी कीमत कितनी है?" },
  { id: "meeting", en: "The meeting starts at 3 PM.", es: "La reunión empieza a las 3 de la tarde.", fr: "La réunion commence à 15 h.", de: "Das Meeting beginnt um 15 Uhr.", hi: "बैठक दोपहर 3 बजे शुरू होती है।" },
  { id: "order-shipped", en: "Your order has shipped.", es: "Su pedido ha sido enviado.", fr: "Votre commande a été expédiée.", de: "Ihre Bestellung wurde versandt.", hi: "आपका ऑर्डर भेज दिया गया है।" },
]);

export function normalizePhrase(text) {
  return String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[¿¡.?!।,;:"\u00ab\u00bb]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX = new Map();
for (const phrase of DEMO_PHRASES) {
  for (const code of DEMO_LANGUAGES) {
    const key = `${code}\u0000${normalizePhrase(phrase[code])}`;
    INDEX.set(key, phrase);
  }
}

export function lookupDemoPhrase(text, sourceLanguage) {
  const normalized = normalizePhrase(text);
  const candidates = sourceLanguage === "auto" ? DEMO_LANGUAGES : [sourceLanguage];
  for (const code of candidates) {
    const phrase = INDEX.get(`${code}\u0000${normalized}`);
    if (phrase) return { phrase, detectedLanguage: code };
  }
  return null;
}