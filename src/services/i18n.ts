export type ScheduledLanguageCode =
  | "as" | "bn" | "brx" | "doi" | "gu" | "hi" | "kn" | "ks"
  | "kok" | "mai" | "ml" | "mni" | "mr" | "ne" | "or" | "pa"
  | "sa" | "sat" | "sd" | "ta" | "te" | "ur";

export type AppLocale = ScheduledLanguageCode | "en";

export interface LanguageMeta {
  code: AppLocale;
  label: string;
  nativeLabel: string;
  bcp47: string;
  rtl: boolean;
  scheduled: boolean;
}

export const LANGUAGES: LanguageMeta[] = [
  { code: "en", label: "English", nativeLabel: "English", bcp47: "en-IN", rtl: false, scheduled: false },
  { code: "as", label: "Assamese", nativeLabel: "অসমীয়া", bcp47: "as-IN", rtl: false, scheduled: true },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", bcp47: "bn-IN", rtl: false, scheduled: true },
  { code: "brx", label: "Bodo", nativeLabel: "बड़ो", bcp47: "brx-IN", rtl: false, scheduled: true },
  { code: "doi", label: "Dogri", nativeLabel: "डोगरी", bcp47: "doi-IN", rtl: false, scheduled: true },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", bcp47: "gu-IN", rtl: false, scheduled: true },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", bcp47: "hi-IN", rtl: false, scheduled: true },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", bcp47: "kn-IN", rtl: false, scheduled: true },
  { code: "ks", label: "Kashmiri", nativeLabel: "کٲشُر", bcp47: "ks-IN", rtl: true, scheduled: true },
  { code: "kok", label: "Konkani", nativeLabel: "कोंकणी", bcp47: "kok-IN", rtl: false, scheduled: true },
  { code: "mai", label: "Maithili", nativeLabel: "मैथिली", bcp47: "mai-IN", rtl: false, scheduled: true },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", bcp47: "ml-IN", rtl: false, scheduled: true },
  { code: "mni", label: "Manipuri", nativeLabel: "মণিপুরী", bcp47: "mni-IN", rtl: false, scheduled: true },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", bcp47: "mr-IN", rtl: false, scheduled: true },
  { code: "ne", label: "Nepali", nativeLabel: "नेपाली", bcp47: "ne-NP", rtl: false, scheduled: true },
  { code: "or", label: "Odia", nativeLabel: "ଓଡ଼ିଆ", bcp47: "or-IN", rtl: false, scheduled: true },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", bcp47: "pa-IN", rtl: false, scheduled: true },
  { code: "sa", label: "Sanskrit", nativeLabel: "संस्कृतम्", bcp47: "sa-IN", rtl: false, scheduled: true },
  { code: "sat", label: "Santali", nativeLabel: "ᱥᱟᱱᱛᱟᱲᱤ", bcp47: "sat-IN", rtl: false, scheduled: true },
  { code: "sd", label: "Sindhi", nativeLabel: "سنڌي", bcp47: "sd-IN", rtl: true, scheduled: true },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", bcp47: "ta-IN", rtl: false, scheduled: true },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", bcp47: "te-IN", rtl: false, scheduled: true },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", bcp47: "ur-IN", rtl: true, scheduled: true },
];

export const RTL_LOCALES: AppLocale[] = LANGUAGES.filter((l) => l.rtl).map((l) => l.code);

