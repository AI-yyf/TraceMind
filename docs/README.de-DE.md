[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Русский](README.ru-RU.md)

<p align="center">
  <img src="../assets/tracemind-logo.svg" alt="TraceMind logo" width="520">
</p>

<h1 align="center">TraceMind</h1>

<p align="center">
  <strong>Eine KI-gestützte persönliche Forschungswerkbank für Menschen, die eine Richtung verstehen wollen, nicht nur eine schnelle Antwort.</strong>
</p>

<p align="center">
  <a href="../LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-111827"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-ready-0f766e">
  <img alt="Evidence-first" src="https://img.shields.io/badge/research-evidence_first-f5b84b">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-8_languages-2563eb">
</p>

TraceMind geht von einer einfachen Beobachtung aus: Ein einzelnes Forschungsergebnis reicht fast nie aus, um die Entwicklung eines ganzen Forschungsfeldes zu erkennen.

Die heutige KI-Forschung ist schnell, laut und stark von Trends geprägt. Zusammenfassungen sind leicht zu erzeugen, aber echtes Verständnis wächst langsamer. TraceMind verfolgt daher einen anderen Ansatz: KI soll Literatur verfolgen, Belege sammeln und Antworten auf dieser Grundlage geben, damit sie zu einem loyalen und präzisen Forschungsassistenten wird.

## Projektvorstellung

TraceMind ist eine persönliche KI-Forschungswerkbank für Studierende, unabhängige Forschende, Ingenieurinnen und Ingenieure, Tech Leads, Analystinnen und Analysten und alle, die aus vielen Papieren ein klares Bild formen müssen.

| Typisches Problem | Wobei TraceMind hilft |
| --- | --- |
| Zu viele Papers, keine klare Hauptlinie | Themenkarten, Knotengrafen, Schlüsselpapiere und reale Forschungsphasen |
| KI-Antworten klingen gut, aber ohne belastbare Basis | Antworten mit Bezug zu Papers, PDFs, Abbildungen, Formeln und Zitationen |
| Gute Fragen verschwinden in Chats und Notizen | eine langfristige Themenwerkbank mit Gedächtnis und Export |
| Viel Trendfolge, wenig kumuliertes Verständnis | Themen, die aus echtem Material wachsen |

## Motivation

Forschung scheitert oft nicht am Mangel an Information, sondern daran, dass Verständnis nicht schnell genug kumuliert.

Allgemeine Chat-Tools sind stark im Antworten, aber schwächer darin, folgende Dinge zu bewahren:
- warum ein Urteil entstanden ist
- welche Evidenz es trägt
- was noch unsicher ist
- wie sich ein Gebiet im Zeitverlauf verändert

TraceMind baut deshalb auf vier Prinzipien:
- `Evidenz vor Eindruck`
- `Gedächtnis vor Chat`
- `Struktur vor Ablage`
- `menschliches Urteil im Zentrum`

## Stärken

- `Themenseiten zeigen echten Forschungsfortschritt`: Phasen und Knoten entstehen aus realem Material statt aus künstlicher Vorplanung.
- `Knotenseiten sind strukturierte Forschungsansichten`: Kernfrage, Schlüsselpapiere, Evidenzkette, Methoden, Ergebnisse, Grenzen, Kontroversen und Urteil stehen an einem Ort.
- `Belege bleiben sichtbar`: PDF-Inhalte, Abbildungen, Formeln und Zitate bleiben nah am Ergebnis.
- `Folgefragen bleiben geerdet`: Fragen starten nicht jedes Mal in einem leeren Chatfenster neu.
- `Self-hosted gedacht`: Modelle, Zugangsdaten und Forschungsdaten bleiben unter eigener Kontrolle.

## Schnellstart

Voraussetzungen:
- Node.js `18+`
- npm `9+`
- Python `3.10+`
- ein API-Schlüssel für mindestens einen Modellanbieter

Backend:

```bash
cd skills-backend
npm install
cp .env.example .env
npm run db:generate
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Standardadressen:
- frontend: `http://localhost:5173`
- backend health: `http://localhost:3303/health`

