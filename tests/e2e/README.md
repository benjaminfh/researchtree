E2E Smoke (Playwright)

Prereqs:
- Supabase auth enabled and reachable from the app.
- A test user created in Supabase Auth.
- Mock LLM enabled for deterministic chat responses (dev default).

Required env vars:
- E2E_EMAIL: email for the test user
- E2E_PASSWORD: password for the test user
- OPENAI_API_KEY: OpenAI key stored into Profile
- GEMINI_API_KEY: Gemini key stored into Profile
- ANTHROPIC_API_KEY: Anthropic key stored into Profile
- E2E_BASE_URL (optional): defaults to http://localhost:3000
- E2E_NO_WEB_SERVER=1 (optional): skip auto `npm run dev`

Run:
```
npx playwright test
```
