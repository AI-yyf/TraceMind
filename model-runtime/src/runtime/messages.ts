import type { RuntimeContentPart, RuntimeMessage } from '../types.ts'

function toPlainText(part: RuntimeContentPart) {
  if (part.type === 'text') return part.text
  if (part.type === 'image') return `[image] ${part.imageUrl}`
  return `[file] ${part.fileName}${part.localPath ? `\nlocal-path: ${part.localPath}` : ''}${part.text ? `\n${part.text}` : ''}`
}

export function flattenMessageContent(message: RuntimeMessage) {
  return message.content.map(toPlainText).join('\n\n')
}

export function toOpenAIMessage(message: RuntimeMessage) {
  return {
    role: message.role,
    content: message.content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text }
      }

      if (part.type === 'image') {
        return {
          type: 'image_url',
          image_url: {
            url: part.imageUrl,
            detail: part.detail ?? 'auto',
          },
        }
      }

      return {
        type: 'text',
        text: `[file:${part.fileName}]${part.localPath ? `\nlocal-path:${part.localPath}` : ''}${part.text ? `\n${part.text}` : ''}`,
      }
    }),
  }
}

export function toAnthropicMessage(message: RuntimeMessage) {
  return {
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content.map((part) => {
      if (part.type === 'text') {
        return { type: 'text', text: part.text }
      }

      if (part.type === 'image') {
        return {
          type: 'image',
          source: {
            type: 'url',
            url: part.imageUrl,
          },
        }
      }

      return {
        type: 'text',
        text: `[file:${part.fileName}]${part.localPath ? `\nlocal-path:${part.localPath}` : ''}${part.text ? `\n${part.text}` : ''}`,
      }
    }),
  }
}