Docker:

```bash
docker compose up --build
```

## Erste 15 Minuten

1. Backend und Frontend starten.
2. In den Einstellungen mindestens einen Modellanbieter konfigurieren.
3. Ein Thema anlegen, das wirklich über längere Zeit verfolgt werden soll.
4. Paper-Discovery starten und die Treffer prüfen.
5. Nur die wirklich relevanten Papers in das Thema übernehmen.
6. Eine strukturierte Forschungsansicht eines Knotens öffnen.
7. Eine prüfende Folgefrage stellen, etwa: `Was ist die schwächste Evidenz in diesem Zweig?`
8. Ergebnisse exportieren oder das Thema weiter wachsen lassen.

## Arbeitsfluss

TraceMind organisiert Forschung als wiederkehrenden Zyklus:
- Papers finden
- Kandidaten sichten und aufnehmen
- Evidenz aus PDFs extrahieren
- Forschungsknoten aufbauen
- Zwischenurteile formulieren
- geerdete Folgefragen stellen
- Notizen und Berichte exportieren
- alles ins Themen-Gedächtnis zurückführen

## Vergleich

| Werkzeug | Besonders stark bei | Rolle von TraceMind |
| --- | --- | --- |
| Zotero | Sammeln, Annotieren, Zitieren | macht aus Literatur Knoten, Evidenzketten und Urteile |
| NotebookLM | Fragen über gegebene Quellen | hält diese Fragen in einem langlebigen Thema |
| Elicit | Suche und Review-Workflows | legt mehr Gewicht auf laufende persönliche Forschung |
| Perplexity | schnelle Antworten mit Quellen | verwandelt einmalige Antworten in Themenwissen |
| Obsidian / Notion | persönliche Notizen | ergänzt Literaturverfolgung und evidenzgebundene KI |
| ChatGPT / Claude | Denken, Schreiben, Dialog | gibt dem Modell einen Forschungsraum statt eines leeren Chats |

## Open-Source-Basis und Referenzen

TraceMind baut auf etablierten Grundlagen auf:
- `React`, `Vite`
- `Express`, `Prisma`
- `SQLite`, `PostgreSQL`, `Redis`
- `PyMuPDF`
- `OpenAI`, `Anthropic`, `Google`
- `arXiv`, `OpenAlex`, `Crossref`, `Semantic Scholar`

Bei Dokumentation und öffentlicher Darstellung haben Projekte wie `Supabase`, `Dify`, `LangChain`, `Immich`, `Next.js`, `Visual Studio Code`, `Excalidraw` und `Open WebUI` gezeigt, wie klar ein Open-Source-Projekt erklären kann, was es ist, warum es wichtig ist und wo seine Grenzen liegen.

## Für wen es passt

TraceMind passt gut, wenn Sie:
- eine Forschungsrichtung über Wochen oder Monate verfolgen
- Papers vergleichen statt nur sammeln möchten
- Reviews, technische Memos oder Forschungsberichte schreiben
- Daten und Modellzugänge selbst verwalten möchten

Weniger passend ist es für:
- einmalige Faktensuche
- schnelle Antworten ohne Interesse an der Evidenzkette
- generische Unternehmens-Wissensdatenbanken

## Beiträge, Sicherheit und Lizenz

- Beitragshinweise: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Sicherheitsrichtlinie: [SECURITY.md](../SECURITY.md)
- Lizenz: [MIT](../LICENSE)

## Schluss

Es ist schwer, aus einem einzelnen Forschungsschritt die Richtung eines Feldes zu erkennen. Noch schwerer wird es, wenn das Umfeld Geschwindigkeit, Trends und oberflächliche Neuheit belohnt.

TraceMind ist der Versuch, KI so einzusetzen, dass sie Literatur verfolgt, Evidenz sammelt und Rückfragen auf dieser Basis unterstützt. Nicht als lautere Stimme als die Forschung selbst, sondern als Werkzeug, das deren Struktur klarer sichtbar macht.
