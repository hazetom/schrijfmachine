// Het spiekbriefje naast de tekst (Ctrl+Alt+N): alles over het hoofdstuk waar je in zit,
// zonder je pagina te verlaten. Scènedoel, de samenvatting van het vorige hoofdstuk,
// wie erin voorkomt (een klik opent de kaart hier), de aantekeningen en snel een idee noteren.

import { store } from './store.js';
import { el } from './ui.js';
import { aanwezig } from './personages.js';
import { fragment } from './aantekeningen.js';
import { Notities } from './notes.js';

export class Spiek {
  constructor({ openAantekening, openMoment }) {
    this.paneel = document.getElementById('notities');
    this.cb = { openAantekening };
    this.inhoud = el('div', { class: 'spiek' });
    this.kaartVak = el('div', { class: 'spiek-kaart', hidden: true });
    this.paneel.append(this.inhoud, this.kaartVak);
    this.kaart = new Notities({ root: el('div'), tabs: ['personages'], zonderLijst: true, openMoment });
    this.kaartVak.append(
      el('button', { class: 'knop link spiek-terug', text: 'Terug naar dit hoofdstuk', onclick: () => this.toonOverzicht() }),
      this.kaart.root);
    this.persoon = null;
  }

  get open() { return !this.paneel.hidden; }

  toon(persoonId = null) {
    this.paneel.hidden = false;
    this.paneel.closest('.schrijfvlak').classList.add('met-notities');
    if (persoonId) this.toonKaart(persoonId); else this.toonOverzicht();
  }

  verberg() {
    this.kaart.bewaar();
    this.paneel.hidden = true;
    this.paneel.closest('.schrijfvlak').classList.remove('met-notities');
  }

  bewaar() { this.kaart.bewaar(); }

  toonKaart(id) {
    this.kaart.bewaar();
    this.persoon = id;
    this.inhoud.hidden = true;
    this.kaartVak.hidden = false;
    this.kaart.toon('personages', id);
  }

  toonOverzicht() {
    this.kaart.bewaar();
    this.persoon = null;
    this.kaartVak.hidden = true;
    this.inhoud.hidden = false;
    this.render();
  }

  // opnieuw tekenen als er iets veranderde (ander hoofdstuk, nieuwe aantekening), maar niet tijdens het typen erin
  werkBij() {
    if (!this.open || !this.inhoud.offsetParent) return;
    if (this.inhoud.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;
    this.render();
  }

  render() {
    const p = this.inhoud;
    p.innerHTML = '';
    const h = store.huidig();
    if (!h) return;
    const v = store.meta.volgorde;
    const vorige = store.hoofdstuk(v[v.indexOf(h.id) - 1]);
    const nr = store.nummer(h.id);
    p.append(el('p', { class: 'spiek-kop', text: 'Bij dit hoofdstuk' }),
      el('h2', { class: 'spiek-titel', text: (nr == null ? '' : nr + '. ') + (h.titel || 'Zonder titel') }));

    // scènedoel, hier ook te bewerken
    const doel = el('textarea', { rows: '2', 'aria-label': 'Scènedoel', placeholder: 'Wat moet dit hoofdstuk doen?' });
    doel.value = h.doel || '';
    const groei = () => { doel.style.height = 'auto'; doel.style.height = doel.scrollHeight + 'px'; };
    doel.addEventListener('input', () => { store.wijzigHoofdstuk(h.id, { doel: doel.value }); groei(); });
    p.append(el('div', { class: 'spiek-blok' }, el('span', { class: 'label', text: 'Scènedoel' }), doel));
    requestAnimationFrame(groei);

    const samen = el('textarea', { rows: '2', 'aria-label': 'Samenvatting', placeholder: 'Een paar zinnen: wat gebeurt er?' });
    samen.value = h.samenvatting || '';
    const groeiS = () => { samen.style.height = 'auto'; samen.style.height = samen.scrollHeight + 'px'; };
    samen.addEventListener('input', () => { store.wijzigHoofdstuk(h.id, { samenvatting: samen.value }); groeiS(); });
    p.append(el('div', { class: 'spiek-blok' }, el('span', { class: 'label', text: 'Samenvatting' }), samen));
    requestAnimationFrame(groeiS);

    if (vorige) {
      p.append(el('div', { class: 'spiek-blok' }, el('span', { class: 'label', text: 'Vorig hoofdstuk: ' + (vorige.titel || 'Zonder titel') }),
        vorige.samenvatting ? el('p', { text: vorige.samenvatting }) : el('p', { class: 'leeg-hint', text: 'Nog geen samenvatting. Die vul je in bij Boek, of laat Claude hem maken.' })));
    }

    const wie = aanwezig(h);
    p.append(el('div', { class: 'spiek-blok' }, el('span', { class: 'label', text: 'Wie komt erin voor' }),
      wie.length
        ? el('div', { class: 'hs-personen' }, ...wie.map(({ persoon, aantal }) => el('button', { class: 'hs-persoon', title: 'Kaart van ' + persoon.naam, onclick: () => this.toonKaart(persoon.id) },
          persoon.kleur ? el('span', { class: 'vlak', style: { backgroundColor: persoon.kleur } }) : null, el('span', { class: 'naam', text: persoon.naam }), el('span', { class: 'aantal', text: String(aantal) }))))
        : el('p', { class: 'leeg-hint', text: 'Nog niemand van je cast. Personages maak je bij Boek > Personages.' })));

    const ant = store.aantekeningen(h.id).filter((a) => !a.klaar);
    const antBlok = el('div', { class: 'spiek-blok' }, el('span', { class: 'label', text: 'Aantekeningen hier' }));
    if (!ant.length) antBlok.append(el('p', { class: 'leeg-hint', text: 'Geen open aantekeningen. Zet je cursor ergens en druk Ctrl+Alt+A.' }));
    for (const a of ant) {
      antBlok.append(el('div', { class: 'ant-rij' },
        el('button', { class: 'ant-tekst', onclick: () => this.cb.openAantekening(h.id, a) }, el('span', { text: a.tekst }), el('span', { class: 'ant-waar', text: fragment(h, a) })),
        el('button', { class: 'knop link', text: 'Klaar', onclick: () => { store.wijzigAantekening(h.id, a.id, { klaar: true }); this.render(); } })));
    }
    p.append(antBlok);

    // snel een idee: komt bij Aantekeningen > Ideeën, met het hoofdstuk erbij
    const idee = el('textarea', { rows: '2', class: 'spiek-idee', 'aria-label': 'Snel een idee', placeholder: 'Snel een idee noteren (Ctrl+Enter)' });
    const bewaarIdee = () => {
      const t = idee.value.trim();
      if (!t) return;
      const eerste = t.split('\n')[0];
      store.nieuweNotitie('ideeen', { naam: eerste.length > 60 ? eerste.slice(0, 57) + '…' : eerste, md: t + '\n\n*Bij ' + (h.titel || 'Zonder titel') + '*' });
      idee.value = '';
      knop.textContent = 'Bewaard bij Ideeën';
      setTimeout(() => { knop.textContent = 'Bewaar idee'; }, 2500);
    };
    idee.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); bewaarIdee(); } });
    const knop = el('button', { class: 'knop link', text: 'Bewaar idee', onclick: bewaarIdee });
    p.append(el('div', { class: 'spiek-blok' }, el('span', { class: 'label', text: 'Idee' }), idee, el('div', {}, knop)));
  }
}
