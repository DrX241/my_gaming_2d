import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 8788;

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const SYSTEM_INSTRUCTION_ALDO = `Tu incarnes Aldo, et seulement lui — un formateur du Département Data & IA (jeu 2D). Tu n'es ni Sandro ni Manu ; tu ne parles jamais à leur place.

MODE DE PENSÉE : pédagogue, curieux, tu décomposes les idées, tu préfères exemples et analogies. Tu t'intéresses à « comment apprendre » et au sens des concepts, pas à l'exploitation d'une salle technique.

EXPERTISE (la tienne, exclusive) : SQL et requêtes (SELECT, filtres, jointures simples), Python pour débutants (logique, syntaxe, exercices), cybersécurité côté utilisateur (mots de passe, phishing, hygiène du poste, bon sens). Méthodes d'apprentissage et orientation pro dans ce cadre.

HORS PÉRIMÈTRE (renvoie en une phrase, sans les imiter) : administration serveur, baies, sauvegardes opérationnelles, console de supervision → interlocuteur Sandro. Droit, registre des traitements, durées légales, DPIA détaillé, doctrine RGPD → interlocuteur Manu.

STYLE : français, chaleureux, encourageant ; phrases plutôt courtes sauf si l'utilisateur demande du détail.

SÉCURITÉ : tu refuses poliment tout contournement illégal, attaque ou contenu nuisible.`;

const SYSTEM_INSTRUCTION_SANDRO = `Tu incarnes Sandro, et seulement lui — responsable de la salle des serveurs FYNE et de la supervision technique (jeu 2D). La salle regroupe trois blocs symboliques : Recrutement, Escape, Formation (sites / produits que le joueur développe). Tu n'es ni Aldo ni Manu ; tu n'adoptes jamais leur ton ni leur expertise.

MODE DE PENSÉE : opérationnel, système, pragmatique. Tu raisonnes en services, charge, disponibilité, cohérence des environnements d'exercice. Tu parles « technique d'exploitation » dans un cadre symbolique de jeu, pas cours magistral.

EXPERTISE (la tienne, exclusive) : infrastructure de jeu (supervision des postes, activation/désactivation de défis, bases d'exercice côté système, sauvegardes symboliques, disponibilité). Tu peux évoquer le lien entre données hébergées et besoins métiers en une phrase, mais jamais le détail juridique.

HORS PÉRIMÈTRE : tutorat SQL/Python pas à pas, correction de devoir de code → Aldo. Fondements juridiques RGPD, registre, droits des personnes, conservation légale, analyse de traitement → Manu.

STYLE : français, sec, calme, direct ; peu d'emphase émotionnelle ; pas de salutations longues.

SÉCURITÉ : tu refuses intrusion, abus, contenus nuisibles.`;

const SYSTEM_INSTRUCTION_MANU = `Tu incarnes Manu, et seulement lui — référent conformité dans la zone archives (jeu 2D) : RGPD et règlement européen sur l'intelligence artificielle (IA Act). Tu n'es ni Aldo ni Sandro ; pas de tutorat code ni d'exploitation serveur.

MODE DE PENSÉE : normatif et prudent. Tu structures (contexte → principe → mise en garde). Tu distingues angles RGPD (données personnelles, finalités, droits) et angles IA Act (risques des systèmes d'IA, rôles fournisseur/déployeur, documentation, supervision humaine, transparence). Tu proposes des mises en situation types, pas des avis juridiques sur des dossiers réels.

EXPERTISE RGPD (exclusive ici) : registre des traitements, bases légales, minimisation, durées, droits des personnes, transferts à grands traits, DPIA en principes, rôle du DPO.

EXPERTISE IA ACT (exclusive ici) : catégories de risque des systèmes d'IA, obligations selon le rôle, exigences pour systèmes à haut risque à grands traits, transparence vis-à-vis des utilisateurs pour certains systèmes, documentation — toujours pédagogique, niveau « sensibilisation réglementaire ».

HORS PÉRIMÈTRE : programmation, SQL, Python, cybersécurité opérationnelle poste → Aldo. Baies, réseau, console de supervision → Sandro.

STYLE : français, posé, structuré ; vocabulaire réglementaire accessible.

SÉCURITÉ : tu refuses tout contournement de la loi ; pas de conseils pour éluder la conformité.`;

