function trimUrl(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  return normalized || undefined
}

export function toPublicUploadPath(targetPath: string | null | undefined) {
  const value = trimUrl(targetPath)
  if (!value) return undefined
  if (/^(https?:|data:)/iu.test(value)) return value

  const normalized = value.replace(/\\/gu, '/')
  const uploadsIndex = normalized.toLowerCase().lastIndexOf('/uploads/')

  if (uploadsIndex >= 0) {
    return normalized.slice(uploadsIndex)
  }

  if (normalized.toLowerCase().startsWith('uploads/')) {
    return `/${normalized}`
  }

  if (normalized.startsWith('/uploads/')) {
    return normalized
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`
}

export function normalizePaperPdfUrl(rawUrl: string | null | undefined) {
  const value = trimUrl(rawUrl)
  if (!value) return undefined

  const arxivDoiMatch = value.match(
    /^https?:\/\/doi\.org\/10\.48550\/arxiv\.([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivDoiMatch) {
    return `https://arxiv.org/pdf/${arxivDoiMatch[1]}.pdf`
  }

  const arxivAbsMatch = value.match(
    /^https?:\/\/arxiv\.org\/abs\/([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivAbsMatch) {
    return `https://arxiv.org/pdf/${arxivAbsMatch[1]}.pdf`
  }

  const arxivPdfMatch = value.match(
    /^https?:\/\/arxiv\.org\/pdf\/([\d.]+)(?:v\d+)?$/iu,
  )
  if (arxivPdfMatch) {
    return value.endsWith('.pdf') ? value : `${value}.pdf`
  }

  return value
}

export function resolvePaperSourceLinks(args: {
  arxivUrl?: string | null
  pdfUrl?: string | null
  pdfPath?: string | null
}) {
  const originalUrl = trimUrl(args.arxivUrl) ?? trimUrl(args.pdfUrl)
  const assetPdfUrl = toPublicUploadPath(args.pdfPath)
  const remotePdfUrl =
    normalizePaperPdfUrl(args.pdfUrl) ??
    normalizePaperPdfUrl(args.arxivUrl)

  return {
    originalUrl,
    pdfUrl: assetPdfUrl ?? remotePdfUrl,
  }
}
