# TraceMind

TraceMind es un banco de trabajo personal de investigación con IA para lectura e indagación rigurosas. Conecta descubrimiento de artículos, extracción de evidencia, nodos de investigación, redacción de juicios y preguntas contextualizadas en un flujo trazable.

No es solo un chatbot ni una lista de papers, sino un espacio de trabajo duradero para desarrollar un tema de investigación personal.

## Qué Problema Resuelve

- El material de investigación queda disperso entre bases de papers, PDF, notas e historiales de chat.
- Las respuestas de IA pueden sonar convincentes mientras ocultan el camino de evidencia.
- Los temas de investigación evolucionan, pero los chats comunes no conservan una memoria duradera del tema.

TraceMind mantiene papers, figuras, fórmulas, citas, nodos y conversaciones en un mismo contexto para que las personas investigadoras puedan revisar la evidencia detrás de cada afirmación.

## Cómo Usarlo

1. Inicia el backend y el frontend.
2. Configura un modelo de lenguaje y, opcionalmente, un modelo visual en Settings.
3. Crea o abre un tema de investigación.
4. Ejecuta el descubrimiento de papers y revisa los candidatos.
5. Lee páginas de nodos con evidencia, figuras, fórmulas y citas.
6. Continúa con preguntas fundamentadas en el workbench y exporta resultados.

## Cómo Funciona

TraceMind combina un frontend React + Vite, un backend Express + Prisma, una puerta de enlace de modelos Omni y datos generados curados. El backend agrega fuentes académicas, extrae evidencia de PDF, construye nodos de tema y enruta llamadas de modelo mediante una puerta configurable.

## Ecosistema De Referencia

TraceMind usa o toma como referencia React, Vite, Express, Prisma, Playwright, Vitest, PyMuPDF, arXiv, OpenAlex, Crossref, Semantic Scholar, Zotero e infraestructura académica abierta relacionada.