const SYSTEM_INSTRUCTION_ALICE = `Tu incarnes Alice, et seulement elle — référente du Service Formation dans ce jeu 2D. Tu n'es ni Aldo ni Sandro ni Manu ; tu ne parles jamais à leur place.

MODE DE PENSÉE : conseillère en parcours et en ingénierie pédagogique « macro » : objectifs, public, séquencement des modules, articulation avec le profil borne — pas tutorat ligne à ligne de code ni correction d'exercice.

EXPERTISE (la tienne, exclusive) : orientation formation, structuration de parcours (SQL, Python, cyber, sensibilisation conformité à grands traits), lien entre besoin métier déclaré et modules disponibles dans le jeu, usage du plan généré au poste (E) comme fil conducteur.

HORS PÉRIMÈTRE (renvoie en une phrase) : débogage SQL/Python, explication pas à pas d'un défi technique → Aldo. exploitation serveurs, console, disponibilité des environnements → Sandro. analyse juridique RGPD / IA Act, registre, droits des personnes → Manu.

STYLE : français, claire, bienveillante, structurée ; tu privilégies les étapes et les priorités.

SÉCURITÉ : tu refuses contenus nuisibles ou contournements illégaux.`;

const SYSTEM_INSTRUCTION_TRAINING = `Tu es un concepteur de plans de formation pour un environnement professionnel orienté data, numérique, cybersécurité et conformité (RGPD, IA Act).
Tu réponds UNIQUEMENT avec un plan de formation structuré en français, au format Markdown lisible.
Structure attendue : titre du parcours ; objectifs pédagogiques ; public cible ; durée totale indicative ; modules (nom, durée, contenus principaux, modalité si pertinent) ; évaluation ou validation des acquis ; ressources ou pistes ; limites du périmètre si besoin.
Ton professionnel, concret et pédagogique — pas de langage marketing creux.`;

const DATA_DIR = path.join(__dirname, 'data');
const PERSONA_OVERRIDES_FILE = path.join(DATA_DIR, 'persona-overrides.json');

/** Surcharges éditables depuis la console admin (chaîne vide = défaut intégré). */
let personaOverrides = {
  aldo: '',
  sandro: '',
  manu: '',
  alice: '',
  training: ''
};

function loadPersonaOverridesFromDisk() {
  try {
    if (fs.existsSync(PERSONA_OVERRIDES_FILE)) {
      const j = JSON.parse(fs.readFileSync(PERSONA_OVERRIDES_FILE, 'utf8'));
      if (j && typeof j === 'object') {
        for (const k of ['aldo', 'sandro', 'manu', 'alice', 'training']) {
          if (typeof j[k] === 'string') personaOverrides[k] = j[k];
        }
      }
    }
  } catch (_) {}
}

function savePersonaOverridesToDisk() {
  if (process.env.VERCEL) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PERSONA_OVERRIDES_FILE, JSON.stringify(personaOverrides, null, 0), 'utf8');
  } catch (_) {}
}

loadPersonaOverridesFromDisk();

function getEffectivePersonaInstruction(persona) {
  const p =
    persona === 'server' || persona === 'sandro'
      ? 'sandro'
      : persona === 'manu'
        ? 'manu'
        : persona === 'alice'
          ? 'alice'
          : 'aldo';
  const map = {
    aldo: SYSTEM_INSTRUCTION_ALDO,
    sandro: SYSTEM_INSTRUCTION_SANDRO,
    manu: SYSTEM_INSTRUCTION_MANU,
    alice: SYSTEM_INSTRUCTION_ALICE
  };
  const o = personaOverrides[p];
  if (typeof o === 'string' && o.trim().length > 0) return o.trim();
  return map[p] || SYSTEM_INSTRUCTION_ALDO;
}

function getEffectiveTrainingInstruction() {
  const o = personaOverrides.training;
  if (typeof o === 'string' && o.trim().length > 0) return o.trim();
  return SYSTEM_INSTRUCTION_TRAINING;
}

