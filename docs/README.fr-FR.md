[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Русский](README.ru-RU.md)

<p align="center">
  <img src="../assets/tracemind-logo.svg" alt="TraceMind logo" width="520">
</p>

<h1 align="center">TraceMind</h1>

<p align="center">
  <strong>Un atelier personnel de recherche alimenté par l'IA, conçu pour comprendre une direction de recherche, pas seulement obtenir une réponse rapide.</strong>
</p>

<p align="center">
  <a href="../LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-111827"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-ready-0f766e">
  <img alt="Evidence-first" src="https://img.shields.io/badge/research-evidence_first-f5b84b">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-8_languages-2563eb">
</p>

TraceMind part d'un constat simple : une seule avancée de recherche ne suffit presque jamais à rendre lisible toute l'évolution d'un domaine.

La recherche en IA actuelle est rapide, bruyante et très sensible aux tendances. Les résumés arrivent vite, mais la compréhension profonde s'accumule lentement. TraceMind pose donc une autre question : l'IA peut-elle suivre la littérature, accumuler des preuves et répondre à partir de cette mémoire, afin de devenir un assistant de recherche loyal et rigoureux ?

## Présentation du projet

TraceMind est un atelier personnel de recherche assisté par l'IA. Il s'adresse aux étudiants, chercheurs indépendants, ingénieurs, responsables techniques et analystes qui doivent transformer un grand volume de publications en une vision cohérente.

| Problème courant | Ce que TraceMind apporte |
| --- | --- |
| Trop d'articles, aucune ligne principale claire | cartes de sujet, graphes de nœuds, articles clés, progression réelle |
| Des réponses IA fluides mais peu fondées | réponses reliées aux articles, PDF, figures, formules et citations |
| Des bonnes questions dispersées dans les chats et notes | un espace thématique avec mémoire et export |
| Beaucoup de suivi des tendances, peu d'accumulation | des sujets qui grandissent à partir de matériaux réels |

## Intention

La recherche échoue souvent non pas faute d'information, mais faute d'accumulation de compréhension.

Les outils de chat généralistes répondent bien, mais conservent mal :
- pourquoi un jugement a été formulé
- quelles preuves le soutiennent
- ce qui reste incertain
- comment une direction évolue dans le temps

TraceMind s'organise autour de quatre principes :
- `la preuve avant l'impression`
- `la mémoire avant le chat`
- `la structure avant l'empilement`
- `le jugement humain au centre`

## Points forts

- `Les pages de sujet montrent un progrès réel` : les étapes viennent du matériau accumulé, pas d'un faux plan initial.
- `Les pages de nœud sont des vues de recherche structurées` : question centrale, articles clés, chaîne de preuves, méthodes, résultats, limites, controverses et jugement lisible.
- `La preuve reste visible` : PDF, figures, formules et citations demeurent proches du résultat final.
- `Les questions de suivi gardent leur contexte` : on ne repart pas de zéro dans une fenêtre de chat vide.
- `Pensé pour l'auto-hébergement` : vous gardez la main sur les modèles, les clés et les données.

## Démarrage rapide

Prérequis :
- Node.js `18+`
- npm `9+`
- Python `3.10+`
- une clé API pour au moins un fournisseur de modèles

Backend :

```bash
cd skills-backend
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

Frontend :

```bash
cd frontend
npm install
npm run dev
```

Adresses locales par défaut :
- frontend : `http://localhost:5173`
- backend health : `http://localhost:3303/health`

Docker :

```bash
docker compose up --build
```

## Les 15 premières minutes

1. Lancez le backend et le frontend.
2. Configurez au moins un fournisseur de modèles dans les paramètres.
3. Créez un sujet que vous voulez réellement suivre dans la durée.
4. Lancez la découverte d'articles et relisez les candidats.
5. Gardez seulement les articles qui appartiennent vraiment à la ligne de recherche.
6. Ouvrez une vue de recherche de nœud et lisez d'abord le brief structuré.
7. Posez une vraie question de test, par exemple : `Quelle est la preuve la plus faible dans cette branche ?`
8. Exportez le résultat ou continuez à enrichir le sujet.

## Comment fonctionne le flux

TraceMind traite la recherche comme une boucle :
- découvrir des articles
- filtrer et admettre les candidats
- extraire des preuves depuis les PDF
- construire des nœuds de recherche
- formuler des jugements d'étape
- poser des questions de suivi ancrées
- exporter des notes et rapports
- réinjecter le tout dans la mémoire du sujet

## Comparaison

| Outil | Excellente compétence | Place de TraceMind |
| --- | --- | --- |
| Zotero | collecte, annotation, citation | transforme la littérature en nœuds, preuves et jugements |
| NotebookLM | questions sur un corpus donné | conserve ces questions dans un sujet vivant |
| Elicit | recherche et revues | met davantage l'accent sur l'accumulation personnelle continue |
| Perplexity | réponses rapides sourcées | transforme une réponse ponctuelle en mémoire de sujet |
| Obsidian / Notion | notes personnelles | ajoute suivi de littérature et IA ancrée dans les preuves |
| ChatGPT / Claude | raisonnement, rédaction, dialogue | donne au modèle une salle de recherche plutôt qu'un chat vide |

## Fondations open source et références

TraceMind s'appuie sur des briques éprouvées :
- `React`, `Vite`
- `Express`, `Prisma`
- `SQLite`, `PostgreSQL`, `Redis`
- `PyMuPDF`
- `OpenAI`, `Anthropic`, `Google`
- `arXiv`, `OpenAlex`, `Crossref`, `Semantic Scholar`

Pour la clarté documentaire et la présentation publique, des projets comme `Supabase`, `Dify`, `LangChain`, `Immich`, `Next.js`, `Visual Studio Code`, `Excalidraw` et `Open WebUI` ont servi de référence de ton et de structure.

## Pour qui

TraceMind convient bien si vous :
- suivez une direction de recherche sur plusieurs semaines ou mois
- voulez comparer des articles au lieu de seulement les stocker
- rédigez des revues, notes techniques ou briefs de recherche
- souhaitez garder le contrôle sur vos données et vos modèles

Il est moins adapté si vous cherchez seulement :
- une réponse factuelle immédiate
- une réponse polie sans retour vers la preuve
- une base de connaissances d'entreprise générique

## Contribution, sécurité et licence

- Guide de contribution : [CONTRIBUTING.md](../CONTRIBUTING.md)
- Politique de sécurité : [SECURITY.md](../SECURITY.md)
- Licence : [MIT](../LICENSE)

## Mot de la fin

Il est difficile de voir clairement une direction de recherche à partir d'une seule avancée. C'est encore plus vrai dans un écosystème qui récompense la vitesse, les tendances et la nouveauté de surface.

TraceMind cherche à faire de l'IA un assistant qui suit la littérature, accumule les preuves et soutient les questions de suivi sur cette base. Pas une voix plus forte que la recherche elle-même, mais un outil pour en rendre la forme plus lisible.
