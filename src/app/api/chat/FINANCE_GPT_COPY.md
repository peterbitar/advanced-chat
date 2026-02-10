# FinanceGPTCopy Agent

Agent that follows the full financial-data pipeline: **classify question → formulate queries → fetch (APIs/search) → normalize & merge → structured output**.

## How to use

- **UI:** Choose **Agent: FinanceGPTCopy** in the chat input area, then ask your question.
- **API:** Send the same request as `/api/chat` with:
  - **Body:** `responseFormat: "finance-gpt-copy"`
  - **Or header:** `x-response-format: finance-gpt-copy`

Same auth, tools, and streaming as the main chat; only the system prompt (and thus behavior) changes.

## Pipeline (what the agent does)

1. **Classify** the question: valuation | news | sentiment | macro | fundamentals.
2. **Formulate queries** (e.g. `{TICKER} P/E PEG EPS`, `{TICKER} stock news past 7 days`, `U.S. CPI last release`).
3. **Retrieve** via tools:
   - `financeSearch` — fundamentals, ratios, prices, filings, industry.
   - `webSearch` — news, headlines, sentiment.
   - `secSearch` — SEC filings when needed.
   - `economicsSearch` — CPI, Fed, GDP when macro.
4. **Normalize & merge** (e.g. median when multiple P/E sources; note single-source / low confidence).
5. **Output** structured sections: Fundamentals, Industry/Peers, News, Analyst/Forecasts, Macro (only what applies), plus a short summary.

The agent is conversational: it briefly states each step (classify, search, fetch, merge) as it goes, then delivers the structured answer.
