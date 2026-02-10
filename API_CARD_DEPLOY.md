# Card API (Railway)

After deploying this app to Railway, these endpoints are available:

- **POST** `https://advanced-chat-production.up.railway.app/api/card`  
  Body: `{"symbol":"AAPL"}`  
  Returns: `{ success, card: { title, emoji, content, ticker } }`

- **POST** `https://advanced-chat-production.up.railway.app/api/chat/external`  
  Body: `{"message":"...", "disableLocal": true}`  
  Returns: `{ success, response }`  
  Used by deep-research for card generation.

**If you get 404:** Redeploy the finance app from this repo (main branch or the branch that contains `src/app/api/card/` and `src/app/api/chat/external/`).