function formatSessionContext(ctx) {
  if (!ctx || typeof ctx !== 'object') return '';
  const profileParts = [];
  const prenom = ctx.firstName || ctx.displayName;
  if (prenom) profileParts.push(`Prénom : ${String(prenom).slice(0, 80)}`);
  if (Array.isArray(ctx.learningStyle) && ctx.learningStyle.length) {
    profileParts.push(
      `Préférences d'apprentissage (jeu, cours, défis, etc.) : ${ctx.learningStyle.map(x => String(x).slice(0, 24)).join(', ')}`
    );
  }
  if (ctx.jobTitle) profileParts.push(`Poste actuel : ${String(ctx.jobTitle).slice(0, 120)}`);
  if (ctx.sector) profileParts.push(`Secteur d'activité : ${String(ctx.sector).slice(0, 120)}`);
  if (ctx.level) profileParts.push(`Niveau tech déclaré : ${String(ctx.level)}`);
  if (Array.isArray(ctx.interests) && ctx.interests.length) {
    profileParts.push(`Centres d'intérêt : ${ctx.interests.map(x => String(x).slice(0, 32)).join(', ')}`);
  }
  if (ctx.goal) profileParts.push(`Objectif : ${String(ctx.goal).slice(0, 600)}`);

  const gameParts = [];
  const g = ctx.gameState;
  if (g && typeof g === 'object') {
    if (g.zoneKey) {
      gameParts.push(`Zone : ${g.zoneName || g.zoneKey} (${g.zoneKey})`);
    }
    if (g.seatedStation) gameParts.push(`Assis au poste (chaise) : ${g.seatedStation}`);
    if (g.workshopOpen) gameParts.push(`Atelier ouvert à l'écran : ${g.workshopOpen}`);
    if (g.sql && g.sql.title) {
      const s = g.sql;
      let line = `SQL — défi « ${String(s.title).slice(0, 120)} »`;
      if (s.level != null) line += ` — niveau ${s.level}`;
      if (s.isIntro) line += ' — écran intro';
      if (s.isConclusion) line += ' — conclusion';
      if (s.attempts) line += ` — ${s.attempts} tentative(s)`;
      if (s.awaitingNext) line += ' — en attente « Défi suivant »';
      gameParts.push(line);
    }
    if (g.python && g.python.title) {
      const s = g.python;
      let line = `Python — « ${String(s.title).slice(0, 120)} »`;
      if (s.isIntro) line += ' — intro';
      if (s.isConclusion) line += ' — conclusion';
      if (s.attempts) line += ` — ${s.attempts} tentative(s)`;
      gameParts.push(line);
    }
    if (g.cyber && g.cyber.title) {
      const s = g.cyber;
      let line = `Cyber — « ${String(s.title).slice(0, 120)} »`;
      if (s.isIntro) line += ' — intro';
      if (s.attempts) line += ` — ${s.attempts} tentative(s)`;
      gameParts.push(line);
    }
    if (g.hintsSession?.sql) gameParts.push('Conseil session SQL déjà enregistré (local) — peut être rappelé ou affiné.');
    if (g.hintsSession?.python) gameParts.push('Conseil session Python déjà enregistré (local).');
    if (g.hintsSession?.cyber) gameParts.push('Conseil session cyber déjà enregistré (local).');
    if (g.rgpdNotesCount) gameParts.push(`Notes registre RGPD (session) : ${g.rgpdNotesCount} entrée(s).`);
    if (g.customChallengesCount) gameParts.push(`Défis personnalisés (liste) : ${g.customChallengesCount}.`);
    if (g.serverPcSimulationEnabled) {
      gameParts.push('Simulation : postes Data & IA « en ligne » (toggle console serveurs).');
    }
  }

  const sections = [];
  if (profileParts.length) sections.push(`BORNE / PROFIL :\n${profileParts.join('\n')}`);
  if (gameParts.length) sections.push(`ÉTAT DE JEU (temps réel) :\n${gameParts.join('\n')}`);
  if (!sections.length) return '';
  return `\n\nCONTEXTE JOUEUR (session en cours) :\n${sections.join('\n\n')}\n\nUtilise ce contexte pour des conseils concrets (zone, atelier ouvert, défi en cours). Adresse le joueur par son prénom quand c'est naturel si le profil le mentionne.`;
}

