/**
 * i18n middleware for Express.
 * Detects and sets locale per request, stores in request context.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express'

import {
  detectLocaleFromRequest,
  createRequestI18n,
  type LanguagePreference,
  type BackendLanguageCode,
  type RequestI18nHelper,
} from '../i18n'

// Extend Express Request type
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      locale?: LanguagePreference
      i18n?: RequestI18nHelper
    }
  }
}

/**
 * i18n middleware that detects locale and attaches i18n helper to request.
 */
export function i18nMiddleware(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Detect locale from request headers
    const locale = detectLocaleFromRequest(req)
    req.locale = locale

    // Create request-scoped i18n helper
    req.i18n = createRequestI18n(locale)

    next()
  }
}

/**
 * Get locale from request, with fallback to default.
 */
export function getLocaleFromRequest(req: Request): LanguagePreference {
  return req.locale ?? { primary: 'zh', secondary: 'en', mode: 'monolingual' }
}

/**
 * Get primary language from request.
 */
export function getPrimaryLanguage(req: Request): BackendLanguageCode {
  return getLocaleFromRequest(req).primary
}

/**
 * Check if request prefers bilingual content.
 */
export function prefersBilingual(req: Request): boolean {
  return getLocaleFromRequest(req).mode === 'bilingual'
}

/**
 * Create a localized response helper.
 */
export function createLocalizedResponse(req: Request): LocalizedResponseHelper {
  const locale = getLocaleFromRequest(req)
  const i18n = req.i18n ?? createRequestI18n(locale)

  return new LocalizedResponseHelper(i18n, locale)
}

/**
 * Helper for creating localized API responses.
 */
export class LocalizedResponseHelper {
  constructor(
    private i18n: RequestI18nHelper,
    private locale: LanguagePreference,
  ) {}

  /**
   * Create a success response with localized message.
   */
  success(data: unknown, messageKey?: string): { success: true; data: unknown; message?: string } {
    const response: { success: true; data: unknown; message?: string } = {
      success: true,
      data,
    }

    if (messageKey) {
      response.message = this.i18n.t(messageKey)
    }

    return response
  }

  /**
   * Create an error response with localized message.
   */
  error(
    errorKey: string,
    statusCode = 500,
    details?: unknown,
  ): { success: false; error: string; statusCode: number; details?: unknown } {
    return {
      success: false,
      error: this.i18n.t(errorKey),
      statusCode,
      details,
    }
  }

  /**
   * Create a bilingual content response.
   */
  bilingual(
    contentKey: string,
    additionalData?: Record<string, unknown>,
  ): { primary: string; secondary: string } & Record<string, unknown> {
    const bilingual = this.i18n.tb(contentKey)
    return {
      ...bilingual,
      ...additionalData,
    }
  }

  /**
   * Get i18n helper.
   */
  getI18n(): RequestI18nHelper {
    return this.i18n
  }

  /**
   * Get locale preference.
   */
  getLocale(): LanguagePreference {
    return this.locale
  }
}

/**
 * Helper function to translate error messages in error handler.
 */
export function translateError(
  req: Request,
  errorKey: string,
  fallback?: string,
): string {
  const i18n = req.i18n ?? createRequestI18n(getLocaleFromRequest(req))
  return i18n.t(errorKey, fallback)
}

export default i18nMiddleware
