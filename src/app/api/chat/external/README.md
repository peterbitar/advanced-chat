# External Chat API

A simple REST API endpoint that allows external applications to send messages and receive AI responses without handling streaming or complex authentication.

## Endpoint

```
POST /api/chat/external
```

## Request

### Headers
```
Content-Type: application/json
```

### Body
```json
{
  "message": "string",           // Required: The user's message
  "sessionId": "string",         // Optional: Session ID for conversation context
  "model": "openai" | "ollama",  // Optional: Model preference (default: "openai")
  "disableLocal": boolean         // Optional: Disable local models (default: false)
}
```

### Example Request
```bash
curl -X POST http://localhost:3000/api/chat/external \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What is Apple'\''s current stock price?",
    "model": "openai",
    "disableLocal": true
  }'
```

## Response

### Success Response (200)
```json
{
  "success": true,
  "response": "string",          // The AI's response text
  "processingTime": number,        // Time in milliseconds
  "sessionId": "string",          // Session ID (new or existing)
  "model": "string"               // Model used (e.g., "OpenAI (gpt-5.2)")
}
```

### Error Response (400/500)
```json
{
  "success": false,
  "error": "string",             // Error message
  "processingTime": number        // Time in milliseconds
}
```

## Examples

### Simple Query
```bash
curl -X POST http://localhost:3000/api/chat/external \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Tesla stock price?"}'
```

### With Session (Conversation Context)
```bash
# First message
curl -X POST http://localhost:3000/api/chat/external \
  -H "Content-Type: application/json" \
  -d '{"message": "What is Apple stock price?"}'

# Response includes sessionId: "abc-123-def"

# Follow-up message (uses conversation context)
curl -X POST http://localhost:3000/api/chat/external \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What about Microsoft?",
    "sessionId": "abc-123-def"
  }'
```

### Technical Indicator Calculation
```bash
curl -X POST http://localhost:3000/api/chat/external \
  -H "Content-Type: application/json" \
  -d '{"message": "RSI for Microsoft"}'
```

## Features

- ✅ Simple request/response (no streaming)
- ✅ Automatic session management
- ✅ Full access to all tools (financeSearch, codeExecution, etc.)
- ✅ Conversation context support
- ✅ Model selection (OpenAI or local Ollama)
- ✅ Error handling

## Notes

- The API uses the same AI model and tools as the main chat interface
- Sessions are automatically created if not provided
- Processing time typically ranges from 2-40 seconds depending on query complexity
- For queries requiring tool calls (like RSI calculations), expect 20-40 seconds
- Simple queries (no tools) typically complete in 1-5 seconds