export function isRTL(locale: AppLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

export function speechCode(locale: AppLocale): string {
  return LANGUAGES.find((l) => l.code === locale)?.bcp47 ?? "en-IN";
}

export type I18nKey =
  | "appTitle" | "appSubtitle" | "signIn" | "badgeId" | "password"
  | "vpnConnect" | "vpnDisconnect" | "dashboard" | "cases" | "graph"
  | "analytics" | "patterns" | "geo" | "ingest" | "search"
  | "logout" | "accessGranted" | "authFailed" | "secureTunnel" | "officerCredentials"
  // Workstation shell + shared actions (realtime via useLanguage().t).
  | "commandOverview" | "graphWorkstation" | "threatPatterns" | "geoTimeline"
  | "sahayakAi" | "evidenceTriage" | "cyberConsole" | "myWorkspaces"
  | "searchPlaceholder" | "newCase" | "dossier" | "proceedings" | "staging"
  | "cyberCell" | "accessRequests" | "allCases" | "migration" | "collaboration"
  | "cancel" | "save" | "add" | "close" | "language";

type Dict = Record<I18nKey, string>;

const en: Dict = {
  appTitle: "TRINETRA OS",
  appSubtitle: "National Security Intelligence & Criminal Syndicate Interdiction Platform",
  signIn: "Sign In",
  badgeId: "Badge ID",
  password: "Password",
  vpnConnect: "Establish Secure Tunnel",
  vpnDisconnect: "Disconnect",
  dashboard: "Dashboard",
  cases: "Cases",
  graph: "Graph",
  analytics: "Analytics",
  patterns: "Patterns",
  geo: "Geo-Timeline",
  ingest: "Ingest",
  search: "Search",
  logout: "Logout",
  accessGranted: "Access Granted",
  authFailed: "Authentication Failed",
  secureTunnel: "Secure Tunnel",
  officerCredentials: "Officer Credentials",
  commandOverview: "Command Overview",
  graphWorkstation: "Graph Workstation",
  threatPatterns: "Threat Patterns & Leads",
  geoTimeline: "Geospatial & Timeline",
  sahayakAi: "SAHAYAK AI",
  evidenceTriage: "Evidence Triage Queue",
  cyberConsole: "Cyber Console",
  myWorkspaces: "My Workspaces",
  searchPlaceholder: "Search suspects, phones, IMEIs, bank VPAs...",
  newCase: "New Case",
  dossier: "Dossier",
  proceedings: "Proceedings",
  staging: "Intake Pipeline",
  cyberCell: "Cyber Cell",
  accessRequests: "Access Requests",
  allCases: "All Registered Cases",
  migration: "Handover & Migration",
  collaboration: "State Collaboration",
  cancel: "Cancel",
  save: "Save",
  add: "Add",
  close: "Close",
  language: "Language",
};

export const STRINGS: Record<AppLocale, Dict> = {
  en,
  as: { ...en, appTitle: "ক্ৰিম-ইণ্টেল OS", signIn: "ছাইন ইন", badgeId: "বেজ ID", password: "পাছৱৰ্ড", vpnConnect: "সুৰক্ষিত টানেল স্থাপন কৰক", vpnDisconnect: "সংযোগ বিচ্ছিন্ন", dashboard: "ডেশব'ৰ্ড", cases: "গোচৰ", graph: "গ্ৰাফ", analytics: "বিশ্লেষণ", patterns: "আৰ্হি", geo: "ভূ-সময়ৰেখা", ingest: "অন্তৰ্গ্ৰহণ", search: "সন্ধান", logout: "লগআউট", accessGranted: "প্ৰৱেশ মঞ্জুৰ", authFailed: "প্ৰমাণীকৰণ বিফল", secureTunnel: "সুৰক্ষিত টানেল", officerCredentials: "বিষয়াৰ পৰিচয়" },
  bn: { ...en, appTitle: "ক্রিম-ইন্টেল OS", signIn: "সাইন ইন", badgeId: "ব্যাজ আইডি", password: "পাসওয়ার্ড", vpnConnect: "সুরক্ষিত টানেল স্থাপন করুন", vpnDisconnect: "সংযোগ বিচ্ছিন্ন", dashboard: "ড্যাশবোর্ড", cases: "মামলা", graph: "গ্রাফ", analytics: "বিশ্লেষণ", patterns: "প্যাটার্ন", geo: "ভূ-সময়রেখা", ingest: "অন্তর্ভুক্তি", search: "অনুসন্ধান", logout: "লগআউট", accessGranted: "প্রবেশ মঞ্জুর", authFailed: "প্রমাণীকরণ ব্যর্থ", secureTunnel: "সুরক্ষিত টানেল", officerCredentials: "অফিসার পরিচয়" },
  brx: { ...en, appTitle: "TRINETRA OS", signIn: "Sign In", badgeId: "Badge ID", password: "Password", vpnConnect: "Secure Tunnel Setup Khala", vpnDisconnect: "Disconnect", dashboard: "Dashboard", cases: "Cases", graph: "Graph", analytics: "Analytics", patterns: "Patterns", geo: "Geo-Timeline", ingest: "Ingest", search: "Nagir", logout: "Logout", accessGranted: "Homa Horna", authFailed: "Auth Failed", secureTunnel: "Secure Tunnel", officerCredentials: "Officer Credentials" },
  doi: { ...en, appTitle: "क्रिम-इंटेल OS", signIn: "साइन इन", badgeId: "बैज आईडी", password: "पासवर्ड", vpnConnect: "सुरक्षित टनल बनाओ", vpnDisconnect: "डिस्कनेक्ट", dashboard: "डैशबोर्ड", cases: "मामले", graph: "ग्राफ", analytics: "विश्लेषण", patterns: "पैटर्न", geo: "भू-समयरेखा", ingest: "समावेश", search: "खोज", logout: "लॉगआउट", accessGranted: "पहुंच मंजूर", authFailed: "प्रमाणीकरण असफल", secureTunnel: "सुरक्षित टनल", officerCredentials: "अधिकारी प्रमाण" },
  gu: { ...en, appTitle: "ક્રિમ-ઇન્ટેલ OS", signIn: "સાઇન ઇન", badgeId: "બેજ ID", password: "પાસવર્ડ", vpnConnect: "સુરક્ષિત ટનલ સ્થાપિત કરો", vpnDisconnect: "ડિસ્કનેક્ટ", dashboard: "ડેશબોર્ડ", cases: "કેસો", graph: "ગ્રાફ", analytics: "વિશ્લેષણ", patterns: "પેટર્ન", geo: "ભૂ-સમયરેખા", ingest: "સમાવેશ", search: "શોધ", logout: "લોગઆઉટ", accessGranted: "પ્રવેશ મંજૂર", authFailed: "પ્રમાણીકરણ નિષ્ફળ", secureTunnel: "સુરક્ષિત ટનલ", officerCredentials: "અધિકારી ઓળખ" },
  hi: { ...en, appTitle: "क्रिम-इंटेल OS", signIn: "साइन इन", badgeId: "बैज आईडी", password: "पासवर्ड", vpnConnect: "सुरक्षित टनल स्थापित करें", vpnDisconnect: "डिस्कनेक्ट करें", dashboard: "डैशबोर्ड", cases: "मामले", graph: "ग्राफ", analytics: "विश्लेषण", patterns: "पैटर्न", geo: "भू-समयरेखा", ingest: "समावेश", search: "खोजें", logout: "लॉगआउट", accessGranted: "पहुँच स्वीकृत", authFailed: "प्रमाणीकरण विफल", secureTunnel: "सुरक्षित टनल", officerCredentials: "अधिकारी परिचय" },
  kn: { ...en, appTitle: "ಕ್ರಿಮ್-ಇಂಟೆಲ್ OS", signIn: "ಸೈನ್ ಇನ್", badgeId: "ಬ್ಯಾಡ್ಜ್ ID", password: "ಪಾಸ್‌ವರ್ಡ್", vpnConnect: "ಸುರಕ್ಷಿತ ಸುರಂಗ ಸ್ಥಾಪಿಸಿ", vpnDisconnect: "ಸಂಪರ್ಕ ಕಡಿತ", dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್", cases: "ಪ್ರಕರಣಗಳು", graph: "ಗ್ರಾಫ್", analytics: "ವಿಶ್ಲೇಷಣೆ", patterns: "ಮಾದರಿಗಳು", geo: "ಭೂ-ಕಾಲರೇಖೆ", ingest: "ಸೇರ್ಪಡೆ", search: "ಹುಡುಕಿ", logout: "ಲಾಗ್‌ಔಟ್", accessGranted: "ಪ್ರವೇಶ ಮಂಜೂರು", authFailed: "ದೃಢೀಕರಣ ವಿಫಲ", secureTunnel: "ಸುರಕ್ಷಿತ ಸುರಂಗ", officerCredentials: "ಅಧಿಕಾರಿ ಪರಿಚಯ" },
  ks: { ...en, appTitle: "کرِم-اِنٹیل OS", signIn: "سائن اِن", badgeId: "بیج ID", password: "پاس ورڈ", vpnConnect: "محفوظ ٹنل قٲیِم کٔرِو", vpnDisconnect: "رابطہ ختم", dashboard: "ڈیش بورڈ", cases: "مقدمے", graph: "گراف", analytics: "تجزیہ", patterns: "نمونے", geo: "جیو ٹائم لائن", ingest: "شامل", search: "تلاش", logout: "لاگ آؤٹ", accessGranted: "رسائی منظور", authFailed: "تصدیق ناکام", secureTunnel: "محفوظ ٹنل", officerCredentials: "افسر شناخت" },
  kok: { ...en, appTitle: "क्रिम-इंटेल OS", signIn: "साइन इन", badgeId: "बॅज ID", password: "पासवर्ड", vpnConnect: "सुरक्षित बोगदो स्थापन करात", vpnDisconnect: "डिस्कनेक्ट", dashboard: "डॅशबोर्ड", cases: "केसी", graph: "ग्राफ", analytics: "विश्लेषण", patterns: "पॅटर्न", geo: "भूं-वेळापत्रक", ingest: "समावेश", search: "सोद", logout: "लॉगआउट", accessGranted: "प्रवेश मंजूर", authFailed: "प्रमाणीकरण अयशस्वी", secureTunnel: "सुरक्षित बोगदो", officerCredentials: "अधिकारी ओळख" },
  mai: { ...en, appTitle: "क्रिम-इंटेल OS", signIn: "साइन इन", badgeId: "बैज आईडी", password: "पासवर्ड", vpnConnect: "सुरक्षित सुरंग स्थापित करू", vpnDisconnect: "विच्छेद", dashboard: "डैशबोर्ड", cases: "मामिला", graph: "ग्राफ", analytics: "विश्लेषण", patterns: "पैटर्न", geo: "भू-समयरेखा", ingest: "समावेश", search: "खोजू", logout: "लॉगआउट", accessGranted: "पहुँच स्वीकृत", authFailed: "प्रमाणीकरण विफल", secureTunnel: "सुरक्षित सुरंग", officerCredentials: "अधिकारी परिचय" },
  ml: { ...en, appTitle: "ക്രിം-ഇന്റൽ OS", signIn: "സൈൻ ഇൻ", badgeId: "ബാഡ്ജ് ID", password: "പാസ്‌വേഡ്", vpnConnect: "സുരക്ഷിത തുരങ്കം സ്ഥാപിക്കുക", vpnDisconnect: "വിച്ഛേദിക്കുക", dashboard: "ഡാഷ്‌ബോർഡ്", cases: "കേസുകൾ", graph: "ഗ്രാഫ്", analytics: "വിശകലനം", patterns: "പാറ്റേണുകൾ", geo: "ഭൂ-ടൈംലൈൻ", ingest: "ഉൾപ്പെടുത്തൽ", search: "തിരയുക", logout: "ലോഗൗട്ട്", accessGranted: "പ്രവേശനം അനുവദിച്ചു", authFailed: "ആധികാരികത പരാജയപ്പെട്ടു", secureTunnel: "സുരക്ഷിത തുരങ്കം", officerCredentials: "ഓഫീസർ തിരിച്ചറിയൽ" },
  mni: { ...en, appTitle: "ক্রিম-ইন্টেল OS", signIn: "সাইন ইন", badgeId: "বেজ ID", password: "পাসৱার্ড", vpnConnect: "সুরক্ষিত টানেল শেমগৎলু", vpnDisconnect: "তোখায়বা", dashboard: "ডেশবোর্ড", cases: "কেসশিং", graph: "গ্রাফ", analytics: "নৈนশিং", patterns: "পেতর্ন", geo: "ভূ-মতম", ingest: "য়াওশিনবা", search: "থিজিনবা", logout: "লোগআউট", accessGranted: "চংবা য়াবা", authFailed: "অথেনতিকেসন মায় পাকপা", secureTunnel: "সুরক্ষিত টানেল", officerCredentials: "ওফিসারগী মশক" },
  mr: { ...en, appTitle: "क्रिम-इंटेल OS", signIn: "साइन इन", badgeId: "बॅज ID", password: "पासवर्ड", vpnConnect: "सुरक्षित बोगदा प्रस्थापित करा", vpnDisconnect: "खंडित करा", dashboard: "डॅशबोर्ड", cases: "प्रकरणे", graph: "आलेख", analytics: "विश्लेषण", patterns: "नमुने", geo: "भू-कालरेषा", ingest: "समावेश", search: "शोधा", logout: "लॉगआउट", accessGranted: "प्रवेश मंजूर", authFailed: "प्रमाणीकरण अयशस्वी", secureTunnel: "सुरक्षित बोगदा", officerCredentials: "अधिकारी ओळख" },
  ne: { ...en, appTitle: "क्रिम-इन्टेल OS", signIn: "साइन इन", badgeId: "ब्याज ID", password: "पासवर्ड", vpnConnect: "सुरक्षित टनेल स्थापना गर्नुहोस्", vpnDisconnect: "विच्छेद", dashboard: "ड्यासबोर्ड", cases: "मुद्दा", graph: "ग्राफ", analytics: "विश्लेषण", patterns: "ढाँचा", geo: "भू-समयरेखा", ingest: "समावेश", search: "खोज्नुहोस्", logout: "लगआउट", accessGranted: "पहुँच स्वीकृत", authFailed: "प्रमाणीकरण असफल", secureTunnel: "सुरक्षित टनेल", officerCredentials: "अधिकारी परिचय" },
  or: { ...en, appTitle: "କ୍ରିମ୍-ଇଣ୍ଟେଲ OS", signIn: "ସାଇନ୍ ଇନ୍", badgeId: "ବ୍ୟାଜ୍ ID", password: "ପାସୱାର୍ଡ", vpnConnect: "ସୁରକ୍ଷିତ ଟନେଲ୍ ସ୍ଥାପନ କରନ୍ତୁ", vpnDisconnect: "ବିଚ୍ଛିନ୍ନ", dashboard: "ଡ୍ୟାସବୋର୍ଡ", cases: "ମାମଲା", graph: "ଗ୍ରାଫ୍", analytics: "ବିଶ୍ଳେଷଣ", patterns: "ଢାଞ୍ଚା", geo: "ଭୂ-ସମୟରେଖା", ingest: "ଅନ୍ତର୍ଭୁକ୍ତ", search: "ଖୋଜନ୍ତୁ", logout: "ଲଗଆଉଟ୍", accessGranted: "ପ୍ରବେଶ ମଞ୍ଜୁର", authFailed: "ପ୍ରମାଣୀକରଣ ବିଫଳ", secureTunnel: "ସୁରକ୍ଷିତ ଟନେଲ୍", officerCredentials: "ଅଧିକାରୀ ପରିଚୟ" },
  pa: { ...en, appTitle: "ਕ੍ਰਿਮ-ਇੰਟੈਲ OS", signIn: "ਸਾਈਨ ਇਨ", badgeId: "ਬੈਜ ID", password: "ਪਾਸਵਰਡ", vpnConnect: "ਸੁਰੱਖਿਅਤ ਟਨਲ ਸਥਾਪਿਤ ਕਰੋ", vpnDisconnect: "ਡਿਸਕਨੈਕਟ", dashboard: "ਡੈਸ਼ਬੋਰਡ", cases: "ਕੇਸ", graph: "ਗ੍ਰਾਫ", analytics: "ਵਿਸ਼ਲੇਸ਼ਣ", patterns: "ਪੈਟਰਨ", geo: "ਭੂ-ਸਮਾਂਰੇਖਾ", ingest: "ਸ਼ਾਮਲ", search: "ਖੋਜੋ", logout: "ਲਾਗਆਉਟ", accessGranted: "ਪਹੁੰਚ ਮਨਜ਼ੂਰ", authFailed: "ਪ੍ਰਮਾਣਿਕਤਾ ਅਸਫਲ", secureTunnel: "ਸੁਰੱਖਿਅਤ ਟਨਲ", officerCredentials: "ਅਧਿਕਾਰੀ ਪਛਾਣ" },
  sa: { ...en, appTitle: "क्रिम्-इण्टेल् OS", signIn: "प्रविशतु", badgeId: "पट्टिका-सङ्ख्या", password: "गुप्तशब्दः", vpnConnect: "सुरक्षितां सुरङ्गां स्थापयतु", vpnDisconnect: "विच्छेदयतु", dashboard: "फलकम्", cases: "प्रकरणानि", graph: "आलेखः", analytics: "विश्लेषणम्", patterns: "प्रतिमानानि", geo: "भू-कालरेखा", ingest: "समावेशः", search: "अन्वेषणम्", logout: "निर्गमनम्", accessGranted: "प्रवेशः स्वीकृतः", authFailed: "प्रमाणीकरणं विफलम्", secureTunnel: "सुरक्षिता सुरङ्गा", officerCredentials: "अधिकारी-परिचयः" },
  sat: { ...en, appTitle: "TRINETRA OS", signIn: "Sign In", badgeId: "Badge ID", password: "Password", vpnConnect: "Secure Tunnel Teyar Me", vpnDisconnect: "Disconnect", dashboard: "Dashboard", cases: "Cases", graph: "Graph", analytics: "Analytics", patterns: "Patterns", geo: "Geo-Timeline", ingest: "Ingest", search: "Search", logout: "Logout", accessGranted: "Bolar Hor", authFailed: "Auth Failed", secureTunnel: "Secure Tunnel", officerCredentials: "Officer Credentials" },
  sd: { ...en, appTitle: "ڪرِم-انٽيل OS", signIn: "سائن ان", badgeId: "بيج ID", password: "پاسورڊ", vpnConnect: "محفوظ سرنگ قائم ڪريو", vpnDisconnect: "رابطو ختم", dashboard: "ڊيش بورڊ", cases: "ڪيس", graph: "گراف", analytics: "تجزيو", patterns: "نمونا", geo: "جيو ٽائم لائن", ingest: "شامل", search: "ڳولا", logout: "لاگ آئوٽ", accessGranted: "رسائي منظور", authFailed: "تصديق ناڪام", secureTunnel: "محفوظ سرنگ", officerCredentials: "آفيسر سڃاڻپ" },
  ta: { ...en, appTitle: "கிரிம்-இன்டெல் OS", signIn: "உள்நுழை", badgeId: "பேட்ஜ் ID", password: "கடவுச்சொல்", vpnConnect: "பாதுகாப்பான சுரங்கம் அமை", vpnDisconnect: "துண்டி", dashboard: "டாஷ்போர்டு", cases: "வழக்குகள்", graph: "வரைபடம்", analytics: "பகுப்பாய்வு", patterns: "வடிவங்கள்", geo: "புவி-காலவரிசை", ingest: "உள்ளீடு", search: "தேடு", logout: "வெளியேறு", accessGranted: "அணுகல் வழங்கப்பட்டது", authFailed: "அங்கீகாரம் தோல்வி", secureTunnel: "பாதுகாப்பான சுரங்கம்", officerCredentials: "அதிகாரி அடையாளம்" },
  te: { ...en, appTitle: "క్రిమ్-ఇంటెల్ OS", signIn: "సైన్ ఇన్", badgeId: "బ్యాడ్జ్ ID", password: "పాస్‌వర్డ్", vpnConnect: "సురక్షిత సొరంగం ఏర్పాటు చేయండి", vpnDisconnect: "డిస్‌కనెక్ట్", dashboard: "డాష్‌బోర్డ్", cases: "కేసులు", graph: "గ్రాఫ్", analytics: "విశ్లేషణ", patterns: "నమూనాలు", geo: "భూ-కాలరేఖ", ingest: "సమावేశం", search: "వెతకండి", logout: "లాగ్అవుట్", accessGranted: "ప్రవేశం మంజూరు", authFailed: "ధృవీకరణ విఫలం", secureTunnel: "సురక్షిత సొరంగం", officerCredentials: "అధికారి గుర్తింపు" },
  ur: { ...en, appTitle: "کرم-انٹیل OS", signIn: "سائن ان", badgeId: "بیج ID", password: "پاس ورڈ", vpnConnect: "محفوظ سرنگ قائم کریں", vpnDisconnect: "رابطہ منقطع", dashboard: "ڈیش بورڈ", cases: "مقدمات", graph: "گراف", analytics: "تجزیہ", patterns: "پیٹرن", geo: "جیو ٹائم لائن", ingest: "شمول", search: "تلاش", logout: "لاگ آؤٹ", accessGranted: "رسائی منظور", authFailed: "توثیق ناکام", secureTunnel: "محفوظ سرنگ", officerCredentials: "افسر شناخت" },
};

export function translate(locale: AppLocale, key: I18nKey): string {
  return STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key;
}

// Shell + shared-action translations for the major locales. Remaining
// locales fall back to the English base via the `{ ...en }` spread above.
const EXTRA: Partial<Record<AppLocale, Partial<Dict>>> = {
  hi: { commandOverview: "कमांड अवलोकन", graphWorkstation: "ग्राफ कार्यस्थान", threatPatterns: "खतरा पैटर्न और लीड", geoTimeline: "भू-स्थानिक और समयरेखा", sahayakAi: "सहायक AI", evidenceTriage: "साक्ष्य छंटाई कतार", cyberConsole: "साइबर कंसोल", myWorkspaces: "मेरे कार्यक्षेत्र", searchPlaceholder: "संदिग्ध, फोन, IMEI, बैंक VPA खोजें...", newCase: "नया मामला", dossier: "डोजियर", proceedings: "कार्यवाही", staging: "अंतर्ग्रहण पाइपलाइन", cyberCell: "साइबर सेल", accessRequests: "पहुंच अनुरोध", allCases: "सभी पंजीकृत मामले", migration: "हस्तांतरण और माइग्रेशन", collaboration: "राज्य सहयोग", cancel: "रद्द करें", save: "सहेजें", add: "जोड़ें", close: "बंद करें", language: "भाषा" },
  mr: { commandOverview: "कमांड आढावा", graphWorkstation: "आलेख कार्यस्थान", threatPatterns: "धोका नमुने आणि लीड", geoTimeline: "भू-स्थानिक आणि कालरेषा", sahayakAi: "सहायक AI", evidenceTriage: "पुरावा चाळणी रांग", cyberConsole: "सायबर कन्सोल", myWorkspaces: "माझी कार्यक्षेत्रे", searchPlaceholder: "संशयित, फोन, IMEI, बँक VPA शोधा...", newCase: "नवीन प्रकरण", dossier: "डोजियर", proceedings: "कार्यवाही", staging: "अंतर्ग्रहण पाइपलाइन", cyberCell: "सायबर सेल", accessRequests: "प्रवेश विनंत्या", allCases: "सर्व नोंदणीकृत प्रकरणे", migration: "हस्तांतरण आणि स्थलांतर", collaboration: "राज्य सहकार्य", cancel: "रद्द करा", save: "जतन करा", add: "जोडा", close: "बंद करा", language: "भाषा" },
  kn: { commandOverview: "ಕಮಾಂಡ್ ಅವಲೋಕನ", graphWorkstation: "ಗ್ರಾಫ್ ಕಾರ್ಯಸ್ಥಳ", threatPatterns: "ಬೆದರಿಕೆ ಮಾದರಿಗಳು ಮತ್ತು ಲೀಡ್‌ಗಳು", geoTimeline: "ಭೂ-ಸ್ಥಳ ಮತ್ತು ಕಾಲರೇಖೆ", sahayakAi: "ಸಹಾಯಕ್ AI", evidenceTriage: "ಸಾಕ್ಷ್ಯ ವಿಂಗಡಣಾ ಸರತಿ", cyberConsole: "ಸೈಬರ್ ಕನ್ಸೋಲ್", myWorkspaces: "ನನ್ನ ಕಾರ್ಯಕ್ಷೇತ್ರಗಳು", searchPlaceholder: "ಶಂಕಿತರು, ಫೋನ್‌ಗಳು, IMEI, ಬ್ಯಾಂಕ್ VPA ಹುಡುಕಿ...", newCase: "ಹೊಸ ಪ್ರಕರಣ", dossier: "ದಸ್ತಾವೇಜು", proceedings: "ಕ್ರಮಗಳು", staging: "ಒಳಸೇರ್ಪಡೆ ಪೈಪ್‌ಲೈನ್", cyberCell: "ಸೈಬರ್ ಸೆಲ್", accessRequests: "ಪ್ರವೇಶ ವಿನಂತಿಗಳು", allCases: "ಎಲ್ಲಾ ನೋಂದಾಯಿತ ಪ್ರಕರಣಗಳು", migration: "ಹಸ್ತಾಂತರ ಮತ್ತು ವಲಸೆ", collaboration: "ರಾಜ್ಯ ಸಹಯೋಗ", cancel: "ರದ್ದುಮಾಡಿ", save: "ಉಳಿಸಿ", add: "ಸೇರಿಸಿ", close: "ಮುಚ್ಚಿ", language: "ಭಾಷೆ" },
  ta: { commandOverview: "கட்டளை கண்ணோட்டம்", graphWorkstation: "வரைபட பணியிடம்", threatPatterns: "அச்சுறுத்தல் வடிவங்கள்", geoTimeline: "புவி-இட & காலவரிசை", sahayakAi: "சஹாயக் AI", evidenceTriage: "சான்று வரிசை", cyberConsole: "சைபர் கன்சோல்", myWorkspaces: "எனது பணியிடங்கள்", searchPlaceholder: "சந்தேகநபர்கள், தொலைபேசி, IMEI தேடுக...", newCase: "புதிய வழக்கு", dossier: "ஆவணம்", proceedings: "நடவடிக்கைகள்", staging: "உள்வாங்கு வரிசை", cyberCell: "சைபர் பிரிவு", accessRequests: "அணுகல் கோரிக்கைகள்", allCases: "அனைத்து வழக்குகள்", migration: "ஒப்படைப்பு & இடமாற்றம்", collaboration: "மாநில ஒத்துழைப்பு", cancel: "ரத்து", save: "சேமி", add: "சேர்", close: "மூடு", language: "மொழி" },
  te: { commandOverview: "కమాండ్ అవలోకనం", graphWorkstation: "గ్రాఫ్ కార్యస్థలం", threatPatterns: "ముప్పు నమూనాలు", geoTimeline: "భౌగోళిక & కాలరేఖ", sahayakAi: "సహాయక్ AI", evidenceTriage: "సాక్ష్యం క్యూ", cyberConsole: "సైబర్ కన్సోల్", myWorkspaces: "నా కార్యస్థలాలు", searchPlaceholder: "అనుమానితులు, ఫోన్లు, IMEI వెతకండి...", newCase: "కొత్త కేసు", dossier: "దస్తావేజు", proceedings: "చర్యలు", staging: "స్వీకరణ పైప్‌లైన్", cyberCell: "సైబర్ సెల్", accessRequests: "ప్రవేశ అభ్యర్థనలు", allCases: "అన్ని కేసులు", migration: "అప్పగింత & బదిలీ", collaboration: "రాష్ట్ర సహకారం", cancel: "రద్దు", save: "సేవ్", add: "జోడించు", close: "మూసివేయి", language: "భాష" },
  bn: { commandOverview: "কমান্ড ওভারভিউ", graphWorkstation: "গ্রাফ কর্মক্ষেত্র", threatPatterns: "হুমকি প্যাটার্ন ও লিড", geoTimeline: "ভূ-স্থান ও সময়রেখা", sahayakAi: "সহায়ক AI", evidenceTriage: "প্রমাণ সারি", cyberConsole: "সাইবার কনসোল", myWorkspaces: "আমার কর্মক্ষেত্র", searchPlaceholder: "সন্দেহভাজন, ফোন, IMEI খুঁজুন...", newCase: "নতুন মামলা", dossier: "ডোজিয়ার", proceedings: "কার্যবিবরণী", staging: "অন্তর্ভুক্তি পাইপলাইন", cyberCell: "সাইবার সেল", accessRequests: "অ্যাক্সেস অনুরোধ", allCases: "সমস্ত মামলা", migration: "হস্তান্তর ও মাইগ্রেশন", collaboration: "রাজ্য সহযোগিতা", cancel: "বাতিল", save: "সংরক্ষণ", add: "যোগ", close: "বন্ধ", language: "ভাষা" },
};
for (const [loc, dict] of Object.entries(EXTRA)) {
  Object.assign(STRINGS[loc as AppLocale], dict);
}
