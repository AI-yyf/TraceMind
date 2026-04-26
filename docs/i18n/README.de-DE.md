# TraceMind

TraceMind ist eine KI-gestützte Forschungsumgebung für ernsthafte Recherche und Lektüre. Sie verbindet Paper Discovery, Evidenzextraktion, Forschungsnoten, Urteilsbildung und kontextgebundene Rückfragen in einem nachvollziehbaren Arbeitsfluss.

## Welches Problem Es Löst

- Forschungsmaterial liegt verstreut in Datenbanken, PDFs, Notizen und Chatverläufen.
- KI-Antworten klingen flüssig, aber der Evidenzpfad bleibt oft unsichtbar.
- Forschungsthemen entwickeln sich weiter, während normale Chats kein dauerhaftes Themen-Gedächtnis besitzen.

TraceMind hält Papers, Abbildungen, Formeln, Zitate, Knoten und Gespräche in einem gemeinsamen Kontext, damit Forschende die Belege hinter jeder Aussage prüfen können.

## Nutzung

1. Backend und Frontend starten.
2. In Settings ein Sprachmodell und optional ein Vision-Modell konfigurieren.
3. Ein Forschungsthema erstellen oder öffnen.
4. Paper Discovery ausführen und Kandidaten prüfen.
5. Knotenseiten mit Evidenz, Abbildungen, Formeln und Zitaten lesen.
6. Im Workbench-Kontext weiterfragen und Ergebnisse exportieren.

## Funktionsweise

TraceMind kombiniert ein React + Vite Frontend, ein Express + Prisma Backend, ein Omni Model Gateway und kuratierte generierte Daten. Das Backend aggregiert akademische Suchquellen, extrahiert PDF-Evidenz, baut Themenknoten auf und leitet Modellaufrufe über ein konfigurierbares Gateway.

## Referenz-Ökosystem

TraceMind nutzt oder referenziert React, Vite, Express, Prisma, Playwright, Vitest, PyMuPDF, arXiv, OpenAlex, Crossref, Semantic Scholar, Zotero und verwandte offene Forschungsinfrastruktur.
