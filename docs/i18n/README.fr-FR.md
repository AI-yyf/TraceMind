# TraceMind

TraceMind est un atelier personnel de recherche assisté par IA pour la lecture et l'investigation exigeantes. Il relie découverte d'articles, extraction de preuves, nœuds de recherche, rédaction de jugement et questions contextualisées dans une boucle traçable.

Ce n'est pas seulement un chatbot ou une liste d'articles, mais un espace durable pour faire évoluer un sujet de recherche personnel.

## Problème Résolu

- Les matériaux de recherche sont dispersés entre bases d'articles, PDF, notes et historiques de discussion.
- Les réponses IA peuvent être fluides tout en masquant le chemin des preuves.
- Les sujets de recherche évoluent, mais les outils de chat ordinaires n'ont pas de mémoire durable du sujet.

TraceMind place articles, figures, formules, citations, nœuds et conversations dans un même contexte afin que les chercheurs puissent examiner les preuves derrière chaque affirmation.

## Utilisation

1. Lancez le backend et le frontend.
2. Configurez un modèle de langage et, si nécessaire, un modèle visuel dans Settings.
3. Créez ou ouvrez un sujet de recherche.
4. Lancez la découverte d'articles et examinez les candidats.
5. Lisez les pages de nœuds avec preuves, figures, formules et citations.
6. Continuez les questions ancrées dans le workbench et exportez les résultats.

## Fonctionnement

TraceMind combine un frontend React + Vite, un backend Express + Prisma, une passerelle de modèles Omni et des données générées organisées. Le backend agrège des sources académiques, extrait les preuves des PDF, construit des nœuds de sujet et route les appels de modèles via une passerelle configurable.

## Écosystème De Référence

TraceMind utilise ou référence React, Vite, Express, Prisma, Playwright, Vitest, PyMuPDF, arXiv, OpenAlex, Crossref, Semantic Scholar, Zotero et d'autres infrastructures académiques ouvertes.