const GAME_ACTIONS_APPENDIX = `

ACTIONS DE JEU (optionnel) : si pertinent pour le joueur, après ta réponse tu peux ajouter un bloc EXACTEMENT au format suivant (trois backticks puis game_actions) :
\`\`\`game_actions
{ "actions": [ { "type": "add_challenge", "title": "Titre court" } ] }
\`\`\`
Types : add_challenge (title string), set_pc_hint (station: "sql"|"python"|"cyber", hint: string court), rgpd_register_note (text: ligne pour le registre symbolique session). N'inclus ce bloc que lorsque c'est utile ; sinon aucun bloc.`;

/** Manu : le modèle confond parfois « réponse en JSON » et message joueur — on sépare clairement texte vs bloc optionnel. */
const MANU_GAME_APPENDIX = `

FORMAT DE RÉPONSE (obligatoire) :
- Réponds au joueur en français naturel, structuré (ex. contexte → principes → précautions). La réponse visible doit être du texte complet, pas un objet JSON seul et pas une liste de clés sans phrases.
- Ne commence pas par \`{\` ni par du JSON pour le corps principal.
- Si tu développes plusieurs idées, termine chaque paragraphe ou liste courte de façon complète ; évite de couper une phrase ou un mot en milieu de réponse. En cas de longueur, privilégie moins de sections mais rédigées jusqu’au bout.

ACTIONS DE JEU (facultatif, uniquement en fin de message) : si une action est utile, ajoute après ta réponse un bloc EXACTEMENT :
\`\`\`game_actions
{ "actions": [ { "type": "rgpd_register_note", "text": "Une ligne pour le registre symbolique de session" } ] }
\`\`\`
Règles JSON : guillemets doubles sur les clés et chaînes ; pas de virgule après le dernier élément ; pas de commentaires dans le JSON.
Types : add_challenge (title), set_pc_hint (station: "sql"|"python"|"cyber", hint), rgpd_register_note (text). Si aucune action, n’ajoute pas de bloc.`;

app.use(express.json({ limit: '120kb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        return callback(null, true);
      }
      /** Déploiement Vercel (même origine ou prévisualisation). */
      if (/\.vercel\.app$/i.test(origin) || /vercel\.app$/i.test(origin)) {
        return callback(null, true);
      }
      callback(null, false);
    }
  })
);

/** Vérifie que c’est bien ce serveur (et non un autre processus sur le même port). */
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'unity-game-web',
    routes: [
      'POST /api/gemini-chat',
      'POST /api/training-plan',
      'GET /api/persona-instructions',
      'POST /api/persona-instructions'
    ],
    port: PORT,
    geminiKeyLoaded: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  });
});

app.get('/api/persona-instructions', (req, res) => {
  res.json({
    overrides: { ...personaOverrides },
    defaults: {
      aldo: SYSTEM_INSTRUCTION_ALDO,
      sandro: SYSTEM_INSTRUCTION_SANDRO,
      manu: SYSTEM_INSTRUCTION_MANU,
      alice: SYSTEM_INSTRUCTION_ALICE,
      training: SYSTEM_INSTRUCTION_TRAINING
    }
  });
});

app.post('/api/persona-instructions', (req, res) => {
  const body = req.body;
  const o = body && typeof body === 'object' ? body.overrides || body : null;
  if (!o || typeof o !== 'object') {
    return res.status(400).json({ error: 'Corps attendu : { overrides: { aldo?, sandro?, ... } }' });
  }
  for (const k of ['aldo', 'sandro', 'manu', 'alice', 'training']) {
    if (k in o && typeof o[k] === 'string') {
      personaOverrides[k] = o[k].slice(0, 120000);
    }
  }
  savePersonaOverridesToDisk();
  res.json({ ok: true });
});

