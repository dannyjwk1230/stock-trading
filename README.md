# stock-trading

AeroTrade React frontend built with React and Vite.

## Run

Install Node.js, then run these commands from the `frontend` directory:

```bash
npm install
npm run dev
```

The default development server opens at `http://localhost:5173`.

## Environment

Copy `.env.example` to `.env.local` and fill in your values:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_BACKEND_URL=http://127.0.0.1:8000
```

## Structure

- `index.html`: React entry HTML
- `src/main.jsx`: React render entry point
- `src/App.jsx`: Shared layout, pages, and state management
- `src/lib/backendClient.js`: Backend API helper with Supabase access token forwarding
- `src/theme.css`: Existing dark/light theme colors
- `src/styles.css`: React app styles
