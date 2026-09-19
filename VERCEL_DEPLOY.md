# Vercel deployment

After the GitHub repository exists and `main` is pushed:

1. Import `faust-0612/BUKLOD-QuickCheck-Web` into Vercel.
2. Framework preset: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add environment variables:
   - `VITE_SUPABASE_URL=https://yhanxndaqbmuzbdqlblu.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_RWvrYHzgLMvBousgwn4dTg_QawYzwRS`
6. Deploy production.

The Gemini key stays in Supabase Edge Function secrets and must never be added to Vercel or GitHub.
