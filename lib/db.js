const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FILE = path.join(__dirname, '..', 'data', 'db.json');
const hash = (p) => crypto.createHash('sha256').update(p).digest('hex');
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
const dayOnly = (n) => inDays(n).slice(0, 10);

function seed() {
  const db = {
    seq: 1,
    sessions: {},
    users: [],
    annonces: [],
    favoris: [],
    visites: [],
    messages: [],
    paiements: [],
    avis: [],
    evenements: []
  };
  const nid = () => db.seq++;

  const user = (nom, prenom, email, mdp, role, jours) => {
    const u = {
      id: nid(), nom, prenom, email, mdp: hash(mdp), role,
      telephone: '+221 77 000 00 00', whatsapp: '+221 77 000 00 00',
      creeLe: inDays(jours)
    };
    db.users.push(u);
    return u;
  };

  const admin = user('Sall', 'Awa', 'admin@tanal.sn', 'admin123', 'admin', -120);
  const mady = user('Mbedji', 'Mady', 'bailleur@tanal.sn', 'bailleur123', 'bailleur', -90);
  const aminata = user('Ndiaye', 'Aminata', 'aminata@tanal.sn', 'bailleur123', 'bailleur', -80);
  const diop = user('Nssame', 'Diop', 'diop@tanal.sn', 'bailleur123', 'bailleur', -60);
  const jean = user('Dupont', 'Jean', 'etudiant@tanal.sn', 'etudiant123', 'etudiant', -45);
  const amadou = user('Diallo', 'Amadou', 'amadou@tanal.sn', 'etudiant123', 'etudiant', -40);

  const annonce = (bailleur, titre, type, quartier, prix, photo, statut, jours, boost) => {
    const a = {
      id: nid(), bailleurId: bailleur.id, titre, type, quartier, prix, photo,
      description: `${titre}. Logement propre et sécurisé, proche des universités et des commodités. Eau et électricité disponibles, quartier calme.`,
      statut, creeLe: inDays(jours), boost: boost || null
    };
    db.annonces.push(a);
    return a;
  };

  const a1 = annonce(mady, 'Studio étudiant meublé - Point E', 'Studio', 'Point E', 85000, 'room1', 'approuvee', -20, { formule: 'premium', jours: 7, jusquAu: inDays(5) });
  const a2 = annonce(aminata, 'Chambre indépendante chez l\'habitant - Yoff', 'Chambre', 'Yoff', 45000, 'room3', 'approuvee', -18);
  const a3 = annonce(mady, 'Appartement T3 lumineux - Almadies', 'Appartement', 'Almadies', 250000, 'room4', 'approuvee', -16);
  const a4 = annonce(diop, 'Studio moderne proche UCAD - Dakar Plateau', 'Studio', 'Dakar Plateau', 95000, 'room1', 'approuvee', -15);
  const a5 = annonce(aminata, 'Colocation 3 chambres - Mermoz', 'Colocation', 'Mermoz', 65000, 'room2', 'approuvee', -14, { formule: 'standard', jours: 3, jusquAu: inDays(-2) });
  const a6 = annonce(mady, 'Chambre meublée avec salon - Sacré-Cœur', 'Chambre', 'Sacré-Cœur', 75000, 'room3', 'approuvee', -12);
  const a7 = annonce(diop, 'Studio neuf cité Keur Gorgui - Ouakam', 'Studio', 'Ouakam', 70000, 'room1', 'approuvee', -10);
  const a8 = annonce(aminata, 'Appartement T2 rénové - Fann', 'Appartement', 'Fann', 150000, 'room4', 'approuvee', -8);
  const a9 = annonce(diop, 'Chambre étudiante calme - Grand Yoff', 'Chambre', 'Grand Yoff', 40000, 'room3', 'approuvee', -6);
  annonce(mady, 'Studio à louer - Médina', 'Studio', 'Médina', 55000, 'room1', 'rejectee', -25);

  const enAttente = [
    [mady, 'Studio meublé avec kitchenette - Mermoz', 'Studio', 'Mermoz', 90000, 'room1'],
    [mady, 'Chambre spacieuse proche arrêt bus - Grand Yoff', 'Chambre', 'Grand Yoff', 42000, 'room3'],
    [aminata, 'Appartement T2 meublé - Point E', 'Appartement', 'Point E', 180000, 'room4'],
    [aminata, 'Colocation 2 chambres étudiantes - Yoff', 'Colocation', 'Yoff', 60000, 'room2'],
    [diop, 'Studio neuf avec terrasse - Ouakam', 'Studio', 'Ouakam', 78000, 'room1'],
    [diop, 'Chambre indépendante clôturée - Médina', 'Chambre', 'Médina', 38000, 'room3'],
    [mady, 'Appartement T3 vue mer - Almadies', 'Appartement', 'Almadies', 300000, 'room4'],
    [aminata, 'Studio calme résidence sécurisée - Sacré-Cœur', 'Studio', 'Sacré-Cœur', 88000, 'room1'],
    [diop, 'Chambre meublée tout inclus - Fann', 'Chambre', 'Fann', 65000, 'room3'],
    [mady, 'Colocation 4 chambres - Dakar Plateau', 'Colocation', 'Dakar Plateau', 70000, 'room2'],
    [aminata, 'Studio rénové proche université - Grand Yoff', 'Studio', 'Grand Yoff', 52000, 'room1'],
    [diop, 'Appartement T2 familial - Mermoz', 'Appartement', 'Mermoz', 160000, 'room4']
  ];
  enAttente.forEach(([b, t, ty, q, p, ph], i) => annonce(b, t, ty, q, p, ph, 'en_attente', -(i + 1)));

  [a1, a2, a3, a5, a6, a8, a9].forEach((a) => db.favoris.push({ id: nid(), etudiantId: jean.id, annonceId: a.id }));

  const visite = (etudiant, a, date, heure, statut) => {
    const v = { id: nid(), etudiantId: etudiant.id, annonceId: a.id, date, heure, statut };
    db.visites.push(v);
    return v;
  };
  visite(jean, a1, dayOnly(1), '10:00', 'en_attente');
  visite(jean, a5, dayOnly(2), '10:00', 'en_attente');
  visite(jean, a6, dayOnly(-3), '14:00', 'confirmee');
  visite(amadou, a2, dayOnly(1), '16:00', 'en_attente');

  const message = (from, to, a, texte, lu, jours) => {
    db.messages.push({ id: nid(), fromId: from.id, toId: to.id, annonceId: a ? a.id : null, texte, lu, date: inDays(jours) });
  };
  message(jean, mady, a1, 'Bonjour, le studio est-il toujours disponible ?', true, -2);
  message(mady, jean, a1, 'Bonjour Jean, oui le studio est toujours disponible.', false, -1);
  message(mady, jean, a1, 'Quand souhaitez-vous passer pour une visite ?', false, -1);
  message(amadou, aminata, a2, 'Bonjour madame, je suis intéressé par la chambre.', true, -3);
  message(aminata, amadou, a2, 'Bonjour, elle est libre immédiatement.', true, -2);

  const paiement = (a, formule, jours, montant, mode, j) => {
    db.paiements.push({ id: nid(), annonceId: a.id, bailleurId: a.bailleurId, formule, jours, montant, mode, date: inDays(j) });
  };
  paiement(a1, 'premium', 7, 35000, 'Wave', -2);
  paiement(a5, 'standard', 3, 7500, 'Orange Money', -5);

  const avi = (a, etudiant, note, texte, jours) => {
    db.avis.push({ id: nid(), annonceId: a.id, etudiantId: etudiant.id, note, texte, date: inDays(jours) });
  };
  avi(a5, jean, 5, 'Logement très propre, bailleur réactif.', -7);
  avi(a2, amadou, 4, 'Bon rapport qualité-prix, quartier calme.', -5);
  avi(a1, jean, 4, 'Studio conforme aux photos.', -3);

  const ev = (texte, jours) => db.evenements.push({ id: nid(), texte, date: inDays(jours) });
  ev('Nouvelle inscription bailleur : Nssame Diop', -60);
  ev('Annonce approuvée : Appartement T2 rénové - Fann', -7);
  ev('Paiement boost Premium (35.000 FCFA) : Studio étudiant meublé - Point E', -2);
  ev('12 annonces en attente de validation', -1);

  return db;
}

let db;
if (fs.existsSync(FILE)) {
  db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} else {
  db = seed();
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

module.exports = { db, save, hash };
