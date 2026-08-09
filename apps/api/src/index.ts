import express, { json, urlencoded, Request, Response, NextFunction } from 'express'
import swaggerUi from 'swagger-ui-express'
import pinoHttp from 'pino-http'
import type { Options as PinoHttpOptions } from 'pino-http'
import { RegisterRoutes } from './generated/routes.js'
import swaggerDocument from './generated/swagger.json' with { type: 'json' }
import { requestContextMiddleware, type ResponseWithBody } from './middleware/requestContext.js'
import logger, { redactObject } from './utils/logger.js'
import { stringifyForLog } from './utils/logBody.js'

const app = express()

// Extended request/response types for body capture
interface RequestWithBody extends Request {
  _reqBody?: unknown
}

// Parse body BEFORE logging so we can capture it
app.use(json())
app.use(urlencoded({ extended: true }))

// Capture request body immediately after parsing (before any processing)
app.use((req: Request, _res: Response, next: NextFunction) => {
  // Store a copy of the body for logging (will be redacted by logger formatter)
  if (req.body && Object.keys(req.body).length > 0) {
    ;(req as RequestWithBody)._reqBody = req.body
  }
  next()
})

// HTTP request logging with PII redaction
const httpLoggerOptions: PinoHttpOptions = {
  logger,
  // Don't log health checks, static assets, or high-frequency polling endpoints
  autoLogging: {
    ignore: req => {
      const url = req.url || ''
      return url === '/health' || url.startsWith('/docs') || url.startsWith('/sync/state')
    },
  },
  // Redact sensitive headers
  redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-auth-token"]'],
  // Custom log messages that include status code
  customSuccessMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
  // Add custom properties including request/response bodies (redacted).
  //
  // Bodies are emitted as JSON *strings*, not objects. Logging them as objects
  // made the log index create a mapping field for every key of every domain
  // object it ever saw — resBody alone reached 441 fields and pushed the index
  // past OpenSearch's 1000-field limit, after which any log line containing a
  // new field was rejected outright. That silently dropped the auth diagnostics.
  // A string keeps the body readable and full-text searchable as one field.
  customProps: (req, res) => {
    const props: Record<string, unknown> = {}
    const reqBody = (req as RequestWithBody)._reqBody
    const resBody = (res as ResponseWithBody)._resBody
    if (reqBody !== undefined) props.reqBody = stringifyForLog(redactObject(reqBody))
    if (resBody !== undefined) props.resBody = stringifyForLog(redactObject(resBody))
    return props
  },
  // Customize serializers - use pino's request serializer, omit redundant res object
  serializers: {
    req: pinoHttp.stdSerializers.req,
    res: () => undefined, // Status code is now in the message
  },
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.use((pinoHttp as any)(httpLoggerOptions))

// Wrap all requests in AsyncLocalStorage context + capture response body for
// logging + emit X-Refreshed-Token.
app.use(requestContextMiddleware)

// Swagger UI - at /docs since DigitalOcean routes /api/* here (stripping /api prefix)
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

// Register TSOA routes directly (DigitalOcean strips /api prefix before forwarding)
RegisterRoutes(app)

// Error handling
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof Error) {
    // Check if error has a statusCode property (custom HttpError)
    const statusCode =
      'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500

    // Log error with context (pino-http attaches log to req)
    const log = req.log || logger
    if (statusCode >= 500) {
      log.error({ err, statusCode }, 'Server error')
    } else {
      log.warn({ statusCode, message: err.message }, 'Client error')
    }

    res.status(statusCode).json({
      message: err.message,
    })
  }
})

const port = process.env.PORT || 3000

// Fail fast if critical env vars are missing
if (
  !process.env.JWT_SECRET &&
  process.env.NODE_ENV !== 'test' &&
  process.env.NODE_ENV !== 'development'
) {
  logger.fatal('JWT_SECRET environment variable is not set — authentication will fail')
}

app.listen(port, () => {
  logger.info({ port }, 'API server started')
  logger.info({ path: '/api/docs', port }, 'Swagger docs available')

  // Note: the FIO sync queue worker + scheduler now run in the @kawakawa/sync-worker
  // daemon (apps/sync-worker), not inside the API. Controllers still enqueue via
  // @kawakawa/services/sync-queue; the daemon picks up those jobs and processes them.
})
