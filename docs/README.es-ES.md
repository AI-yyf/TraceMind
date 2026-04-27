[English](../README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja-JP.md) | [한국어](README.ko-KR.md) | [Deutsch](README.de-DE.md) | [Français](README.fr-FR.md) | [Español](README.es-ES.md) | [Русский](README.ru-RU.md)

<p align="center">
  <img src="../assets/tracemind-logo.svg" alt="TraceMind logo" width="520">
</p>

<h1 align="center">TraceMind</h1>

<p align="center">
  <strong>Un banco personal de investigación con IA para quienes quieren entender una dirección de trabajo, no solo recibir una respuesta rápida.</strong>
</p>

<p align="center">
  <a href="../LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-111827"></a>
  <img alt="Self-hosted" src="https://img.shields.io/badge/self--hosted-ready-0f766e">
  <img alt="Evidence-first" src="https://img.shields.io/badge/research-evidence_first-f5b84b">
  <img alt="i18n" src="https://img.shields.io/badge/i18n-8_languages-2563eb">
</p>

TraceMind nace de una realidad sencilla: un solo avance de investigación casi nunca permite ver con claridad la trayectoria completa de un campo.

La investigación en IA actual es rápida, ruidosa y muy impulsada por tendencias. Los resúmenes aparecen enseguida, pero la comprensión profunda se acumula mucho más despacio. Por eso TraceMind propone otra idea: que la IA siga la literatura, acumule evidencia y responda desde esa base para convertirse en un asistente de investigación fiel y riguroso.

## Introducción al proyecto

TraceMind es un banco personal de investigación con IA. Está pensado para estudiantes, investigadores independientes, ingenieros, responsables técnicos y analistas que necesitan convertir muchas lecturas en una visión coherente.

| Problema habitual | Cómo ayuda TraceMind |
| --- | --- |
| Demasiados artículos y ninguna línea principal clara | mapas de temas, grafos de nodos, artículos clave y progreso real |
| Respuestas de IA fluidas pero poco trazables | respuestas conectadas con artículos, PDF, figuras, fórmulas y citas |
| Buenas preguntas dispersas entre chats y notas | un espacio temático con memoria y exportación |
| Mucho seguimiento de modas y poca acumulación | temas que crecen desde material real |

## Motivación

La investigación suele fallar no por falta de información, sino porque la comprensión no llega a consolidarse.

Las herramientas de chat general responden bien, pero conservan mal:
- por qué se formuló un juicio
- qué evidencia lo sostiene
- qué partes siguen siendo inciertas
- cómo cambia una dirección con el tiempo

TraceMind se apoya en cuatro principios:
- `evidencia antes que impresión`
- `memoria antes que chat`
- `estructura antes que acumulación`
- `juicio humano en el centro`

## Puntos fuertes

- `Las páginas de tema muestran progreso real` y no una fase de planificación artificial.
- `Las páginas de nodo son vistas de investigación estructuradas` con pregunta central, artículos clave, cadena de evidencia, métodos, hallazgos, límites y juicio.
- `La evidencia permanece visible` cerca del resultado final.
- `Las preguntas de seguimiento conservan el contexto` del tema y del nodo.
- `Está pensado para autoalojarse` y mantener bajo control modelos, credenciales y datos.

## Inicio rápido

Requisitos:
- Node.js `18+`
- npm `9+`
- Python `3.10+`
- una clave API de al menos un proveedor de modelos

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

Direcciones locales por defecto:
- frontend: `http://localhost:5173`
- backend health: `http://localhost:3303/health`

Docker:

```bash
docker compose up --build
```

## Los primeros 15 minutos

1. Inicia backend y frontend.
2. Configura al menos un proveedor de modelos.
3. Crea un tema que de verdad quieras seguir durante semanas o meses.
4. Ejecuta el descubrimiento de artículos y revisa los candidatos.
5. Acepta solo los trabajos que realmente pertenecen a la línea central.
6. Abre una vista de nodo y lee primero el resumen estructurado.
7. Haz una pregunta de prueba como `¿Cuál es la evidencia más débil de esta rama?`
8. Exporta el resultado o sigue ampliando el tema.

## Cómo funciona el flujo

TraceMind organiza la investigación como un ciclo:
- descubrir artículos
- filtrar y admitir candidatos
- extraer evidencia desde los PDF
- construir nodos de investigación
- formular juicios por etapas
- hacer preguntas de seguimiento con contexto
- exportar notas e informes
- devolver todo a la memoria del tema

## Comparación

| Herramienta | Destaca en | Papel de TraceMind |
| --- | --- | --- |
| Zotero | recopilar, anotar y citar | convierte la literatura en nodos, evidencia y juicios |
| NotebookLM | preguntar sobre un conjunto dado de fuentes | mantiene esas preguntas dentro de un tema vivo |
| Elicit | búsqueda y revisiones | se orienta más a la acumulación personal continua |
| Perplexity | respuestas rápidas con fuentes | convierte una respuesta puntual en memoria de tema |
| Obsidian / Notion | notas y organización personal | añade seguimiento bibliográfico e IA fundamentada |
| ChatGPT / Claude | razonamiento y redacción | da al modelo una sala de investigación en vez de un chat vacío |

## Base open source y referencias

TraceMind se apoya en componentes maduros:
- `React`, `Vite`
- `Express`, `Prisma`
- `SQLite`, `PostgreSQL`, `Redis`
- `PyMuPDF`
- `OpenAI`, `Anthropic`, `Google`
- `arXiv`, `OpenAlex`, `Crossref`, `Semantic Scholar`

En la forma de explicar el proyecto y organizar la documentación pública, también aprendimos de la claridad de `Supabase`, `Dify`, `LangChain`, `Immich`, `Next.js`, `Visual Studio Code`, `Excalidraw` y `Open WebUI`.

## Para quién es

TraceMind encaja bien si:
- sigues una línea de investigación durante semanas o meses
- necesitas comparar artículos, no solo guardarlos
- escribes revisiones, notas técnicas o informes de investigación
- quieres controlar tus datos y tus modelos

No es la mejor opción si solo buscas:
- una consulta factual rápida
- una respuesta elegante sin volver a la evidencia
- una base de conocimiento corporativa genérica

## Contribución, seguridad y licencia

- Guía de contribución: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Política de seguridad: [SECURITY.md](../SECURITY.md)
- Licencia: [MIT](../LICENSE)

## Cierre

Es difícil entender una dirección de investigación a partir de una sola novedad, y todavía más en un entorno que premia la velocidad, la moda y la novedad superficial.

TraceMind intenta que la IA siga la literatura, acumule evidencia y sostenga preguntas posteriores sobre esa base. No para hablar más alto que la propia investigación, sino para ayudarte a ver su forma con mayor claridad.