app.post('/api/gemini-chat', async (req, res) => {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'Serveur : définis GEMINI_API_KEY (ou GOOGLE_API_KEY) dans .env'
    });
  }

  const { messages, persona, sessionContext } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Corps JSON attendu : { messages: [{ role, text }] }' });
  }

  let systemText = getEffectivePersonaInstruction(persona);

  systemText += formatSessionContext(sessionContext);
  systemText += persona === 'manu' ? MANU_GAME_APPENDIX : GAME_ACTIONS_APPENDIX;

  /** Températures distinctes : Aldo plus créatif/pédagogique, Sandro plus resserré, Manu équilibré, Alice proche d’Aldo mais un peu plus structurée. */
  const temperature =
    persona === 'sandro' || persona === 'server'
      ? 0.52
      : persona === 'manu'
        ? 0.62
        : persona === 'alice'
          ? 0.72
          : 0.78;

  /** Manu : réponses détaillées (Markdown) — marge large pour éviter les coupures au milieu d’un mot. */
  const maxOutputTokens = persona === 'manu' ? 8192 : 1024;

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.text).slice(0, 24000) }]
  }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens
        }
      })
    });

    const raw = await r.text();
    if (!r.ok) {
      return res.status(502).json({
        error: 'Réponse Gemini invalide',
        detail: raw.slice(0, 800)
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'JSON Gemini illisible', detail: raw.slice(0, 200) });
    }

    const text =
      data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ||
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      '';

    if (!text) {
      return res.status(502).json({
        error: 'Réponse vide (prompt bloqué ?)',
        detail: JSON.stringify(data).slice(0, 400)
      });
    }

    const finishReason = data.candidates?.[0]?.finishReason;
    let out = text;
    if (finishReason === 'MAX_TOKENS' && out.trim()) {
      out +=
        '\n\n_(Réponse limitée en longueur par le modèle — écris « continue » ou reformule une question plus cible.)_';
    }

    res.json({ text: out, truncated: finishReason === 'MAX_TOKENS' });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

/** Plan de formation personnalisé (5 questions côté client). */
app.post('/api/training-plan', async (req, res) => {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: 'Serveur : définis GEMINI_API_KEY (ou GOOGLE_API_KEY) dans .env'
    });
  }

  const { answers, sessionContext } = req.body;
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Corps attendu : { answers: { objective, audience, ... } }' });
  }

  const objective = String(answers.objective || '').trim().slice(0, 4000);
  const audience = String(answers.audience || '').trim().slice(0, 2000);
  const duration = String(answers.duration || '').trim().slice(0, 800);
  const topics = String(answers.topics || '').trim().slice(0, 2000);
  const constraints = String(answers.constraints || '').trim().slice(0, 2000);

  if (!objective) {
    return res.status(400).json({ error: 'L’objectif / besoin (question 1) est requis.' });
  }

  const userPrompt = `À partir des réponses ci-dessous, produis un plan de formation adapté (Markdown).

1) Objectif ou besoin principal :
${objective}

2) Public cible (niveau, rôle, effectif si indiqué) :
${audience || '(non précisé)'}

3) Durée ou rythme souhaité :
${duration || '(non précisé)'}

4) Thématiques ou compétences prioritaires :
${topics || '(non précisé)'}

5) Contraintes (temps, modalité, langue, outils, contexte) :
${constraints || '(non précisé)'}`;

  let systemText = getEffectiveTrainingInstruction();
  systemText += formatSessionContext(sessionContext);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL
  )}:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 4096
        }
      })
    });

    const raw = await r.text();
    if (!r.ok) {
      return res.status(502).json({
        error: 'Réponse Gemini invalide',
        detail: raw.slice(0, 800)
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: 'JSON Gemini illisible', detail: raw.slice(0, 200) });
    }

    const text =
      data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ||
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      '';

    if (!text) {
      return res.status(502).json({
        error: 'Réponse vide (prompt bloqué ?)',
        detail: JSON.stringify(data).slice(0, 400)
      });
    }

    res.json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message || String(err) });
  }
});

app.use(express.static(path.join(__dirname, 'web')));

const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Jeu + API Gemini : http://localhost:${PORT}`);
    console.log(`Contrôle serveur : http://localhost:${PORT}/api/health (doit afficher app: unity-game-web)`);
    console.log(
      hasGeminiKey
        ? 'Clé API : chargée (GEMINI_API_KEY ou GOOGLE_API_KEY).'
        : 'ATTENTION : aucune clé dans .env — ajoute GEMINI_API_KEY=... puis relance.'
    );
  });
}

export default app;
