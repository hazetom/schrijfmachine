// Instellingen per apparaat (avondstand, volledig scherm, slimme aanhalingstekens).
// Klein en niet kritiek, dus in localStorage; als dat niet lukt gelden de standaardwaarden.

export const VERSIE = 6;

const STANDAARD = {
  avond: 'uit',          // uit | aan | auto (van 20:00 tot 7:00)
  volledigScherm: true,  // bij de eerste toets of klik naar volledig scherm
  typografie: true,      // “ ” ‘ ’ en … tijdens het typen
  kantlijnVast: false,   // hoofdstukken altijd links in beeld
  claude: null,          // laatste keuzes in "Klaar voor Claude"
};

const SLEUTEL = 'schrijfmachine-instellingen';
let waarden = { ...STANDAARD };
try {
  const ruw = localStorage.getItem(SLEUTEL);
  if (ruw) waarden = { ...STANDAARD, ...JSON.parse(ruw) };
} catch (e) { /* standaard */ }

export const instellingen = new EventTarget();

export function lees(naam) { return waarden[naam]; }

export function zet(naam, waarde) {
  waarden[naam] = waarde;
  try { localStorage.setItem(SLEUTEL, JSON.stringify(waarden)); } catch (e) { /* niet erg */ }
  instellingen.dispatchEvent(new CustomEvent('gewijzigd', { detail: { naam, waarde } }));
}

export function isAvond(nu = new Date()) {
  if (waarden.avond === 'aan') return true;
  if (waarden.avond === 'auto') { const u = nu.getHours(); return u >= 20 || u < 7; }
  return false;
}

export function pasThemaToe() {
  const avond = isAvond();
  document.documentElement.dataset.thema = avond ? 'avond' : 'dag';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', avond ? '#23221F' : '#E6E2D8');
}
